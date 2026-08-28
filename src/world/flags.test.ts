import { describe, expect, it, vi } from 'vitest';
import {
  createDefaultFlagStore,
  createLocalStorageFlagStore,
  createMemoryFlagStore,
  getUserFlags,
  loadCarried,
  persistCarried,
  type StorageLike,
} from './flags';
import { emptyCarried } from './tile-world';

function createStubStorage(): StorageLike & { readonly raw: Map<string, string> } {
  const raw = new Map<string, string>();

  return {
    raw,
    getItem(key: string): string | null {
      return raw.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      raw.set(key, value);
    },
  };
}

describe('createMemoryFlagStore', () => {
  it('defaults missing flags to false', () => {
    const store = createMemoryFlagStore();

    expect(store.get('nope')).toBe(false);
  });

  it('sets and reads flags', () => {
    const store = createMemoryFlagStore();

    store.set('a', true);
    store.set('b', false);

    expect(store.get('a')).toBe(true);
    expect(store.get('b')).toBe(false);
  });

  it('snapshots are immutable copies', () => {
    const store = createMemoryFlagStore();

    store.set('a', true);

    const snapshot = store.snapshot() as Record<string, boolean>;

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot.a).toBe(true);
    expect(store.snapshot().a).toBe(true);
  });
});

describe('createLocalStorageFlagStore', () => {
  it('persists through the storage object', () => {
    const storage = createStubStorage();
    const store = createLocalStorageFlagStore(storage);

    store.set('a', true);

    const reloaded = createLocalStorageFlagStore(storage);

    expect(reloaded.get('a')).toBe(true);
  });

  it('tolerates corrupt payloads and starts empty', () => {
    const storage = createStubStorage();

    storage.setItem('tile-flags', '{not json');

    const store = createLocalStorageFlagStore(storage);

    expect(store.get('anything')).toBe(false);
  });

  it('survives storage write failures', () => {
    const storage = createStubStorage();

    storage.setItem = () => {
      throw new Error('quota exceeded');
    };

    const store = createLocalStorageFlagStore(storage);

    expect(() => store.set('a', true)).not.toThrow();
    expect(store.get('a')).toBe(true);
  });
});

describe('createDefaultFlagStore', () => {
  it('uses localStorage when available', () => {
    const storage = createStubStorage();

    vi.stubGlobal('localStorage', storage);

    try {
      const store = createDefaultFlagStore();

      store.set('persisted', true);
      expect(storage.raw.get('tile-flags')).toContain('persisted');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('falls back to memory without localStorage', () => {
    vi.stubGlobal('localStorage', undefined);

    try {
      const store = createDefaultFlagStore();

      store.set('mem', true);
      expect(store.get('mem')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('persistCarried / loadCarried', () => {
  it('round-trips every carried namespace with prefixes', () => {
    const store = createMemoryFlagStore();
    const carried = {
      flags: { 'cellar-key': true },
      openedChests: { 'vault-chest': true },
      onTargetFired: { 'cellar-block': true },
      latchedOpenDoors: { 'hub-gate': true },
    };

    persistCarried(store, carried);

    expect(store.get('flag:cellar-key')).toBe(true);
    expect(store.get('chest:vault-chest')).toBe(true);
    expect(store.get('target:cellar-block')).toBe(true);
    expect(store.get('latch:hub-gate')).toBe(true);

    const loaded = loadCarried(store);

    expect(loaded).toEqual(carried);
  });

  it('loads an empty store as empty carried state', () => {
    expect(loadCarried(createMemoryFlagStore())).toEqual(
      emptyCarried(),
    );
  });

  it('persists through a localStorage adapter for reload survival', () => {
    const storage = createStubStorage();
    const store = createLocalStorageFlagStore(storage);

    persistCarried(store, {
      flags: { k: true },
      openedChests: {},
      onTargetFired: {},
      latchedOpenDoors: {},
    });

    // Simulated page reload: a fresh store over the same storage.
    const reloaded = loadCarried(
      createLocalStorageFlagStore(storage),
    );

    expect(reloaded.flags.k).toBe(true);
  });

  it('skips false entries when persisting', () => {
    const store = createMemoryFlagStore();

    persistCarried(store, {
      flags: { on: true, off: false },
      openedChests: {},
      onTargetFired: {},
      latchedOpenDoors: {},
    });

    expect(store.get('flag:on')).toBe(true);
    expect(store.get('flag:off')).toBe(false);
  });
});

describe('getUserFlags', () => {
  it('returns only the flag: namespace stripped of the prefix', () => {
    const store = createMemoryFlagStore();

    persistCarried(store, {
      flags: { k: true },
      openedChests: { c: true },
      onTargetFired: {},
      latchedOpenDoors: {},
    });

    expect(getUserFlags(store)).toEqual({ k: true });
  });
});

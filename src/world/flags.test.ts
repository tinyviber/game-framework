import { describe, expect, it, vi } from 'vitest';
import {
  createDefaultFlagStore,
  createLocalStorageFlagStore,
  createMemoryFlagStore,
  getUserFlags,
  loadCarried,
  persistCarried,
  type FlagStore,
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

  it('deletes flags so they read as false', () => {
    const store = createMemoryFlagStore();

    store.set('a', true);
    store.delete('a');

    expect(store.get('a')).toBe(false);
    expect(store.snapshot()).toEqual({});
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

  it('deletes through the storage object and survives reload', () => {
    const storage = createStubStorage();
    const store = createLocalStorageFlagStore(storage);

    store.set('a', true);
    store.delete('a');

    const reloaded = createLocalStorageFlagStore(storage);

    expect(reloaded.get('a')).toBe(false);
  });

  it('tolerates corrupt payloads and starts empty', () => {
    const storage = createStubStorage();

    storage.setItem('tile-flags:v2', '{not json');

    const store = createLocalStorageFlagStore(storage);

    expect(store.get('anything')).toBe(false);
  });

  it('ignores the legacy v1 storage key', () => {
    const storage = createStubStorage();

    storage.setItem('tile-flags', JSON.stringify({ 'flag:k': true }));

    const store = createLocalStorageFlagStore(storage);

    expect(store.get('flag:k')).toBe(false);
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
      expect(storage.raw.get('tile-flags:v2')).toContain('persisted');
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
      openedChests: { 'vault.vault-chest': true },
      onTargetFired: { 'cellar.cellar-block': true },
      latchedOpenDoors: { 'hub.hub-gate': true },
    };

    persistCarried(store, carried);

    expect(store.get('flag:cellar-key')).toBe(true);
    expect(store.get('chest:vault.vault-chest')).toBe(true);
    expect(store.get('target:cellar.cellar-block')).toBe(true);
    expect(store.get('latch:hub.hub-gate')).toBe(true);

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

  it('writes only changed keys when given the previous snapshot (review P2-9)', () => {
    const store = createMemoryFlagStore();
    const writes: string[] = [];

    const tracking: FlagStore = {
      get: (key) => store.get(key),
      set: (key, value) => {
        writes.push(`set:${key}`);
        store.set(key, value);
      },
      delete: (key) => {
        writes.push(`delete:${key}`);
        store.delete(key);
      },
      snapshot: () => store.snapshot(),
    };

    const before = {
      flags: { 'cellar-key': true },
      openedChests: { 'vault.vault-chest': true },
      onTargetFired: {},
      latchedOpenDoors: {},
    };

    persistCarried(tracking, before);
    expect(writes).toEqual([
      'set:flag:cellar-key',
      'set:chest:vault.vault-chest',
    ]);

    // Unchanged carried state: zero writes.
    writes.length = 0;
    persistCarried(tracking, before, before);
    expect(writes).toEqual([]);

    // A new chest plus a removed flag: exactly two writes.
    writes.length = 0;
    persistCarried(
      tracking,
      {
        flags: {},
        openedChests: {
          'vault.vault-chest': true,
          'cellar.cellar-chest': true,
        },
        onTargetFired: {},
        latchedOpenDoors: {},
      },
      before,
    );
    expect(writes).toEqual([
      'delete:flag:cellar-key',
      'set:chest:cellar.cellar-chest',
    ]);
  });

  it('unsetting a flag survives a reload (no resurrection)', () => {
    const storage = createStubStorage();
    const store = createLocalStorageFlagStore(storage);

    persistCarried(store, {
      flags: { k: true },
      openedChests: {},
      onTargetFired: {},
      latchedOpenDoors: {},
    });

    persistCarried(
      store,
      {
        flags: {},
        openedChests: {},
        onTargetFired: {},
        latchedOpenDoors: {},
      },
      loadCarried(store),
    );

    expect(
      loadCarried(createLocalStorageFlagStore(storage)).flags.k,
    ).toBe(undefined);
  });
});

describe('getUserFlags', () => {
  it('returns only the flag: namespace stripped of the prefix', () => {
    const store = createMemoryFlagStore();

    persistCarried(store, {
      flags: { k: true },
      openedChests: { 'vault.vault-chest': true },
      onTargetFired: {},
      latchedOpenDoors: {},
    });

    expect(getUserFlags(store)).toEqual({ k: true });
  });
});

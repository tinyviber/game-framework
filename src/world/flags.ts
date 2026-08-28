import type { CarriedState } from './tile-world';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface FlagStore {
  get(key: string): boolean;
  set(key: string, value: boolean): void;
  snapshot(): Readonly<Record<string, boolean>>;
}

const STORAGE_KEY = 'tile-flags';

/**
 * In-memory flag store. The default in environments without a
 * browser `localStorage` (vitest node, etc.).
 */
export function createMemoryFlagStore(): FlagStore {
  const values = new Map<string, boolean>();

  return {
    get(key): boolean {
      return values.get(key) === true;
    },

    set(key, value): void {
      values.set(key, value);
    },

    snapshot(): Readonly<Record<string, boolean>> {
      return Object.freeze(Object.fromEntries(values));
    },
  };
}

/**
 * Flag store backed by a browser-like Storage object. The whole map
 * is persisted as one JSON blob under a single key, written through
 * on every set. Corrupt or missing storage falls back to an empty
 * map and never throws.
 */
export function createLocalStorageFlagStore(
  storage: StorageLike,
): FlagStore {
  const memory = createMemoryFlagStore();

  const load = (): void => {
    const raw = storage.getItem(STORAGE_KEY);

    if (!raw) {
      return;
    }

    try {
      const parsed: unknown = JSON.parse(raw);

      if (typeof parsed !== 'object' || parsed === null) {
        return;
      }

      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'boolean' && value) {
          memory.set(key, true);
        }
      }
    } catch {
      // Corrupt payload: start empty.
    }
  };

  load();

  return {
    get(key): boolean {
      return memory.get(key);
    },

    set(key, value): void {
      memory.set(key, value);

      try {
        storage.setItem(
          STORAGE_KEY,
          JSON.stringify(memory.snapshot()),
        );
      } catch {
        // Persistence is best-effort (private mode, quota, ...).
      }
    },

    snapshot(): Readonly<Record<string, boolean>> {
      return memory.snapshot();
    },
  };
}

/**
 * localStorage when available, otherwise memory. World code never
 * touches this directly: main.ts owns the store.
 */
export function createDefaultFlagStore(): FlagStore {
  return typeof localStorage !== 'undefined'
    ? createLocalStorageFlagStore(localStorage)
    : createMemoryFlagStore();
}

const FLAG_PREFIX = 'flag:';
const CHEST_PREFIX = 'chest:';
const TARGET_PREFIX = 'target:';
const LATCH_PREFIX = 'latch:';

/**
 * Persists the carried cross-room state into the store using
 * prefixed boolean keys so a single flat store holds everything.
 * False values are skipped (absence == false).
 */
export function persistCarried(
  store: FlagStore,
  carried: CarriedState,
): void {
  for (const [name, value] of Object.entries(carried.flags)) {
    if (value) {
      store.set(`${FLAG_PREFIX}${name}`, true);
    }
  }

  for (const [id, value] of Object.entries(carried.openedChests)) {
    if (value) {
      store.set(`${CHEST_PREFIX}${id}`, true);
    }
  }

  for (const [id, value] of Object.entries(carried.onTargetFired)) {
    if (value) {
      store.set(`${TARGET_PREFIX}${id}`, true);
    }
  }

  for (const [id, value] of Object.entries(carried.latchedOpenDoors)) {
    if (value) {
      store.set(`${LATCH_PREFIX}${id}`, true);
    }
  }
}

function restorePrefixed(
  store: FlagStore,
  prefix: string,
): Record<string, boolean> {
  const restored: Record<string, boolean> = {};

  for (const [key, value] of Object.entries(store.snapshot())) {
    if (value && key.startsWith(prefix)) {
      restored[key.slice(prefix.length)] = true;
    }
  }

  return restored;
}

export function loadCarried(store: FlagStore): CarriedState {
  return {
    flags: restorePrefixed(store, FLAG_PREFIX),
    openedChests: restorePrefixed(store, CHEST_PREFIX),
    onTargetFired: restorePrefixed(store, TARGET_PREFIX),
    latchedOpenDoors: restorePrefixed(store, LATCH_PREFIX),
  };
}

/** User-facing flags only (the `flag:` namespace). */
export function getUserFlags(
  store: FlagStore,
): Readonly<Record<string, boolean>> {
  return restorePrefixed(store, FLAG_PREFIX);
}

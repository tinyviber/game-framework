import type { Position } from '@/world/types';

/**
 * Sifting Shrine — diegetic ordered-container spike.
 *
 * The shrine is a magical urn: whatever you toss in, it always returns the
 * LIGHTEST item it currently holds first (ties: oldest first). The player is
 * never told a rule; they discover the order by using it.
 *
 * Puzzle shape in this spike: the urn starts holding a feather, a pebble and
 * the golden seed. Two pedestals (light/heavy) each want their matching item;
 * filling both opens the gate before the goal. The golden seed necessarily
 * comes out last, and the carry limit forces the player to deal with the
 * unwanted pebble — the container's intrinsic order IS the puzzle.
 */

export type SeedKind = 'feather' | 'pebble' | 'gold';

export const SEED_WEIGHT: Readonly<Record<SeedKind, number>> = {
  feather: 1,
  pebble: 2,
  gold: 3,
};

export const SEED_LABEL: Readonly<Record<SeedKind, string>> = {
  feather: '羽种',
  pebble: '砾种',
  gold: '金种',
};

export const CARRY_LIMIT = 2;

export interface UrnEntry {
  readonly kind: SeedKind;
  readonly insertedAt: number;
}

export interface SiftingLayout {
  readonly urn: Position;
  readonly lightPedestal: Position;
  readonly heavyPedestal: Position;
  readonly gate: Position;
  readonly goal: Position;
}

export interface SiftingState {
  readonly carried: readonly SeedKind[];
  readonly urn: readonly UrnEntry[];
  readonly lightPedestal: SeedKind | null;
  readonly heavyPedestal: SeedKind | null;
  readonly insertCounter: number;
}

export function positionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

/**
 * Places the experiment along the world's validated final path so every
 * interactive cell is guaranteed walkable on every seed.
 */
export function createSiftingLayout(
  path: readonly Position[],
  goal: Position,
): SiftingLayout {
  if (path.length < 18) {
    throw new Error(`Sifting shrine needs a longer path (got ${path.length})`);
  }
  return {
    urn: { ...path[8]! },
    lightPedestal: { ...path[12]! },
    heavyPedestal: { ...path[14]! },
    gate: { ...path[path.length - 2]! },
    goal: { ...goal },
  };
}

export function createInitialSiftingState(): SiftingState {
  return {
    carried: [],
    urn: [
      { kind: 'pebble', insertedAt: 0 },
      { kind: 'gold', insertedAt: 1 },
      { kind: 'feather', insertedAt: 2 },
    ],
    lightPedestal: null,
    heavyPedestal: null,
    insertCounter: 3,
  };
}

export function gateIsOpen(state: SiftingState): boolean {
  return state.lightPedestal !== null && state.heavyPedestal !== null;
}

/** The cell the gate stands on is impassable until both pedestals are filled. */
export function canEnterCell(layout: SiftingLayout, state: SiftingState, cell: Position): boolean {
  if (positionKey(cell) === positionKey(layout.gate)) {
    return gateIsOpen(state);
  }
  return true;
}

export type SiftingAction =
  | { readonly tag: 'toss' }
  | { readonly tag: 'sift' }
  | { readonly tag: 'place-light' }
  | { readonly tag: 'place-heavy' }
  | { readonly tag: 'drop' };

export type SiftingResult =
  | { readonly ok: true; readonly state: SiftingState; readonly message: string }
  | { readonly ok: false; readonly state: SiftingState; readonly message: string };

/** Toss every carried seed into the urn. */
export function tossIntoUrn(state: SiftingState): SiftingResult {
  if (state.carried.length === 0) {
    return { ok: false, state, message: '怀里空空如也，没什么可投的。' };
  }
  const additions = state.carried.map((kind, index) => ({
    kind,
    insertedAt: state.insertCounter + index,
  }));
  return {
    ok: true,
    state: {
      ...state,
      carried: [],
      urn: [...state.urn, ...additions],
      insertCounter: state.insertCounter + additions.length,
    },
    message: `你把 ${state.carried.map((kind) => SEED_LABEL[kind]).join('、')} 投进了祭坛。`,
  };
}

/** The urn's single stable rule: lightest first, oldest breaks ties. */
export function siftFromUrn(state: SiftingState): SiftingResult {
  if (state.urn.length === 0) {
    return { ok: false, state, message: '祭坛里已经没有东西了。' };
  }
  if (state.carried.length >= CARRY_LIMIT) {
    return { ok: false, state, message: '怀里装满了，祭坛的吐出口卡住了。' };
  }
  let lightestIndex = 0;
  for (let index = 1; index < state.urn.length; index += 1) {
    const candidate = state.urn[index]!;
    const current = state.urn[lightestIndex]!;
    if (
      SEED_WEIGHT[candidate.kind] < SEED_WEIGHT[current.kind] ||
      (SEED_WEIGHT[candidate.kind] === SEED_WEIGHT[current.kind] &&
        candidate.insertedAt < current.insertedAt)
    ) {
      lightestIndex = index;
    }
  }
  const released = state.urn[lightestIndex]!;
  return {
    ok: true,
    state: {
      ...state,
      carried: [...state.carried, released.kind],
      urn: state.urn.filter((_, index) => index !== lightestIndex),
    },
    message: `祭坛吐出了${SEED_WEIGHT[released.kind] === 1 ? '最轻的' : '此刻最轻的'}：${SEED_LABEL[released.kind]}。`,
  };
}

export function placeOnPedestal(
  state: SiftingState,
  pedestal: 'light' | 'heavy',
): SiftingResult {
  const wanted: SeedKind = pedestal === 'light' ? 'feather' : 'gold';
  const heldIndex = state.carried.indexOf(wanted);
  const alreadyFilled =
    pedestal === 'light' ? state.lightPedestal !== null : state.heavyPedestal !== null;
  if (alreadyFilled) {
    return { ok: false, state, message: '石台上已经安放好了。' };
  }
  if (state.carried.length === 0) {
    return { ok: false, state, message: '石台空空地等着，你怀里也空空的。' };
  }
  if (heldIndex === -1) {
    return {
      ok: false,
      state,
      message:
        pedestal === 'light'
          ? '石台轻轻弹开了它——这座石台只认最轻的那一枚。'
          : '石台纹丝不动——这座石台只认最有分量的那一枚。',
    };
  }
  const nextCarried = state.carried.filter((_, index) => index !== heldIndex);
  const next: SiftingState = {
    ...state,
    carried: nextCarried,
    lightPedestal: pedestal === 'light' ? wanted : state.lightPedestal,
    heavyPedestal: pedestal === 'heavy' ? wanted : state.heavyPedestal,
  };
  const opened = gateIsOpen(next) && !gateIsOpen(state);
  return {
    ok: true,
    state: next,
    message: opened
      ? `${SEED_LABEL[wanted]}落位！远处石门轰然开启。`
      : `${SEED_LABEL[wanted]}稳稳落在石台上。`,
  };
}

/** Drop the first carried seed onto the current cell. */
export function dropCarried(state: SiftingState): SiftingResult {
  if (state.carried.length === 0) {
    return { ok: false, state, message: '怀里没有东西可放。' };
  }
  const [dropped, ...rest] = state.carried;
  return {
    ok: true,
    state: { ...state, carried: rest },
    message: `你把${SEED_LABEL[dropped!]}放在了脚边。`,
  };
}

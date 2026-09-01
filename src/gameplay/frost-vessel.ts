import {
  authoredCellAt,
  type AuthoredRoom,
} from '@/world/authored-world';
import {
  canTraverse,
  createTraversalEdge,
} from '@/world/traversal';
import type { Position } from '@/world/types';

export const FROST_RADIUS = 2;
export const FROST_LIFETIME = 4;

export interface FrostVesselState {
  readonly acquired: boolean;
  /** Cell key `${x},${y}` → remaining accepted movement steps. */
  readonly frozen: Readonly<Record<string, number>>;
  readonly relicTaken: boolean;
  readonly drownCount: number;
}

export interface FrostTrial {
  readonly vessel: Position;
  readonly relic: Position;
  /** Explicit authored shore used after a soft drowning failure. */
  readonly reset: Position;
}

export interface FrostCastResult {
  readonly state: FrostVesselState;
  readonly newlyFrozen: number;
}

export interface FrostAdvanceResult {
  readonly state: FrostVesselState;
  readonly drowned: boolean;
  readonly meltedCount: number;
}

function positionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

function manhattan(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function freezeState(state: FrostVesselState): FrostVesselState {
  return Object.freeze({
    ...state,
    frozen: Object.freeze({ ...state.frozen }),
  });
}

export function createInitialFrostState(): FrostVesselState {
  return freezeState({
    acquired: false,
    frozen: {},
    relicTaken: false,
    drownCount: 0,
  });
}

export function frostTrialForRoom(room: AuthoredRoom): FrostTrial | undefined {
  const vessel = room.features?.find((feature) => feature.kind === 'frost-vessel');
  const relic = room.features?.find((feature) => feature.kind === 'relic');
  if (!vessel || !relic) {
    return undefined;
  }
  return {
    vessel: { ...vessel.position },
    relic: { ...relic.position },
    reset: { ...room.spawn },
  };
}

export function isFrozen(
  state: FrostVesselState,
  position: Position,
): boolean {
  return state.frozen[positionKey(position)] !== undefined;
}

export function castFrost(
  state: FrostVesselState,
  room: AuthoredRoom,
  center: Position,
): FrostCastResult {
  const frozen: Record<string, number> = { ...state.frozen };
  let newlyFrozen = 0;

  for (let dy = -FROST_RADIUS; dy <= FROST_RADIUS; dy += 1) {
    for (let dx = -FROST_RADIUS; dx <= FROST_RADIUS; dx += 1) {
      const candidate = { x: center.x + dx, y: center.y + dy };
      if (manhattan(center, candidate) > FROST_RADIUS) {
        continue;
      }
      if (authoredCellAt(room, candidate)?.surface !== 'water') {
        continue;
      }

      const key = positionKey(candidate);
      if (frozen[key] === undefined) {
        newlyFrozen += 1;
      }
      frozen[key] = FROST_LIFETIME;
    }
  }

  return {
    state: freezeState({
      ...state,
      frozen,
    }),
    newlyFrozen,
  };
}

export function canTraverseWithFrost(
  state: FrostVesselState,
  room: AuthoredRoom,
  from: Position,
  target: Position,
): boolean {
  const fromCell = authoredCellAt(room, from);
  const targetCell = authoredCellAt(room, target);
  if (!fromCell || !targetCell) {
    return false;
  }

  const fromWalkable = fromCell.walkable || (
    fromCell.surface === 'water' && isFrozen(state, from)
  );
  const targetWalkable = targetCell.walkable || (
    targetCell.surface === 'water' && isFrozen(state, target)
  );
  if (!fromWalkable || !targetWalkable) {
    return false;
  }

  return canTraverse(
    { ...fromCell, walkable: fromWalkable },
    { ...targetCell, walkable: targetWalkable },
    createTraversalEdge(from, target),
    {},
  );
}

export function advanceFrost(
  state: FrostVesselState,
  room: AuthoredRoom,
  player: Position,
): FrostAdvanceResult {
  const frozen: Record<string, number> = {};
  let meltedCount = 0;
  for (const [key, life] of Object.entries(state.frozen)) {
    const next = life - 1;
    if (next <= 0) {
      meltedCount += 1;
      continue;
    }
    frozen[key] = next;
  }

  const standingOnMeltedWater = authoredCellAt(room, player)?.surface === 'water'
    && frozen[positionKey(player)] === undefined;
  if (standingOnMeltedWater) {
    return {
      state: freezeState({
        ...state,
        frozen: {},
        drownCount: state.drownCount + 1,
      }),
      drowned: true,
      meltedCount,
    };
  }

  return {
    state: freezeState({
      ...state,
      frozen,
    }),
    drowned: false,
    meltedCount,
  };
}

export function clearActiveFrost(state: FrostVesselState): FrostVesselState {
  return freezeState({
    ...state,
    frozen: {},
  });
}

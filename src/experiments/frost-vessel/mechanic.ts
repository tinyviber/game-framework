/**
 * NIGHT PROTOTYPE C — 冻泉法器 (Frost Vessel)
 * Terrain state rewriting: the player briefly rewrites water into walkable
 * ice, but every step the player takes wears the ice down. Standing on ice
 * when it melts means falling into the water and being swept back to shore.
 *
 * The hidden computational structure is a time-varying rewrite of the
 * reachability closure: each cast replaces a local patch of the traversal
 * graph (water cells become walkable), and movement ticks a global clock
 * that shrinks the patch back. The player is learning a budgeted
 * walkability-rewrite rule, not "BFS on a dynamic graph".
 */
import type { LocalWorldState, Position } from '@/world/types';
import { generatedCellAt, type GeneratedWorld } from '@/world/generated-world';
import { applyScopedOperation } from '@/world/operation';
import {
  GENERATED_PLAYER_ID,
  moveGeneratedPlayer,
  playerPosition,
  type GeneratedDirection,
  type GeneratedPlayground,
} from '@/chapters/chapter-13/generated-playground';

export const FROST_RADIUS = 2;
export const FROST_LIFETIME = 4;
/** The treasure must sit 2–3 water cells off shore so a relay of casts is needed. */
export const TREASURE_MIN_DEPTH = 2;
export const TREASURE_MAX_DEPTH = 3;

export type FrostEvent =
  | 'moved'
  | 'blocked'
  | 'drowned'
  | 'took-treasure'
  | 'cast-frost';

export interface FrostVesselState {
  /** cellKey `${x},${y}` → remaining steps of life. */
  readonly frozen: Readonly<Record<string, number>>;
  readonly treasureTaken: boolean;
  readonly drownCount: number;
}

export interface FrostTrial {
  /** The shore cell the player starts on (walkable, adjacent to water). */
  readonly spawn: Position;
  /** The water cell holding the treasure (reachable after a few casts). */
  readonly treasure: Position;
  /** Depth of the treasure measured in water cells from the shore. */
  readonly depth: number;
  /** The connected water cells of the pocket (debug/visualization aid). */
  readonly riverCells: readonly Position[];
}

const DIRECTIONS: readonly Position[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];

function positionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

function manhattan(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function createInitialFrostState(): FrostVesselState {
  return {
    frozen: {},
    treasureTaken: false,
    drownCount: 0,
  };
}

export function isFrozen(state: FrostVesselState, position: Position): boolean {
  return state.frozen[positionKey(position)] !== undefined;
}

export function isWaterAt(world: GeneratedWorld, position: Position): boolean {
  return generatedCellAt(world, position)?.surface === 'water';
}

export function isWalkableAt(world: GeneratedWorld, position: Position): boolean {
  return generatedCellAt(world, position)?.walkable === true;
}

function nextFacing(direction: GeneratedDirection): 'left' | 'right' {
  return direction === 'left' ? 'left' : 'right';
}

/**
 * Freeze every water cell within FROST_RADIUS (Manhattan) of the center.
 * Already-frozen cells get their life refreshed. Returns a new state and the
 * number of cells that were newly frozen (for feedback).
 */
export function castFrost(
  state: FrostVesselState,
  world: GeneratedWorld,
  center: Position,
): { readonly state: FrostVesselState; readonly frozenCount: number } {
  const frozen: Record<string, number> = { ...state.frozen };
  let newlyFrozen = 0;
  for (let dy = -FROST_RADIUS; dy <= FROST_RADIUS; dy += 1) {
    for (let dx = -FROST_RADIUS; dx <= FROST_RADIUS; dx += 1) {
      const candidate = { x: center.x + dx, y: center.y + dy };
      if (manhattan(center, candidate) > FROST_RADIUS) {
        continue;
      }
      if (!isWaterAt(world, candidate)) {
        continue;
      }
      const key = positionKey(candidate);
      const wasFrozen = frozen[key] !== undefined;
      frozen[key] = FROST_LIFETIME;
      if (!wasFrozen) {
        newlyFrozen += 1;
      }
    }
  }
  return {
    state: {
      frozen,
      treasureTaken: state.treasureTaken,
      drownCount: state.drownCount,
    },
    frozenCount: newlyFrozen,
  };
}

/**
 * Every step the player takes wears all ice down by one. Ice that reaches
 * zero melts back into water. If the player then stands on water, they fall
 * in: swept back to the nearest walkable shore cell and the whole frost
 * patch melts away (the commotion breaks the spell).
 */
export function advanceFrost(
  state: FrostVesselState,
  world: GeneratedWorld,
  player: Position,
): { readonly state: FrostVesselState; readonly drowned: boolean; readonly meltedCount: number } {
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

  const standingCell = generatedCellAt(world, player);
  const standingOnWater = !standingCell?.walkable && frozen[positionKey(player)] === undefined;
  if (!standingOnWater) {
    return {
      state: { frozen, treasureTaken: state.treasureTaken, drownCount: state.drownCount },
      drowned: false,
      meltedCount,
    };
  }

  return {
    state: {
      // The whole spell breaks when the caster falls in.
      frozen: {},
      treasureTaken: state.treasureTaken,
      drownCount: state.drownCount + 1,
    },
    drowned: true,
    meltedCount,
  };
}

export function nearestWalkableCell(
  world: GeneratedWorld,
  from: Position,
): Position {
  const queue: Position[] = [{ ...from }];
  const visited = new Set<string>([positionKey(from)]);
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    if (isWalkableAt(world, current)) {
      return current;
    }
    for (const delta of DIRECTIONS) {
      const next = { x: current.x + delta.x, y: current.y + delta.y };
      const key = positionKey(next);
      if (visited.has(key) || generatedCellAt(world, next) === undefined) {
        continue;
      }
      visited.add(key);
      queue.push(next);
    }
  }
  // The world always has walkable cells; this is unreachable in practice.
  return { ...from };
}

export interface FrostMoveResult {
  readonly accepted: boolean;
  readonly state: FrostVesselState;
  /** World state after the move (same reference when blocked). */
  readonly worldState: LocalWorldState;
  readonly event: FrostEvent;
}

/**
 * Movement with frost preflight. Walking onto a frozen water cell is legal;
 * walking onto unfrozen water is blocked (the river rejects you). After an
 * accepted move the frost clock ticks; standing on melted ice drowns you and
 * the spell shatters. Standing on the treasure cell takes it.
 */
export function tryMoveFrost(
  playground: GeneratedPlayground,
  state: LocalWorldState,
  frost: FrostVesselState,
  direction: GeneratedDirection,
  treasure: Position,
): FrostMoveResult {
  const position = playerPosition(state);
  const delta: Position =
    direction === 'up'
      ? { x: 0, y: -1 }
      : direction === 'down'
        ? { x: 0, y: 1 }
        : direction === 'left'
          ? { x: -1, y: 0 }
          : { x: 1, y: 0 };
  const target = { x: position.x + delta.x, y: position.y + delta.y };

  const targetCell = generatedCellAt(playground.world, target);
  const steppingOnFrost = isFrozen(frost, target);
  const steppingOnWalkable = targetCell?.walkable === true;

  if (!steppingOnFrost && !steppingOnWalkable) {
    return { accepted: false, state: frost, worldState: state, event: 'blocked' };
  }

  let worldState: typeof state;
  if (steppingOnFrost) {
    const result = applyScopedOperation(state, playground.scope, (context) => {
      const player = context.state.objects[GENERATED_PLAYER_ID];
      if (!player || player.kind !== 'main-character') {
        throw new Error('Frost vessel player is missing');
      }
      return {
        changes: [
          {
            objectId: GENERATED_PLAYER_ID,
            state: { ...player, position: { ...target }, facing: nextFacing(direction) },
          },
        ],
        events: [{ tag: 'moved', objectId: GENERATED_PLAYER_ID }],
      };
    });
    worldState = result.accepted ? result.state : state;
  } else {
    worldState = moveGeneratedPlayer(playground, state, direction).state;
  }

  const nextPosition = playerPosition(worldState);
  const advanced = advanceFrost(frost, playground.world, nextPosition);
  let nextFrost = advanced.state;

  let event: FrostEvent = advanced.drowned ? 'drowned' : 'moved';
  if (advanced.drowned) {
    // The river sweeps the player to the nearest walkable shore cell.
    const shore = nearestWalkableCell(playground.world, nextPosition);
    const swept = applyScopedOperation(worldState, playground.scope, (context) => {
      const player = context.state.objects[GENERATED_PLAYER_ID];
      if (!player || player.kind !== 'main-character') {
        throw new Error('Frost vessel player is missing');
      }
      return {
        changes: [
          {
            objectId: GENERATED_PLAYER_ID,
            state: { ...player, position: { ...shore }, facing: player.facing },
          },
        ],
        events: [{ tag: 'moved', objectId: GENERATED_PLAYER_ID }],
      };
    });
    worldState = swept.accepted ? swept.state : worldState;
  } else if (samePosition(nextPosition, treasure)) {
    nextFrost = { ...nextFrost, treasureTaken: true };
    event = 'took-treasure';
  }

  return { accepted: true, state: nextFrost, worldState, event };
}

/**
 * Find a small playable scenario in a generated world: a walkable shore cell
 * whose adjacent water pocket holds a cell 2–3 water-steps out. The treasure
 * must sit like an island in the river (at least three water neighbours) and
 * stay at least two cells away from any dry land, so the player cannot simply
 * circle around and grab it with a single cast.
 */
export function findFrostTrial(world: GeneratedWorld): FrostTrial | null {
  for (const preferredDepth of [TREASURE_MAX_DEPTH, TREASURE_MIN_DEPTH]) {
    for (const row of world.cells) {
      for (const cell of row) {
        if (!cell.walkable) {
          continue;
        }
        const shore: Position = { x: cell.x, y: cell.y };
        for (const delta of DIRECTIONS) {
          const waterStart = { x: shore.x + delta.x, y: shore.y + delta.y };
          if (!isWaterAt(world, waterStart)) {
            continue;
          }
          // BFS through water only, up to TREASURE_MAX_DEPTH.
          const queue: Array<{ readonly p: Position; readonly depth: number }> = [
            { p: waterStart, depth: 1 },
          ];
          const visited = new Set<string>([positionKey(waterStart)]);
          for (let head = 0; head < queue.length; head += 1) {
            const current = queue[head]!;
            if (current.depth === preferredDepth) {
              const waterNeighbours = DIRECTIONS.filter((step) =>
                isWaterAt(world, { x: current.p.x + step.x, y: current.p.y + step.y }),
              ).length;
              // Island-like treasure: fully surrounded by water, so it cannot
              // be grabbed from a neighbouring bank with a single cast.
              const fullyInRiver = waterNeighbours === 4;
              // Dry land reachable within two water steps (a shore exists for
              // drowning resets and the trial stays physically plausible).
              const dryLandWithinTwo = DIRECTIONS.some((step) => {
                const mid = { x: current.p.x + step.x, y: current.p.y + step.y };
                if (!isWaterAt(world, mid)) {
                  return false;
                }
                return DIRECTIONS.some((inner) => {
                  const far = { x: mid.x + inner.x, y: mid.y + inner.y };
                  const farCell = generatedCellAt(world, far);
                  return farCell !== undefined && farCell.surface !== 'water';
                });
              });
              if (fullyInRiver && dryLandWithinTwo) {
                const riverCells = Array.from(visited, (key) => {
                  const [x, y] = key.split(',').map(Number);
                  return { x, y };
                });
                return {
                  spawn: { ...shore },
                  treasure: { ...current.p },
                  depth: current.depth,
                  riverCells,
                };
              }
            }
            if (current.depth >= TREASURE_MAX_DEPTH) {
              continue;
            }
            for (const step of DIRECTIONS) {
              const next = { x: current.p.x + step.x, y: current.p.y + step.y };
              const key = positionKey(next);
              if (visited.has(key) || !isWaterAt(world, next)) {
                continue;
              }
              visited.add(key);
              queue.push({ p: next, depth: current.depth + 1 });
            }
          }
        }
      }
    }
  }
  return null;
}

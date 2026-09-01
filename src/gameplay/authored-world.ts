import {
  applyScopedOperation,
  type ClosureScope,
} from '@/world/operation';
import { initializeLocalWorld } from '@/world/local-world';
import {
  authoredCellAt,
  getAuthoredRoom,
  type AuthoredDirection,
  type AuthoredExit,
  type AuthoredRoom,
  type AuthoredWorld,
} from '@/world/authored-world';
import {
  createClosureId,
  createObjectId,
  createRoomDefinition as freezeRoomDefinition,
  type LocalWorldState,
  type ObjectState,
  type OperationEvent,
  type Position,
  type RoomDefinition,
  type RoomId,
} from '@/world/types';
import { movementIsLegal } from '@/world/spatial';
import {
  advanceFrost,
  canTraverseWithFrost,
  castFrost,
  clearActiveFrost,
  createInitialFrostState,
  featurePosition,
  frostResetForRoom,
  type FrostVesselState,
} from './frost-vessel';
import {
  transitionRoom,
  type RoomCatalog,
} from '@/world/transition';

export const AUTHORED_PLAYER_ID = createObjectId('authored-player');

const DELTAS: Readonly<Record<AuthoredDirection, Position>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export interface AuthoredGame {
  readonly world: AuthoredWorld;
  readonly catalog: RoomCatalog;
  readonly scopes: Readonly<Record<RoomId, ClosureScope>>;
}

export interface AuthoredPlayState {
  readonly game: AuthoredGame;
  readonly currentRoomId: RoomId;
  readonly localState: LocalWorldState;
  readonly frostVessel: FrostVesselState;
}

export type AuthoredMoveEvent = 'moved' | 'drowned' | 'relic-taken';

export type AuthoredMoveResult =
  | {
      readonly accepted: true;
      readonly state: AuthoredPlayState;
      readonly events: readonly OperationEvent[];
      readonly event: AuthoredMoveEvent;
    }
  | {
      readonly accepted: false;
      readonly state: AuthoredPlayState;
      readonly reason: 'blocked' | 'transition-failed' | 'operation-failed';
    };

function boundsFor(room: AuthoredRoom): NonNullable<RoomDefinition['bounds']> {
  return {
    minX: 0,
    maxX: room.width - 1,
    minY: 0,
    maxY: room.height - 1,
  };
}

function buildRoomDefinition(room: AuthoredRoom): RoomDefinition {
  const playerPosition = room.spawn;
  const closureId = createClosureId(`authored-${room.id}`);
  return freezeRoomDefinition({
    roomId: room.id,
    closureId,
    bounds: boundsFor(room),
    staticObjects: [],
    mutableObjects: [
      {
        id: AUTHORED_PLAYER_ID,
        kind: 'main-character',
        position: { ...playerPosition },
        tags: ['authored-world'],
        initialState: {
          kind: 'main-character',
          position: { ...playerPosition },
          facing: 'right',
        },
      },
    ],
    validateEntry: (entry) => {
      const x = entry.spawnX;
      const y = entry.spawnY;
      return (
        typeof x === 'number'
        && Number.isInteger(x)
        && typeof y === 'number'
        && Number.isInteger(y)
        && authoredCellAt(room, { x, y })?.walkable === true
      );
    },
    initialize: ({ entry, persistentMetadata }) => ({
      roomId: room.id,
      closureId,
      entry,
      persistentMetadata,
      objects: {
        [AUTHORED_PLAYER_ID]: {
          kind: 'main-character',
          position: {
            x: entry.spawnX as number,
            y: entry.spawnY as number,
          },
          facing: 'right',
        },
      },
      lastEvents: [],
    }),
  });
}

export function createAuthoredGame(world: AuthoredWorld): AuthoredGame {
  const definitions = world.rooms.map(buildRoomDefinition);
  const catalog = {} as Record<RoomId, RoomDefinition | undefined>;
  const scopes = {} as Record<RoomId, ClosureScope>;

  for (const [index, room] of world.rooms.entries()) {
    const definition = definitions[index]!;
    catalog[room.id] = definition;
    scopes[room.id] = {
      closureId: definition.closureId,
      allowedObjectIds: [AUTHORED_PLAYER_ID],
    };
  }

  return {
    world,
    catalog: Object.freeze(catalog),
    scopes: Object.freeze(scopes),
  };
}

function initializeRoom(
  game: AuthoredGame,
  roomId: RoomId,
  position: Position,
): LocalWorldState {
  const definition = game.catalog[roomId];
  if (!definition) {
    throw new Error(`Unknown authored room: ${roomId}`);
  }
  return initializeLocalWorld(
    definition,
    { spawnX: position.x, spawnY: position.y },
    {},
  );
}

export function createAuthoredPlayState(
  game: AuthoredGame,
  roomId: RoomId = game.world.startRoomId,
  position?: Position,
): AuthoredPlayState {
  const room = getAuthoredRoom(game.world, roomId);
  const spawn = position ?? room.spawn;
  return {
    game,
    currentRoomId: roomId,
    localState: initializeRoom(game, roomId, spawn),
    frostVessel: createInitialFrostState(),
  };
}

export function resetAuthoredPlayState(game: AuthoredGame): AuthoredPlayState {
  return createAuthoredPlayState(game);
}

export function authoredPlayerPosition(state: AuthoredPlayState): Position {
  const player = state.localState.objects[AUTHORED_PLAYER_ID];
  if (!player || player.kind !== 'main-character') {
    throw new Error('Authored world player is missing');
  }
  return player.position;
}

export function authoredCurrentRoom(state: AuthoredPlayState): AuthoredRoom {
  return getAuthoredRoom(state.game.world, state.currentRoomId);
}

export function detectAuthoredExit(
  room: AuthoredRoom,
  position: Position,
  direction: AuthoredDirection,
): AuthoredExit | undefined {
  return room.exits.find((exit) =>
    exit.direction === direction
    && exit.position.x === position.x
    && exit.position.y === position.y,
  );
}

function transitionThroughExit(
  state: AuthoredPlayState,
  exit: AuthoredExit,
): AuthoredMoveResult {
  const transition = transitionRoom(
    state.localState,
    state.game.catalog,
    exit.targetRoomId,
    { spawnX: exit.targetEntry.x, spawnY: exit.targetEntry.y },
  );
  if (!transition.accepted) {
    return { accepted: false, state, reason: 'transition-failed' };
  }
  return {
    accepted: true,
    state: {
      game: state.game,
      currentRoomId: transition.toRoomId,
      localState: transition.state,
      frostVessel: clearActiveFrost(state.frostVessel),
    },
    events: transition.state.lastEvents,
    event: 'moved',
  };
}

function movePlayerState(
  state: LocalWorldState,
  scope: ClosureScope,
  target: Position,
  direction: AuthoredDirection,
): LocalWorldState | undefined {
  const result = applyScopedOperation(state, scope, (context) => {
    const player = context.state.objects[AUTHORED_PLAYER_ID];
    if (!player || player.kind !== 'main-character') {
      throw new Error('Authored world player is missing');
    }
    const nextPlayer: ObjectState = {
      ...player,
      position: target,
      facing: direction === 'left' ? 'left' : direction === 'right' ? 'right' : player.facing,
    };
    return {
      changes: [{ objectId: AUTHORED_PLAYER_ID, state: nextPlayer }],
      events: [{ tag: 'moved', objectId: AUTHORED_PLAYER_ID }],
    };
  });
  return result.accepted ? result.state : undefined;
}

export function moveAuthoredPlayer(
  state: AuthoredPlayState,
  direction: AuthoredDirection,
): AuthoredMoveResult {
  const room = authoredCurrentRoom(state);
  const position = authoredPlayerPosition(state);
  const delta = DELTAS[direction];
  const target = { x: position.x + delta.x, y: position.y + delta.y };
  const leavingExit = detectAuthoredExit(room, position, direction);
  const bounds = boundsFor(room);
  if (!movementIsLegal(bounds, target)) {
    return leavingExit
      ? transitionThroughExit(state, leavingExit)
      : { accepted: false, state, reason: 'blocked' };
  }

  const fromCell = authoredCellAt(room, position);
  const toCell = authoredCellAt(room, target);
  if (
    !fromCell
    || !toCell
    || !canTraverseWithFrost(state.frostVessel, room, position, target)
  ) {
    return { accepted: false, state, reason: 'blocked' };
  }

  const scope = state.game.scopes[state.currentRoomId];
  if (!scope) {
    return { accepted: false, state, reason: 'operation-failed' };
  }
  const moved = movePlayerState(state.localState, scope, target, direction);
  if (!moved) {
    return { accepted: false, state, reason: 'operation-failed' };
  }

  let frostVessel = state.frostVessel;
  let localState = moved;
  let event: AuthoredMoveEvent = 'moved';
  if (frostVessel.acquired) {
    const advanced = advanceFrost(frostVessel, room, target);
    frostVessel = advanced.state;
    if (advanced.drowned) {
      const reset = movePlayerState(localState, scope, frostResetForRoom(room), direction);
      if (!reset) {
        return { accepted: false, state, reason: 'operation-failed' };
      }
      localState = reset;
      event = 'drowned';
    } else {
      const relic = featurePosition(room, 'relic');
      if (!frostVessel.relicTaken && relic && target.x === relic.x && target.y === relic.y) {
        frostVessel = Object.freeze({ ...frostVessel, relicTaken: true });
        event = 'relic-taken';
      }
    }
  }

  return {
    accepted: true,
    state: {
      game: state.game,
      currentRoomId: state.currentRoomId,
      localState,
      frostVessel,
    },
    events: localState.lastEvents,
    event,
  };
}

export type AuthoredInteractionKind = 'vessel-acquired' | 'inspected';

export interface AuthoredInteractionResult {
  readonly state: AuthoredPlayState;
  readonly kind: AuthoredInteractionKind;
}

function near(a: Position, b: Position): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1;
}

export function interactAuthoredPlayer(
  state: AuthoredPlayState,
): AuthoredInteractionResult {
  const vessel = featurePosition(authoredCurrentRoom(state), 'frost-vessel');
  if (vessel && !state.frostVessel.acquired && near(authoredPlayerPosition(state), vessel)) {
    return {
      state: {
        ...state,
        frostVessel: Object.freeze({ ...state.frostVessel, acquired: true }),
      },
      kind: 'vessel-acquired',
    };
  }
  return { state, kind: 'inspected' };
}

export type AuthoredCastFailure = 'vessel-not-acquired';

export type AuthoredCastResult =
  | {
      readonly accepted: true;
      readonly state: AuthoredPlayState;
      readonly newlyFrozen: number;
    }
  | {
      readonly accepted: false;
      readonly state: AuthoredPlayState;
      readonly reason: AuthoredCastFailure;
    };

export function castAuthoredFrost(
  state: AuthoredPlayState,
): AuthoredCastResult {
  if (!state.frostVessel.acquired) {
    return { accepted: false, state, reason: 'vessel-not-acquired' };
  }
  const room = authoredCurrentRoom(state);
  const cast = castFrost(state.frostVessel, room, authoredPlayerPosition(state));
  return {
    accepted: true,
    state: {
      ...state,
      frostVessel: cast.state,
    },
    newlyFrozen: cast.newlyFrozen,
  };
}

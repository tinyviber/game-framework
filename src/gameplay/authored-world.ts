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
  canTraverse,
  createTraversalEdge,
} from '@/world/traversal';
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
}

export type AuthoredMoveResult =
  | {
      readonly accepted: true;
      readonly state: AuthoredPlayState;
      readonly events: readonly OperationEvent[];
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
  position: Position = game.world.startPosition,
): AuthoredPlayState {
  return {
    game,
    currentRoomId: roomId,
    localState: initializeRoom(game, roomId, position),
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

function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
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
    },
    events: transition.state.lastEvents,
  };
}

export function moveAuthoredPlayer(
  state: AuthoredPlayState,
  direction: AuthoredDirection,
): AuthoredMoveResult {
  const room = authoredCurrentRoom(state);
  const position = authoredPlayerPosition(state);
  const delta = DELTAS[direction];
  const target = { x: position.x + delta.x, y: position.y + delta.y };
  const enteringExit = room.exits.find((exit) =>
    exit.direction === direction && samePosition(exit.position, target),
  );
  if (enteringExit) {
    return transitionThroughExit(state, enteringExit);
  }

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
    || !canTraverse(fromCell, toCell, createTraversalEdge(position, target), {})
  ) {
    return { accepted: false, state, reason: 'blocked' };
  }

  const scope = state.game.scopes[state.currentRoomId];
  if (!scope) {
    return { accepted: false, state, reason: 'operation-failed' };
  }
  const result = applyScopedOperation(state.localState, scope, (context) => {
    const player = context.state.objects[AUTHORED_PLAYER_ID];
    if (!player || player.kind !== 'main-character') {
      throw new Error('Authored world player is missing');
    }
    const nextPlayer: ObjectState = {
      ...player,
      position: target,
      facing: direction === 'left' ? 'left' : 'right',
    };
    return {
      changes: [{ objectId: AUTHORED_PLAYER_ID, state: nextPlayer }],
      events: [{ tag: 'moved', objectId: AUTHORED_PLAYER_ID }],
    };
  });

  if (!result.accepted) {
    return { accepted: false, state, reason: 'operation-failed' };
  }
  return {
    accepted: true,
    state: {
      game: state.game,
      currentRoomId: state.currentRoomId,
      localState: result.state,
    },
    events: result.events,
  };
}

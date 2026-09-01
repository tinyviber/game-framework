import {
  applyScopedOperation,
  type ClosureScope,
} from '@/world/operation';
import { tryInitializeLocalWorld } from '@/world/local-world';
import {
  generatedCellAt,
  resolveGeneratedEdge,
  type GeneratedWorld,
} from '@/world/generated-world';
import {
  canTraverse,
  type PlayerCapabilities,
} from '@/world/traversal';
import {
  createClosureId,
  createObjectId,
  createRoomId,
  type LocalWorldState,
  type ObjectState,
  type OperationEvent,
  type Position,
  type RoomDefinition,
} from '@/world/types';

export const GENERATED_PLAYER_ID = createObjectId('generated-player');
export const GENERATED_ROOM_ID = createRoomId('generated-playground');
export const GENERATED_CLOSURE_ID = createClosureId('generated-playground');

export type GeneratedDirection = 'up' | 'down' | 'left' | 'right';

export interface GeneratedPlayground {
  readonly world: GeneratedWorld;
  readonly definition: RoomDefinition;
  readonly scope: ClosureScope;
  readonly initialState: LocalWorldState;
}

export type GeneratedMoveResult =
  | {
      readonly accepted: true;
      readonly state: LocalWorldState;
      readonly events: readonly OperationEvent[];
    }
  | {
      readonly accepted: false;
      readonly state: LocalWorldState;
      readonly reason: 'blocked' | 'operation-failed';
    };

const DELTAS: Readonly<Record<GeneratedDirection, Position>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function isValidSpawn(world: GeneratedWorld, entry: Readonly<Record<string, unknown>>): boolean {
  const x = entry.spawnX;
  const y = entry.spawnY;
  return (
    typeof x === 'number' &&
    typeof y === 'number' &&
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    generatedCellAt(world, { x, y })?.walkable === true
  );
}

function createDefinition(world: GeneratedWorld): RoomDefinition {
  return {
    roomId: GENERATED_ROOM_ID,
    closureId: GENERATED_CLOSURE_ID,
    bounds: {
      minX: 0,
      maxX: world.width - 1,
      minY: 0,
      maxY: world.height - 1,
    },
    staticObjects: [],
    mutableObjects: [
      {
        id: GENERATED_PLAYER_ID,
        kind: 'main-character',
        position: { ...world.start },
        tags: ['generated-playground'],
        initialState: {
          kind: 'main-character',
          position: { ...world.start },
          facing: 'right',
        },
      },
    ],
    validateEntry: (entry) => isValidSpawn(world, entry),
    initialize: ({ entry, persistentMetadata }) => {
      const spawn = {
        x: entry.spawnX as number,
        y: entry.spawnY as number,
      };
      return {
        roomId: GENERATED_ROOM_ID,
        closureId: GENERATED_CLOSURE_ID,
        entry,
        persistentMetadata,
        objects: {
          [GENERATED_PLAYER_ID]: {
            kind: 'main-character',
            position: spawn,
            facing: 'right',
          },
        },
        lastEvents: [],
      };
    },
  };
}

export function createGeneratedPlayground(
  world: GeneratedWorld,
  spawn: Position = world.start,
): GeneratedPlayground {
  const definition = createDefinition(world);
  const initialized = tryInitializeLocalWorld(
    definition,
    { spawnX: spawn.x, spawnY: spawn.y },
    {},
  );
  if (!initialized.ok) {
    throw new Error(`Generated playground initialization failed: ${initialized.reason}`);
  }

  return {
    world,
    definition,
    scope: {
      closureId: GENERATED_CLOSURE_ID,
      allowedObjectIds: [GENERATED_PLAYER_ID],
    },
    initialState: initialized.state,
  };
}

export function playerPosition(state: LocalWorldState): Position {
  const player = state.objects[GENERATED_PLAYER_ID];
  if (!player || player.kind !== 'main-character') {
    throw new Error('Generated playground player is missing');
  }
  return player.position;
}

export function generatedGoalReached(
  playground: GeneratedPlayground,
  state: LocalWorldState,
): boolean {
  const position = playerPosition(state);
  return position.x === playground.world.goal.x && position.y === playground.world.goal.y;
}

function nextFacing(direction: GeneratedDirection): 'left' | 'right' {
  return direction === 'left' ? 'left' : 'right';
}

/**
 * Terrain rejection is intentionally a preflight: applyScopedOperation has
 * no rejected-proposal variant. Every accepted mutation still goes through
 * the framework operation primitive; rejected movement returns the original
 * frozen state reference without invoking it.
 */
export function moveGeneratedPlayer(
  playground: GeneratedPlayground,
  state: LocalWorldState,
  direction: GeneratedDirection,
  capabilities: PlayerCapabilities = {},
): GeneratedMoveResult {
  const position = playerPosition(state);
  const delta = DELTAS[direction];
  const target = { x: position.x + delta.x, y: position.y + delta.y };
  const fromCell = generatedCellAt(playground.world, position);
  const toCell = generatedCellAt(playground.world, target);
  const edge = resolveGeneratedEdge(playground.world, position, target);

  if (!fromCell || !toCell || !edge || !canTraverse(fromCell, toCell, edge, capabilities)) {
    return { accepted: false, state, reason: 'blocked' };
  }

  const result = applyScopedOperation(state, playground.scope, (context) => {
    const player = context.state.objects[GENERATED_PLAYER_ID];
    if (!player || player.kind !== 'main-character') {
      throw new Error('Generated playground player is missing');
    }

    const nextPlayer: ObjectState = {
      ...player,
      position: { ...target },
      facing: nextFacing(direction),
    };
    return {
      changes: [{ objectId: GENERATED_PLAYER_ID, state: nextPlayer }],
      events: [{ tag: 'moved', objectId: GENERATED_PLAYER_ID }],
    };
  });

  if (!result.accepted) {
    return { accepted: false, state, reason: 'operation-failed' };
  }

  return result;
}

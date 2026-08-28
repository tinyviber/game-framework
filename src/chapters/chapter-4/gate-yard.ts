import {
  applyScopedOperation,
  type ClosureScope,
  type OperationResult,
  type WorldOperation,
} from '@/world/operation';
import {
  createClosureId,
  createObjectId,
  createRoomDefinition,
  createRoomId,
  type LocalWorldState,
  type ObjectId,
  type RoomDefinition,
  type RoomEntryParameters,
} from '@/world/types';
import type { ClosureContract } from '@/world/closure';
import { initializeLocalWorld } from '@/world/local-world';
import {
  createSpatialIndex,
  movementIsLegal,
} from '@/world/spatial';

export const CHAPTER_4_ROOM_ID = createRoomId('gate-yard');
export const CHAPTER_4_CLOSURE_ID = createClosureId(
  'gate-yard-closure',
);

export const MAIN_CHARACTER_ID = createObjectId(
  'main-character',
);
export const ACTIVATOR_ID = createObjectId('gate-activator');
export const DOOR_ID = createObjectId('gate-door');
export const OBSTACLE_ID = createObjectId('gate-obstacle');
export const EXIT_ID = createObjectId('gate-exit');
export const CHAPTER_4_EXIT_X = 3;

export interface Chapter4EntryParameters extends RoomEntryParameters {
  readonly spawnX: number;
}

const entryIsValid = (
  entry: RoomEntryParameters,
): boolean => {
  const spawnX = entry.spawnX;

  return (
    typeof spawnX === 'number' &&
    Number.isInteger(spawnX) &&
    spawnX >= 0 &&
    spawnX <= 1
  );
};

const chapter4Bounds = {
  minX: 0,
  maxX: CHAPTER_4_EXIT_X,
  minY: 0,
  maxY: 0,
} as const;

export const chapter4RoomDefinition: RoomDefinition =
  createRoomDefinition({
  roomId: CHAPTER_4_ROOM_ID,
  closureId: CHAPTER_4_CLOSURE_ID,
  bounds: chapter4Bounds,
  staticObjects: [
    {
      id: EXIT_ID,
      kind: 'exit',
      position: { x: CHAPTER_4_EXIT_X, y: 0 },
      tags: ['closure-exit'],
    },
  ],
  mutableObjects: [
    {
      id: MAIN_CHARACTER_ID,
      kind: 'main-character',
      position: { x: 0, y: 0 },
      tags: ['player-controlled'],
      initialState: {
        kind: 'main-character',
        position: { x: 0, y: 0 },
        facing: 'right',
      },
    },
    {
      id: ACTIVATOR_ID,
      kind: 'mechanism',
      position: { x: 1, y: 0 },
      tags: ['gate-activator'],
      initialState: {
        kind: 'mechanism',
        active: false,
      },
    },
    {
      id: DOOR_ID,
      kind: 'door',
      position: { x: 2, y: 0 },
      tags: ['gate'],
      initialState: {
        kind: 'door',
        status: 'closed',
      },
    },
    {
      id: OBSTACLE_ID,
      kind: 'obstacle',
      position: { x: 2, y: 0 },
      tags: ['gate-obstacle'],
      initialState: {
        kind: 'obstacle',
        status: 'blocking',
      },
    },
  ],
  validateEntry: entryIsValid,
  initialize: ({ entry, persistentMetadata }) => {
    const gateWasOpened =
      persistentMetadata.gateYardOpened === true;
    const spawnX = entry.spawnX as number;
    const objects: LocalWorldState['objects'] = {
      [MAIN_CHARACTER_ID]: {
        kind: 'main-character',
        position: { x: spawnX, y: 0 },
        facing: 'right',
      },
      [ACTIVATOR_ID]: {
        kind: 'mechanism',
        active: gateWasOpened,
      },
      [DOOR_ID]: {
        kind: 'door',
        status: gateWasOpened ? 'open' : 'closed',
      },
      [OBSTACLE_ID]: {
        kind: 'obstacle',
        status: gateWasOpened ? 'cleared' : 'blocking',
      },
    };

    return {
      roomId: CHAPTER_4_ROOM_ID,
      closureId: CHAPTER_4_CLOSURE_ID,
      entry,
      persistentMetadata,
      objects,
      lastEvents: [],
    };
  },
  });

/**
 * Spatial queries derived from room definitions, so movement rules
 * reference object positions from data instead of hardcoded cells.
 */
const chapter4SpatialIndex = createSpatialIndex([
  ...chapter4RoomDefinition.staticObjects,
  ...chapter4RoomDefinition.mutableObjects,
]);

function objectState(
  state: LocalWorldState,
  objectId: ObjectId,
) {
  const value = state.objects[objectId];

  if (!value) {
    throw new Error(`Missing Chapter 4 object ${objectId}`);
  }

  return value;
}

function blockingObjectAt(
  state: LocalWorldState,
  position: { readonly x: number; readonly y: number },
  excludeId: ObjectId,
): ObjectId | null {
  const candidates = chapter4SpatialIndex
    .objectsAt(position)
    .filter((objectId) => objectId !== excludeId);

  for (const objectId of candidates) {
    const objectStateValue = state.objects[objectId];

    if (
      objectId === DOOR_ID &&
      objectStateValue?.kind === 'door' &&
      objectStateValue.status === 'closed'
    ) {
      return objectId;
    }

    if (
      objectId === OBSTACLE_ID &&
      objectStateValue?.kind === 'obstacle' &&
      objectStateValue.status === 'blocking'
    ) {
      return objectId;
    }
  }

  return null;
}

function sharesCellWith(
  position: { readonly x: number; readonly y: number },
  objectId: ObjectId,
): boolean {
  return (
    chapter4SpatialIndex
      .objectsAt(position)
      .indexOf(objectId) !== -1
  );
}

export type Chapter4Operation =
  | {
      readonly kind: 'move-main-character';
      readonly deltaX: -1 | 1;
    }
  | {
      readonly kind: 'activate';
      readonly targetId: ObjectId;
    };

function toWorldOperation(
  operation: Chapter4Operation,
): WorldOperation {
  if (operation.kind === 'activate') {
    return ({ state }) => {
      const mainCharacter = objectState(
        state,
        MAIN_CHARACTER_ID,
      );
      const activator = objectState(state, ACTIVATOR_ID);

      if (
        operation.targetId !== ACTIVATOR_ID ||
        mainCharacter.kind !== 'main-character' ||
        activator.kind !== 'mechanism' ||
        !sharesCellWith(
          mainCharacter.position,
          ACTIVATOR_ID,
        )
      ) {
        return {
          events: [{ tag: 'noop' }],
          changes: [],
        };
      }

      return {
        events: [
          {
            tag: 'activated',
            objectId: MAIN_CHARACTER_ID,
            targetId: ACTIVATOR_ID,
          },
        ],
        changes: [
          {
            objectId: ACTIVATOR_ID,
            state: {
              kind: 'mechanism',
              active: true,
            },
          },
          {
            objectId: DOOR_ID,
            state: {
              kind: 'door',
              status: 'open',
            },
          },
          {
            objectId: OBSTACLE_ID,
            state: {
              kind: 'obstacle',
              status: 'cleared',
            },
          },
        ],
      };
    };
  }

  return ({ state }) => {
    const mainCharacter = objectState(
      state,
      MAIN_CHARACTER_ID,
    );

    if (mainCharacter.kind !== 'main-character') {
      throw new Error('Invalid Chapter 4 object state');
    }

    const nextPosition = {
      x: mainCharacter.position.x + operation.deltaX,
      y: mainCharacter.position.y,
    };

    if (
      !movementIsLegal(chapter4RoomDefinition.bounds, nextPosition)
    ) {
      return {
        events: [
          {
            tag: 'move-blocked',
            objectId: MAIN_CHARACTER_ID,
          },
        ],
        changes: [],
      };
    }

    const blocker = blockingObjectAt(
      state,
      nextPosition,
      MAIN_CHARACTER_ID,
    );

    if (blocker) {
      return {
        events: [
          {
            tag: 'move-blocked',
            objectId: MAIN_CHARACTER_ID,
            blockedBy: blocker,
          },
        ],
        changes: [],
      };
    }

    return {
      events: [
        { tag: 'moved', objectId: MAIN_CHARACTER_ID },
      ],
      changes: [
        {
          objectId: MAIN_CHARACTER_ID,
          state: {
            kind: 'main-character',
            position: nextPosition,
            facing: operation.deltaX > 0 ? 'right' : 'left',
          },
        },
      ],
    };
  };
}

export function initializeChapter4World(
  entry: Chapter4EntryParameters,
  persistentMetadata = {},
): LocalWorldState {
  return initializeLocalWorld(
    chapter4RoomDefinition,
    entry,
    persistentMetadata,
  );
}

export function applyChapter4Operation(
  state: LocalWorldState,
  operation: Chapter4Operation,
): OperationResult {
  return applyScopedOperation(
    state,
    chapter4ClosureScope,
    toWorldOperation(operation),
  );
}

export const chapter4ClosureScope: ClosureScope = {
  closureId: CHAPTER_4_CLOSURE_ID,
  allowedObjectIds: [
    MAIN_CHARACTER_ID,
    ACTIVATOR_ID,
    DOOR_ID,
    OBSTACLE_ID,
  ],
};

export const chapter4ClosureContract: ClosureContract = {
  closureId: CHAPTER_4_CLOSURE_ID,
  canEnter: (state) => {
    const mainCharacter = state.objects[MAIN_CHARACTER_ID];
    const activator = state.objects[ACTIVATOR_ID];
    const door = state.objects[DOOR_ID];
    const obstacle = state.objects[OBSTACLE_ID];

    return (
      state.roomId === CHAPTER_4_ROOM_ID &&
      mainCharacter?.kind === 'main-character' &&
      activator?.kind === 'mechanism' &&
      door?.kind === 'door' &&
      obstacle?.kind === 'obstacle'
    );
  },
  canExit: (state) => {
    const mainCharacter = state.objects[MAIN_CHARACTER_ID];
    const activator = state.objects[ACTIVATOR_ID];
    const door = state.objects[DOOR_ID];
    const obstacle = state.objects[OBSTACLE_ID];

    return (
      mainCharacter?.kind === 'main-character' &&
      mainCharacter.position.x >= CHAPTER_4_EXIT_X &&
      activator?.kind === 'mechanism' &&
      activator.active &&
      door?.kind === 'door' &&
      door.status === 'open' &&
      obstacle?.kind === 'obstacle' &&
      obstacle.status === 'cleared'
    );
  },
  createPersistentEffect: () => ({
    changes: { gateYardOpened: true },
  }),
};

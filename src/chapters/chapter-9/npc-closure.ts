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
  type RoomEntryParameters,
  type RoomDefinition,
} from '@/world/types';
import { initializeLocalWorld } from '@/world/local-world';
import { movementIsLegal } from '@/world/spatial';

export const CHAPTER_9_ROOM_ID = createRoomId('npc-yard');
export const CHAPTER_9_CLOSURE_ID = createClosureId(
  'npc-yard-closure',
);
export const CHAPTER_9_MAIN_CHARACTER_ID = createObjectId(
  'chapter-9-main-character',
);
export const CHAPTER_9_NPC_ID = createObjectId('closure-npc');

export interface Chapter9EntryParameters
  extends RoomEntryParameters {
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

const chapter9Bounds = {
  minX: 0,
  maxX: 2,
  minY: 0,
  maxY: 0,
} as const;

export const chapter9RoomDefinition: RoomDefinition =
  createRoomDefinition({
    roomId: CHAPTER_9_ROOM_ID,
    closureId: CHAPTER_9_CLOSURE_ID,
    bounds: chapter9Bounds,
    staticObjects: [],
    mutableObjects: [
      {
        id: CHAPTER_9_MAIN_CHARACTER_ID,
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
        id: CHAPTER_9_NPC_ID,
        kind: 'npc',
        position: { x: 1, y: 0 },
        tags: ['closure-owned'],
        initialState: {
          kind: 'npc',
          position: { x: 1, y: 0 },
          mood: 'neutral',
          dialogueStage: 0,
        },
      },
    ],
    validateEntry: entryIsValid,
    initialize: ({ entry, persistentMetadata }) => ({
      roomId: CHAPTER_9_ROOM_ID,
      closureId: CHAPTER_9_CLOSURE_ID,
      entry,
      persistentMetadata,
      objects: {
        [CHAPTER_9_MAIN_CHARACTER_ID]: {
          kind: 'main-character',
          position: {
            x: entry.spawnX as number,
            y: 0,
          },
          facing: 'right',
        },
        [CHAPTER_9_NPC_ID]: {
          kind: 'npc',
          position: { x: 1, y: 0 },
          mood: 'neutral',
          dialogueStage: 0,
        },
      },
      lastEvents: [],
    }),
  });

export const chapter9ClosureScope: ClosureScope = {
  closureId: CHAPTER_9_CLOSURE_ID,
  allowedObjectIds: [
    CHAPTER_9_MAIN_CHARACTER_ID,
    CHAPTER_9_NPC_ID,
  ],
};

function objectState(
  state: LocalWorldState,
  objectId: ObjectId,
) {
  const value = state.objects[objectId];

  if (!value) {
    throw new Error(`Missing Chapter 9 object ${objectId}`);
  }

  return value;
}

export type Chapter9Operation =
  | {
      readonly kind: 'move-main-character';
      readonly deltaX: -1 | 1;
    }
  | {
      readonly kind: 'talk-to-npc';
      readonly targetId: ObjectId;
    };

function toWorldOperation(
  operation: Chapter9Operation,
): WorldOperation {
  if (operation.kind === 'talk-to-npc') {
    return ({ state }) => {
      const mainCharacter = objectState(
        state,
        CHAPTER_9_MAIN_CHARACTER_ID,
      );
      const npc = objectState(state, CHAPTER_9_NPC_ID);

      // The NPC can move within the closure, so range checks use the
      // live NPC position, not the definition-position spatial index.
      if (
        operation.targetId !== CHAPTER_9_NPC_ID ||
        mainCharacter.kind !== 'main-character' ||
        npc.kind !== 'npc' ||
        mainCharacter.position.x !== npc.position.x ||
        mainCharacter.position.y !== npc.position.y ||
        npc.dialogueStage !== 0
      ) {
        return {
          events: [{ tag: 'noop' }],
          changes: [],
        };
      }

      return {
        events: [
          {
            tag: 'dialogue-progressed',
            objectId: CHAPTER_9_MAIN_CHARACTER_ID,
            targetId: CHAPTER_9_NPC_ID,
          },
        ],
        changes: [
          {
            objectId: CHAPTER_9_NPC_ID,
            state: {
              kind: 'npc',
              position: npc.position,
              mood: 'friendly',
              dialogueStage: 1,
            },
          },
        ],
      };
    };
  }

  return ({ state }) => {
    const mainCharacter = objectState(
      state,
      CHAPTER_9_MAIN_CHARACTER_ID,
    );

    if (mainCharacter.kind !== 'main-character') {
      throw new Error('Invalid Chapter 9 main character state');
    }

    const nextPosition = {
      x: mainCharacter.position.x + operation.deltaX,
      y: mainCharacter.position.y,
    };

    if (
      !movementIsLegal(chapter9Bounds, nextPosition)
    ) {
      return {
        events: [
          {
            tag: 'move-blocked',
            objectId: CHAPTER_9_MAIN_CHARACTER_ID,
          },
        ],
        changes: [],
      };
    }

    return {
      events: [
        { tag: 'moved', objectId: CHAPTER_9_MAIN_CHARACTER_ID },
      ],
      changes: [
        {
          objectId: CHAPTER_9_MAIN_CHARACTER_ID,
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

export function initializeChapter9World(
  entry: Chapter9EntryParameters,
  persistentMetadata = {},
): LocalWorldState {
  return initializeLocalWorld(
    chapter9RoomDefinition,
    entry,
    persistentMetadata,
  );
}

export function applyChapter9Operation(
  state: LocalWorldState,
  operation: Chapter9Operation,
): OperationResult {
  return applyScopedOperation(
    state,
    chapter9ClosureScope,
    toWorldOperation(operation),
  );
}

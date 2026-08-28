import type { Chapter4View } from './view';
import {
  ACTIVATOR_ID,
  chapter4RoomDefinition,
  CHAPTER_4_EXIT_X,
  DOOR_ID,
  EXIT_ID,
  MAIN_CHARACTER_ID,
  OBSTACLE_ID,
} from './gate-yard';
import type {
  LocalWorldState,
  ObjectId,
  OperationEvent,
} from '@/world/types';
import { cellToWorldX } from '@/rendering/layout';

function definitionCellX(objectId: ObjectId): number {
  const all = [
    ...chapter4RoomDefinition.staticObjects,
    ...chapter4RoomDefinition.mutableObjects,
  ];
  const object = all.find(
    (candidate) => candidate.id === objectId,
  );

  if (!object) {
    throw new Error(
      `Missing definition in Chapter 4 view: ${objectId}`,
    );
  }

  return object.position.x;
}

function requireObject(
  state: LocalWorldState,
  objectId: ObjectId,
) {
  const object = state.objects[objectId];

  if (!object) {
    throw new Error(`Missing object in Chapter 4 view: ${objectId}`);
  }

  return object;
}

type Chapter4FeedbackSignals = Pick<
  Chapter4View['feedback'],
  'action' | 'failureReason'
>;

function feedbackFromEvents(
  events: readonly OperationEvent[],
): Chapter4FeedbackSignals | null {
  let action: Chapter4View['feedback']['action'] = null;
  let failureReason: Chapter4View['feedback']['failureReason'] =
    null;

  for (const event of events) {
    switch (event.tag) {
      case 'moved':
        if (event.objectId === MAIN_CHARACTER_ID) {
          action = 'move';
        }
        break;
      case 'move-blocked':
        if (event.objectId === MAIN_CHARACTER_ID) {
          action = 'move';
          failureReason =
            event.blockedBy === DOOR_ID ||
            event.blockedBy === OBSTACLE_ID
              ? 'locked-gate'
              : 'boundary';
        }
        break;
      case 'activated':
        if (
          event.objectId === MAIN_CHARACTER_ID &&
          event.targetId === ACTIVATOR_ID
        ) {
          action = 'interact';
        }
        break;
      case 'dialogue-progressed':
      case 'noop':
        break;
    }
  }

  if (!action && !failureReason) {
    return null;
  }

  return { action, failureReason };
}

export function toChapter4WorldView(
  state: LocalWorldState,
): Chapter4View {
  const mainCharacter = requireObject(
    state,
    MAIN_CHARACTER_ID,
  );
  const activator = requireObject(state, ACTIVATOR_ID);
  const door = requireObject(state, DOOR_ID);
  const obstacle = requireObject(state, OBSTACLE_ID);

  if (
    mainCharacter.kind !== 'main-character' ||
    activator.kind !== 'mechanism' ||
    door.kind !== 'door' ||
    obstacle.kind !== 'obstacle'
  ) {
    throw new Error('Invalid object state for Chapter 4 view');
  }

  const position = mainCharacter.position.x;
  const complete = position >= CHAPTER_4_EXIT_X;
  const feedback = feedbackFromEvents(state.lastEvents);
  const blocked = feedback?.failureReason === 'locked-gate';

  return {
    helper: {
      x: cellToWorldX(position),
    },
    activator: {
      x: cellToWorldX(definitionCellX(ACTIVATOR_ID)),
      active: activator.active,
    },
    gate: {
      x: cellToWorldX(definitionCellX(DOOR_ID)),
      open: door.status === 'open',
      blocked,
    },
    exit: {
      x: cellToWorldX(definitionCellX(EXIT_ID)),
      reached: complete,
    },
    feedback: {
      status: complete ? 'complete' : 'running',
      action: feedback?.action ?? null,
      failureReason: feedback?.failureReason ?? null,
    },
  };
}

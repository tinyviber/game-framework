import { describe, expect, it } from 'vitest';
import {
  ACTIVATOR_ID,
  applyChapter4Operation,
  chapter4ClosureContract,
  chapter4RoomDefinition,
  CHAPTER_4_ROOM_ID,
  initializeChapter4World,
  MAIN_CHARACTER_ID,
  DOOR_ID,
} from '@/chapters/chapter-4/gate-yard';
import {
  applyChapter9Operation,
  chapter9RoomDefinition,
  CHAPTER_9_NPC_ID,
  CHAPTER_9_ROOM_ID,
} from '@/chapters/chapter-9/npc-closure';
import {
  applySessionOperation,
  completeActiveClosure,
  createGameSession,
  restoreCheckpoint,
  saveCheckpoint,
  transitionSession,
  type GameSession,
} from './game-session';
import { createRoomTopology } from '@/world/topology';
import type { RoomCatalog } from '@/world/transition';

const catalog: RoomCatalog = {
  [CHAPTER_4_ROOM_ID]: chapter4RoomDefinition,
  [CHAPTER_9_ROOM_ID]: chapter9RoomDefinition,
};

const topology = createRoomTopology({
  routes: [
    {
      fromRoomId: CHAPTER_4_ROOM_ID,
      toRoomId: CHAPTER_9_ROOM_ID,
      entry: { spawnX: 0 },
      canTraverse: ({ persistentMetadata }) =>
        persistentMetadata.gateYardOpened === true,
    },
  ],
});

function createSession(): GameSession {
  return createGameSession(
    initializeChapter4World(
      { spawnX: 0 },
      { tutorialSeen: true },
    ),
    catalog,
    topology,
  );
}

function applyChapter4(
  session: GameSession,
  operation: Parameters<typeof applyChapter4Operation>[1],
): GameSession {
  const result = applySessionOperation(
    session,
    (state) => applyChapter4Operation(state, operation),
  );

  if (!result.accepted) {
    throw new Error(`Chapter 4 operation failed: ${result.reason.kind}`);
  }

  return result.session;
}

function solveGate(session: GameSession): GameSession {
  let next = applyChapter4(session, {
    kind: 'move-main-character',
    deltaX: 1,
  });
  next = applyChapter4(next, {
    kind: 'activate',
    targetId: ACTIVATOR_ID,
  });
  next = applyChapter4(next, {
    kind: 'move-main-character',
    deltaX: 1,
  });
  return applyChapter4(next, {
    kind: 'move-main-character',
    deltaX: 1,
  });
}

describe('Chapter 11 game session integration', () => {
  it('commits a closure effect before enabling a real room transition', () => {
    const initial = createSession();
    const blocked = transitionSession(
      initial,
      CHAPTER_9_ROOM_ID,
    );

    expect(blocked).toMatchObject({
      accepted: false,
      reason: 'route-not-reachable',
      session: {
        activeWorld: {
          roomId: CHAPTER_4_ROOM_ID,
        },
      },
    });

    const solved = solveGate(initial);
    const completed = completeActiveClosure(
      solved,
      chapter4ClosureContract,
    );

    expect(completed).toMatchObject({
      accepted: true,
      effect: {
        changes: { gateYardOpened: true },
      },
      session: {
        activeWorld: {
          persistentMetadata: {
            tutorialSeen: true,
            gateYardOpened: true,
          },
        },
        checkpoint: null,
      },
    });

    if (!completed.accepted) {
      throw new Error('Expected Gate Yard completion');
    }

    const entered = transitionSession(
      completed.session,
      CHAPTER_9_ROOM_ID,
    );

    expect(entered).toMatchObject({
      accepted: true,
      session: {
        activeWorld: {
          roomId: CHAPTER_9_ROOM_ID,
          persistentMetadata: {
            tutorialSeen: true,
            gateYardOpened: true,
          },
        },
        checkpoint: null,
      },
    });
  });

  it('routes chapter-specific operations through the active local world', () => {
    const session = createSession();
    const wrongClosure = applySessionOperation(
      session,
      (state) =>
        applyChapter9Operation(state, {
          kind: 'talk-to-npc',
          targetId: CHAPTER_9_NPC_ID,
        }),
    );

    expect(wrongClosure).toMatchObject({
      accepted: false,
      reason: { kind: 'closure-mismatch' },
      session: {
        activeWorld: {
          roomId: CHAPTER_4_ROOM_ID,
        },
      },
    });
  });

  it('isolates operation adapters and reports adapter failures', () => {
    const session = createSession();
    const result = applySessionOperation(session, (state) => {
      const mainCharacter = state.objects[
        MAIN_CHARACTER_ID
      ] as {
        position: { x: number; y: number };
      };
      mainCharacter.position.x = 99;
      throw new Error('adapter failure');
    });

    expect(result).toMatchObject({
      accepted: false,
      reason: { kind: 'operation-threw' },
    });
    expect(session.activeWorld.objects[MAIN_CHARACTER_ID]).toMatchObject({
      position: { x: 0, y: 0 },
    });
  });

  it('restores a local checkpoint without rolling back permanent progress', () => {
    const completed = completeActiveClosure(
      solveGate(createSession()),
      chapter4ClosureContract,
    );

    if (!completed.accepted) {
      throw new Error('Expected Gate Yard completion');
    }

    const checkpointed = saveCheckpoint(completed.session);
    const moved = applyChapter4(
      checkpointed,
      {
        kind: 'move-main-character',
        deltaX: -1,
      },
    );
    const restored = restoreCheckpoint(moved);

    expect(restored).toMatchObject({
      accepted: true,
      session: {
        activeWorld: {
          roomId: CHAPTER_4_ROOM_ID,
          persistentMetadata: {
            tutorialSeen: true,
            gateYardOpened: true,
          },
          objects: {
            [MAIN_CHARACTER_ID]: {
              position: { x: 3, y: 0 },
            },
            [DOOR_ID]: {
              status: 'open',
            },
          },
          lastEvents: [],
        },
      },
    });
    expect(moved.activeWorld.objects[MAIN_CHARACTER_ID]).toMatchObject({
      position: { x: 2, y: 0 },
    });
  });

  it('invalidates an old local checkpoint after permanent progress changes', () => {
    const checkpointed = saveCheckpoint(
      solveGate(createSession()),
    );
    const completed = completeActiveClosure(
      checkpointed,
      chapter4ClosureContract,
    );

    expect(completed).toMatchObject({
      accepted: true,
      session: { checkpoint: null },
    });
  });

  it('clears a local checkpoint after changing room', () => {
    const completed = completeActiveClosure(
      solveGate(createSession()),
      chapter4ClosureContract,
    );

    if (!completed.accepted) {
      throw new Error('Expected Gate Yard completion');
    }

    const checkpointed = saveCheckpoint(completed.session);
    const entered = transitionSession(
      checkpointed,
      CHAPTER_9_ROOM_ID,
    );

    expect(entered).toMatchObject({
      accepted: true,
      session: { checkpoint: null },
    });
    expect(restoreCheckpoint(entered.session)).toMatchObject({
      accepted: false,
      reason: 'no-checkpoint',
    });
  });
});

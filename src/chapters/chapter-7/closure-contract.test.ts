import { describe, expect, it, vi } from 'vitest';
import {
  completeClosure,
  validateClosureEntry,
  type ClosureContract,
} from '@/world/closure';
import {
  ACTIVATOR_ID,
  applyChapter4Operation,
  chapter4ClosureContract,
  CHAPTER_4_EXIT_X,
  DOOR_ID,
  initializeChapter4World,
  MAIN_CHARACTER_ID,
  OBSTACLE_ID,
} from '@/chapters/chapter-4/gate-yard';
import {
  createClosureId,
  createRoomId,
} from '@/world/types';

describe('Chapter 7 closure contract', () => {
  it('validates entry against the closure identity and precondition', () => {
    const initial = initializeChapter4World({ spawnX: 0 });

    expect(
      validateClosureEntry(
        initial,
        chapter4ClosureContract,
      ),
    ).toEqual({ accepted: true });

    expect(
      validateClosureEntry(
        {
          ...initial,
          closureId: createClosureId('other-closure'),
        },
        chapter4ClosureContract,
      ),
    ).toEqual({
      accepted: false,
      reason: 'closure-mismatch',
    });

    expect(
      validateClosureEntry(
        {
          ...initial,
          roomId: createRoomId('other-room'),
        },
        chapter4ClosureContract,
      ),
    ).toEqual({
      accepted: false,
      reason: 'entry-precondition-failed',
    });
  });

  it('does not create an effect before the exit predicate succeeds', () => {
    const initial = initializeChapter4World({ spawnX: 0 });
    const createEffect = vi.fn(() => ({
      changes: { gateYardOpened: true },
    }));
    const contract: ClosureContract = {
      ...chapter4ClosureContract,
      canExit: () => false,
      createPersistentEffect: createEffect,
    };

    const result = completeClosure(initial, contract);

    expect(result).toEqual({
      accepted: false,
      reason: 'exit-not-satisfied',
    });
    expect(createEffect).not.toHaveBeenCalled();
  });

  it('reports contract exceptions as rejected results', () => {
    const initial = initializeChapter4World({ spawnX: 0 });
    const entryFailure: ClosureContract = {
      ...chapter4ClosureContract,
      canEnter: () => {
        throw new Error('entry failure');
      },
    };
    const exitFailure: ClosureContract = {
      ...chapter4ClosureContract,
      canExit: () => {
        throw new Error('exit failure');
      },
    };

    expect(validateClosureEntry(initial, entryFailure)).toEqual({
      accepted: false,
      reason: 'contract-threw',
    });
    expect(completeClosure(initial, exitFailure)).toEqual({
      accepted: false,
      reason: 'contract-threw',
    });
  });

  it('isolates contract callbacks from the active local state', () => {
    const initial = initializeChapter4World({ spawnX: 0 });
    const contract: ClosureContract = {
      ...chapter4ClosureContract,
      canEnter: (state) => {
        const mainCharacter = state.objects[
          MAIN_CHARACTER_ID
        ] as {
          position: { x: number; y: number };
        };
        mainCharacter.position.x = CHAPTER_4_EXIT_X;
        return true;
      },
      canExit: (state) => {
        const mainCharacter = state.objects[
          MAIN_CHARACTER_ID
        ] as {
          position: { x: number; y: number };
        };
        mainCharacter.position.x = CHAPTER_4_EXIT_X;
        return false;
      },
    };

    expect(completeClosure(initial, contract)).toEqual({
      accepted: false,
      reason: 'exit-not-satisfied',
    });
    expect(initial.objects[MAIN_CHARACTER_ID]).toMatchObject({
      position: { x: 0, y: 0 },
    });
  });

  it('requires the solved environment, not only a persistent flag', () => {
    const initial = initializeChapter4World(
      { spawnX: 0 },
      { gateYardOpened: true },
    );
    const inconsistentState = {
      ...initial,
      objects: {
        ...initial.objects,
        [MAIN_CHARACTER_ID]: {
          kind: 'main-character' as const,
          position: { x: CHAPTER_4_EXIT_X, y: 0 },
          facing: 'right' as const,
        },
        [ACTIVATOR_ID]: {
          kind: 'mechanism' as const,
          active: false,
        },
        [DOOR_ID]: {
          kind: 'door' as const,
          status: 'closed' as const,
        },
        [OBSTACLE_ID]: {
          kind: 'obstacle' as const,
          status: 'blocking' as const,
        },
      },
    };

    expect(
      completeClosure(
        inconsistentState,
        chapter4ClosureContract,
      ),
    ).toEqual({
      accepted: false,
      reason: 'exit-not-satisfied',
    });
  });

  it('returns the persistent effect only after Gate Yard is solved', () => {
    const initial = initializeChapter4World({ spawnX: 0 });
    const atActivator = applyChapter4Operation(initial, {
      kind: 'move-main-character',
      deltaX: 1,
    });
    const activated = applyChapter4Operation(
      atActivator.state,
      {
        kind: 'activate',
        targetId: ACTIVATOR_ID,
      },
    );
    const atGate = applyChapter4Operation(
      activated.state,
      {
        kind: 'move-main-character',
        deltaX: 1,
      },
    );
    const solved = applyChapter4Operation(
      atGate.state,
      {
        kind: 'move-main-character',
        deltaX: 1,
      },
    );
    const beforeCompletion = structuredClone(solved.state);

    const result = completeClosure(
      solved.state,
      chapter4ClosureContract,
    );

    expect(result).toEqual({
      accepted: true,
      effect: {
        changes: { gateYardOpened: true },
      },
    });
    expect(solved.state).toEqual(beforeCompletion);
    expect(solved.state.persistentMetadata).toEqual({});
  });
});

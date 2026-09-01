import { describe, expect, it, vi } from 'vitest';
import {
  completeClosure,
  validateClosureEntry,
  type ClosureContract,
} from './closure';
import { initializeLocalWorld } from './local-world';
import {
  createClosureId,
  createObjectId,
  createRoomDefinition,
  createRoomId,
} from './types';

const ROOM_ID = createRoomId('closure-test-room');
const CLOSURE_ID = createClosureId('closure-test');
const MAIN_CHARACTER_ID = createObjectId('closure-test-main');

const roomDefinition = createRoomDefinition({
  roomId: ROOM_ID,
  closureId: CLOSURE_ID,
  staticObjects: [],
  mutableObjects: [
    {
      id: MAIN_CHARACTER_ID,
      kind: 'main-character',
      position: { x: 0, y: 0 },
      tags: [],
      initialState: {
        kind: 'main-character',
        position: { x: 0, y: 0 },
        facing: 'right',
      },
    },
  ],
  validateEntry: (entry) => entry.spawnX === 0,
  initialize: ({ entry, persistentMetadata }) => ({
    roomId: ROOM_ID,
    closureId: CLOSURE_ID,
    entry,
    persistentMetadata,
    objects: {
      [MAIN_CHARACTER_ID]: {
        kind: 'main-character',
        position: { x: 0, y: 0 },
        facing: 'right',
      },
    },
    lastEvents: [],
  }),
});

function createInitialState() {
  return initializeLocalWorld(
    roomDefinition,
    { spawnX: 0 },
    {},
  );
}

function createContract(
  overrides: Partial<ClosureContract> = {},
): ClosureContract {
  return {
    closureId: CLOSURE_ID,
    canEnter: (state) => state.entry.spawnX === 0,
    canExit: (state) => {
      const mainCharacter = state.objects[MAIN_CHARACTER_ID];

      return (
        mainCharacter?.kind === 'main-character' &&
        mainCharacter.position.x === 1
      );
    },
    createPersistentEffect: () => ({
      changes: { closureTestComplete: true },
    }),
    ...overrides,
  };
}

describe('closure contract', () => {
  it('validates closure identity and entry preconditions', () => {
    const initial = createInitialState();
    const contract = createContract();

    expect(validateClosureEntry(initial, contract)).toEqual({
      accepted: true,
    });

    expect(
      validateClosureEntry(
        { ...initial, closureId: createClosureId('other-closure') },
        contract,
      ),
    ).toEqual({
      accepted: false,
      reason: 'closure-mismatch',
    });

    expect(
      validateClosureEntry(
        { ...initial, entry: { spawnX: 1 } },
        contract,
      ),
    ).toEqual({
      accepted: false,
      reason: 'entry-precondition-failed',
    });
  });

  it('does not create an effect before the exit predicate succeeds', () => {
    const createEffect = vi.fn(() => ({
      changes: { closureTestComplete: true },
    }));

    const result = completeClosure(
      createInitialState(),
      createContract({
        canExit: () => false,
        createPersistentEffect: createEffect,
      }),
    );

    expect(result).toEqual({
      accepted: false,
      reason: 'exit-not-satisfied',
    });
    expect(createEffect).not.toHaveBeenCalled();
  });

  it('reports entry and exit contract exceptions as rejections', () => {
    const initial = createInitialState();

    expect(
      validateClosureEntry(
        initial,
        createContract({
          canEnter: () => {
            throw new Error('entry failure');
          },
        }),
      ),
    ).toEqual({
      accepted: false,
      reason: 'contract-threw',
    });

    expect(
      completeClosure(
        initial,
        createContract({
          canExit: () => {
            throw new Error('exit failure');
          },
        }),
      ),
    ).toEqual({
      accepted: false,
      reason: 'contract-threw',
    });
  });

  it('isolates contract callbacks from the active local state', () => {
    const initial = createInitialState();
    const contract = createContract({
      canEnter: (state) => {
        const mainCharacter = state.objects[
          MAIN_CHARACTER_ID
        ] as {
          position: { x: number; y: number };
        };
        mainCharacter.position.x = 1;
        return true;
      },
      canExit: (state) => {
        const mainCharacter = state.objects[
          MAIN_CHARACTER_ID
        ] as {
          position: { x: number; y: number };
        };
        mainCharacter.position.x = 1;
        return false;
      },
    });

    expect(completeClosure(initial, contract)).toEqual({
      accepted: false,
      reason: 'exit-not-satisfied',
    });
    expect(initial.objects[MAIN_CHARACTER_ID]).toMatchObject({
      position: { x: 0, y: 0 },
    });
  });

  it('returns the persistent effect only after the exit predicate succeeds', () => {
    const initial = createInitialState();
    const solved = {
      ...initial,
      objects: {
        ...initial.objects,
        [MAIN_CHARACTER_ID]: {
          kind: 'main-character' as const,
          position: { x: 1, y: 0 },
          facing: 'right' as const,
        },
      },
    };
    const beforeCompletion = structuredClone(solved);

    expect(completeClosure(solved, createContract())).toEqual({
      accepted: true,
      effect: {
        changes: { closureTestComplete: true },
      },
    });
    expect(solved).toEqual(beforeCompletion);
    expect(solved.persistentMetadata).toEqual({});
  });
});

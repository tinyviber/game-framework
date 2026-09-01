import { describe, expect, it } from 'vitest';
import {
  applyScopedOperation,
  type ClosureScope,
  type WorldOperation,
} from '@/world/operation';
import {
  createClosureId,
  createObjectId,
  createRoomId,
  type LocalWorldState,
  type ObjectId,
} from '@/world/types';

const roomId = createRoomId('test-room');
const closureId = createClosureId('test-closure');
const doorId = createObjectId('door');
const mainCharacterId = createObjectId('main-character');

const initialState: LocalWorldState = {
  roomId,
  closureId,
  entry: {
    spawn: {
      x: 0,
      y: 0,
    },
  },
  persistentMetadata: {
    nested: {
      visited: false,
    },
  },
  objects: {
    [doorId]: {
      kind: 'door',
      status: 'closed',
    },
    [mainCharacterId]: {
      kind: 'main-character',
      position: { x: 0, y: 0 },
      facing: 'right',
    },
  },
  lastEvents: [],
};

const scope: ClosureScope = {
  closureId,
  allowedObjectIds: [doorId],
};

describe('scoped world operations', () => {
  it('commits a valid change without mutating the original state', () => {
    const result = applyScopedOperation(
      initialState,
      scope,
      () => ({
        events: [
          { tag: 'activated', objectId: mainCharacterId, targetId: doorId },
        ],
        changes: [
          {
            objectId: doorId,
            state: {
              kind: 'door',
              status: 'open',
            },
          },
        ],
      }),
    );

    expect(result.accepted).toBe(true);
    expect(result.state.objects[doorId]).toEqual({
      kind: 'door',
      status: 'open',
    });
    expect(initialState.objects[doorId]).toEqual({
      kind: 'door',
      status: 'closed',
    });
  });

  it('freezes committed state so later mutation attempts fail loudly', () => {
    const result = applyScopedOperation(
      initialState,
      scope,
      () => ({
        events: [{ tag: 'noop' }],
        changes: [
          {
            objectId: doorId,
            state: { kind: 'door', status: 'open' },
          },
        ],
      }),
    );

    expect(result.accepted).toBe(true);
    expect(Object.isFrozen(result.state)).toBe(true);
    expect(Object.isFrozen(result.state.objects)).toBe(true);
    expect(Object.isFrozen(result.state.objects[doorId])).toBe(
      true,
    );
  });

  it('reuses unchanged object states by reference (structural sharing)', () => {
    const result = applyScopedOperation(
      initialState,
      scope,
      () => ({
        changes: [
          {
            objectId: doorId,
            state: { kind: 'door', status: 'open' },
          },
        ],
      }),
    );

    expect(result.accepted).toBe(true);
    if (!result.accepted) {
      throw new Error('unreachable');
    }

    expect(result.state.objects[mainCharacterId]).toBe(
      initialState.objects[mainCharacterId],
    );
    expect(result.state.objects[doorId]).not.toBe(
      initialState.objects[doorId],
    );
  });

  it('returns the input state unchanged and uncloned on every rejection', () => {
    const result = applyScopedOperation(
      initialState,
      scope,
      () => ({
        changes: [
          {
            objectId: doorId,
            state: { kind: 'door', status: 'broken' } as never,
          },
        ],
      }),
    );

    expect(result.accepted).toBe(false);
    expect(result.state).toBe(initialState);
    expect(result.state.lastEvents).toEqual([]);
  });

  it('commits typed events into lastEvents instead of string labels', () => {
    const result = applyScopedOperation(
      initialState,
      scope,
      () => ({
        events: [
          { tag: 'moved', objectId: mainCharacterId },
        ],
        changes: [
          {
            objectId: doorId,
            state: { kind: 'door', status: 'open' },
          },
        ],
      }),
    );

    expect(result.accepted).toBe(true);
    if (!result.accepted) {
      throw new Error('unreachable');
    }

    expect(result.events).toEqual([
      { tag: 'moved', objectId: mainCharacterId },
    ]);
    expect(result.state.lastEvents).toEqual([
      { tag: 'moved', objectId: mainCharacterId },
    ]);
    expect(Object.isFrozen(result.state.lastEvents)).toBe(true);
  });

  it('rejects a mixed in-scope and out-of-scope proposal atomically', () => {
    const result = applyScopedOperation(
      initialState,
      scope,
      () => ({
        changes: [
          {
            objectId: doorId,
            state: {
              kind: 'door',
              status: 'open',
            },
          },
          {
            objectId: mainCharacterId,
            state: {
              kind: 'main-character',
              position: { x: 1, y: 0 },
              facing: 'right',
            },
          },
        ],
      }),
    );

    expect(result).toMatchObject({
      accepted: false,
      reason: {
        kind: 'scope-violation',
        objectId: mainCharacterId,
      },
    });
    expect(result.state.objects[doorId]).toEqual({
      kind: 'door',
      status: 'closed',
    });
    expect(result.state.objects[mainCharacterId]).toEqual(
      initialState.objects[mainCharacterId],
    );
  });

  it('discards draft mutations when an operation throws', () => {
    const operation: WorldOperation = ({ state }) => {
      const mutableDraft = state.objects[doorId] as {
        status: 'closed' | 'open';
      };

      mutableDraft.status = 'open';
      throw new Error('abort');
    };

    const result = applyScopedOperation(
      initialState,
      scope,
      operation,
    );

    expect(result).toMatchObject({
      accepted: false,
      reason: { kind: 'operation-threw' },
    });
    expect(result.state.objects[doorId]).toEqual({
      kind: 'door',
      status: 'closed',
    });
    expect(initialState.objects[doorId]).toEqual({
      kind: 'door',
      status: 'closed',
    });
  });

  it('does not let an operation widen the scope', () => {
    const originalIds = [...scope.allowedObjectIds];
    const result = applyScopedOperation(
      initialState,
      scope,
      ({ scope: receivedScope }) => {
        const mutableScope = receivedScope as unknown as {
          allowedObjectIds: ObjectId[];
        };

        try {
          mutableScope.allowedObjectIds.push(
            mainCharacterId,
          );
        } catch {
          // The operation must not be able to mutate its scope.
        }

        return {
          changes: [
            {
              objectId: mainCharacterId,
              state: {
                kind: 'main-character',
                position: { x: 1, y: 0 },
                facing: 'right',
              },
            },
          ],
        };
      },
    );

    expect(result).toMatchObject({
      accepted: false,
      reason: {
        kind: 'scope-violation',
        objectId: mainCharacterId,
      },
    });
    expect(scope.allowedObjectIds).toEqual(originalIds);
  });

  it('rejects unknown objects and kind mismatches', () => {
    const unknownId = createObjectId('unknown');

    const unknown = applyScopedOperation(
      initialState,
      {
        ...scope,
        allowedObjectIds: [unknownId],
      },
      () => ({
        changes: [
          {
            objectId: unknownId,
            state: {
              kind: 'door',
              status: 'open',
            },
          },
        ],
      }),
    );

    expect(unknown).toMatchObject({
      accepted: false,
      reason: {
        kind: 'unknown-object',
        objectId: unknownId,
      },
    });

    const mismatch = applyScopedOperation(
      initialState,
      scope,
      () => ({
        changes: [
          {
            objectId: doorId,
            state: {
              kind: 'obstacle',
              status: 'cleared',
            },
          },
        ],
      }),
    );

    expect(mismatch).toMatchObject({
      accepted: false,
      reason: {
        kind: 'kind-mismatch',
        objectId: doorId,
      },
    });
  });

  it('rejects an invalid state even when its kind matches', () => {
    const invalid = applyScopedOperation(
      initialState,
      scope,
      () => ({
        changes: [
          {
            objectId: doorId,
            state: {
              kind: 'door',
              status: 'broken',
            } as never,
          },
        ],
      }),
    );

    expect(invalid).toMatchObject({
      accepted: false,
      reason: { kind: 'invalid-proposal' },
    });
  });
});

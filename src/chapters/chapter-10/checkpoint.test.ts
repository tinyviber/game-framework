import { describe, expect, it } from 'vitest';
import {
  createLocalCheckpoint,
  restoreLocalCheckpoint,
  type LocalCheckpoint,
} from '@/world/checkpoint';
import {
  applyChapter9Operation,
  CHAPTER_9_MAIN_CHARACTER_ID,
  initializeChapter9World,
} from '@/chapters/chapter-9/npc-closure';
import {
  createClosureId,
  createRoomId,
} from '@/world/types';

describe('Chapter 10 local checkpoint and recovery', () => {
  it('snapshots only local state and isolates the checkpoint', () => {
    const initial = initializeChapter9World(
      { spawnX: 0 },
      { progress: { permanent: false } },
    );
    const checkpoint = createLocalCheckpoint(initial);
    const moved = applyChapter9Operation(initial, {
      kind: 'move-main-character',
      deltaX: 1,
    });

    expect(checkpoint).toMatchObject({
      roomId: initial.roomId,
      closureId: initial.closureId,
      entry: { spawnX: 0 },
      objects: {
        [CHAPTER_9_MAIN_CHARACTER_ID]: {
          position: { x: 0, y: 0 },
        },
      },
    });
    expect(checkpoint).not.toHaveProperty('persistentMetadata');
    expect(checkpoint).not.toHaveProperty('lastEvents');
    expect(moved.state.objects[CHAPTER_9_MAIN_CHARACTER_ID]).toMatchObject({
      position: { x: 1, y: 0 },
    });
    expect(checkpoint.objects[CHAPTER_9_MAIN_CHARACTER_ID]).toMatchObject({
      position: { x: 0, y: 0 },
    });
    expect(Object.isFrozen(checkpoint)).toBe(true);
    expect(Object.isFrozen(checkpoint.objects)).toBe(true);
  });

  it('restores local attempts while preserving current persistent metadata', () => {
    const initial = initializeChapter9World(
      { spawnX: 0 },
      { progress: { permanent: false } },
    );
    const checkpoint = createLocalCheckpoint(initial);
    const failedAttempt = applyChapter9Operation(initial, {
      kind: 'move-main-character',
      deltaX: 1,
    });
    const current = {
      ...failedAttempt.state,
      persistentMetadata: {
        progress: { permanent: true },
      },
    };

    const result = restoreLocalCheckpoint(current, checkpoint);

    expect(result).toMatchObject({
      accepted: true,
      state: {
        roomId: initial.roomId,
        closureId: initial.closureId,
        objects: {
          [CHAPTER_9_MAIN_CHARACTER_ID]: {
            position: { x: 0, y: 0 },
          },
        },
        persistentMetadata: {
          progress: { permanent: true },
        },
        lastEvents: [],
      },
    });
    expect(current.objects[CHAPTER_9_MAIN_CHARACTER_ID]).toMatchObject({
      position: { x: 1, y: 0 },
    });
  });

  it('rejects a checkpoint from another active room or closure', () => {
    const initial = initializeChapter9World({ spawnX: 0 });
    const checkpoint = createLocalCheckpoint(initial);
    const otherRoom = {
      ...initial,
      roomId: createRoomId('other-room'),
    };
    const otherClosure = {
      ...initial,
      closureId: createClosureId('other-closure'),
    };

    expect(
      restoreLocalCheckpoint(otherRoom, checkpoint),
    ).toMatchObject({
      accepted: false,
      reason: 'room-mismatch',
      state: otherRoom,
    });
    expect(
      restoreLocalCheckpoint(otherClosure, checkpoint),
    ).toMatchObject({
      accepted: false,
      reason: 'closure-mismatch',
      state: otherClosure,
    });
  });

  it('rejects checkpoints with a different local object set', () => {
    const initial = initializeChapter9World({ spawnX: 0 });
    const malformed: LocalCheckpoint = {
      ...createLocalCheckpoint(initial),
      objects: {
        [CHAPTER_9_MAIN_CHARACTER_ID]:
          initial.objects[CHAPTER_9_MAIN_CHARACTER_ID]!,
      },
    };

    expect(restoreLocalCheckpoint(initial, malformed)).toMatchObject({
      accepted: false,
      reason: 'invalid-checkpoint',
      state: initial,
    });
  });

  it('rejects malformed checkpoints without partial recovery', () => {
    const initial = initializeChapter9World({ spawnX: 0 });
    const malformed: LocalCheckpoint = {
      ...createLocalCheckpoint(initial),
      objects: {
        [CHAPTER_9_MAIN_CHARACTER_ID]: {
          kind: 'invalid',
        },
      } as never,
    };

    const result = restoreLocalCheckpoint(initial, malformed);

    expect(result).toMatchObject({
      accepted: false,
      reason: 'invalid-checkpoint',
      state: initial,
    });
  });
});

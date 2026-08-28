import { describe, expect, it } from 'vitest';
import {
  applyChapter9Operation,
  CHAPTER_9_MAIN_CHARACTER_ID,
  CHAPTER_9_NPC_ID,
  initializeChapter9World,
} from './npc-closure';
import { createClosureId } from '@/world/types';

describe('Chapter 9 closure-local NPC interaction', () => {
  it('keeps a distant NPC unchanged until the player is in range', () => {
    const initial = initializeChapter9World({ spawnX: 0 });

    const result = applyChapter9Operation(initial, {
      kind: 'talk-to-npc',
      targetId: CHAPTER_9_NPC_ID,
    });

    expect(result).toMatchObject({
      accepted: true,
      state: {
        lastEvents: [{ tag: 'noop' }],
        objects: {
          [CHAPTER_9_NPC_ID]: {
            kind: 'npc',
            mood: 'neutral',
            dialogueStage: 0,
          },
        },
      },
    });
  });

  it('changes only the active closure NPC through a valid interaction', () => {
    const initial = initializeChapter9World({ spawnX: 0 });
    const atNpc = applyChapter9Operation(initial, {
      kind: 'move-main-character',
      deltaX: 1,
    });
    const talked = applyChapter9Operation(atNpc.state, {
      kind: 'talk-to-npc',
      targetId: CHAPTER_9_NPC_ID,
    });

    expect(talked).toMatchObject({
      accepted: true,
      state: {
        lastEvents: [
          {
            tag: 'dialogue-progressed',
            objectId: CHAPTER_9_MAIN_CHARACTER_ID,
            targetId: CHAPTER_9_NPC_ID,
          },
        ],
        objects: {
          [CHAPTER_9_MAIN_CHARACTER_ID]: {
            kind: 'main-character',
            position: { x: 1, y: 0 },
          },
          [CHAPTER_9_NPC_ID]: {
            kind: 'npc',
            mood: 'friendly',
            dialogueStage: 1,
          },
        },
      },
    });
    expect(initial.objects[CHAPTER_9_NPC_ID]).toEqual({
      kind: 'npc',
      position: { x: 1, y: 0 },
      mood: 'neutral',
      dialogueStage: 0,
    });
  });

  it('does not infer a global NPC simulation or mutate another local world', () => {
    const inactiveWorld = initializeChapter9World({
      spawnX: 0,
    });
    const activeWorld = initializeChapter9World({
      spawnX: 0,
    });
    const atNpc = applyChapter9Operation(activeWorld, {
      kind: 'move-main-character',
      deltaX: 1,
    });

    applyChapter9Operation(atNpc.state, {
      kind: 'talk-to-npc',
      targetId: CHAPTER_9_NPC_ID,
    });

    expect(inactiveWorld.objects[CHAPTER_9_NPC_ID]).toEqual({
      kind: 'npc',
      position: { x: 1, y: 0 },
      mood: 'neutral',
      dialogueStage: 0,
    });
  });

  it('rejects operations from a different active closure', () => {
    const initial = initializeChapter9World({ spawnX: 0 });
    const otherClosure = {
      ...initial,
      closureId: createClosureId('other-closure'),
    };

    const result = applyChapter9Operation(otherClosure, {
      kind: 'move-main-character',
      deltaX: 1,
    });

    expect(result).toMatchObject({
      accepted: false,
      reason: { kind: 'closure-mismatch' },
    });
    expect(result.state).toEqual(otherClosure);
  });

  it('rejects a wrong NPC target without changing NPC state', () => {
    const initial = initializeChapter9World({ spawnX: 1 });

    const result = applyChapter9Operation(initial, {
      kind: 'talk-to-npc',
      targetId: CHAPTER_9_MAIN_CHARACTER_ID,
    });

    expect(result).toMatchObject({
      accepted: true,
      state: {
        lastEvents: [{ tag: 'noop' }],
        objects: {
          [CHAPTER_9_NPC_ID]: {
            mood: 'neutral',
            dialogueStage: 0,
          },
        },
      },
    });
  });

  it('blocks movement that would leave the room bounds', () => {
    const initial = initializeChapter9World({ spawnX: 0 });

    const blocked = applyChapter9Operation(initial, {
      kind: 'move-main-character',
      deltaX: -1,
    });

    expect(blocked.accepted).toBe(true);
    expect(blocked.state.objects[CHAPTER_9_MAIN_CHARACTER_ID]).toMatchObject({
      position: { x: 0, y: 0 },
    });
    expect(blocked.state.lastEvents).toEqual([
      {
        tag: 'move-blocked',
        objectId: CHAPTER_9_MAIN_CHARACTER_ID,
      },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  ACTIVATOR_ID,
  applyChapter4Operation,
  DOOR_ID,
  initializeChapter4World,
  MAIN_CHARACTER_ID,
  OBSTACLE_ID,
} from './gate-yard';

describe('Chapter 4 local world', () => {
  it('moves the main character and blocks the closed gate', () => {
    const initial = initializeChapter4World({ spawnX: 0 });
    const atActivator = applyChapter4Operation(initial, {
      kind: 'move-main-character',
      deltaX: 1,
    });
    const blocked = applyChapter4Operation(
      atActivator.state,
      {
        kind: 'move-main-character',
        deltaX: 1,
      },
    );

    expect(atActivator.state.objects[MAIN_CHARACTER_ID]).toMatchObject({
      position: { x: 1, y: 0 },
    });
    expect(blocked.accepted).toBe(true);
    expect(blocked.state.objects[MAIN_CHARACTER_ID]).toMatchObject({
      position: { x: 1, y: 0 },
    });
    expect(blocked.state.lastEvents).toEqual([
      {
        tag: 'move-blocked',
        objectId: MAIN_CHARACTER_ID,
        blockedBy: DOOR_ID,
      },
    ]);
  });

  it('blocks movement that would leave the room bounds', () => {
    const initial = initializeChapter4World({ spawnX: 0 });
    const blocked = applyChapter4Operation(initial, {
      kind: 'move-main-character',
      deltaX: -1,
    });

    expect(blocked.accepted).toBe(true);
    expect(blocked.state.objects[MAIN_CHARACTER_ID]).toMatchObject({
      position: { x: 0, y: 0 },
    });
    expect(blocked.state.lastEvents).toEqual([
      {
        tag: 'move-blocked',
        objectId: MAIN_CHARACTER_ID,
      },
    ]);
  });

  it('activates the gate by changing several local object states', () => {
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

    expect(activated).toMatchObject({
      accepted: true,
      state: {
        lastEvents: [
          {
            tag: 'activated',
            objectId: MAIN_CHARACTER_ID,
            targetId: ACTIVATOR_ID,
          },
        ],
        objects: {
          [ACTIVATOR_ID]: { kind: 'mechanism', active: true },
          [DOOR_ID]: { kind: 'door', status: 'open' },
          [OBSTACLE_ID]: {
            kind: 'obstacle',
            status: 'cleared',
          },
        },
      },
    });

    const movedThroughGate = applyChapter4Operation(
      activated.state,
      {
        kind: 'move-main-character',
        deltaX: 1,
      },
    );

    expect(movedThroughGate.state.objects[MAIN_CHARACTER_ID]).toMatchObject({
      position: { x: 2, y: 0 },
    });
    expect(movedThroughGate.state.lastEvents).toEqual([
      { tag: 'moved', objectId: MAIN_CHARACTER_ID },
    ]);
  });

  it('uses persistent metadata only as initialization input', () => {
    const initial = initializeChapter4World(
      { spawnX: 0 },
      { gateYardOpened: true },
    );
    const moved = applyChapter4Operation(initial, {
      kind: 'move-main-character',
      deltaX: 1,
    });

    expect(initial.persistentMetadata).toEqual({
      gateYardOpened: true,
    });
    expect(moved.state.persistentMetadata).toEqual({
      gateYardOpened: true,
    });
    expect(moved.state.objects[DOOR_ID]).toEqual({
      kind: 'door',
      status: 'open',
    });
  });
});

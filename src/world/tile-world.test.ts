import { describe, expect, it } from 'vitest';
import room01Json from '../data/rooms/room_01.json';
import { parseTileRoom } from './tilemap';
import {
  applyExternalFlag,
  applyTileOperation,
  createTileRoomState,
} from './tile-world';

const room = parseTileRoom(room01Json);

describe('createTileRoomState', () => {
  it('spawns at the room spawn and is frozen', () => {
    const state = createTileRoomState(room);

    expect(state.roomId).toBe('room_01');
    expect(state.player).toEqual({ x: 1, y: 4 });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.player)).toBe(true);
  });

  it('rejects a spawn on a wall', () => {
    expect(() =>
      createTileRoomState(room, { x: 0, y: 0 }),
    ).toThrow(/wall/);
  });
});

describe('applyTileOperation: move', () => {
  it('moves the player onto floor tiles', () => {
    const state = createTileRoomState(room);
    const result = applyTileOperation(state, room, {
      kind: 'move',
      direction: 'right',
    });

    expect(result.accepted).toBe(true);
    expect(result.state.player).toEqual({ x: 2, y: 4 });
    expect(result.events).toEqual([
      { tag: 'moved', x: 2, y: 4 },
    ]);
  });

  it('refuses to walk into walls and returns the input state by reference', () => {
    const state = createTileRoomState(room, { x: 1, y: 4 });
    const result = applyTileOperation(state, room, {
      kind: 'move',
      direction: 'left',
    });

    expect(result.accepted).toBe(false);

    if (result.accepted) {
      return;
    }

    expect(result.reason).toBe('wall');
    expect(result.events).toEqual([
      { tag: 'blocked', reason: 'wall' },
    ]);
    expect(result.state).toBe(state);
  });

  it('never mutates the previous state', () => {
    const state = createTileRoomState(room);
    const before = state.player;

    applyTileOperation(state, room, {
      kind: 'move',
      direction: 'right',
    });

    expect(state.player).toEqual(before);
    expect(Object.isFrozen(state)).toBe(true);
  });

  it('cannot walk off the room edge even where the map has no wall row', () => {
    // The exit column (x=12, y=4) is floor; walking right past it
    // leaves the room and must be blocked (phase 2 will turn it into
    // a transition instead).
    const state = createTileRoomState(room, { x: 12, y: 4 });
    const result = applyTileOperation(state, room, {
      kind: 'move',
      direction: 'right',
    });

    expect(result.accepted).toBe(false);
    expect(result.state).toBe(state);
  });

  it('supports all four directions', () => {
    let state = createTileRoomState(room, { x: 6, y: 4 });

    for (const direction of [
      'up',
      'down',
      'left',
      'right',
    ] as const) {
      const result = applyTileOperation(state, room, {
        kind: 'move',
        direction,
      });

      expect(result.accepted).toBe(true);
      state = result.state;
    }

    expect(state.player).toEqual({ x: 6, y: 4 });
  });
});

describe('applyTileOperation: interact', () => {
  it('is an accepted noop when nothing interactable is near', () => {
    const state = createTileRoomState(room);
    const result = applyTileOperation(state, room, {
      kind: 'interact',
    });

    expect(result.accepted).toBe(true);
    expect(result.events).toEqual([{ tag: 'interact-noop' }]);
  });
});

/**
 * ── Phase 3/4 fixtures ─────────────────────────────────────────
 * Inline rooms built through parseTileRoom, so mechanism behavior
 * is proven against the same validation the shipped JSONs use.
 */

interface Fixture {
  room: ReturnType<typeof parseTileRoom>;
  state: ReturnType<typeof createTileRoomState>;
}

function fixture(
  json: Record<string, unknown>,
  spawn = (json.spawn as { x: number; y: number }),
  carried?: Parameters<typeof createTileRoomState>[2],
): Fixture {
  const parsed = parseTileRoom(json);

  return {
    room: parsed,
    state: createTileRoomState(parsed, spawn, carried),
  };
}

function move(
  fixtureState: Fixture['state'],
  fixtureRoom: Fixture['room'],
  direction: 'up' | 'down' | 'left' | 'right',
): ReturnType<typeof applyTileOperation> {
  return applyTileOperation(fixtureState, fixtureRoom, {
    kind: 'move',
    direction,
  });
}

describe('Phase 3: locked doors + flags', () => {
  it('blocks movement into a closed lockedBy door, by reference', () => {
    const { room: r, state: s } = fixture({
      id: 'locked',
      spawn: { x: 0, y: 0 },
      doors: [{ id: 'd', pos: { x: 1, y: 0 }, lockedBy: 'k' }],
      tiles: [
        [0, 0],
        [1, 1],
      ],
    });

    const result = move(s, r, 'right');

    expect(result.accepted).toBe(false);
    expect(result.events).toEqual([
      { tag: 'blocked', reason: 'locked-door' },
    ]);
    expect(result.state).toBe(s);
    expect(s.doors.d).toEqual({ open: false });
  });

  it('opens the door once the flag is set via applyExternalFlag', () => {
    const { room: r, state: s } = fixture({
      id: 'locked',
      spawn: { x: 0, y: 0 },
      doors: [{ id: 'd', pos: { x: 1, y: 0 }, lockedBy: 'k' }],
      tiles: [
        [0, 0],
        [1, 1],
      ],
    });

    const unlocked = applyExternalFlag(s, r, 'k', true);

    expect(unlocked.doors.d).toEqual({ open: true });
    expect(unlocked.lastEvents).toContainEqual({
      tag: 'door-opened',
      doorId: 'd',
    });

    const result = move(unlocked, r, 'right');

    expect(result.accepted).toBe(true);
    expect(result.state.player).toEqual({ x: 1, y: 0 });
  });

  it('seeds flag-locked doors open from carried state at entry', () => {
    const { room: r, state: s } = fixture(
      {
        id: 'locked',
        spawn: { x: 0, y: 0 },
        doors: [{ id: 'd', pos: { x: 1, y: 0 }, lockedBy: 'k' }],
        tiles: [
          [0, 0],
          [1, 1],
        ],
      },
      { x: 0, y: 0 },
      { flags: { k: true }, openedChests: {}, onTargetFired: {}, latchedOpenDoors: {} },
    );

    expect(s.doors.d).toEqual({ open: true });
    expect(move(s, r, 'right').accepted).toBe(true);
  });

  it('a door on a boundary exit cell blocks the move before any exit resolves', () => {
    const { room: r, state: s } = fixture({
      id: 'edge',
      spawn: { x: 0, y: 0 },
      doors: [{ id: 'd', pos: { x: 1, y: 0 }, lockedBy: 'k' }],
      tiles: [
        [0, 0],
        [1, 1],
      ],
    });

    expect(move(s, r, 'right').accepted).toBe(false);
  });
});

describe('Phase 4: pressure plate', () => {
  it('holds its linked door open while the player stands on it', () => {
    const { room: r, state: s } = fixture({
      id: 'plate',
      spawn: { x: 0, y: 0 },
      doors: [{ id: 'd', pos: { x: 2, y: 0 } }],
      pressurePlates: [{ id: 'p', pos: { x: 1, y: 0 }, doors: ['d'] }],
      tiles: [
        [0, 0, 0],
        [1, 1, 1],
      ],
    });

    const onPlate = move(s, r, 'right');

    expect(onPlate.accepted).toBe(true);
    expect(onPlate.events).toContainEqual({
      tag: 'plate-pressed',
      plateId: 'p',
    });
    expect(onPlate.events).toContainEqual({
      tag: 'door-opened',
      doorId: 'd',
    });
    expect(onPlate.state.doors.d).toEqual({ open: true });

    // Door open: walking through the door cell is accepted.
    expect(move(onPlate.state, r, 'right').accepted).toBe(true);
  });

  it('releases and closes the door when the player steps off', () => {
    const { room: r, state: s } = fixture({
      id: 'plate',
      spawn: { x: 0, y: 0 },
      doors: [{ id: 'd', pos: { x: 2, y: 0 } }],
      pressurePlates: [{ id: 'p', pos: { x: 1, y: 0 }, doors: ['d'] }],
      tiles: [
        [0, 0, 0],
        [1, 1, 1],
      ],
    });

    const onPlate = move(s, r, 'right').state;
    const through = move(onPlate, r, 'right').state; // stands past the door
    const released = move(through, r, 'left'); // walks back onto the door cell? no: left from (2,0) lands on (1,0) the plate

    expect(released.accepted).toBe(true);
    expect(released.events).toContainEqual({
      tag: 'plate-pressed',
      plateId: 'p',
    });
    expect(released.state.doors.d).toEqual({ open: true });

    // Step off the plate completely → door closes again.
    const back = move(released.state, r, 'left');
    expect(back.events).toContainEqual({
      tag: 'plate-released',
      plateId: 'p',
    });
    expect(back.events).toContainEqual({
      tag: 'door-closed',
      doorId: 'd',
    });
    expect(back.state.doors.d).toEqual({ open: false });
  });

  it('is held by a block resting on it (block-holds-plate puzzle)', () => {
    const { room: r, state: s } = fixture({
      id: 'plate-block',
      spawn: { x: 0, y: 0 },
      doors: [{ id: 'd', pos: { x: 4, y: 0 } }],
      pressurePlates: [{ id: 'p', pos: { x: 3, y: 0 }, doors: ['d'] }],
      blocks: [{ id: 'b', pos: { x: 2, y: 0 } }],
      tiles: [
        [0, 0, 0, 0, 0],
        [1, 1, 1, 1, 1],
      ],
    });

    // Walk behind the block and push it onto the plate.
    const behind = move(s, r, 'right').state; // (1,0)
    const pushed = move(behind, r, 'right'); // block (2,0)→(3,0)

    expect(pushed.accepted).toBe(true);
    expect(pushed.events).toContainEqual({
      tag: 'pushed',
      blockId: 'b',
      x: 3,
      y: 0,
    });
    expect(pushed.events).toContainEqual({
      tag: 'plate-pressed',
      plateId: 'p',
    });
    expect(pushed.events).toContainEqual({
      tag: 'door-opened',
      doorId: 'd',
    });
    expect(pushed.state.doors.d).toEqual({ open: true });

    // Player walks away; block stays → door stays open.
    const away = move(pushed.state, r, 'left').state;

    expect(away.doors.d).toEqual({ open: true });
  });
});

describe('Phase 4: moving block', () => {
  it('pushes a block when the target cell is free', () => {
    const { room: r, state: s } = fixture({
      id: 'push',
      spawn: { x: 0, y: 0 },
      blocks: [{ id: 'b', pos: { x: 2, y: 0 } }],
      tiles: [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
      ],
    });

    const behind = move(s, r, 'right').state;
    const pushed = move(behind, r, 'right');

    expect(pushed.accepted).toBe(true);
    expect(pushed.state.player).toEqual({ x: 2, y: 0 });
    expect(pushed.state.blocks.b).toEqual({ x: 3, y: 0 });
    expect(pushed.events).toContainEqual({
      tag: 'pushed',
      blockId: 'b',
      x: 3,
      y: 0,
    });
  });

  it('rejects pushing into a wall, all-or-nothing, by reference', () => {
    const { room: r, state: s } = fixture({
      id: 'push-wall',
      spawn: { x: 0, y: 0 },
      blocks: [{ id: 'b', pos: { x: 2, y: 0 } }],
      tiles: [
        [0, 0, 0],
        [1, 1, 1],
      ],
    });

    const behind = move(s, r, 'right').state;
    const rejected = move(behind, r, 'right');

    expect(rejected.accepted).toBe(false);

    if (rejected.accepted) {
      return;
    }

    expect(rejected.reason).toBe('block-stuck');
    expect(rejected.events).toEqual([
      { tag: 'blocked', reason: 'block-stuck' },
    ]);
    expect(rejected.state).toBe(behind);
    expect(behind.player).toEqual({ x: 1, y: 0 });
    expect(behind.blocks.b).toEqual({ x: 2, y: 0 });
  });

  it('rejects pushing into a closed door or a second block', () => {
    const { room: r, state: s } = fixture({
      id: 'push-door',
      spawn: { x: 0, y: 0 },
      doors: [{ id: 'd', pos: { x: 3, y: 0 }, lockedBy: 'k' }],
      blocks: [{ id: 'b', pos: { x: 2, y: 0 } }],
      tiles: [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
      ],
    });

    const behind = move(s, r, 'right').state;
    const rejected = move(behind, r, 'right');

    expect(rejected.accepted).toBe(false);

    if (rejected.accepted) {
      return;
    }

    expect(rejected.reason).toBe('block-stuck');
    expect(rejected.state).toBe(behind);

    const second = fixture({
      id: 'push-second',
      spawn: { x: 0, y: 0 },
      blocks: [
        { id: 'b1', pos: { x: 2, y: 0 } },
        { id: 'b2', pos: { x: 3, y: 0 } },
      ],
      tiles: [
        [0, 0, 0, 0, 0],
        [1, 1, 1, 1, 1],
      ],
    });

    const behind2 = move(second.state, second.room, 'right').state;
    const rejected2 = move(behind2, second.room, 'right');

    expect(rejected2.accepted).toBe(false);

    if (rejected2.accepted) {
      return;
    }

    expect(rejected2.reason).toBe('block-stuck');
  });

  it('rejects pushing a block onto a lever or chest cell', () => {
    for (const object of [
      { kind: 'lever', id: 'lv', pos: { x: 3, y: 0 }, doors: [] },
      { kind: 'chest', id: 'ch', pos: { x: 3, y: 0 }, setFlag: 'x' },
    ]) {
      const { room: r, state: s } = fixture({
        id: 'push-object',
        spawn: { x: 0, y: 0 },
        blocks: [{ id: 'b', pos: { x: 2, y: 0 } }],
        levers:
          object.kind === 'lever' ? [object] : [],
        chests:
          object.kind === 'chest' ? [object] : [],
        tiles: [
          [0, 0, 0, 0],
          [1, 1, 1, 1],
        ],
      });

      const behind = move(s, r, 'right').state;
      const rejected = move(behind, r, 'right');

      expect(rejected.accepted).toBe(false);

      if (rejected.accepted) {
        return;
      }

      expect(rejected.reason).toBe('block-stuck');
      expect(rejected.state).toBe(behind);
    }
  });

  it('fires onTarget exactly once when the block reaches its target', () => {
    const { room: r, state: s } = fixture({
      id: 'target',
      spawn: { x: 0, y: 0 },
      blocks: [
        {
          id: 'b',
          pos: { x: 2, y: 0 },
          target: { x: 3, y: 0 },
          onTarget: { setFlag: 'solved' },
        },
      ],
      tiles: [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
      ],
    });

    const behind = move(s, r, 'right').state; // (1,0)
    const fired = move(behind, r, 'right'); // block → (3,0)

    expect(fired.accepted).toBe(true);
    expect(fired.events).toContainEqual({
      tag: 'block-on-target',
      blockId: 'b',
    });
    expect(fired.events).toContainEqual({
      tag: 'flag-set',
      key: 'solved',
      value: true,
    });
    expect(fired.state.flags.solved).toBe(true);
    expect(fired.state.onTargetFired.b).toBe(true);

    // Re-entering with the latch carried: pushing the block onto the
    // target again must NOT re-fire.
    const walkAround = fixture(
      {
        id: 'target',
        spawn: { x: 0, y: 0 },
        blocks: [
          {
            id: 'b',
            pos: { x: 2, y: 0 },
            target: { x: 3, y: 0 },
            onTarget: { setFlag: 'solved' },
          },
        ],
        tiles: [
          [0, 0, 0, 0, 0, 0],
          [1, 1, 1, 1, 1, 1],
        ],
      },
      { x: 0, y: 0 },
      {
        flags: { solved: true },
        openedChests: {},
        onTargetFired: { b: true },
        latchedOpenDoors: {},
      },
    );

    const behindAgain = move(walkAround.state, walkAround.room, 'right').state;
    const refire = move(behindAgain, walkAround.room, 'right');

    expect(refire.accepted).toBe(true);
    expect(refire.state.blocks.b).toEqual({ x: 3, y: 0 });
    expect(refire.state.flags.solved).toBe(true);
    expect(refire.events).not.toContainEqual({
      tag: 'block-on-target',
      blockId: 'b',
    });
  });
});

describe('Phase 4: lever', () => {
  it('toggles its linked door open and closed', () => {
    const { room: r, state: s } = fixture({
      id: 'lever',
      spawn: { x: 0, y: 0 },
      doors: [{ id: 'd', pos: { x: 2, y: 0 } }],
      levers: [{ id: 'lv', pos: { x: 1, y: 0 }, doors: ['d'] }],
      tiles: [
        [0, 0, 0],
        [1, 1, 1],
      ],
    });

    const on = applyTileOperation(s, r, { kind: 'interact' });

    expect(on.accepted).toBe(true);
    expect(on.events).toContainEqual({
      tag: 'lever-toggled',
      leverId: 'lv',
      on: true,
    });
    expect(on.events).toContainEqual({
      tag: 'door-opened',
      doorId: 'd',
    });
    expect(on.state.levers.lv).toEqual({ on: true });
    expect(on.state.doors.d).toEqual({ open: true });

    const off = applyTileOperation(on.state, r, { kind: 'interact' });

    expect(off.events).toContainEqual({
      tag: 'lever-toggled',
      leverId: 'lv',
      on: false,
    });
    expect(off.events).toContainEqual({
      tag: 'door-closed',
      doorId: 'd',
    });
    expect(off.state.doors.d).toEqual({ open: false });
  });

  it('does not disturb a plate-linked door (non-interference)', () => {
    const { room: r, state: s } = fixture({
      id: 'mixed',
      spawn: { x: 0, y: 0 },
      doors: [
        { id: 'door-a', pos: { x: 2, y: 0 } },
        { id: 'door-b', pos: { x: 2, y: 2 } },
      ],
      levers: [{ id: 'lv', pos: { x: 1, y: 0 }, doors: ['door-a'] }],
      pressurePlates: [{ id: 'p', pos: { x: 1, y: 2 }, doors: ['door-b'] }],
      tiles: [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [1, 1, 1, 1],
      ],
    });

    const toggle = applyTileOperation(s, r, { kind: 'interact' });

    expect(toggle.events).toContainEqual({
      tag: 'door-opened',
      doorId: 'door-a',
    });
    expect(toggle.events).not.toContainEqual(
      expect.objectContaining({ doorId: 'door-b' }),
    );
    expect(toggle.state.doors['door-b']).toEqual({ open: false });
  });
});

describe('Phase 4: chest', () => {
  it('opens once and sets its flag; further interacts are noops', () => {
    const { room: r, state: s } = fixture({
      id: 'chest',
      spawn: { x: 0, y: 0 },
      chests: [{ id: 'ch', pos: { x: 0, y: 0 }, setFlag: 'k' }],
      tiles: [
        [0, 0],
        [1, 1],
      ],
    });

    const opened = applyTileOperation(s, r, { kind: 'interact' });

    expect(opened.accepted).toBe(true);
    expect(opened.events).toContainEqual({
      tag: 'chest-opened',
      chestId: 'ch',
      flag: 'k',
    });
    expect(opened.events).toContainEqual({
      tag: 'flag-set',
      key: 'k',
      value: true,
    });
    expect(opened.state.chests.ch).toEqual({ opened: true });
    expect(opened.state.flags.k).toBe(true);

    const again = applyTileOperation(opened.state, r, {
      kind: 'interact',
    });

    expect(again.events).toEqual([{ tag: 'interact-noop' }]);
  });

  it('does not re-open a chest that was opened before a room re-entry', () => {
    const carried = {
      flags: { k: true },
      openedChests: { ch: true },
      onTargetFired: {},
      latchedOpenDoors: {},
    };
    const { room: r, state: s } = fixture(
      {
        id: 'chest',
        spawn: { x: 0, y: 0 },
        chests: [{ id: 'ch', pos: { x: 0, y: 0 }, setFlag: 'k' }],
        tiles: [
          [0, 0],
          [1, 1],
        ],
      },
      { x: 0, y: 0 },
      carried,
    );

    expect(s.chests.ch).toEqual({ opened: true });
    expect(applyTileOperation(s, r, { kind: 'interact' }).events).toEqual([
      { tag: 'interact-noop' },
    ]);
  });
});

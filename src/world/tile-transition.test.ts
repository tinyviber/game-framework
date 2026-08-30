import { describe, expect, it } from 'vitest';
import room01Json from '../data/rooms/room_01.json';
import room02Json from '../data/rooms/room_02.json';
import room03Json from '../data/rooms/room_03.json';
import hubJson from '../data/rooms/hub.json';
import vaultJson from '../data/rooms/vault.json';
import cellarJson from '../data/rooms/cellar.json';
import { parseTileRoom, type TileRoom } from './tilemap';
import {
  applyTileOperation,
  createTileRoomState,
  type TileGameState,
} from './tile-world';
import {
  resolveTileExit,
  validateTileRoomCatalog,
  type TileRoomCatalog,
} from './tile-transition';

const catalog: TileRoomCatalog = {
  room_01: parseTileRoom(room01Json),
  room_02: parseTileRoom(room02Json),
  room_03: parseTileRoom(room03Json),
  hub: parseTileRoom(hubJson),
  vault: parseTileRoom(vaultJson),
  cellar: parseTileRoom(cellarJson),
};

const room = (id: string): TileRoom => {
  const found = catalog[id];

  if (!found) {
    throw new Error(`missing room ${id}`);
  }

  return found;
};

function walkTo(
  fromRoomId: string,
  moves: readonly ('up' | 'down' | 'left' | 'right')[],
): { state: TileGameState; roomId: string } {
  let roomId = fromRoomId;
  let state = createTileRoomState(room(roomId));

  for (const direction of moves) {
    const result = applyTileOperation(
      state,
      room(roomId),
      { kind: 'move', direction },
    );

    if (!result.accepted) {
      throw new Error(
        `walk blocked moving ${direction} at (${state.player.x},${state.player.y}) in ${roomId}`,
      );
    }

    state = result.state;
  }

  return { state, roomId };
}

describe('resolveTileExit with the three shipped rooms', () => {
  it('transitions room_01 -> room_02 at the right-edge trigger', () => {
    const { state, roomId } = walkTo('room_01', [
      'right',
      'right',
      'right',
      'right',
      'right',
      'right',
      'right',
      'right',
      'right',
      'right',
      'right',
    ]);

    expect(roomId).toBe('room_01');
    expect(state.player).toEqual({ x: 12, y: 4 });

    const resolution = resolveTileExit(
      state,
      room('room_01'),
      catalog,
    );

    expect(resolution).toEqual({
      accepted: true,
      exitId: 'to-room-02',
      roomId: 'room_02',
      spawn: { x: 1, y: 4 },
    });
  });

  it('transitions room_02 -> room_01 back through the left-edge trigger', () => {
    const { state } = walkTo('room_02', [
      'left',
      'left',
      'left',
      'left',
    ]);

    expect(state.player).toEqual({ x: 0, y: 4 });

    const resolution = resolveTileExit(
      state,
      room('room_02'),
      catalog,
    );

    expect(resolution).toEqual({
      accepted: true,
      exitId: 'to-room-01',
      roomId: 'room_01',
      spawn: { x: 11, y: 4 },
    });
  });

  it('transitions room_02 -> room_03 through the bottom trigger', () => {
    const { state } = walkTo('room_02', [
      'down',
      'down',
      'down',
      'down',
    ]);

    expect(state.player).toEqual({ x: 4, y: 8 });

    const resolution = resolveTileExit(
      state,
      room('room_02'),
      catalog,
    );

    expect(resolution).toEqual({
      accepted: true,
      exitId: 'to-room-03',
      roomId: 'room_03',
      spawn: { x: 4, y: 1 },
    });
  });

  it('transitions room_03 -> room_02 back through the top trigger', () => {
    const { state } = walkTo('room_03', [
      'up',
      'up',
      'up',
      'up',
    ]);

    expect(state.player).toEqual({ x: 4, y: 0 });

    const resolution = resolveTileExit(
      state,
      room('room_03'),
      catalog,
    );

    expect(resolution).toEqual({
      accepted: true,
      exitId: 'to-room-02',
      roomId: 'room_02',
      spawn: { x: 4, y: 7 },
    });
  });

  it('reports no-exit for interior cells', () => {
    const { state } = walkTo('room_01', []);

    const resolution = resolveTileExit(
      state,
      room('room_01'),
      catalog,
    );

    expect(resolution).toEqual({
      accepted: false,
      reason: 'no-exit',
    });
  });

  it('reports no-exit for boundary cells without an exit trigger', () => {
    // (3, 2) is a floor cell on the right edge, but only (3, 1) and
    // (3, 3) are exit triggers — edge cells no longer imply exits.
    const edgeRoom = parseTileRoom({
      id: 'edge-room',
      spawn: { x: 1, y: 2 },
      exits: [
        {
          id: 'north-gate',
          at: { x: 3, y: 1 },
          room: 'room_01',
          spawn: { x: 11, y: 4 },
        },
        {
          id: 'south-gate',
          at: { x: 3, y: 3 },
          room: 'room_02',
          spawn: { x: 4, y: 4 },
        },
      ],
      tiles: [
        [1, 1, 1, 1],
        [1, 0, 0, 0],
        [1, 0, 0, 0],
        [1, 0, 0, 0],
        [1, 1, 1, 1],
      ],
    });

    const state = createTileRoomState(edgeRoom, { x: 3, y: 2 });

    expect(
      resolveTileExit(state, edgeRoom, catalog),
    ).toEqual({ accepted: false, reason: 'no-exit' });
  });

  it('supports multiple exits on the same side of a room', () => {
    const twoRightExits = parseTileRoom({
      id: 'two-right',
      spawn: { x: 1, y: 2 },
      exits: [
        {
          id: 'north-gate',
          at: { x: 3, y: 1 },
          room: 'room_01',
          spawn: { x: 11, y: 4 },
        },
        {
          id: 'south-gate',
          at: { x: 3, y: 3 },
          room: 'room_02',
          spawn: { x: 4, y: 4 },
        },
      ],
      tiles: [
        [1, 1, 1, 1],
        [1, 0, 0, 0],
        [1, 0, 0, 0],
        [1, 0, 0, 0],
        [1, 1, 1, 1],
      ],
    });

    const north = createTileRoomState(twoRightExits, { x: 3, y: 1 });
    const south = createTileRoomState(twoRightExits, { x: 3, y: 3 });

    expect(
      resolveTileExit(north, twoRightExits, catalog),
    ).toEqual({
      accepted: true,
      exitId: 'north-gate',
      roomId: 'room_01',
      spawn: { x: 11, y: 4 },
    });

    expect(
      resolveTileExit(south, twoRightExits, catalog),
    ).toEqual({
      accepted: true,
      exitId: 'south-gate',
      roomId: 'room_02',
      spawn: { x: 4, y: 4 },
    });
  });

  it('supports interior exit triggers (portals, staircases)', () => {
    const portal = parseTileRoom({
      id: 'portal-room',
      spawn: { x: 1, y: 1 },
      exits: [
        {
          id: 'center-portal',
          at: { x: 2, y: 2 },
          room: 'room_01',
          spawn: { x: 11, y: 4 },
        },
      ],
      tiles: [
        [1, 1, 1, 1, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 0, 0, 0, 1],
        [1, 1, 1, 1, 1],
      ],
    });

    const state = createTileRoomState(portal, { x: 2, y: 2 });

    expect(resolveTileExit(state, portal, catalog)).toEqual({
      accepted: true,
      exitId: 'center-portal',
      roomId: 'room_01',
      spawn: { x: 11, y: 4 },
    });
  });

  it('reports unknown-room for a dangling exit', () => {
    const ghost = parseTileRoom({
      id: 'ghost',
      spawn: { x: 0, y: 0 },
      exits: [
        {
          id: 'to-nowhere',
          at: { x: 1, y: 0 },
          room: 'nowhere',
          spawn: { x: 0, y: 0 },
        },
      ],
      tiles: [
        [0, 0],
        [1, 1],
      ],
    });

    const state = createTileRoomState(ghost, { x: 1, y: 0 });
    const resolution = resolveTileExit(state, ghost, catalog);

    expect(resolution).toEqual({
      accepted: false,
      reason: 'unknown-room',
    });
  });

  it('reports invalid-spawn when the target spawn is a wall', () => {
    const badSpawn = parseTileRoom({
      id: 'badspawn',
      spawn: { x: 0, y: 0 },
      exits: [
        {
          id: 'to-room-01',
          at: { x: 1, y: 0 },
          room: 'room_01',
          spawn: { x: 0, y: 0 },
        },
      ],
      tiles: [
        [0, 0],
        [1, 1],
      ],
    });

    const state = createTileRoomState(badSpawn, { x: 1, y: 0 });
    const resolution = resolveTileExit(state, badSpawn, catalog);

    expect(resolution).toEqual({
      accepted: false,
      reason: 'invalid-spawn',
    });
  });
});

describe('validateTileRoomCatalog', () => {
  it('accepts the shipped six-room graph', () => {
    expect(validateTileRoomCatalog(catalog)).toEqual([]);
  });

  it('reports exits pointing at unknown rooms', () => {
    const broken = parseTileRoom({
      id: 'broken',
      spawn: { x: 0, y: 0 },
      exits: [
        {
          id: 'to-nowhere',
          at: { x: 1, y: 0 },
          room: 'nowhere',
          spawn: { x: 0, y: 0 },
        },
      ],
      tiles: [
        [0, 0],
        [1, 1],
      ],
    });

    const problems = validateTileRoomCatalog({ ...catalog, broken });

    expect(problems).toEqual([
      {
        roomId: 'broken',
        exitId: 'to-nowhere',
        detail: 'references unknown room "nowhere"',
      },
    ]);
  });

  it('reports exit spawns that are not walkable in the target room', () => {
    const broken = parseTileRoom({
      id: 'broken',
      spawn: { x: 0, y: 0 },
      exits: [
        {
          id: 'into-wall',
          at: { x: 1, y: 0 },
          room: 'room_01',
          spawn: { x: 0, y: 0 },
        },
      ],
      tiles: [
        [0, 0],
        [1, 1],
      ],
    });

    const problems = validateTileRoomCatalog({ ...catalog, broken });

    expect(problems).toEqual([
      {
        roomId: 'broken',
        exitId: 'into-wall',
        detail: 'spawn (0,0) is not walkable in "room_01"',
      },
    ]);
  });

  it('reports catalog keys that do not match the room id', () => {
    const problems = validateTileRoomCatalog({
      ...catalog,
      mislabeled: room('room_01'),
    });

    expect(problems).toEqual([
      {
        roomId: 'mislabeled',
        exitId: '-',
        detail: 'room id "room_01" does not match catalog key "mislabeled"',
      },
    ]);
  });
});

describe('three-room round trip (DoD)', () => {
  it('walks room_01 -> room_02 -> room_03 and back with correct spawns', () => {
    const catalogForEnter = (id: string): TileRoom => room(id);

    // room_01 -> room_02
    const step1 = walkTo('room_01', [
      'right',
      'right',
      'right',
      'right',
      'right',
      'right',
      'right',
      'right',
      'right',
      'right',
      'right',
    ]);
    const exit1 = resolveTileExit(
      step1.state,
      catalogForEnter(step1.roomId),
      catalog,
    );
    expect(exit1.accepted).toBe(true);
    if (!exit1.accepted) {
      return;
    }

    let state = createTileRoomState(
      room(exit1.roomId),
      exit1.spawn,
    );
    let roomId = exit1.roomId;
    expect(state.player).toEqual({ x: 1, y: 4 });

    // room_02 -> room_03: align with the exit column first
    for (const direction of ['right', 'right', 'right'] as const) {
      const result = applyTileOperation(state, room(roomId), {
        kind: 'move',
        direction,
      });
      expect(result.accepted).toBe(true);
      state = result.state;
    }

    for (const direction of ['down', 'down', 'down', 'down'] as const) {
      const result = applyTileOperation(state, room(roomId), {
        kind: 'move',
        direction,
      });
      expect(result.accepted).toBe(true);
      state = result.state;
    }

    const exit2 = resolveTileExit(state, room(roomId), catalog);
    expect(exit2.accepted).toBe(true);
    if (!exit2.accepted) {
      return;
    }

    state = createTileRoomState(room(exit2.roomId), exit2.spawn);
    roomId = exit2.roomId;
    expect(roomId).toBe('room_03');
    expect(state.player).toEqual({ x: 4, y: 1 });

    // room_03 -> room_02 (spawn is (4,1): one step up reaches the exit)
    for (const direction of ['up'] as const) {
      const result = applyTileOperation(state, room(roomId), {
        kind: 'move',
        direction,
      });
      expect(result.accepted).toBe(true);
      state = result.state;
    }

    const exit3 = resolveTileExit(state, room(roomId), catalog);
    expect(exit3.accepted).toBe(true);
    if (!exit3.accepted) {
      return;
    }

    state = createTileRoomState(room(exit3.roomId), exit3.spawn);
    roomId = exit3.roomId;
    expect(roomId).toBe('room_02');
    expect(state.player).toEqual({ x: 4, y: 7 });

    // room_02 -> room_01: row 7's left edge is a wall, so align with
    // the open row (y=4) before walking left.
    for (const direction of ['up', 'up', 'up'] as const) {
      const result = applyTileOperation(state, room(roomId), {
        kind: 'move',
        direction,
      });
      expect(result.accepted).toBe(true);
      state = result.state;
    }

    for (const direction of [
      'left',
      'left',
      'left',
      'left',
    ] as const) {
      const result = applyTileOperation(state, room(roomId), {
        kind: 'move',
        direction,
      });
      expect(result.accepted).toBe(true);
      state = result.state;
    }

    expect(state.player).toEqual({ x: 0, y: 4 });

    const exit4 = resolveTileExit(state, room(roomId), catalog);
    expect(exit4.accepted).toBe(true);
    if (!exit4.accepted) {
      return;
    }

    state = createTileRoomState(room(exit4.roomId), exit4.spawn);
    expect(exit4.roomId).toBe('room_01');
    expect(state.player).toEqual({ x: 11, y: 4 });
  });
});

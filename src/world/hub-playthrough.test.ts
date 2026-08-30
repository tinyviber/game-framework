import { describe, expect, it } from 'vitest';
import hubJson from '../data/rooms/hub.json';
import vaultJson from '../data/rooms/vault.json';
import cellarJson from '../data/rooms/cellar.json';
import room01Json from '../data/rooms/room_01.json';
import room02Json from '../data/rooms/room_02.json';
import room03Json from '../data/rooms/room_03.json';
import { parseTileRoom, type TileRoom } from './tilemap';
import {
  applyTileOperation,
  createTileRoomState,
  extractCarriedState,
  type CarriedState,
  type TileGameState,
  type TileOperation,
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

function step(
  state: TileGameState,
  roomId: string,
  operation: TileOperation,
): TileGameState {
  const result = applyTileOperation(state, room(roomId), operation);

  if (!result.accepted) {
    throw new Error(
      `step rejected in ${roomId}: ${result.reason} (player ${state.player.x},${state.player.y})`,
    );
  }

  return result.state;
}

function walk(
  state: TileGameState,
  roomId: string,
  directions: readonly ('up' | 'down' | 'left' | 'right')[],
): TileGameState {
  let current = state;

  for (const direction of directions) {
    current = step(current, roomId, { kind: 'move', direction });
  }

  return current;
}

/** Moves until the player stands on an exit cell, then transitions. */
function exitRoom(
  state: TileGameState,
  roomId: string,
  directions: readonly ('up' | 'down' | 'left' | 'right')[],
): { roomId: string; state: TileGameState } {
  const atExit = walk(state, roomId, directions);
  const resolution = resolveTileExit(atExit, room(roomId), catalog);

  if (!resolution.accepted) {
    throw new Error(
      `no exit resolved from ${roomId} at (${atExit.player.x},${atExit.player.y})`,
    );
  }

  return {
    roomId: resolution.roomId,
    state: createTileRoomState(
      room(resolution.roomId),
      resolution.spawn,
      extractCarriedState(atExit),
    ),
  };
}

/** Walk right until the cell just below the hub-gate. */
function corridorCheckPath(state: TileGameState): TileGameState {
  return walk(state, 'hub', [
    'right',
    'right',
    'right',
    'right',
    'right',
    'up',
  ]);
}

describe('catalog integrity', () => {
  it('the shipped hub cluster validates: every exit target exists and every spawn is walkable', () => {
    expect(validateTileRoomCatalog(catalog)).toEqual([]);
  });
});

describe('connectivity (review B1)', () => {
  it('the boot room reaches the hub cluster through room_02 and room_03', () => {
    let roomId = 'room_01';
    let state = createTileRoomState(room(roomId));

    // room_01 → room_02
    state = walk(state, roomId, [
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
    let resolution = resolveTileExit(state, room(roomId), catalog);
    expect(resolution.accepted).toBe(true);
    if (!resolution.accepted) {
      return;
    }
    state = createTileRoomState(room(resolution.roomId), resolution.spawn);
    roomId = resolution.roomId;
    expect(roomId).toBe('room_02');

    // room_02 → room_03
    state = walk(state, roomId, ['right', 'right', 'right', 'down', 'down', 'down', 'down']);
    resolution = resolveTileExit(state, room(roomId), catalog);
    expect(resolution.accepted).toBe(true);
    if (!resolution.accepted) {
      return;
    }
    state = createTileRoomState(room(resolution.roomId), resolution.spawn);
    roomId = resolution.roomId;
    expect(roomId).toBe('room_03');

    // room_03 → hub
    state = walk(state, roomId, ['down', 'down', 'down', 'down', 'down', 'down', 'down']);
    resolution = resolveTileExit(state, room(roomId), catalog);
    expect(resolution.accepted).toBe(true);
    if (!resolution.accepted) {
      return;
    }
    state = createTileRoomState(room(resolution.roomId), resolution.spawn);
    roomId = resolution.roomId;
    expect(roomId).toBe('hub');
    expect(state.player).toEqual({ x: 2, y: 5 });
  });
});

describe('hub playthrough (Phase 5 DoD)', () => {
  it('locks the cellar gate and the up gate at entry', () => {
    const state = createTileRoomState(room('hub'));

    expect(state.doors['hub-gate']).toEqual({ open: false });
    expect(state.doors['cellar-gate']).toEqual({ open: false });
    expect(state.blocks['hub-block']).toEqual({ x: 4, y: 5 });
  });

  it('blocks the locked cellar-gate with a locked-door rejection', () => {
    const state = walk(createTileRoomState(room('hub')), 'hub', [
      'down',
      'right',
      'right',
      'right',
      'right',
      'right',
      'down',
      'down',
    ]);

    expect(state.player).toEqual({ x: 7, y: 8 });

    const result = applyTileOperation(state, room('hub'), {
      kind: 'move',
      direction: 'down',
    });

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toBe('locked-door');
    }
  });

  it('the hub-gate corridor is sealed: no bypass around the plate puzzle', () => {
    const state = corridorCheckPath(
      createTileRoomState(room('hub')),
    );

    expect(state.player).toEqual({ x: 7, y: 4 });

    // Side walls seal the corridor: (7,1)/(7,2) are unreachable
    // without passing through the gate door itself.
    expect(
      applyTileOperation(state, room('hub'), {
        kind: 'move',
        direction: 'left',
      }).accepted,
    ).toBe(true);
    expect(
      applyTileOperation(
        walk(state, 'hub', ['left', 'left']),
        room('hub'),
        { kind: 'move', direction: 'up' },
      ).accepted,
    ).toBe(true);

    const result = applyTileOperation(state, room('hub'), {
      kind: 'move',
      direction: 'up',
    });

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason).toBe('locked-door');
    }
  });

  it('plays the full flow: plate+block → chest flag → flag door → lever → block target', () => {
    let state = createTileRoomState(room('hub'));

    // ── hub: push the block onto the pressure plate ─────────────
    state = walk(state, 'hub', ['up', 'right', 'right']); // player (4,4)
    state = step(state, 'hub', { kind: 'move', direction: 'down' }); // push → (4,6)
    state = step(state, 'hub', { kind: 'move', direction: 'down' }); // push → (4,7)
    state = step(state, 'hub', { kind: 'move', direction: 'down' }); // push → (4,8)
    state = walk(state, 'hub', ['right', 'down']); // player (5,8)
    state = step(state, 'hub', { kind: 'move', direction: 'left' }); // push → (3,8)
    state = step(state, 'hub', { kind: 'move', direction: 'left' }); // push → plate (2,8)

    expect(state.blocks['hub-block']).toEqual({ x: 2, y: 8 });
    expect(state.doors['hub-gate']).toEqual({ open: true });

    // ── hub → vault ─────────────────────────────────────────────
    let transition = exitRoom(state, 'hub', [
      'right',
      'right',
      'right',
      'right',
      'up',
      'up',
      'up',
      'up',
      'up',
      'up',
      'up',
      'up',
    ]);

    expect(transition.roomId).toBe('vault');
    state = transition.state;
    expect(state.player).toEqual({ x: 4, y: 1 });

    // ── vault: open the chest → cellar-key flag ─────────────────
    state = walk(state, 'vault', ['down', 'down']);
    expect(state.player).toEqual({ x: 4, y: 3 });
    state = step(state, 'vault', { kind: 'interact' });

    expect(state.chests['vault-chest']).toEqual({ opened: true });
    expect(state.flags['cellar-key']).toBe(true);

    const carriedAfterChest: CarriedState =
      extractCarriedState(state);
    expect(carriedAfterChest.flags['cellar-key']).toBe(true);
    expect(carriedAfterChest.openedChests['vault.vault-chest']).toBe(true);

    // ── vault → hub (flag survives; spawn lands in the plaza) ───
    transition = exitRoom(state, 'vault', ['down', 'down', 'down']);
    expect(transition.roomId).toBe('hub');
    state = transition.state;
    expect(state.player).toEqual({ x: 10, y: 6 });
    expect(state.flags['cellar-key']).toBe(true);
    expect(state.doors['cellar-gate']).toEqual({ open: true });

    // ── hub → cellar: block positions reset on re-entry, so the
    // plate must be re-held before the gate corridor is passable ──
    state = walk(state, 'hub', [
      'left',
      'left',
      'left',
      'left',
      'left',
      'left',
      'left',
      'up',
      'up',
      'right',
    ]); // player (4,4), block back at (4,5)
    state = step(state, 'hub', { kind: 'move', direction: 'down' }); // push → (4,6)
    state = step(state, 'hub', { kind: 'move', direction: 'down' }); // push → (4,7)
    state = step(state, 'hub', { kind: 'move', direction: 'down' }); // push → (4,8)
    state = walk(state, 'hub', ['right', 'down']); // player (5,8)
    state = step(state, 'hub', { kind: 'move', direction: 'left' }); // push → (3,8)
    state = step(state, 'hub', { kind: 'move', direction: 'left' }); // push → plate (2,8)

    expect(state.doors['hub-gate']).toEqual({ open: true });
    expect(state.doors['cellar-gate']).toEqual({ open: true });

    transition = exitRoom(state, 'hub', [
      'right',
      'right',
      'right',
      'right',
      'down',
      'down',
    ]);
    expect(transition.roomId).toBe('cellar');
    state = transition.state;
    expect(state.player).toEqual({ x: 2, y: 1 });

    // ── cellar: lever (own cell) opens the treasure door ─────────
    state = step(state, 'cellar', { kind: 'interact' });

    expect(state.levers['cellar-lever']).toEqual({ on: true });
    expect(state.doors['treasure-door']).toEqual({ open: true });
    expect(state.doors['exit-door']).toEqual({ open: false });

    // ── cellar: push the block to its target → exit-door latch ──
    state = walk(state, 'cellar', [
      'right',
      'right',
      'right',
      'down',
      'down',
      'right',
      'right',
      'down',
    ]); // player (7,4)
    state = step(state, 'cellar', { kind: 'move', direction: 'down' }); // push → block (7,6)
    state = walk(state, 'cellar', ['left', 'down']); // player (6,6)
    state = step(state, 'cellar', { kind: 'move', direction: 'right' }); // block → (8,6)

    expect(state.blocks['cellar-block']).toEqual({ x: 8, y: 6 });
    expect(state.flags['cellar-solved']).toBe(true);
    expect(state.onTargetFired['cellar.cellar-block']).toBe(true);
    expect(state.doors['exit-door']).toEqual({ open: true });

    // ── back to hub through both open doors ─────────────────────
    transition = exitRoom(state, 'cellar', [
      'up',
      'left',
      'up',
      'left',
      'up',
      'up',
      'up',
      'up',
    ]);
    expect(transition.roomId).toBe('hub');
    state = transition.state;
    expect(state.player).toEqual({ x: 7, y: 9 });

    // ── both flags survive ──────────────────────────────────────
    const finalCarried = extractCarriedState(state);

    expect(finalCarried.flags).toEqual({
      'cellar-key': true,
      'cellar-solved': true,
    });
    expect(finalCarried.onTargetFired['cellar.cellar-block']).toBe(true);
  });

  it('identically-named objects in different rooms never alias (review P1-3)', () => {
    const roomA = parseTileRoom({
      id: 'room-a',
      spawn: { x: 0, y: 0 },
      chests: [{ id: 'chest-1', pos: { x: 1, y: 0 }, setFlag: 'ka' }],
      tiles: [
        [0, 0],
        [1, 1],
      ],
    });
    const roomB = parseTileRoom({
      id: 'room-b',
      spawn: { x: 0, y: 0 },
      chests: [{ id: 'chest-1', pos: { x: 1, y: 0 }, setFlag: 'kb' }],
      tiles: [
        [0, 0],
        [1, 1],
      ],
    });

    // Open chest-1 in room A...
    const stateA = applyTileOperation(
      createTileRoomState(roomA),
      roomA,
      { kind: 'move', direction: 'right' },
    ).state;
    const openedA = applyTileOperation(stateA, roomA, {
      kind: 'interact',
    });

    expect(openedA.state.flags.ka).toBe(true);

    // ...then enter room B with that carried state: room B's
    // chest-1 must still be closed and must set its OWN flag.
    const stateB = createTileRoomState(
      roomB,
      roomB.spawn,
      extractCarriedState(openedA.state),
    );

    expect(stateB.chests['chest-1']).toEqual({ opened: false });

    const openedB = applyTileOperation(
      applyTileOperation(stateB, roomB, {
        kind: 'move',
        direction: 'right',
      }).state,
      roomB,
      { kind: 'interact' },
    );

    expect(openedB.state.flags.ka).toBe(true);
    expect(openedB.state.flags.kb).toBe(true);
  });

  it('re-entering the vault does not re-open the chest', () => {
    const carried = {
      flags: { 'cellar-key': true },
      openedChests: { 'vault.vault-chest': true },
      onTargetFired: {},
      latchedOpenDoors: {},
    };

    const reentered = createTileRoomState(
      room('vault'),
      room('vault').spawn,
      carried,
    );

    expect(reentered.chests['vault-chest']).toEqual({ opened: true });
    expect(reentered.flags['cellar-key']).toBe(true);

    const again = applyTileOperation(reentered, room('vault'), {
      kind: 'interact',
    });

    expect(again.accepted).toBe(true);
    expect(again.events).toEqual([{ tag: 'interact-noop' }]);
    expect(again.state.flags['cellar-key']).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import room01Json from '../data/rooms/room_01.json';
import {
  isWallAt,
  parseTileRoom,
  TileRoomParseError,
} from './tilemap';

describe('parseTileRoom', () => {
  it('parses the shipped room_01.json', () => {
    const room = parseTileRoom(room01Json);

    expect(room.id).toBe('room_01');
    expect(room.width).toBe(13);
    expect(room.height).toBe(9);
    expect(room.spawn).toEqual({ x: 1, y: 4 });
    expect(room.doors).toEqual([]);
    expect(room.exits).toEqual([
      {
        id: 'to-room-02',
        at: { x: 12, y: 4 },
        room: 'room_02',
        spawn: { x: 1, y: 4 },
      },
    ]);
  });

  it('produces a deeply frozen room', () => {
    const room = parseTileRoom(room01Json);

    expect(Object.isFrozen(room)).toBe(true);
    expect(Object.isFrozen(room.tiles)).toBe(true);
    expect(Object.isFrozen(room.tiles[0])).toBe(true);
  });

  it('rejects non-rectangular tile arrays', () => {
    expect(() =>
      parseTileRoom({
        id: 'bad',
        spawn: { x: 0, y: 0 },
        tiles: [[0, 0], [0]],
      }),
    ).toThrow(TileRoomParseError);
  });

  it('rejects tile values other than 0 and 1', () => {
    expect(() =>
      parseTileRoom({
        id: 'bad',
        spawn: { x: 0, y: 0 },
        tiles: [[0, 2]],
      }),
    ).toThrow(TileRoomParseError);
  });

  it('rejects a first tile row that is not an array (no raw TypeError)', () => {
    expect(() =>
      parseTileRoom({
        id: 'bad',
        spawn: { x: 0, y: 0 },
        tiles: [null],
      }),
    ).toThrow(TileRoomParseError);

    expect(() =>
      parseTileRoom({
        id: 'bad',
        spawn: { x: 0, y: 0 },
        tiles: [0, 1],
      }),
    ).toThrow(TileRoomParseError);
  });

  it('rejects a spawn on a wall tile', () => {
    expect(() =>
      parseTileRoom({
        id: 'bad',
        spawn: { x: 0, y: 0 },
        tiles: [[1, 0], [0, 0]],
      }),
    ).toThrow(/spawn/);
  });

  it('rejects a spawn outside the room', () => {
    expect(() =>
      parseTileRoom({
        id: 'bad',
        spawn: { x: 5, y: 0 },
        tiles: [[0, 0]],
      }),
    ).toThrow(/outside/);
  });

  it('rejects non-integer spawn coordinates', () => {
    expect(() =>
      parseTileRoom({
        id: 'bad',
        spawn: { x: 0.5, y: 0 },
        tiles: [[0, 0]],
      }),
    ).toThrow(TileRoomParseError);
  });
});

/**
 * ── Authoring-boundary validation ───────────────────────────────
 * Room JSON is written by humans and agents; every structural
 * mistake must fail at parse time instead of producing a world
 * that parses but cannot be played.
 */
describe('parseTileRoom authoring-boundary validation', () => {
  const TILES = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [1, 1, 1, 1],
  ] as const;

  function roomWith(
    overrides: Record<string, unknown>,
  ): unknown {
    return {
      id: 'probe',
      spawn: { x: 0, y: 0 },
      tiles: TILES,
      ...overrides,
    };
  }

  it('rejects unknown root keys (typos like "exits" misspelled)', () => {
    expect(() =>
      parseTileRoom(roomWith({ rigth: {} })),
    ).toThrow(/unknown key "rigth"/);
  });

  it('rejects exits in the legacy directional-object format', () => {
    expect(() =>
      parseTileRoom(
        roomWith({
          exits: { right: { room: 'x', spawn: { x: 0, y: 0 } } },
        }),
      ),
    ).toThrow(/exits must be an array/);
  });

  it('rejects unknown keys inside exit entries', () => {
    expect(() =>
      parseTileRoom(
        roomWith({
          exits: [
            {
              id: 'e',
              at: { x: 3, y: 0 },
              rom: 'elsewhere',
              spawn: { x: 0, y: 0 },
            },
          ],
        }),
      ),
    ).toThrow(/unknown key "rom"/);
  });

  it('rejects duplicate ids across entity categories', () => {
    expect(() =>
      parseTileRoom(
        roomWith({
          doors: [{ id: 'dup', pos: { x: 1, y: 0 } }],
          levers: [{ id: 'dup', pos: { x: 2, y: 0 }, doors: [] }],
        }),
      ),
    ).toThrow(/duplicate id "dup"/);
  });

  it('rejects door references to unknown doors', () => {
    expect(() =>
      parseTileRoom(
        roomWith({
          pressurePlates: [
            { id: 'p', pos: { x: 1, y: 0 }, doors: ['ghost-door'] },
          ],
        }),
      ),
    ).toThrow(/unknown door "ghost-door"/);

    expect(() =>
      parseTileRoom(
        roomWith({
          levers: [
            { id: 'lv', pos: { x: 1, y: 0 }, doors: ['ghost-door'] },
          ],
        }),
      ),
    ).toThrow(/unknown door "ghost-door"/);

    expect(() =>
      parseTileRoom(
        roomWith({
          blocks: [
            {
              id: 'b',
              pos: { x: 1, y: 0 },
              onTarget: { openDoors: ['ghost-door'] },
            },
          ],
        }),
      ),
    ).toThrow(/unknown door "ghost-door"/);
  });

  it('rejects an onTarget with the wrong type instead of ignoring it', () => {
    expect(() =>
      parseTileRoom(
        roomWith({
          blocks: [
            { id: 'b', pos: { x: 1, y: 0 }, onTarget: 'open-the-door' },
          ],
        }),
      ),
    ).toThrow(/onTarget must be an object/);
  });

  it('rejects objects placed on wall tiles', () => {
    expect(() =>
      parseTileRoom(
        roomWith({
          doors: [{ id: 'd', pos: { x: 0, y: 2 } }],
        }),
      ),
    ).toThrow(/door "d" must be on a floor tile/);

    expect(() =>
      parseTileRoom(
        roomWith({
          chests: [{ id: 'c', pos: { x: 1, y: 2 }, setFlag: 'k' }],
        }),
      ),
    ).toThrow(/chest "c" must be on a floor tile/);
  });

  it('rejects two objects sharing a cell', () => {
    expect(() =>
      parseTileRoom(
        roomWith({
          pressurePlates: [
            { id: 'p', pos: { x: 1, y: 0 }, doors: [] },
          ],
          chests: [{ id: 'c', pos: { x: 1, y: 0 }, setFlag: 'k' }],
        }),
      ),
    ).toThrow(/overlaps/);
  });

  it('rejects a block target on a wall or on another object', () => {
    expect(() =>
      parseTileRoom(
        roomWith({
          blocks: [
            { id: 'b', pos: { x: 1, y: 0 }, target: { x: 0, y: 2 } },
          ],
        }),
      ),
    ).toThrow(/target must be on a floor tile/);

    expect(() =>
      parseTileRoom(
        roomWith({
          chests: [{ id: 'c', pos: { x: 2, y: 0 }, setFlag: 'k' }],
          blocks: [
            { id: 'b', pos: { x: 1, y: 0 }, target: { x: 2, y: 0 } },
          ],
        }),
      ),
    ).toThrow(/target .* overlaps/);
  });

  it('allows a block target on a pressure plate (classic combo)', () => {
    const room = parseTileRoom(
      roomWith({
        pressurePlates: [
          { id: 'p', pos: { x: 2, y: 0 }, doors: [] },
        ],
        blocks: [
          {
            id: 'b',
            pos: { x: 1, y: 0 },
            target: { x: 2, y: 0 },
            onTarget: { setFlag: 'solved' },
          },
        ],
      }),
    );

    expect(room.blocks[0]?.target).toEqual({ x: 2, y: 0 });
  });

  it('rejects a spawn inside a door or a block', () => {
    expect(() =>
      parseTileRoom(
        roomWith({
          spawn: { x: 1, y: 0 },
          doors: [{ id: 'd', pos: { x: 1, y: 0 } }],
        }),
      ),
    ).toThrow(/spawn must not be on a door/);

    expect(() =>
      parseTileRoom(
        roomWith({
          spawn: { x: 1, y: 0 },
          blocks: [{ id: 'b', pos: { x: 1, y: 0 } }],
        }),
      ),
    ).toThrow(/spawn must not be on a block/);
  });

  it('rejects exit triggers that are not standable floor cells', () => {
    expect(() =>
      parseTileRoom(
        roomWith({
          exits: [
            { id: 'e', at: { x: 0, y: 2 }, room: 'x', spawn: { x: 0, y: 0 } },
          ],
        }),
      ),
    ).toThrow(/exit "e" at must be on a floor tile/);

    expect(() =>
      parseTileRoom(
        roomWith({
          exits: [
            { id: 'e', at: { x: 9, y: 9 }, room: 'x', spawn: { x: 0, y: 0 } },
          ],
        }),
      ),
    ).toThrow(/outside the room/);
  });

  it('rejects two exits sharing a trigger cell', () => {
    expect(() =>
      parseTileRoom(
        roomWith({
          exits: [
            {
              id: 'e1',
              at: { x: 3, y: 0 },
              room: 'a',
              spawn: { x: 0, y: 0 },
            },
            {
              id: 'e2',
              at: { x: 3, y: 0 },
              room: 'b',
              spawn: { x: 0, y: 0 },
            },
          ],
        }),
      ),
    ).toThrow(/trigger .* is already used by/);
  });

  it('rejects a spawn directly on an exit trigger cell', () => {
    expect(() =>
      parseTileRoom(
        roomWith({
          spawn: { x: 1, y: 0 },
          exits: [
            { id: 'e', at: { x: 1, y: 0 }, room: 'x', spawn: { x: 0, y: 0 } },
          ],
        }),
      ),
    ).toThrow(/spawn is on exit/);
  });
});

describe('isWallAt', () => {
  const room = parseTileRoom(room01Json);

  it('treats out-of-bounds cells as walls', () => {
    expect(isWallAt(room, -1, 4)).toBe(true);
    expect(isWallAt(room, 13, 4)).toBe(true);
    expect(isWallAt(room, 1, -1)).toBe(true);
    expect(isWallAt(room, 1, 9)).toBe(true);
  });

  it('reports border tiles as walls', () => {
    expect(isWallAt(room, 0, 4)).toBe(true);
    expect(isWallAt(room, 6, 0)).toBe(true);
    expect(isWallAt(room, 6, 8)).toBe(true);
  });

  it('reports interior floor tiles as walkable', () => {
    expect(isWallAt(room, 1, 4)).toBe(false);
    expect(isWallAt(room, 6, 4)).toBe(false);
  });
});

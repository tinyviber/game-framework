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
    expect(room.exits.right).toEqual({
      room: 'room_02',
      spawn: { x: 1, y: 4 },
    });
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

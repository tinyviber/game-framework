import { describe, expect, it } from 'vitest';
import { positionKey } from './grid';
import { reachablePositions, shortestPath, validateRoom } from './analyze';
import { genRoom } from './gen-room';

describe('genRoom', () => {
  for (const seed of [0, 1, 42, 2026]) {
    it(`generates a valid connected room for seed ${seed}`, () => {
      const room = genRoom(seed);

      expect(room.width).toBe(40);
      expect(room.height).toBe(40);
      expect(validateRoom(room)).toEqual([]);
      expect(shortestPath(room, room.spawn, room.goal)).not.toBeNull();

      const reachable = new Set(
        reachablePositions(room).map(positionKey),
      );
      expect(reachable.has(positionKey(room.goal))).toBe(true);
    });
  }

  it('is deterministic for the same seed', () => {
    expect(genRoom(2026)).toEqual(genRoom(2026));
  });

  it('does not store derived walkability on cells', () => {
    const room = genRoom(42);

    expect(
      Object.prototype.hasOwnProperty.call(room.cells[1]?.[1], 'walkable'),
    ).toBe(false);
  });
});

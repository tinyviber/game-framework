import { describe, expect, it } from 'vitest';
import {
  projectGeneratedMinimap,
  projectGridCell,
} from './generated-minimap';

function cells(width: number, height: number): Array<Array<{ elevation: number; walkable: boolean }>> {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ elevation: 0, walkable: false })),
  );
}

describe('generated minimap projection', () => {
  it('projects odd world coordinates with floor and clamp', () => {
    expect(projectGridCell({ x: 1, y: 1 }, 40, 40, 20, 20)).toEqual({ x: 0, y: 0 });
    expect(projectGridCell({ x: 39, y: 39 }, 40, 40, 20, 20)).toEqual({ x: 19, y: 19 });
    expect(projectGridCell({ x: -4, y: 99 }, 40, 40, 20, 20)).toEqual({ x: 0, y: 19 });
  });

  it('aggregates every source cell in a non-divisible tile range', () => {
    const source = cells(5, 4);
    source[1]![0] = { elevation: 1, walkable: true };
    source[2]![4] = { elevation: 0, walkable: true };
    const map = projectGeneratedMinimap({
      cells: source,
      sourceWidth: 5,
      sourceHeight: 4,
      start: { x: 1, y: 1 },
      goal: { x: 4, y: 2 },
      disruption: [{ x: 1, y: 1 }],
      columns: 3,
      rows: 2,
    });

    expect(map.tiles).toHaveLength(6);
    expect(map.tiles[0]).toMatchObject({ x: 0, y: 0, walkable: true, elevated: true, start: true, disrupted: true });
    expect(map.tiles[5]).toMatchObject({ x: 2, y: 1, walkable: true, goal: true });
    expect(map.tiles.map((tile) => `${tile.x},${tile.y}`)).toEqual([
      '0,0', '1,0', '2,0',
      '0,1', '1,1', '2,1',
    ]);
  });

  it('leaves empty target tiles empty when the target is larger than the source', () => {
    const source = cells(1, 1);
    source[0]![0] = { elevation: 1, walkable: true };
    const map = projectGeneratedMinimap({
      cells: source,
      sourceWidth: 1,
      sourceHeight: 1,
      start: { x: 0, y: 0 },
      goal: { x: 0, y: 0 },
      disruption: [],
      columns: 2,
      rows: 2,
    });

    expect(map.tiles).toEqual([
      { x: 0, y: 0, walkable: false, elevated: false, start: true, goal: true, disrupted: false },
      { x: 1, y: 0, walkable: false, elevated: false, start: false, goal: false, disrupted: false },
      { x: 0, y: 1, walkable: false, elevated: false, start: false, goal: false, disrupted: false },
      { x: 1, y: 1, walkable: true, elevated: true, start: false, goal: false, disrupted: false },
    ]);
  });

  it('validates positive dimensions and source shape', () => {
    const source = cells(2, 2);
    expect(() => projectGeneratedMinimap({
      cells: source,
      sourceWidth: 0,
      sourceHeight: 2,
      start: { x: 0, y: 0 },
      goal: { x: 1, y: 1 },
      disruption: [],
      columns: 2,
      rows: 2,
    })).toThrow(/sourceWidth/);
    expect(() => projectGeneratedMinimap({
      cells: source.slice(0, 1),
      sourceWidth: 2,
      sourceHeight: 2,
      start: { x: 0, y: 0 },
      goal: { x: 1, y: 1 },
      disruption: [],
      columns: 2,
      rows: 2,
    })).toThrow(/dimensions/);
  });
});

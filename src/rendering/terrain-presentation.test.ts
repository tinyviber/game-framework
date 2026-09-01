import { describe, expect, it } from 'vitest';
import { terrainTileIdForCell } from './terrain-presentation';

describe('terrain presentation mapping', () => {
  it('changes only the visual selection, never semantic cell data', () => {
    const cells = [[
      { x: 0, y: 0, elevation: 0, surface: 'grass', walkable: true },
      { x: 1, y: 0, elevation: 0, surface: 'dirt', walkable: false },
    ]];
    const before = structuredClone(cells);

    expect(terrainTileIdForCell(cells, cells[0]![0]!)).toBeDefined();
    expect(cells).toEqual(before);
    expect(cells[0]![1]!.walkable).toBe(false);
  });
});

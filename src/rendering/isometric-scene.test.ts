import { describe, expect, it } from 'vitest';
import {
  ISO_HEIGHT_STEP,
  ISO_TILE_HEIGHT,
  ISO_TILE_WIDTH,
  isoSortKey,
  projectIsoCell,
} from './isometric-scene';

describe('isometric projection', () => {
  it('maps grid axes onto diagonals and raises elevated terrain', () => {
    const origin = projectIsoCell(0, 0);
    const east = projectIsoCell(1, 0);
    const south = projectIsoCell(0, 1);
    const high = projectIsoCell(0, 0, 2);

    expect(east.x - origin.x).toBe(ISO_TILE_WIDTH / 2);
    expect(east.y - origin.y).toBe(ISO_TILE_HEIGHT / 2);
    expect(south.x - origin.x).toBe(-ISO_TILE_WIDTH / 2);
    expect(south.y - origin.y).toBe(ISO_TILE_HEIGHT / 2);
    expect(origin.y - high.y).toBe(ISO_HEIGHT_STEP * 2);
  });

  it('sorts objects by their foot position, independent of height', () => {
    expect(isoSortKey(3, 2)).toBeGreaterThan(isoSortKey(2, 2));
    expect(isoSortKey(3, 2)).toBeGreaterThan(isoSortKey(3, 1));
    expect(isoSortKey(3, 2)).toBe(5003);
  });
});

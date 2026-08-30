import { describe, expect, it } from 'vitest';
import { generateGeneratedWorld } from '@/world/generated-world';
import {
  ORTHO_ELEVATION_STEP,
  ORTHO_TILE_SIZE,
  orthogonalSortKey,
  projectOrthogonalCell,
} from './orthogonal-scene';

describe('orthogonal projection', () => {
  it('keeps world axes aligned with screen axes', () => {
    const origin = projectOrthogonalCell(3, 4);
    const right = projectOrthogonalCell(4, 4);
    const down = projectOrthogonalCell(3, 5);
    const high = projectOrthogonalCell(3, 4, 2);

    expect(right.x - origin.x).toBe(ORTHO_TILE_SIZE);
    expect(right.y - origin.y).toBe(0);
    expect(down.x - origin.x).toBe(0);
    expect(down.y - origin.y).toBe(ORTHO_TILE_SIZE);
    expect(origin.y - high.y).toBe(ORTHO_ELEVATION_STEP * 2);
  });

  it('sorts by logical foot row while keeping the projection orthogonal', () => {
    expect(orthogonalSortKey(3, 2)).toBeGreaterThan(orthogonalSortKey(2, 2));
    expect(orthogonalSortKey(3, 2)).toBeGreaterThan(orthogonalSortKey(3, 1));
  });

  it('does not make view selection part of world generation', () => {
    const isoWorld = generateGeneratedWorld(123);
    const orthoWorld = generateGeneratedWorld(123);

    expect(orthoWorld).toEqual(isoWorld);
    expect(orthoWorld.start).toEqual(isoWorld.start);
    expect(orthoWorld.goal).toEqual(isoWorld.goal);
    expect(orthoWorld.cells).toEqual(isoWorld.cells);
    expect(orthoWorld.edges).toEqual(isoWorld.edges);
    expect(orthoWorld.perturbation).toEqual(isoWorld.perturbation);
  });
});

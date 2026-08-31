import { describe, expect, it } from 'vitest';
import { generateGeneratedWorld } from '@/world/generated-world';
import { KENNEY_MAP_PACK_METADATA } from '@/assets/kenney-map-pack/metadata';
import { ORTHO_DECORATION_TILE_IDS } from './orthogonal-textures';
import {
  ORTHO_ELEVATION_STEP,
  ORTHO_TILE_SIZE,
  barrierSideEdgeTileId,
  orthogonalSortKey,
  projectOrthogonalCell,
  sideEdgeTileId,
  stoneSouthEdgeTileId,
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

describe('orthogonal edge tile selection', () => {
  it('keeps a blocked stone south row straight and caps only its ends', () => {
    expect(stoneSouthEdgeTileId(true, true)).toBe('kenney.mapTile.042');
    expect(stoneSouthEdgeTileId(false, true)).toBe('kenney.mapTile.041');
    expect(stoneSouthEdgeTileId(true, false)).toBe('kenney.mapTile.043');
    expect(stoneSouthEdgeTileId(false, false)).toBe('kenney.mapTile.041');
  });

  it('maps per-surface side edge tiles', () => {
    expect(sideEdgeTileId('stone', 'west')).toBe('kenney.mapTile.026');
    expect(sideEdgeTileId('stone', 'east')).toBe('kenney.mapTile.028');
    expect(sideEdgeTileId('dirt', 'west')).toBe('kenney.mapTile.081');
    expect(sideEdgeTileId('dirt', 'east')).toBe('kenney.mapTile.083');
    expect(sideEdgeTileId('grass', 'west')).toBe('kenney.mapTile.021');
    expect(sideEdgeTileId('grass', 'east')).toBe('kenney.mapTile.023');
    expect(sideEdgeTileId('water', 'west')).toBeUndefined();
  });

  it('splits a barrier cell only from different-surface walkable ground', () => {
    expect(barrierSideEdgeTileId('stone', true, true)).toBe('kenney.mapTile.026');
    expect(barrierSideEdgeTileId('stone', false, true)).toBe('kenney.mapTile.028');
    expect(barrierSideEdgeTileId('dirt', true, false)).toBe('kenney.mapTile.081');
    expect(barrierSideEdgeTileId('stone', false, false)).toBeUndefined();
    expect(barrierSideEdgeTileId('water', true, true)).toBeUndefined();
  });

  it('references only decoration tiles that exist in the Kenney pack', () => {
    for (const id of ORTHO_DECORATION_TILE_IDS) {
      expect(KENNEY_MAP_PACK_METADATA.tiles.some((tile) => tile.id === id)).toBe(true);
    }
  });
});

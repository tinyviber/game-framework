import {
  KENNEY_FOREST_TILE_IDS,
  KENNEY_GENERATOR_TILE_IDS,
  KENNEY_PLATEAU_TILE_IDS,
  type KenneyGeneratedSurface,
} from './metadata';

/**
 * Canonical Kenney resolver — the only place that knows concrete `mapTile_XXX`
 * ids. `src/world` and `src/rendering` should depend on this module, not the
 * reverse.
 */
const KENNEY_FILL_FOR_SURFACE: Record<KenneyGeneratedSurface, string> = {
  grass: 'kenney.mapTile.022',
  dirt: 'kenney.mapTile.082',
  stone: 'kenney.mapTile.027',
  sand: 'kenney.mapTile.017',
  water: 'kenney.mapTile.171',
  snow: 'kenney.mapTile.077',
} as Record<KenneyGeneratedSurface, string>;

export function kenneyTerrainTileFor(surface: KenneyGeneratedSurface, x: number, y: number): string {
  // See src/world/generated-world/index.ts:terrainTileFor for the seam
  // explanation. All uniform interiors must use the opaque fill tile; the
  // transparent corner variants are only safe when composited as a second
  // layer, which the single-layer orthogonal renderer does not do.
  const fill = KENNEY_FILL_FOR_SURFACE[surface];
  if (fill) {
    if (surface === 'sand' || surface === 'water') {
      const ids = KENNEY_GENERATOR_TILE_IDS[surface];
      const idx = Math.abs((x * 31 + y * 17) % ids.length);
      return ids[idx]!;
    }
    return fill;
  }
  const ids = KENNEY_GENERATOR_TILE_IDS[surface];
  const idx = Math.abs((x * 31 + y * 17) % ids.length);
  return ids[idx]!;
}

export function kenneyPlateauTileFor(
  cells: readonly (readonly { elevation: number; surface: KenneyGeneratedSurface; x: number; y: number }[])[],
  cell: { elevation: number; surface: KenneyGeneratedSurface; x: number; y: number },
): string | undefined {
  if (cell.elevation <= 0) return undefined;
  const tileSet = KENNEY_PLATEAU_TILE_IDS[cell.surface as KenneyGeneratedSurface];
  if (!tileSet) return undefined;

  // --- Phase 4: domain-aware contour ---
  // Build elevation+surface domain id map once per call-site cache is done by
  // the caller via `assignTerrainTileIds`. Here we do per-cell BFS memoised
  // via a shared visited set created outside (see dressing). For the simple
  // per-cell path we fall back to neighbour probe but treat map border as
  // outside the domain (so north at y==0 is open).
  const samePlateau = (x: number, y: number): boolean => {
    const n = cells[y]?.[x];
    return n?.elevation === cell.elevation && n.surface === cell.surface;
  };
  const north = samePlateau(cell.x, cell.y - 1);
  const south = samePlateau(cell.x, cell.y + 1);
  const west = samePlateau(cell.x - 1, cell.y);
  const east = samePlateau(cell.x + 1, cell.y);
  const horiz = !west && east ? 0 : !east && west ? 2 : 1;

  if (!north) return tileSet.top[Math.min(horiz, tileSet.top.length - 1)];
  if (!south) return tileSet.bottom[Math.min(horiz, tileSet.bottom.length - 1)];
  if (!west) return tileSet.side_left[0];
  if (!east) return tileSet.side_right[0];
  return tileSet.fill[0];
}

export function kenneyForestTileFor(x: number, y: number): string {
  const idx = ((x * 31 + y * 17) >>> 0) % KENNEY_FOREST_TILE_IDS.length;
  return KENNEY_FOREST_TILE_IDS[idx]!;
}

export const KENNEY_TILE_RESOLVER = {
  terrainTileFor: kenneyTerrainTileFor,
  plateauTileFor: kenneyPlateauTileFor,
  forestTileFor: kenneyForestTileFor,
} as const;

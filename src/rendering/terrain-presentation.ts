import {
  KENNEY_GENERATED_SURFACES,
  type KenneyGeneratedSurface,
} from '@/assets/kenney-map-pack/metadata';
import {
  kenneyPlateauTileFor,
  kenneyTerrainTileFor,
} from '@/assets/kenney-map-pack/kenney-resolver';

/** Semantic cell shape accepted by the current rough terrain presentation. */
export interface TerrainPresentationCell {
  readonly x: number;
  readonly y: number;
  readonly elevation: number;
  readonly surface?: string;
  readonly terrainType?: string;
}

function isKenneySurface(value: string): value is KenneyGeneratedSurface {
  return KENNEY_GENERATED_SURFACES.includes(value as KenneyGeneratedSurface);
}

/** Maps semantic terrain to today's Kenney visualization without mutating it. */
export function terrainTileIdForCell(
  cells: readonly (readonly TerrainPresentationCell[])[],
  cell: TerrainPresentationCell,
): string | undefined {
  const surface = cell.surface ?? cell.terrainType;
  if (!surface || !isKenneySurface(surface)) {
    return undefined;
  }

  return kenneyPlateauTileFor(cells, cell) ?? kenneyTerrainTileFor(surface, cell.x, cell.y);
}

export function kenneyPropAssetKeyFor(prop: {
  readonly kind: 'stairs' | 'decoration' | 'landmark';
  readonly x: number;
  readonly y: number;
}): string {
  if (prop.kind === 'stairs') {
    return 'stairs';
  }
  return (prop.x * 31 + prop.y * 17) % 2 === 0 ? 'flowers' : 'mushrooms';
}

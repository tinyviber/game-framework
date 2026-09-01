import { describe, expect, it } from 'vitest';
import { KENNEY_MAP_PACK_METADATA } from './metadata';
import {
  kenneyPlateauTileFor,
  kenneyTerrainTileFor,
} from './kenney-resolver';
import type { KenneyGeneratedSurface } from './metadata';

const grass = (x: number, y: number) => ({ x, y, elevation: 0, surface: 'grass' });

describe('Kenney presentation mapping', () => {
  it('maps semantic surfaces to existing terrain assets', () => {
    const ids = new Set(KENNEY_MAP_PACK_METADATA.tiles.map((tile) => tile.id));
    for (const surface of ['grass', 'dirt', 'stone', 'sand', 'snow', 'water']) {
      expect(ids.has(kenneyTerrainTileFor(surface as KenneyGeneratedSurface, 2, 3))).toBe(true);
    }
  });

  it('selects plateau contours from semantic neighbours', () => {
    const cells = [
      [grass(0, 0), grass(1, 0), grass(2, 0)],
      [grass(0, 1), { x: 1, y: 1, elevation: 1, surface: 'stone' }, grass(2, 1)],
      [grass(0, 2), grass(1, 2), grass(2, 2)],
    ];
    const tileId = kenneyPlateauTileFor(cells, cells[1]![1]!);
    const tile = KENNEY_MAP_PACK_METADATA.tiles.find((candidate) => candidate.id === tileId);
    expect(tile?.tags).toContain('top');
  });
});

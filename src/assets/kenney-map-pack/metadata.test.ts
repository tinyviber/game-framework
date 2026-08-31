import { describe, expect, it } from 'vitest';
import {
  KENNEY_GENERATED_SURFACES,
  KENNEY_MAP_PACK_METADATA,
  KENNEY_ROAD_TILE_IDS,
  validateKenneyMapPackMetadata,
} from './metadata';

describe('Kenney Map Pack tile metadata', () => {
  it('catalogues every extracted map tile', () => {
    expect(KENNEY_MAP_PACK_METADATA.tiles).toHaveLength(188);
    expect(new Set(KENNEY_MAP_PACK_METADATA.tiles.map((tile) => tile.id)).size).toBe(188);
    expect(KENNEY_MAP_PACK_METADATA.tiles.every((tile) => tile.file.startsWith('PNG/mapTile_'))).toBe(true);
  });

  it('exposes only map-pack surfaces to the generated terrain pool', () => {
    expect(KENNEY_GENERATED_SURFACES).toEqual(['sand', 'grass', 'stone', 'snow', 'dirt', 'water']);
    expect(KENNEY_MAP_PACK_METADATA.generator_tiles.water).toEqual([
      'kenney.mapTile.171',
      'kenney.mapTile.187',
      'kenney.mapTile.188',
    ]);
    expect(KENNEY_MAP_PACK_METADATA.generator_tiles.sand).toContain('kenney.mapTile.087');
  });

  it('labels plateau fill, rounded edges, tops, and forest decorations', () => {
    expect(KENNEY_MAP_PACK_METADATA.plateau_tiles.stone).toEqual({
      fill: ['kenney.mapTile.027'],
      top: ['kenney.mapTile.011', 'kenney.mapTile.012', 'kenney.mapTile.013'],
      side_left: ['kenney.mapTile.026'],
      side_right: ['kenney.mapTile.028'],
      bottom: ['kenney.mapTile.041', 'kenney.mapTile.042', 'kenney.mapTile.043'],
    });
    expect(KENNEY_MAP_PACK_METADATA.forest_tiles).toEqual([
      'kenney.mapTile.055',
      'kenney.mapTile.115',
    ]);
  });

  it('labels the Kenney route pieces used to compose generated paths', () => {
    expect(KENNEY_ROAD_TILE_IDS).toEqual({
      corner_rounded: [
        'kenney.mapTile.121',
        'kenney.mapTile.122',
      ],
      corner_square: [
        'kenney.mapTile.123',
        'kenney.mapTile.124',
      ],
      tee: ['kenney.mapTile.125'],
      cross: ['kenney.mapTile.128'],
      vertical: ['kenney.mapTile.126'],
      horizontal: ['kenney.mapTile.127'],
      end_vertical: ['kenney.mapTile.129'],
      end_horizontal: ['kenney.mapTile.130'],
    });
  });

  it('rejects a generator pool that is not backed by tagged terrain', () => {
    expect(() => validateKenneyMapPackMetadata({
      ...KENNEY_MAP_PACK_METADATA,
      generator_tiles: {
        ...KENNEY_MAP_PACK_METADATA.generator_tiles,
        grass: ['kenney.mapTile.034'],
      },
    })).toThrow(/not a grass terrain tile/);
  });
});

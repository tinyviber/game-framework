import rawMetadata from './tiles-metadata.json';

export const KENNEY_MAP_TILE_CATEGORIES = [
  'terrain',
  'decoration',
  'connector',
  'marker',
  'character',
  'structure',
  'unknown',
] as const;

export const KENNEY_MAP_TILE_SURFACES = [
  'sand',
  'grass',
  'stone',
  'snow',
  'dirt',
  'water',
  'unknown',
] as const;

export type KenneyMapTileCategory = (typeof KENNEY_MAP_TILE_CATEGORIES)[number];
export type KenneyMapTileSurface = (typeof KENNEY_MAP_TILE_SURFACES)[number];
export type KenneyGeneratedSurface = Exclude<KenneyMapTileSurface, 'unknown'>;

export interface KenneyMapTileMetadata {
  readonly id: string;
  readonly file: string;
  readonly category: KenneyMapTileCategory;
  readonly surface: KenneyMapTileSurface;
  readonly walkable: boolean;
  readonly blocks_movement: boolean;
  readonly height_class: number;
  readonly tags: readonly string[];
  readonly confidence: number;
  readonly source_rect: readonly [number, number, number, number];
  readonly logical_footprint: Readonly<{ width: number; height: number }>;
  readonly visual_bounds: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly anchor: Readonly<{ x: number; y: number }>;
}

export interface KenneyPlateauTileSet {
  readonly fill: readonly string[];
  readonly top: readonly string[];
  readonly side_left: readonly string[];
  readonly side_right: readonly string[];
  readonly bottom: readonly string[];
}

export interface KenneyRoadTileSet {
  readonly corner_rounded: readonly string[];
  readonly corner_square: readonly string[];
  readonly tee: readonly string[];
  readonly cross: readonly string[];
  readonly vertical: readonly string[];
  readonly horizontal: readonly string[];
  readonly end_vertical: readonly string[];
  readonly end_horizontal: readonly string[];
}

export interface KenneyMapPackMetadata {
  readonly schema: number;
  readonly pack: {
    readonly id: string;
    readonly title: string;
    readonly source: string;
    readonly license: string;
    readonly tile_size: number;
    readonly native: Readonly<{ width: number; height: number; columns: number; rows: number }>;
  };
  readonly generator_tiles: Readonly<Record<KenneyGeneratedSurface, readonly string[]>>;
  readonly forest_tiles: readonly string[];
  readonly plateau_tiles: Readonly<Partial<Record<KenneyGeneratedSurface, KenneyPlateauTileSet>>>;
  readonly road_tiles: KenneyRoadTileSet;
  readonly tiles: readonly KenneyMapTileMetadata[];
}

const categories = new Set<string>(KENNEY_MAP_TILE_CATEGORIES);
const surfaces = new Set<string>(KENNEY_MAP_TILE_SURFACES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invalid Kenney Map Pack metadata: ${message}`);
  }
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function readRect(value: unknown, label: string): readonly [number, number, number, number] {
  assert(Array.isArray(value) && value.length === 4, `${label} must be a four-number array`);
  assert(value.every(isInteger), `${label} must contain integers`);
  const rect = value as number[];
  assert(rect[0]! >= 0 && rect[1]! >= 0 && rect[2]! > 0 && rect[3]! > 0, `${label} must be positive and in bounds`);
  return [rect[0]!, rect[1]!, rect[2]!, rect[3]!];
}

function readSize(value: unknown, label: string): { readonly width: number; readonly height: number } {
  assert(isRecord(value), `${label} must be an object`);
  assert(isInteger(value.width) && value.width > 0, `${label}.width must be positive`);
  assert(isInteger(value.height) && value.height > 0, `${label}.height must be positive`);
  return { width: value.width, height: value.height };
}

function readBounds(value: unknown, label: string): KenneyMapTileMetadata['visual_bounds'] {
  assert(isRecord(value), `${label} must be an object`);
  assert(isInteger(value.x) && value.x >= 0, `${label}.x must be non-negative`);
  assert(isInteger(value.y) && value.y >= 0, `${label}.y must be non-negative`);
  assert(isInteger(value.width) && value.width > 0, `${label}.width must be positive`);
  assert(isInteger(value.height) && value.height > 0, `${label}.height must be positive`);
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}

function readAnchor(value: unknown, label: string): KenneyMapTileMetadata['anchor'] {
  assert(isRecord(value), `${label} must be an object`);
  assert(isInteger(value.x) && value.x >= 0, `${label}.x must be non-negative`);
  assert(isInteger(value.y) && value.y >= 0, `${label}.y must be non-negative`);
  return { x: value.x, y: value.y };
}

function readTile(value: unknown, index: number): KenneyMapTileMetadata {
  assert(isRecord(value), `tiles[${index}] must be an object`);
  const id = value.id;
  const file = value.file;
  const category = value.category;
  const surface = value.surface;
  assert(typeof id === 'string' && id.length > 0, `tiles[${index}].id is required`);
  assert(typeof file === 'string' && file.startsWith('PNG/'), `${id}.file must point into PNG/`);
  assert(typeof category === 'string' && categories.has(category), `${id}.category is invalid`);
  assert(typeof surface === 'string' && surfaces.has(surface), `${id}.surface is invalid`);
  assert(typeof value.walkable === 'boolean', `${id}.walkable must be boolean`);
  assert(typeof value.blocks_movement === 'boolean', `${id}.blocks_movement must be boolean`);
  assert(isInteger(value.height_class) && value.height_class >= 0, `${id}.height_class must be non-negative`);
  assert(Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === 'string'), `${id}.tags must be strings`);
  assert(typeof value.confidence === 'number' && value.confidence >= 0 && value.confidence <= 1, `${id}.confidence must be between 0 and 1`);
  const sourceRect = readRect(value.source_rect, `${id}.source_rect`);
  const footprint = readSize(value.logical_footprint, `${id}.logical_footprint`);
  const visualBounds = readBounds(value.visual_bounds, `${id}.visual_bounds`);
  const anchor = readAnchor(value.anchor, `${id}.anchor`);
  assert(visualBounds.x + visualBounds.width <= sourceRect[2]!, `${id}.visual_bounds exceeds source width`);
  assert(visualBounds.y + visualBounds.height <= sourceRect[3]!, `${id}.visual_bounds exceeds source height`);
  assert(anchor.x <= sourceRect[2]! && anchor.y <= sourceRect[3]!, `${id}.anchor exceeds source rect`);
  if (category === 'unknown') {
    assert(value.confidence <= 0.5, `${id} unknown semantics must use confidence <= 0.5`);
  }
  return {
    id,
    file,
    category: category as KenneyMapTileCategory,
    surface: surface as KenneyMapTileSurface,
    walkable: value.walkable,
    blocks_movement: value.blocks_movement,
    height_class: value.height_class,
    tags: [...value.tags] as string[],
    confidence: value.confidence,
    source_rect: sourceRect,
    logical_footprint: footprint,
    visual_bounds: visualBounds,
    anchor,
  };
}

function readReferencedTileIds(value: unknown, label: string): readonly string[] {
  assert(Array.isArray(value) && value.length > 0 && value.every((id) => typeof id === 'string'), `${label} must be non-empty`);
  return [...value] as string[];
}

export function validateKenneyMapPackMetadata(value: unknown): KenneyMapPackMetadata {
  assert(isRecord(value), 'root must be an object');
  assert(value.schema === 1, 'schema must be 1');
  const pack = value.pack;
  assert(isRecord(pack), 'pack must be an object');
  assert(typeof pack.id === 'string' && pack.id.length > 0, 'pack.id is required');
  assert(typeof pack.title === 'string' && pack.title.length > 0, 'pack.title is required');
  assert(typeof pack.source === 'string' && pack.source.length > 0, 'pack.source is required');
  assert(typeof pack.license === 'string' && pack.license.length > 0, 'pack.license is required');
  assert(isInteger(pack.tile_size) && pack.tile_size > 0, 'pack.tile_size must be positive');
  const native = pack.native;
  assert(isRecord(native), 'pack.native must be an object');
  const nativeWidth = native.width;
  const nativeHeight = native.height;
  const nativeColumns = native.columns;
  const nativeRows = native.rows;
  assert(isInteger(nativeWidth) && nativeWidth > 0, 'pack.native.width must be positive');
  assert(isInteger(nativeHeight) && nativeHeight > 0, 'pack.native.height must be positive');
  assert(isInteger(nativeColumns) && nativeColumns > 0, 'pack.native.columns must be positive');
  assert(isInteger(nativeRows) && nativeRows > 0, 'pack.native.rows must be positive');
  assert(Array.isArray(value.tiles) && value.tiles.length === 188, 'tiles must contain all 188 map tiles');

  const ids = new Set<string>();
  const tiles = value.tiles.map((tile, index) => {
    const parsed = readTile(tile, index);
    assert(!ids.has(parsed.id), `duplicate tile id ${parsed.id}`);
    ids.add(parsed.id);
    assert(parsed.source_rect[0]! + parsed.source_rect[2]! <= nativeWidth, `${parsed.id}.source_rect exceeds pack width`);
    assert(parsed.source_rect[1]! + parsed.source_rect[3]! <= nativeHeight, `${parsed.id}.source_rect exceeds pack height`);
    return parsed;
  });

  assert(isRecord(value.generator_tiles), 'generator_tiles must be an object');
  const generatorTiles = {} as Record<KenneyGeneratedSurface, readonly string[]>;
  for (const surface of KENNEY_MAP_TILE_SURFACES) {
    if (surface === 'unknown') {
      continue;
    }
    const tileIds = value.generator_tiles[surface];
    assert(Array.isArray(tileIds) && tileIds.length > 0 && tileIds.every((id) => typeof id === 'string'), `generator_tiles.${surface} must be non-empty`);
    for (const id of tileIds) {
      const tile = tiles.find((candidate) => candidate.id === id);
      assert(tile !== undefined, `generator_tiles.${surface} references missing ${id}`);
      assert(tile.category === 'terrain' && tile.surface === surface, `${id} is not a ${surface} terrain tile`);
    }
    generatorTiles[surface] = [...tileIds];
  }

  const forestTiles = readReferencedTileIds(value.forest_tiles, 'forest_tiles');
  for (const id of forestTiles) {
    const tile = tiles.find((candidate) => candidate.id === id);
    assert(tile !== undefined, `forest_tiles references missing ${id}`);
    assert(tile.category === 'decoration' && tile.tags.includes('forest') && tile.tags.includes('tree'), `${id} is not a tagged forest tree`);
  }

  const plateauTiles = {} as Partial<Record<KenneyGeneratedSurface, KenneyPlateauTileSet>>;
  assert(isRecord(value.plateau_tiles), 'plateau_tiles must be an object');
  for (const surface of KENNEY_MAP_TILE_SURFACES) {
    if (surface === 'unknown') {
      continue;
    }
    const configured = value.plateau_tiles[surface];
    if (configured === undefined) {
      continue;
    }
    assert(isRecord(configured), `plateau_tiles.${surface} must be an object`);
    const roles = {} as Record<'fill' | 'top' | 'side_left' | 'side_right' | 'bottom', readonly string[]>;
    for (const role of ['fill', 'top', 'side_left', 'side_right', 'bottom'] as const) {
      const tileIds = readReferencedTileIds(configured[role], `plateau_tiles.${surface}.${role}`);
      for (const id of tileIds) {
        const tile = tiles.find((candidate) => candidate.id === id);
        assert(tile !== undefined, `plateau_tiles.${surface}.${role} references missing ${id}`);
        assert(tile.category === 'terrain' && tile.surface === surface, `${id} is not a plateau ${surface} terrain tile`);
        assert(tile.tags.includes('plateau') && tile.tags.includes(role), `${id} must be tagged plateau and ${role}`);
      }
      roles[role] = tileIds;
    }
    plateauTiles[surface] = roles;
  }

  assert(isRecord(value.road_tiles), 'road_tiles must be an object');
  const roadTiles = {} as { -readonly [Key in keyof KenneyRoadTileSet]: readonly string[] };
  for (const role of ['corner_rounded', 'corner_square', 'tee', 'cross', 'vertical', 'horizontal', 'end_vertical', 'end_horizontal'] as const) {
    const tileIds = readReferencedTileIds(value.road_tiles[role], `road_tiles.${role}`);
    for (const id of tileIds) {
      const tile = tiles.find((candidate) => candidate.id === id);
      assert(tile !== undefined, `road_tiles.${role} references missing ${id}`);
      assert(tile.category === 'connector' && tile.tags.includes('route'), `${id} is not a tagged route tile`);
    }
    roadTiles[role] = tileIds;
  }

  return {
    schema: 1,
    pack: pack as KenneyMapPackMetadata['pack'],
    generator_tiles: generatorTiles,
    forest_tiles: forestTiles,
    plateau_tiles: plateauTiles,
    road_tiles: roadTiles,
    tiles,
  };
}

export const KENNEY_MAP_PACK_METADATA = validateKenneyMapPackMetadata(rawMetadata);
export const KENNEY_GENERATOR_TILE_IDS = KENNEY_MAP_PACK_METADATA.generator_tiles;
export const KENNEY_GENERATED_SURFACES = Object.keys(KENNEY_GENERATOR_TILE_IDS) as KenneyGeneratedSurface[];
export const KENNEY_FOREST_TILE_IDS = KENNEY_MAP_PACK_METADATA.forest_tiles;
export const KENNEY_PLATEAU_TILE_IDS = KENNEY_MAP_PACK_METADATA.plateau_tiles;
export const KENNEY_ROAD_TILE_IDS = KENNEY_MAP_PACK_METADATA.road_tiles;

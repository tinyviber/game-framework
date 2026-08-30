import rawMetadata from './atlas-metadata.json';

export const ORTHOGONAL_CATEGORIES = [
  'terrain',
  'obstacle',
  'edge',
  'corner',
  'decoration',
  'water',
  'connector',
  'structure',
  'unknown',
] as const;

export const ORTHOGONAL_SURFACES = [
  'grass',
  'dirt',
  'stone',
  'water',
  'sand',
  'snow',
  'unknown',
] as const;

export const ORTHOGONAL_EDGE_SURFACES = [
  ...ORTHOGONAL_SURFACES,
  'cliff',
] as const;

export type OrthogonalAssetCategory = (typeof ORTHOGONAL_CATEGORIES)[number];
export type OrthogonalAssetSurface = (typeof ORTHOGONAL_SURFACES)[number];
export type OrthogonalAssetEdgeSurface = (typeof ORTHOGONAL_EDGE_SURFACES)[number];

export interface OrthogonalAssetRegion {
  readonly id: string;
  readonly category: OrthogonalAssetCategory;
  readonly surface: OrthogonalAssetSurface;
  readonly walkable: boolean;
  readonly blocks_movement: boolean;
  readonly height_class: number;
  readonly edge: Readonly<Record<'north' | 'south' | 'east' | 'west', OrthogonalAssetEdgeSurface>>;
  readonly tags: readonly string[];
  readonly confidence: number;
  readonly source_rect: readonly [number, number, number, number];
  readonly logical_footprint: Readonly<{ width: number; height: number }>;
  readonly visual_bounds: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly anchor: Readonly<{ x: number; y: number }>;
  readonly notes?: string;
}

export interface OrthogonalAtlasMetadata {
  readonly schema: number;
  readonly atlas: {
    readonly id: string;
    readonly title: string;
    readonly source: string;
    readonly license: string;
    readonly tile_size: number;
    readonly native: Readonly<{ width: number; height: number; columns: number; rows: number }>;
  };
  readonly regions: readonly OrthogonalAssetRegion[];
}

const categorySet = new Set<string>(ORTHOGONAL_CATEGORIES);
const surfaceSet = new Set<string>(ORTHOGONAL_SURFACES);
const edgeSurfaceSet = new Set<string>(ORTHOGONAL_EDGE_SURFACES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invalid orthogonal atlas metadata: ${message}`);
  }
}

function readRect(
  value: unknown,
  label: string,
): readonly [number, number, number, number] {
  assert(Array.isArray(value) && value.length === 4, `${label} must be a four-number array`);
  assert(value.every(isInteger), `${label} must contain integers`);
  const rect = value as number[];
  assert(rect[0]! >= 0 && rect[1]! >= 0, `${label} origin must be non-negative`);
  assert(rect[2]! > 0 && rect[3]! > 0, `${label} size must be positive`);
  return [rect[0]!, rect[1]!, rect[2]!, rect[3]!];
}

function readSize(
  value: unknown,
  label: string,
): { readonly width: number; readonly height: number } {
  assert(isRecord(value), `${label} must be an object`);
  const width = value.width;
  const height = value.height;
  assert(isInteger(width) && width > 0, `${label}.width must be positive`);
  assert(isInteger(height) && height > 0, `${label}.height must be positive`);
  return { width, height };
}

function readBounds(value: unknown): OrthogonalAssetRegion['visual_bounds'] {
  assert(isRecord(value), 'visual_bounds must be an object');
  const x = value.x;
  const y = value.y;
  const width = value.width;
  const height = value.height;
  assert(isInteger(x) && x >= 0, 'visual_bounds.x must be non-negative');
  assert(isInteger(y) && y >= 0, 'visual_bounds.y must be non-negative');
  assert(isInteger(width) && width > 0, 'visual_bounds.width must be positive');
  assert(isInteger(height) && height > 0, 'visual_bounds.height must be positive');
  return { x, y, width, height };
}

function readAnchor(value: unknown): OrthogonalAssetRegion['anchor'] {
  assert(isRecord(value), 'anchor must be an object');
  const x = value.x;
  const y = value.y;
  assert(isInteger(x) && x >= 0, 'anchor.x must be non-negative');
  assert(isInteger(y) && y >= 0, 'anchor.y must be non-negative');
  return { x, y };
}

function readRegion(value: unknown, index: number): OrthogonalAssetRegion {
  assert(isRecord(value), `regions[${index}] must be an object`);
  const id = value.id;
  const category = value.category;
  const surface = value.surface;
  const walkable = value.walkable;
  const blocksMovement = value.blocks_movement;
  const heightClass = value.height_class;
  const tags = value.tags;
  const confidence = value.confidence;
  assert(typeof id === 'string' && id.length > 0, `regions[${index}].id is required`);
  assert(typeof category === 'string' && categorySet.has(category), `${id}.category is invalid`);
  assert(typeof surface === 'string' && surfaceSet.has(surface), `${id}.surface is invalid`);
  assert(typeof walkable === 'boolean', `${id}.walkable must be boolean`);
  assert(typeof blocksMovement === 'boolean', `${id}.blocks_movement must be boolean`);
  assert(isInteger(heightClass) && heightClass >= 0, `${id}.height_class must be a non-negative integer`);
  assert(Array.isArray(tags) && tags.every((tag) => typeof tag === 'string'), `${id}.tags must be strings`);
  assert(typeof confidence === 'number' && confidence >= 0 && confidence <= 1, `${id}.confidence must be between 0 and 1`);
  if (category === 'unknown' || surface === 'unknown') {
    assert(confidence <= 0.5, `${id} unknown semantics must use confidence <= 0.5`);
  }

  const sourceRect = readRect(value.source_rect, `${id}.source_rect`);
  const footprint = readSize(value.logical_footprint, `${id}.logical_footprint`);
  const visualBounds = readBounds(value.visual_bounds);
  const anchor = readAnchor(value.anchor);
  assert(visualBounds.x + visualBounds.width <= sourceRect[2]!, `${id}.visual_bounds exceeds source width`);
  assert(visualBounds.y + visualBounds.height <= sourceRect[3]!, `${id}.visual_bounds exceeds source height`);
  assert(anchor.x <= sourceRect[2]! && anchor.y <= sourceRect[3]!, `${id}.anchor exceeds source rect`);

  assert(isRecord(value.edge), `${id}.edge must be an object`);
  const edge = {} as Record<'north' | 'south' | 'east' | 'west', OrthogonalAssetEdgeSurface>;
  for (const side of ['north', 'south', 'east', 'west'] as const) {
    const sideValue = value.edge[side];
    assert(typeof sideValue === 'string' && edgeSurfaceSet.has(sideValue), `${id}.edge.${side} is invalid`);
    edge[side] = sideValue as OrthogonalAssetEdgeSurface;
  }

  return {
    id,
    category: category as OrthogonalAssetCategory,
    surface: surface as OrthogonalAssetSurface,
    walkable,
    blocks_movement: blocksMovement,
    height_class: heightClass,
    edge,
    tags: [...tags] as string[],
    confidence,
    source_rect: sourceRect,
    logical_footprint: footprint,
    visual_bounds: visualBounds,
    anchor,
    ...(typeof value.notes === 'string' ? { notes: value.notes } : {}),
  };
}

export function validateOrthogonalAtlasMetadata(value: unknown): OrthogonalAtlasMetadata {
  assert(isRecord(value), 'root must be an object');
  assert(value.schema === 1, 'schema must be 1');
  assert(isRecord(value.atlas), 'atlas must be an object');
  const atlas = value.atlas;
  assert(typeof atlas.id === 'string' && atlas.id.length > 0, 'atlas.id is required');
  assert(typeof atlas.title === 'string' && atlas.title.length > 0, 'atlas.title is required');
  assert(typeof atlas.source === 'string' && atlas.source.length > 0, 'atlas.source is required');
  assert(typeof atlas.license === 'string' && atlas.license.length > 0, 'atlas.license is required');
  assert(isInteger(atlas.tile_size) && atlas.tile_size > 0, 'atlas.tile_size must be positive');
  assert(isRecord(atlas.native), 'atlas.native must be an object');
  const native = atlas.native;
  const nativeWidth = native.width;
  const nativeHeight = native.height;
  const nativeColumns = native.columns;
  const nativeRows = native.rows;
  assert(isInteger(nativeWidth) && nativeWidth > 0, 'atlas.native.width must be positive');
  assert(isInteger(nativeHeight) && nativeHeight > 0, 'atlas.native.height must be positive');
  assert(isInteger(nativeColumns) && nativeColumns > 0, 'atlas.native.columns must be positive');
  assert(isInteger(nativeRows) && nativeRows > 0, 'atlas.native.rows must be positive');
  assert(Array.isArray(value.regions) && value.regions.length > 0, 'regions must be non-empty');

  const ids = new Set<string>();
  const regions = value.regions.map((region, index) => {
    const parsed = readRegion(region, index);
    assert(!ids.has(parsed.id), `duplicate region id ${parsed.id}`);
    ids.add(parsed.id);
    assert(parsed.source_rect[0]! + parsed.source_rect[2]! <= nativeWidth, `${parsed.id}.source_rect exceeds atlas width`);
    assert(parsed.source_rect[1]! + parsed.source_rect[3]! <= nativeHeight, `${parsed.id}.source_rect exceeds atlas height`);
    return parsed;
  });

  return {
    schema: 1,
    atlas: {
      id: atlas.id as string,
      title: atlas.title as string,
      source: atlas.source as string,
      license: atlas.license as string,
      tile_size: atlas.tile_size as number,
      native: {
        width: nativeWidth,
        height: nativeHeight,
        columns: nativeColumns,
        rows: nativeRows,
      },
    },
    regions,
  };
}

export const ORTHOGONAL_ATLAS_METADATA = validateOrthogonalAtlasMetadata(rawMetadata);

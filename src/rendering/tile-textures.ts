import {
  Assets,
  Texture,
  Rectangle,
  SCALE_MODES,
  type TextureSource,
} from 'pixi.js';

export type TileTextureName =
  | 'floor'
  | 'wall'
  | 'player'
  | 'door'
  | 'doorOpen'
  | 'plate'
  | 'leverOn'
  | 'leverOff'
  | 'chest'
  | 'chestOpened'
  | 'block';

export type TileTextureSet = Readonly<
  Record<TileTextureName, Texture>
>;

/**
 * Frame map for the Kenney "Tiny Dungeon" packed tilemap
 * (16×16 tiles, 12 columns × 11 rows = 192×176 sheet). Indices are
 * [col, row] into the sheet and correspond to the installed CC0 pack.
 * The downloaded pack has 11 rows (rather than the 9-row geometry of
 * an older/alternate sheet), so the geometry below intentionally matches
 * the asset stored under public/assets.
 */
export const TINY_DUNGEON_SHEET = {
  tileSize: 16,
  columns: 12,
  rows: 11,
} as const;

export const TINY_DUNGEON_FRAMES: Readonly<
  Record<TileTextureName, readonly [number, number]>
> = {
  floor: [0, 4],
  wall: [2, 1],
  player: [2, 8],
  door: [10, 3],
  doorOpen: [10, 1],
  plate: [5, 8],
  leverOn: [6, 9],
  leverOff: [5, 9],
  chest: [6, 7],
  chestOpened: [8, 7],
  block: [3, 5],
};

function sourceMatchesExpected(
  source: TextureSource,
  sheet: typeof TINY_DUNGEON_SHEET,
): boolean {
  return (
    source.width === sheet.columns * sheet.tileSize &&
    source.height === sheet.rows * sheet.tileSize
  );
}

/**
 * Loads a tileset sheet and cuts named texture frames from it.
 * Returns null (never throws) when the asset is missing, unreadable
 * or not the expected geometry, so the renderer can fall back to
 * flat-color graphics per tile.
 */
export async function loadTileTextures(
  url: string,
): Promise<TileTextureSet | null> {
  let texture: Texture;

  try {
    texture = await Assets.load(url);
  } catch {
    return null;
  }

  if (!texture?.source || !sourceMatchesExpected(texture.source, TINY_DUNGEON_SHEET)) {
    return null;
  }

  const { tileSize } = TINY_DUNGEON_SHEET;
  const frames: Record<string, Texture> = {};

  for (const [name, [col, row]] of Object.entries(TINY_DUNGEON_FRAMES)) {
    const frame = new Rectangle(
      col * tileSize,
      row * tileSize,
      tileSize,
      tileSize,
    );

    frames[name] = new Texture({
      source: texture.source,
      frame,
    });
  }

  return frames as TileTextureSet;
}

/**
 * Marks textures for nearest-neighbor scaling (crisp pixel art when
 * upscaled to TILE_SIZE). Returns a no-op for missing textures.
 */
export function setNearestFilter(textures: TileTextureSet | null): void {
  if (!textures) {
    return;
  }

  for (const texture of Object.values(textures)) {
    texture.source.scaleMode = SCALE_MODES.NEAREST;
  }
}

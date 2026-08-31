import {
  Assets,
  SCALE_MODES,
  Texture,
} from 'pixi.js';
import {
  KENNEY_FOREST_TILE_IDS,
  KENNEY_GENERATOR_TILE_IDS,
  KENNEY_MAP_PACK_METADATA,
  KENNEY_PLATEAU_TILE_IDS,
} from '@/assets/kenney-map-pack/metadata';
import { KENNEY_MAP_PACK_TILE_ROOT } from '@/assets/kenney-map-pack/asset-url';

export interface OrthogonalTexture {
  readonly texture: Texture;
  readonly regionId: string;
}

export interface OrthogonalTextureSet {
  readonly terrain?: Readonly<Partial<Record<string, OrthogonalTexture>>>;
  readonly forest?: Readonly<Partial<Record<string, OrthogonalTexture>>>;
  readonly plateau?: Readonly<Partial<Record<string, OrthogonalTexture>>>;
  readonly road?: Readonly<Partial<Record<string, OrthogonalTexture>>>;
}

export async function loadOrthogonalTextures(): Promise<OrthogonalTextureSet> {
  const terrainIds = [...new Set(Object.values(KENNEY_GENERATOR_TILE_IDS).flat())];
  const forestIds = [...new Set(KENNEY_FOREST_TILE_IDS)];
  const plateauIds = [...new Set(Object.values(KENNEY_PLATEAU_TILE_IDS).flatMap((set) => [
    ...set.fill,
    ...set.top,
    ...set.side_left,
    ...set.side_right,
    ...set.bottom,
  ]))];
  const packIds = [...new Set([...terrainIds, ...forestIds, ...plateauIds])];
  const packEntries = await Promise.all(packIds.map(async (id) => {
    const tile = KENNEY_MAP_PACK_METADATA.tiles.find((candidate) => candidate.id === id);
    if (!tile) {
      return null;
    }
    try {
      const texture = await Assets.load(`${KENNEY_MAP_PACK_TILE_ROOT}/${tile.file}`) as Texture;
      if (!texture?.source) {
        return null;
      }
      texture.source.scaleMode = SCALE_MODES.NEAREST;
      return [id, { texture, regionId: id }] as const;
    } catch {
      return null;
    }
  }));

  const packTextures: Record<string, OrthogonalTexture> = {};
  for (const entry of packEntries) {
    if (entry) {
      packTextures[entry[0]] = entry[1];
    }
  }

  const terrain: Record<string, OrthogonalTexture> = {};
  for (const id of terrainIds) {
    const texture = packTextures[id];
    if (texture) {
      terrain[id] = texture;
    }
  }
  const forest: Record<string, OrthogonalTexture> = {};
  for (const id of forestIds) {
    const texture = packTextures[id];
    if (texture) {
      forest[id] = texture;
    }
  }
  const plateau: Record<string, OrthogonalTexture> = {};
  for (const [, tileSet] of Object.entries(KENNEY_PLATEAU_TILE_IDS)) {
    const allPlateauIds = [
      ...(tileSet?.fill ?? []),
      ...(tileSet?.top ?? []),
      ...(tileSet?.side_left ?? []),
      ...(tileSet?.side_right ?? []),
      ...(tileSet?.bottom ?? []),
    ];
    for (const plateauId of allPlateauIds) {
      const tex = packTextures[plateauId];
      if (tex) plateau[plateauId] = tex;
    }
  }
  return { terrain, forest, plateau };
}

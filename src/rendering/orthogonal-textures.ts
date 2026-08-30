import {
  Assets,
  Rectangle,
  SCALE_MODES,
  Texture,
  type TextureSource,
} from 'pixi.js';
import {
  ORTHOGONAL_RENDER_ROLES,
  orthogonalRegionForRole,
  type OrthogonalRenderRole,
} from '@/assets/orthogonal/semantic-mapping';
import { ORTHOGONAL_ATLAS_METADATA } from '@/assets/orthogonal/metadata';
import { PUNY_WORLD_ATLAS_URL } from '@/assets/orthogonal/asset-url';

export interface OrthogonalTexture {
  readonly texture: Texture;
  readonly regionId: string;
}

export type OrthogonalTextureSet = Readonly<Partial<Record<OrthogonalRenderRole, OrthogonalTexture>>>;

function sourceMatchesMetadata(source: TextureSource): boolean {
  return (
    source.width === ORTHOGONAL_ATLAS_METADATA.atlas.native.width &&
    source.height === ORTHOGONAL_ATLAS_METADATA.atlas.native.height
  );
}

export async function loadOrthogonalTextures(
  url = PUNY_WORLD_ATLAS_URL,
): Promise<OrthogonalTextureSet> {
  let atlas: Texture;
  try {
    atlas = await Assets.load(url);
  } catch {
    return {};
  }

  if (!atlas?.source || !sourceMatchesMetadata(atlas.source)) {
    return {};
  }

  const loaded: Partial<Record<OrthogonalRenderRole, OrthogonalTexture>> = {};
  for (const role of ORTHOGONAL_RENDER_ROLES) {
    const region = orthogonalRegionForRole(role);
    const [x, y, width, height] = region.source_rect;
    const texture = new Texture({
      source: atlas.source,
      frame: new Rectangle(x, y, width, height),
    });
    texture.source.scaleMode = SCALE_MODES.NEAREST;
    loaded[role] = { texture, regionId: region.id };
  }
  return loaded;
}

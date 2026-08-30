import {
  ORTHOGONAL_ATLAS_METADATA,
  type OrthogonalAssetRegion,
} from './metadata';

export const ORTHOGONAL_RENDER_ROLES = [
  'grass',
  'dirt',
  'water',
  'cliff',
  'stairs',
  'tree',
] as const;

export type OrthogonalRenderRole = (typeof ORTHOGONAL_RENDER_ROLES)[number];

export const ORTHOGONAL_RENDER_MAPPING: Readonly<Record<OrthogonalRenderRole, string>> = {
  grass: 'puny.grass.base',
  dirt: 'puny.dirt.path',
  water: 'puny.water.base',
  cliff: 'puny.unresolved.ledge-candidate',
  stairs: 'puny.unresolved.connector-candidate',
  tree: 'puny.tree.cluster',
};

const regionsById = new Map(
  ORTHOGONAL_ATLAS_METADATA.regions.map((region) => [region.id, region]),
);

export function orthogonalRegionForRole(
  role: OrthogonalRenderRole,
): OrthogonalAssetRegion {
  const region = regionsById.get(ORTHOGONAL_RENDER_MAPPING[role]);
  if (!region) {
    throw new Error(`Missing orthogonal asset mapping for ${role}`);
  }
  return region;
}

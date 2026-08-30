import { describe, expect, it } from 'vitest';
import {
  ORTHOGONAL_ATLAS_METADATA,
  validateOrthogonalAtlasMetadata,
} from './metadata';

describe('orthogonal asset annotations', () => {
  it('keeps source geometry separate from logical footprint and visual bounds', () => {
    const tree = ORTHOGONAL_ATLAS_METADATA.regions.find((region) => region.id === 'puny.tree.cluster');

    expect(tree).toBeDefined();
    expect(tree?.source_rect).toEqual([0, 128, 32, 32]);
    expect(tree?.logical_footprint).toEqual({ width: 2, height: 2 });
    expect(tree?.visual_bounds).toEqual({ x: 0, y: 0, width: 32, height: 32 });
    expect(tree?.anchor).toEqual({ x: 16, y: 32 });
  });

  it('records ambiguous atlas regions as unknown instead of promoting a guess', () => {
    const cliffCandidate = ORTHOGONAL_ATLAS_METADATA.regions.find((region) => region.id === 'puny.unresolved.ledge-candidate');
    const stairsCandidate = ORTHOGONAL_ATLAS_METADATA.regions.find((region) => region.id === 'puny.unresolved.connector-candidate');

    expect(cliffCandidate).toMatchObject({ category: 'unknown', surface: 'unknown', confidence: 0.35 });
    expect(stairsCandidate).toMatchObject({ category: 'unknown', surface: 'unknown', confidence: 0.35 });
  });

  it('preserves footprint and visual geometry as separate review fields', () => {
    const ledgeCandidate = ORTHOGONAL_ATLAS_METADATA.regions.find((region) => region.id === 'puny.unresolved.ledge-candidate');
    const stairsCandidate = ORTHOGONAL_ATLAS_METADATA.regions.find((region) => region.id === 'puny.unresolved.connector-candidate');

    expect(ledgeCandidate?.logical_footprint).toEqual({ width: 4, height: 3 });
    expect(ledgeCandidate?.visual_bounds.height).toBe(64);
    expect(stairsCandidate?.logical_footprint).toEqual({ width: 1, height: 3 });
    expect(stairsCandidate?.visual_bounds.height).toBe(16);
  });

  it('allows explicit unknown semantics only with low confidence', () => {
    const originalRegions = structuredClone(ORTHOGONAL_ATLAS_METADATA).regions;
    const unknownMetadata = {
      ...structuredClone(ORTHOGONAL_ATLAS_METADATA),
      regions: [
        ...originalRegions,
        {
          ...originalRegions[0]!,
          id: 'puny.unresolved.sample',
          category: 'unknown',
          surface: 'unknown',
          confidence: 0.35,
        },
      ],
    };

    expect(validateOrthogonalAtlasMetadata(unknownMetadata).regions.at(-1)).toMatchObject({
      id: 'puny.unresolved.sample',
      category: 'unknown',
      surface: 'unknown',
      confidence: 0.35,
    });

    expect(() => validateOrthogonalAtlasMetadata({
      ...unknownMetadata,
      regions: [{
        ...unknownMetadata.regions.at(-1)!,
        confidence: 0.9,
      }],
    })).toThrow(/unknown semantics/);
  });

  it('rejects source rectangles that exceed the native atlas', () => {
    expect(() => validateOrthogonalAtlasMetadata({
      ...ORTHOGONAL_ATLAS_METADATA,
      regions: [{
        ...ORTHOGONAL_ATLAS_METADATA.regions[0]!,
        id: 'invalid',
        source_rect: [430, 0, 16, 16] as const,
      }],
    })).toThrow(/exceeds atlas width/);
  });
});

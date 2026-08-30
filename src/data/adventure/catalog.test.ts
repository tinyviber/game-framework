import { describe, expect, it } from 'vitest';
import manifest from '../../../public/assets/mark/manifest.json';
import { adventureCatalog } from './catalog';
import { MARK_ASSET_KEYS } from '@/rendering/isometric-scene';

describe('adventure authoring catalog', () => {
  it('covers eight visual biomes and only known mark assets', () => {
    expect(new Set(adventureCatalog.roomList.map((room) => room.surface)).size).toBeGreaterThanOrEqual(8);
    const manifestKeys = new Set(manifest.assets.map((asset) => asset.key));
    const knownKeys = new Set<string>(MARK_ASSET_KEYS);
    for (const room of adventureCatalog.roomList) {
      expect(room.props.length).toBeGreaterThanOrEqual(2);
      for (const prop of room.props) {
        expect(knownKeys.has(prop.assetKey)).toBe(true);
        expect(manifestKeys.has(prop.assetKey)).toBe(true);
      }
      for (const npc of room.npcs) {
        expect(manifestKeys.has(npc.assetKey)).toBe(true);
      }
    }
  });

  it('records a verified 64x64 source for every runtime art key', () => {
    const manifestKeys = new Set(manifest.assets.map((asset) => asset.key));
    expect(manifest.assets).toHaveLength(27);
    for (const key of MARK_ASSET_KEYS) {
      expect(manifestKeys.has(key)).toBe(true);
    }
    expect(manifest.assets.every((asset) => asset.width === 64 && asset.height === 64)).toBe(true);
    expect(manifest.assets.every((asset) => /^[a-f0-9]{64}$/.test(asset.sha256))).toBe(true);
  });
});

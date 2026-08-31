import { describe, expect, it } from 'vitest';
import { generateGeneratedWorld } from '@/world/generated-world';
import { findFrostTrial } from './mechanic';

describe('frost trial seed scan', () => {
  it('finds island-river trials across seeds', () => {
    const found: Array<{ seed: number; depth: number; spawn: string; treasure: string }> = [];
    for (let seed = 2020; seed <= 2060; seed += 1) {
      const world = generateGeneratedWorld(seed);
      const trial = findFrostTrial(world);
      if (trial) {
        found.push({ seed, depth: trial.depth, spawn: `${trial.spawn.x},${trial.spawn.y}`, treasure: `${trial.treasure.x},${trial.treasure.y}` });
      }
    }
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(found));
    expect(found.length).toBeGreaterThan(0);
  });
});

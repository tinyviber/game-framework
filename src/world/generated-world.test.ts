import { describe, expect, it } from 'vitest';
import {
  GENERATED_WORLD_HEIGHT,
  GENERATED_WORLD_WIDTH,
  generateGeneratedWorld,
  findGeneratedPath,
  resolveGeneratedEdge,
  type GeneratedWorld,
} from './generated-world';
import { canTraverse } from './traversal';

function assertFrozen(value: unknown, seen = new Set<object>()): void {
  if (!value || typeof value !== 'object' || seen.has(value)) {
    return;
  }
  const object = value as object;
  seen.add(object);
  expect(Object.isFrozen(object)).toBe(true);
  expect(object).not.toBeInstanceOf(Map);
  expect(object).not.toBeInstanceOf(Set);
  for (const child of Object.values(object)) {
    assertFrozen(child, seen);
  }
}

function signature(world: GeneratedWorld): string {
  return JSON.stringify({
    cells: world.cells,
    edges: world.edges,
    start: world.start,
    goal: world.goal,
  });
}

describe('seeded generated world', () => {
  it('generates deterministic, immutable 40x40 worlds with non-trivial topology', () => {
    const worlds = [0, 1, 7, 42, 2026].map((seed) => generateGeneratedWorld(seed));

    for (const world of worlds) {
      expect(world.width).toBe(GENERATED_WORLD_WIDTH);
      expect(world.height).toBe(GENERATED_WORLD_HEIGHT);
      expect(world.cells).toHaveLength(40);
      expect(world.cells[0]).toHaveLength(40);
      expect(world.start).not.toEqual(world.goal);
      expect(world.cells.flat().some((cell) => !cell.walkable)).toBe(true);
      expect(world.baselinePath[0]).toEqual(world.start);
      expect(world.baselinePath.at(-1)).toEqual(world.goal);
      expect(world.finalPath[0]).toEqual(world.start);
      expect(world.finalPath.at(-1)).toEqual(world.goal);
      assertFrozen(world);
    }

    expect(signature(worlds[0]!)).not.toBe(signature(worlds[1]!));
    expect(new Set(worlds.map((world) => world.baselineEdges.length)).size).toBeGreaterThan(1);
    expect(new Set(worlds.map((world) => JSON.stringify(world.topology))).size).toBeGreaterThan(1);
    expect(generateGeneratedWorld(42)).toEqual(generateGeneratedWorld(42));
  });

  it('records actual walls, dead ends, articulation bottlenecks, and a loop', () => {
    const world = generateGeneratedWorld(42);

    expect(world.topology.wallCount).toBeGreaterThan(0);
    expect(world.topology.deadEndCount).toBeGreaterThan(0);
    expect(world.topology.articulationCount).toBeGreaterThan(0);
    expect(world.topology.cycleRank).toBeGreaterThan(0);
    expect(world.topology.reachableCellCount).toBeGreaterThan(0);
    expect(world.finalTopology.cycleRank).toBeGreaterThan(0);
  });

  it('keeps baseline and final route validation on separate graphs', () => {
    const world = generateGeneratedWorld(2026);
    const baseline = findGeneratedPath(
      world.baselineCells,
      world.baselineEdges,
      world.start,
      world.goal,
    );
    const final = findGeneratedPath(
      world.cells,
      world.edges,
      world.start,
      world.goal,
    );
    const barrier = world.perturbation.edge;
    const from = world.cells[barrier.from.y]![barrier.from.x]!;
    const to = world.cells[barrier.to.y]![barrier.to.x]!;
    const reverse = resolveGeneratedEdge(world, barrier.to, barrier.from);

    expect(world.baselinePath).toEqual(baseline);
    expect(baseline.length).toBe(world.perturbation.baselineShortestPathLength + 1);
    expect(final).toEqual(world.finalPath);
    expect(final.length).toBeGreaterThan(baseline.length);
    expect(canTraverse(from, to, barrier, {})).toBe(false);
    expect(reverse?.kind).toBe('height-barrier');
  });

  it('fails deterministically when the finite attempt budget is zero', () => {
    expect(() => generateGeneratedWorld(7, { maxAttempts: 0 })).toThrow(
      /seed[^\d]*7|7[^\n]*seed/i,
    );
    expect(() => generateGeneratedWorld(7, { maxAttempts: 0 })).toThrow(
      /attempts[^\d]*0|0[^\n]*attempts/i,
    );
  });

  it('exhausts a real finite retry budget when every candidate is rejected', () => {
    let callbackAttempts = 0;
    expect(() => generateGeneratedWorld(7, {
      maxAttempts: 2,
      acceptCandidate: (_candidate, attempt) => {
        callbackAttempts = attempt;
        return false;
      },
    })).toThrow(/seed[^\d]*7|7[^\n]*seed/i);
    expect(callbackAttempts).toBe(2);
    expect(() => generateGeneratedWorld(7, {
      maxAttempts: 2,
      acceptCandidate: () => false,
    })).toThrow(/attempts[^\d]*2|2[^\n]*attempts/i);
  });
});

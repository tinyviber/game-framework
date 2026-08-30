import { describe, expect, it } from 'vitest';
import {
  GENERATED_TOPOLOGY_FAMILIES,
  GENERATED_WORLD_HEIGHT,
  GENERATED_WORLD_WIDTH,
  chooseTopologyFamily,
  generateGeneratedWorld,
  findGeneratedPath,
  isGeneratedTopologyFamily,
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

function positionKey(position: { readonly x: number; readonly y: number }): string {
  return `${position.x},${position.y}`;
}

function directedEdgeKey(edge: { from: { x: number; y: number }; to: { x: number; y: number } }): string {
  return `${positionKey(edge.from)}>${positionKey(edge.to)}`;
}

function undirectedEdgeKey(edge: { from: { x: number; y: number }; to: { x: number; y: number } }): string {
  return [positionKey(edge.from), positionKey(edge.to)].sort().join('|');
}

function signature(world: GeneratedWorld): string {
  return JSON.stringify({
    topologyFamily: world.topologyFamily,
    cells: world.cells,
    edges: world.edges,
    start: world.start,
    goal: world.goal,
    perturbation: world.perturbation,
  });
}

function directionChanges(path: readonly { x: number; y: number }[]): number {
  let changes = 0;
  let previous: string | undefined;
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1]!;
    const to = path[index]!;
    const direction = `${Math.sign(to.x - from.x)},${Math.sign(to.y - from.y)}`;
    if (previous && previous !== direction) {
      changes += 1;
    }
    previous = direction;
  }
  return changes;
}

function horizontalCorridors(world: GeneratedWorld): number {
  const left = Math.min(world.start.x, world.goal.x);
  const right = Math.max(world.start.x, world.goal.x);
  let count = 0;
  for (let y = 1; y < world.height - 1; y += 1) {
    let complete = true;
    for (let x = left; x <= right; x += 1) {
      const cell = world.baselineCells[y]?.[x];
      if (!cell?.walkable || cell.elevation !== 0) {
        complete = false;
        break;
      }
      if (x < right) {
        const next = world.baselineCells[y]?.[x + 1];
        const edge = resolveGeneratedEdge(world, { x, y }, { x: x + 1, y }, true);
        if (!next || !edge || !canTraverse(cell, next, edge, {})) {
          complete = false;
          break;
        }
      }
    }
    if (complete) {
      count += 1;
    }
  }
  return count;
}

function maximumDegree(world: GeneratedWorld): number {
  const adjacency = new Map<string, Set<string>>();
  for (const cell of world.baselineCells.flat()) {
    if (cell.walkable) {
      adjacency.set(positionKey(cell), new Set());
    }
  }
  for (const edge of world.baselineEdges) {
    const from = world.baselineCells[edge.from.y]?.[edge.from.x];
    const to = world.baselineCells[edge.to.y]?.[edge.to.x];
    if (!from || !to || !canTraverse(from, to, edge, {})) {
      continue;
    }
    adjacency.get(positionKey(edge.from))?.add(positionKey(edge.to));
    adjacency.get(positionKey(edge.to))?.add(positionKey(edge.from));
  }
  return Math.max(0, ...Array.from(adjacency.values(), (neighbors) => neighbors.size));
}

function interRegionCrossings(world: GeneratedWorld): Set<string> {
  const crossings = new Set<string>();
  for (const edge of world.baselineEdges) {
    const from = world.baselineCells[edge.from.y]?.[edge.from.x];
    const to = world.baselineCells[edge.to.y]?.[edge.to.x];
    if (from && to && from.regionId !== to.regionId && canTraverse(from, to, edge, {})) {
      crossings.add(undirectedEdgeKey(edge));
    }
  }
  return crossings;
}

function validateStoredPathEndpoints(
  world: GeneratedWorld,
  path: readonly { readonly x: number; readonly y: number }[],
): string | undefined {
  if (path.length === 0) {
    return 'stored path is empty';
  }
  if (positionKey(path[0]!) !== positionKey(world.start)) {
    return 'stored path does not start at start';
  }
  if (positionKey(path.at(-1)!) !== positionKey(world.goal)) {
    return 'stored path does not end at goal';
  }
  return undefined;
}

function validateStoredPath(
  world: GeneratedWorld,
  path: readonly { readonly x: number; readonly y: number }[],
  baseline: boolean,
): string | undefined {
  const endpointError = validateStoredPathEndpoints(world, path);
  if (endpointError) {
    return endpointError;
  }
  const cells = baseline ? world.baselineCells : world.cells;
  for (let index = 1; index < path.length; index += 1) {
    const fromPosition = path[index - 1]!;
    const toPosition = path[index]!;
    const from = cells[fromPosition.y]?.[fromPosition.x];
    const to = cells[toPosition.y]?.[toPosition.x];
    const edge = resolveGeneratedEdge(world, fromPosition, toPosition, baseline);
    if (!from || !to || !edge || !canTraverse(from, to, edge, {})) {
      return `invalid transition at ${positionKey(fromPosition)}>${positionKey(toPosition)}`;
    }
  }
  return undefined;
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

  it('selects five structurally different macro topology families from the seed', () => {
    const worlds = GENERATED_TOPOLOGY_FAMILIES.map((family) => {
      let seed = 0;
      while (chooseTopologyFamily(seed) !== family) {
        seed += 1;
      }
      const world = generateGeneratedWorld(seed);
      expect(world.topologyFamily).toBe(family);
      return world;
    });

    expect(new Set(worlds.map((world) => world.topologyFamily)).size).toBe(5);

    const parallel = worlds.find((world) => world.topologyFamily === 'parallel-loop')!;
    expect(horizontalCorridors(parallel)).toBeGreaterThanOrEqual(2);

    const switchback = worlds.find((world) => world.topologyFamily === 'switchback')!;
    expect(directionChanges(switchback.baselinePath)).toBeGreaterThanOrEqual(2);

    const ring = worlds.find((world) => world.topologyFamily === 'ring')!;
    expect(ring.topology.cycleRank).toBeGreaterThan(0);
    const ringMiddle = Math.floor((ring.baselinePath.length - 1) / 2);
    const ringFrom = ring.baselinePath[ringMiddle]!;
    const ringTo = ring.baselinePath[ringMiddle + 1]!;
    const ringWithoutEdge = ring.baselineEdges.filter((edge) =>
      !(
        (positionKey(edge.from) === positionKey(ringFrom) && positionKey(edge.to) === positionKey(ringTo)) ||
        (positionKey(edge.from) === positionKey(ringTo) && positionKey(edge.to) === positionKey(ringFrom))
      ),
    );
    expect(findGeneratedPath(ring.baselineCells, ringWithoutEdge, ring.start, ring.goal).length).toBeGreaterThan(0);

    const hub = worlds.find((world) => world.topologyFamily === 'hub-and-spoke')!;
    expect(maximumDegree(hub)).toBeGreaterThanOrEqual(3);
    expect(hub.topology.deadEndCount).toBeGreaterThan(0);

    const twoRegion = worlds.find((world) => world.topologyFamily === 'two-region')!;
    expect(interRegionCrossings(twoRegion).size).toBe(2);
  });

  it('creates a three-cell raised disruption with exact directed boundary edges', () => {
    for (const seed of [0, 1, 7, 42, 2026]) {
      const world = generateGeneratedWorld(seed);
      const disruption = world.perturbation.disruption;
      const footprint = disruption.footprint;
      const footprintKeys = new Set(footprint.map(positionKey));

      expect(footprint).toHaveLength(3);
      expect(footprintKeys.size).toBe(3);
      expect(footprint[0]).toEqual(world.baselinePath[disruption.baselinePathIndex]);
      expect(footprint.every((position) => position.x > 0 && position.x < world.width - 1 && position.y > 0 && position.y < world.height - 1)).toBe(true);
      expect(footprint.some((position) => positionKey(position) === positionKey(world.start))).toBe(false);
      expect(footprint.some((position) => positionKey(position) === positionKey(world.goal))).toBe(false);
      expect(new Set(footprint.map((position) => world.baselineCells[position.y]![position.x]!.elevation)).size).toBe(1);
      expect(footprint.every((position) => world.baselineCells[position.y]![position.x]!.walkable)).toBe(true);
      expect(Math.abs(footprint[0]!.x - footprint[1]!.x) + Math.abs(footprint[0]!.y - footprint[1]!.y)).toBe(1);
      expect(Math.abs(footprint[1]!.x - footprint[2]!.x) + Math.abs(footprint[1]!.y - footprint[2]!.y)).toBe(1);

      const expectedBlocked = world.baselineEdges.filter((edge) =>
        footprintKeys.has(positionKey(edge.from)) !== footprintKeys.has(positionKey(edge.to)),
      );
      expect(new Set(disruption.blockedEdges.map(directedEdgeKey))).toEqual(new Set(expectedBlocked.map(directedEdgeKey)));
      expect(disruption.blockedEdges.every((edge) => edge.kind === 'height-barrier')).toBe(true);
      expect(disruption.blockedEdges.every((edge) => !(footprintKeys.has(positionKey(edge.from)) && footprintKeys.has(positionKey(edge.to))))).toBe(true);
      expect(Object.keys(world.perturbation)).not.toContain('edge');
      expect(Object.keys(world.perturbation)).not.toContain('barrierCell');
      expect(world.finalPath.some((position) => footprintKeys.has(positionKey(position)))).toBe(false);
      expect(world.perturbation.finalShortestPathLength).toBeGreaterThan(world.perturbation.baselineShortestPathLength);
    }
  });

  it('keeps baseline and final route validation on separate graphs', () => {
    const world = generateGeneratedWorld(2026);
    const baseline = findGeneratedPath(world.baselineCells, world.baselineEdges, world.start, world.goal);
    const final = findGeneratedPath(world.cells, world.edges, world.start, world.goal);

    expect(world.baselinePath).toEqual(baseline);
    expect(baseline.length).toBe(world.perturbation.baselineShortestPathLength + 1);
    expect(final).toEqual(world.finalPath);
    expect(final.length).toBeGreaterThan(baseline.length);
    expect(world.finalTopology.reachableCellCount).toBeGreaterThan(0);
    expect(world.perturbation.disruption.blockedEdges.some((edge) => {
      const from = world.cells[edge.from.y]![edge.from.x]!;
      const to = world.cells[edge.to.y]![edge.to.x]!;
      return !canTraverse(from, to, edge, {});
    })).toBe(true);
  });

  it('partitions every cell into unique regions with explicit environment fallback', () => {
    const world = generateGeneratedWorld(42);
    const regionIds = world.regions.map((region) => region.id);
    expect(new Set(regionIds).size).toBe(regionIds.length);
    const cellsByRegion = new Map(world.regions.map((region) => [region.id, new Set(region.cellKeys)]));
    const allKeys = world.regions.flatMap((region) => region.cellKeys);
    expect(allKeys).toHaveLength(world.width * world.height);
    expect(new Set(allKeys).size).toBe(allKeys.length);

    for (const cell of world.cells.flat()) {
      expect(cellsByRegion.get(cell.regionId)?.has(positionKey(cell))).toBe(true);
      expect('surface' in cell).toBe(false);
      expect(cell.terrainType).toBeTypeOf('string');
      const region = world.regions.find((candidate) => candidate.id === cell.regionId)!;
      const environment = region.environment ?? world.environment;
      expect(environment.weather).toBeTypeOf('string');
      expect(environment.lighting).toBeTypeOf('string');
    }
  });

  it('keeps the chosen family stable across finite candidate retries', () => {
    const seed = -1;
    const seenFamilies: string[] = [];
    expect(() => generateGeneratedWorld(seed, {
      maxAttempts: 2,
      acceptCandidate: (candidate) => {
        seenFamilies.push(candidate.topologyFamily);
        return false;
      },
    })).toThrow(/attempts[^\d]*2|2[^\n]*attempts/i);
    expect(seenFamilies).toEqual([chooseTopologyFamily(seed), chooseTopologyFamily(seed)]);
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
    expect(() => generateGeneratedWorld(0, {
      maxAttempts: 2,
      acceptCandidate: (_candidate, attempt) => {
        callbackAttempts = attempt;
        return false;
      },
    })).toThrow(/seed[^\d]*0|0[^\n]*seed/i);
    expect(callbackAttempts).toBe(2);
  });

  it('keeps every seed in the deterministic 0..9999 generation domain valid', { timeout: 300_000 }, () => {
    const failures: string[] = [];
    const familyPredicatesChecked = new Set<string>();
    let failureCount = 0;

    for (let seed = 0; seed <= 9_999; seed += 1) {
      const expectedFamily = chooseTopologyFamily(seed);
      let world: GeneratedWorld;

      try {
        world = generateGeneratedWorld(seed);
      } catch (error) {
        failureCount += 1;
        if (failures.length < 8) {
          const reason = error instanceof Error ? error.message : String(error);
          failures.push(
            `seed=${seed} expectedFamily=${expectedFamily} actualFamily=<generation-throw> reason=${reason}`,
          );
        }
        continue;
      }

      const actualFamily = world.topologyFamily;
      try {
        if (actualFamily !== expectedFamily) {
          throw new Error(`topology family mismatch: expected ${expectedFamily}, got ${actualFamily}`);
        }

        const baselineError = validateStoredPath(world, world.baselinePath, true);
        if (baselineError) {
          throw new Error(`baseline path invalid: ${baselineError}`);
        }
        if (world.perturbation.baselineShortestPathLength !== world.baselinePath.length - 1) {
          throw new Error(
            `baseline metadata mismatch: ${world.perturbation.baselineShortestPathLength} vs ${world.baselinePath.length - 1}`,
          );
        }

        const finalError = validateStoredPath(world, world.finalPath, false);
        if (finalError) {
          throw new Error(`final path invalid: ${finalError}`);
        }
        if (world.perturbation.finalShortestPathLength !== world.finalPath.length - 1) {
          throw new Error(
            `final metadata mismatch: ${world.perturbation.finalShortestPathLength} vs ${world.finalPath.length - 1}`,
          );
        }
        if (world.perturbation.finalShortestPathLength <= world.perturbation.baselineShortestPathLength) {
          throw new Error(
            `final path is not longer than baseline: ${world.perturbation.finalShortestPathLength} <= ${world.perturbation.baselineShortestPathLength}`,
          );
        }
        // The generator already applies this predicate to every candidate. Re-running
        // it for all 10,000 worlds would repeat the ring-family BFS needlessly, so the
        // stress test checks the exported predicate once for each family while still
        // validating generation and family stability for every seed.
        if (!familyPredicatesChecked.has(actualFamily)) {
          if (!isGeneratedTopologyFamily(
            actualFamily,
            world.baselineCells,
            world.baselineEdges,
            world.start,
            world.goal,
            world.baselinePath,
            world.topology,
          )) {
            throw new Error('isGeneratedTopologyFamily returned false');
          }
          familyPredicatesChecked.add(actualFamily);
        }
      } catch (error) {
        failureCount += 1;
        if (failures.length < 8) {
          const reason = error instanceof Error ? error.message : String(error);
          failures.push(
            `seed=${seed} expectedFamily=${expectedFamily} actualFamily=${actualFamily} reason=${reason}`,
          );
        }
      }
    }

    const summary = failureCount === 0
      ? ''
      : `${failureCount} seed validation failure(s); first ${failures.length}:\n${failures.join('\n')}`;
    if (failureCount === 0) {
      expect(familyPredicatesChecked).toEqual(new Set(GENERATED_TOPOLOGY_FAMILIES));
    }
    expect(failureCount, summary).toBe(0);
  });
});

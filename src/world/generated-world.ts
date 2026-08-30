import { deepFreeze, type Position } from './types';
import {
  canTraverse,
  createTraversalEdge,
  resolveEdge,
  type GeneratedEdge,
  type TraversalCell,
} from './traversal';

export const GENERATED_WORLD_WIDTH = 40;
export const GENERATED_WORLD_HEIGHT = 40;
export const MAX_GENERATION_ATTEMPTS = 64;

export type GeneratedSurface =
  | 'meadow'
  | 'sky'
  | 'rain'
  | 'night'
  | 'snow'
  | 'cave'
  | 'crystal'
  | 'sunset';

export interface GeneratedPalette {
  readonly sky: number;
  readonly ground: number;
  readonly groundAlt: number;
  readonly edge: number;
  readonly glow: number;
}

export interface GeneratedCell extends TraversalCell {
  readonly surface: GeneratedSurface;
}

export interface GeneratedProp {
  readonly id: string;
  readonly assetKey: string;
  readonly x: number;
  readonly y: number;
  readonly elevation: number;
  readonly foreground: boolean;
  /** All generated props are landmarks in this slice, never hidden blockers. */
  readonly blocks: false;
}

export interface GeneratedTopologyMetrics {
  readonly wallCount: number;
  readonly reachableCellCount: number;
  readonly deadEndCount: number;
  readonly articulationCount: number;
  readonly cycleRank: number;
}

export interface GeneratedPerturbation {
  readonly edge: GeneratedEdge;
  readonly barrierCell: Position;
  readonly baselinePathIndex: number;
  readonly baselineShortestPathLength: number;
  readonly finalShortestPathLength: number;
}

export interface GeneratedWorld {
  readonly seed: number;
  readonly generationAttempts: number;
  readonly width: number;
  readonly height: number;
  readonly baselineCells: readonly (readonly GeneratedCell[])[];
  readonly baselineEdges: readonly GeneratedEdge[];
  readonly cells: readonly (readonly GeneratedCell[])[];
  readonly edges: readonly GeneratedEdge[];
  readonly start: Position;
  readonly goal: Position;
  readonly baselinePath: readonly Position[];
  readonly finalPath: readonly Position[];
  readonly perturbation: GeneratedPerturbation;
  readonly topology: GeneratedTopologyMetrics;
  readonly finalTopology: GeneratedTopologyMetrics;
  readonly props: readonly GeneratedProp[];
  readonly palette: GeneratedPalette;
}

export interface GeneratedWorldOptions {
  readonly maxAttempts?: number;
  /** Test hook for exercising candidate rejection and finite retry behavior. */
  readonly acceptCandidate?: (candidate: GeneratedWorld, attempt: number) => boolean;
}

interface RandomSource {
  next(): number;
  int(maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
}

interface MutableCell {
  x: number;
  y: number;
  elevation: number;
  surface: GeneratedSurface;
  walkable: boolean;
}

const DIRECTIONS: readonly Position[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];

const PALETTES: readonly GeneratedPalette[] = [
  { sky: 0x14273b, ground: 0x35614f, groundAlt: 0x4e7b5d, edge: 0x1e3a3d, glow: 0xf2c66d },
  { sky: 0x252446, ground: 0x4f527f, groundAlt: 0x686ca0, edge: 0x302d59, glow: 0xffcf83 },
  { sky: 0x173746, ground: 0x36717a, groundAlt: 0x539391, edge: 0x1d4b5a, glow: 0xa8f0dc },
  { sky: 0x422e3b, ground: 0x85534e, groundAlt: 0xa66c54, edge: 0x573546, glow: 0xffd38c },
];

const SURFACES: readonly GeneratedSurface[] = [
  'meadow',
  'sky',
  'rain',
  'night',
  'snow',
  'cave',
  'crystal',
  'sunset',
];

function positionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

function createRandom(seed: number, attempt: number): RandomSource {
  let value = (
    (seed >>> 0) ^
    Math.imul(attempt + 1, 0x9e3779b9)
  ) >>> 0;

  const next = (): number => {
    value = (Math.imul(value ^ (value >>> 16), 0x21f0aaad) + 0x735a2d97) >>> 0;
    value = (Math.imul(value ^ (value >>> 15), 0x735a2d97) + 0x21f0aaad) >>> 0;
    return ((value ^ (value >>> 15)) >>> 0) / 0x100000000;
  };

  return {
    next,
    int(maxExclusive): number {
      return Math.floor(next() * maxExclusive);
    },
    pick<T>(items: readonly T[]): T {
      return items[Math.floor(next() * items.length)] as T;
    },
  };
}

function createCells(random: RandomSource): MutableCell[][] {
  return Array.from({ length: GENERATED_WORLD_HEIGHT }, (_, y) =>
    Array.from({ length: GENERATED_WORLD_WIDTH }, (_, x) => ({
      x,
      y,
      elevation: 0,
      surface: random.pick(SURFACES),
      walkable: false,
    })),
  );
}

function inside(x: number, y: number): boolean {
  return (
    x >= 0 &&
    x < GENERATED_WORLD_WIDTH &&
    y >= 0 &&
    y < GENERATED_WORLD_HEIGHT
  );
}

function carve(
  cells: MutableCell[][],
  x: number,
  y: number,
  elevation: number,
  random: RandomSource,
): void {
  if (!inside(x, y)) {
    return;
  }

  const cell = cells[y]![x]!;
  cell.walkable = true;
  cell.elevation = elevation;
  if (random.next() < 0.42) {
    cell.surface = random.pick(SURFACES);
  }
}

function carveHorizontal(
  cells: MutableCell[][],
  y: number,
  fromX: number,
  toX: number,
  elevation: number,
  random: RandomSource,
): void {
  const step = fromX <= toX ? 1 : -1;
  for (let x = fromX; ; x += step) {
    carve(cells, x, y, elevation, random);
    if (x === toX) {
      break;
    }
  }
}

function carveVertical(
  cells: MutableCell[][],
  x: number,
  fromY: number,
  toY: number,
  elevation: number,
  random: RandomSource,
): void {
  const step = fromY <= toY ? 1 : -1;
  for (let y = fromY; ; y += step) {
    carve(cells, x, y, elevation, random);
    if (y === toY) {
      break;
    }
  }
}

function addConnector(
  connectors: GeneratedEdge[],
  from: Position,
  to: Position,
  kind: 'stairs' | 'ramp',
): void {
  connectors.push(createTraversalEdge(from, to, kind));
  connectors.push(createTraversalEdge(to, from, kind));
}

function buildBaselineGeometry(
  random: RandomSource,
): {
  readonly cells: MutableCell[][];
  readonly connectors: readonly GeneratedEdge[];
  readonly start: Position;
  readonly goal: Position;
  readonly props: readonly GeneratedProp[];
  readonly palette: GeneratedPalette;
} {
  const cells = createCells(random);
  const connectors: GeneratedEdge[] = [];
  const mainY = 8 + random.int(10);
  const leftX = 2 + random.int(4);
  const rightX = 34 + random.int(4);

  // Start with a guaranteed baseline lane and one guaranteed alternate lane,
  // then vary how many additional lanes join the network. The first alternate
  // is the intentional post-perturbation way around the height barrier; later
  // lanes may be one-sided, making visible-but-inaccessible regions possible.
  carveHorizontal(cells, mainY, leftX, rightX, 0, random);
  const laneYs = [mainY];
  const requestedLaneCount = 2 + random.int(3);
  while (laneYs.length < requestedLaneCount) {
    const previousLane = laneYs[laneYs.length - 1]!;
    const nextLane = previousLane + 4 + random.int(5);
    if (nextLane > 34) {
      break;
    }
    laneYs.push(nextLane);
  }

  for (let laneIndex = 1; laneIndex < laneYs.length; laneIndex += 1) {
    const laneY = laneYs[laneIndex]!;
    const previousLane = laneYs[laneIndex - 1]!;
    carveHorizontal(cells, laneY, leftX, rightX, 0, random);

    const joinsLeft = laneIndex === 1 || random.next() < 0.72;
    const joinsRight = laneIndex === 1 || random.next() < 0.72;
    if (joinsLeft || !joinsRight) {
      carveVertical(cells, leftX, previousLane, laneY, 0, random);
    }
    if (joinsRight || !joinsLeft) {
      carveVertical(cells, rightX, previousLane, laneY, 0, random);
    }
  }

  // Seed-dependent branch count, source lane, direction, and tails create
  // different dead ends and articulation bottlenecks instead of one template
  // with recolored props.
  const branchCount = 1 + random.int(4);
  let firstBranchX = leftX + 3;
  let firstBranchY = mainY;
  let firstBranchLength = 3;
  let firstBranchDirection = -1;
  for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
    const sourceY = random.pick(laneYs);
    const branchX = leftX + 2 + random.int(Math.max(1, rightX - leftX - 3));
    const branchLength = 3 + random.int(5);
    const branchDirection = random.next() < 0.5 ? -1 : 1;
    const branchEndY = sourceY + branchDirection * branchLength;
    carveVertical(cells, branchX, sourceY, branchEndY, 0, random);
    if (random.next() < 0.78) {
      const tailDirection = random.next() < 0.5 ? -1 : 1;
      carveHorizontal(
        cells,
        branchEndY,
        branchX,
        branchX + tailDirection * (1 + random.int(4)),
        0,
        random,
      );
    }

    if (branchIndex === 0) {
      firstBranchX = branchX;
      firstBranchY = sourceY;
      firstBranchLength = branchLength;
      firstBranchDirection = branchDirection;
    }
  }

  // A small elevated island is reachable only over an explicit staircase
  // edge. It gives the renderer real 3D geography without making the main
  // route depend on an unmarked height transition.
  const plateauX = 9 + random.int(12);
  const plateauY = 4 + random.int(5);
  const plateauWidth = 3 + random.int(3);
  const plateauHeight = 3 + random.int(2);
  for (let y = plateauY; y < plateauY + plateauHeight; y += 1) {
    for (let x = plateauX; x < plateauX + plateauWidth; x += 1) {
      carve(cells, x, y, 1, random);
    }
  }
  const stairGround = { x: plateauX - 1, y: plateauY + 1 };
  const stairTop = { x: plateauX, y: plateauY + 1 };
  carve(cells, stairGround.x, stairGround.y, 0, random);
  carveVertical(cells, stairGround.x, mainY, stairGround.y, 0, random);
  addConnector(connectors, stairGround, stairTop, 'stairs');

  // Random pockets/chambers add optional side regions. Some are connected to
  // the route, while others remain visible but inaccessible until a later
  // ability or connector rule exists.
  const pocketCount = 1 + random.int(3);
  let landmarkX = 25;
  let landmarkY = 5;
  for (let pocketIndex = 0; pocketIndex < pocketCount; pocketIndex += 1) {
    const pocketX = 8 + random.int(26);
    const pocketY = 3 + random.int(30);
    const pocketWidth = 2 + random.int(4);
    const pocketHeight = 2 + random.int(4);
    carveHorizontal(cells, pocketY, pocketX, pocketX + pocketWidth, 0, random);
    carveVertical(cells, pocketX, pocketY, pocketY + pocketHeight, 0, random);
    if (random.next() < 0.58) {
      const routeY = random.pick(laneYs);
      carveVertical(cells, pocketX, routeY, pocketY, 0, random);
    }
    if (pocketIndex === 0) {
      landmarkX = pocketX;
      landmarkY = pocketY;
    }
  }

  const props: GeneratedProp[] = [
    {
      id: 'generated-stairs',
      assetKey: 'stairs',
      x: stairTop.x,
      y: stairTop.y,
      elevation: 1,
      foreground: false,
      blocks: false,
    },
    {
      id: 'generated-tree',
      assetKey: random.next() < 0.5 ? 'tree' : 'tree-pine',
      x: firstBranchX,
      y: firstBranchY + firstBranchDirection * Math.min(firstBranchLength, 2),
      elevation: 0,
      foreground: true,
      blocks: false,
    },
    {
      id: 'generated-landmark',
      assetKey: random.next() < 0.5 ? 'rocks' : 'flowers',
      x: landmarkX + 2,
      y: landmarkY,
      elevation: 0,
      foreground: false,
      blocks: false,
    },
  ];

  return {
    cells,
    connectors,
    start: { x: leftX, y: mainY },
    goal: { x: rightX, y: mainY },
    props,
    palette: random.pick(PALETTES),
  };
}

function cloneCells(cells: readonly (readonly GeneratedCell[])[]): MutableCell[][] {
  return cells.map((row) =>
    row.map((cell) => ({
      x: cell.x,
      y: cell.y,
      elevation: cell.elevation,
      surface: cell.surface,
      walkable: cell.walkable,
    })),
  );
}

function freezeCells(cells: readonly (readonly MutableCell[])[]): readonly (readonly GeneratedCell[])[] {
  return cells.map((row) =>
    row.map((cell) => ({
      x: cell.x,
      y: cell.y,
      elevation: cell.elevation,
      surface: cell.surface,
      walkable: cell.walkable,
    })),
  );
}

function cellAt(
  cells: readonly (readonly GeneratedCell[])[],
  position: Position,
): GeneratedCell | undefined {
  return cells[position.y]?.[position.x];
}

function connectorKindAt(
  connectors: readonly GeneratedEdge[],
  from: Position,
  to: Position,
): GeneratedEdge['kind'] | undefined {
  return resolveEdge(connectors, from, to)?.kind;
}

function buildEdges(
  cells: readonly (readonly GeneratedCell[])[],
  connectors: readonly GeneratedEdge[],
): readonly GeneratedEdge[] {
  const edges: GeneratedEdge[] = [];

  for (const row of cells) {
    for (const cell of row) {
      if (!cell.walkable) {
        continue;
      }

      for (const delta of [{ x: 1, y: 0 }, { x: 0, y: 1 }]) {
        const to = { x: cell.x + delta.x, y: cell.y + delta.y };
        const target = cellAt(cells, to);
        if (!target?.walkable) {
          continue;
        }

        const heightDifference = Math.abs(cell.elevation - target.elevation);
        const connectorKind = connectorKindAt(connectors, cell, to);
        const kind =
          heightDifference === 0
            ? 'normal'
            : connectorKind === 'stairs' || connectorKind === 'ramp'
              ? connectorKind
              : undefined;

        if (!kind) {
          continue;
        }

        edges.push(createTraversalEdge(cell, target, kind));
        edges.push(createTraversalEdge(target, cell, kind));
      }
    }
  }

  return edges;
}

function traversableNeighbors(
  cells: readonly (readonly GeneratedCell[])[],
  edges: readonly GeneratedEdge[],
  position: Position,
): Position[] {
  const neighbors: Position[] = [];
  const from = cellAt(cells, position);
  if (!from) {
    return neighbors;
  }

  for (const delta of DIRECTIONS) {
    const toPosition = { x: position.x + delta.x, y: position.y + delta.y };
    const to = cellAt(cells, toPosition);
    const edge = resolveEdge(edges, position, toPosition);
    if (to && edge && canTraverse(from, to, edge, {})) {
      neighbors.push(toPosition);
    }
  }

  return neighbors;
}

export function findGeneratedPath(
  cells: readonly (readonly GeneratedCell[])[],
  edges: readonly GeneratedEdge[],
  start: Position,
  goal: Position,
): readonly Position[] {
  const startCell = cellAt(cells, start);
  const goalCell = cellAt(cells, goal);
  if (!startCell?.walkable || !goalCell?.walkable) {
    return [];
  }

  const queue: Position[] = [{ ...start }];
  const visited = new Set<string>([positionKey(start)]);
  const previous = new Map<string, string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (samePosition(current, goal)) {
      break;
    }

    for (const next of traversableNeighbors(cells, edges, current)) {
      const key = positionKey(next);
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);
      previous.set(key, positionKey(current));
      queue.push(next);
    }
  }

  const goalKey = positionKey(goal);
  if (!visited.has(goalKey)) {
    return [];
  }

  const path: Position[] = [];
  let cursor = goalKey;
  while (cursor !== positionKey(start)) {
    const [x, y] = cursor.split(',').map(Number);
    path.push({ x, y });
    const parent = previous.get(cursor);
    if (!parent) {
      return [];
    }
    cursor = parent;
  }
  path.push({ ...start });
  path.reverse();
  return path;
}

function pathIsTraversable(
  cells: readonly (readonly GeneratedCell[])[],
  edges: readonly GeneratedEdge[],
  path: readonly Position[],
): boolean {
  return path.every((position, index) => {
    if (index === 0) {
      return Boolean(cellAt(cells, position)?.walkable);
    }

    const previous = path[index - 1]!;
    const from = cellAt(cells, previous);
    const to = cellAt(cells, position);
    const edge = resolveEdge(edges, previous, position);
    return Boolean(from && to && edge && canTraverse(from, to, edge, {}));
  });
}

function analyzeTopology(
  cells: readonly (readonly GeneratedCell[])[],
  edges: readonly GeneratedEdge[],
  start: Position,
  goal: Position,
): GeneratedTopologyMetrics {
  const reachable = new Set<string>();
  const queue = [{ ...start }];

  while (queue.length > 0) {
    const position = queue.shift()!;
    const key = positionKey(position);
    if (reachable.has(key)) {
      continue;
    }
    reachable.add(key);
    for (const next of traversableNeighbors(cells, edges, position)) {
      if (!reachable.has(positionKey(next))) {
        queue.push(next);
      }
    }
  }

  const adjacency = new Map<string, Set<string>>();
  for (const key of reachable) {
    adjacency.set(key, new Set<string>());
  }

  for (const edge of edges) {
    const fromKey = positionKey(edge.from);
    const toKey = positionKey(edge.to);
    if (!reachable.has(fromKey) || !reachable.has(toKey)) {
      continue;
    }
    const from = cellAt(cells, edge.from);
    const to = cellAt(cells, edge.to);
    if (!from || !to || !canTraverse(from, to, edge, {})) {
      continue;
    }
    adjacency.get(fromKey)?.add(toKey);
  }

  const undirectedEdges = new Set<string>();
  for (const [from, neighbors] of adjacency) {
    for (const to of neighbors) {
      undirectedEdges.add([from, to].sort().join('|'));
    }
  }

  const discovery = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string>();
  let time = 0;
  let articulationCount = 0;

  const visit = (node: string): void => {
    time += 1;
    discovery.set(node, time);
    low.set(node, time);
    let childCount = 0;
    let isArticulation = false;

    for (const neighbor of adjacency.get(node) ?? []) {
      if (!discovery.has(neighbor)) {
        parent.set(neighbor, node);
        childCount += 1;
        visit(neighbor);
        low.set(node, Math.min(low.get(node)!, low.get(neighbor)!));
        if (
          parent.has(node) &&
          low.get(neighbor)! >= discovery.get(node)!
        ) {
          isArticulation = true;
        }
      } else if (parent.get(node) !== neighbor) {
        low.set(node, Math.min(low.get(node)!, discovery.get(neighbor)!));
      }
    }

    if ((!parent.has(node) && childCount > 1) || isArticulation) {
      articulationCount += 1;
    }
  };

  for (const node of adjacency.keys()) {
    if (!discovery.has(node)) {
      visit(node);
    }
  }

  let deadEndCount = 0;
  for (const [node, neighbors] of adjacency) {
    if (
      neighbors.size === 1 &&
      node !== positionKey(start) &&
      node !== positionKey(goal)
    ) {
      deadEndCount += 1;
    }
  }

  const wallCount = cells.reduce(
    (count, row) => count + row.filter((cell) => !cell.walkable).length,
    0,
  );

  return {
    wallCount,
    reachableCellCount: reachable.size,
    deadEndCount,
    articulationCount,
    cycleRank: Math.max(0, undirectedEdges.size - reachable.size + 1),
  };
}

function barrierPathIndex(path: readonly Position[], random: RandomSource): number {
  const first = Math.max(2, Math.floor(path.length * 0.35));
  const last = Math.min(path.length - 3, Math.floor(path.length * 0.65));
  return first + random.int(Math.max(1, last - first + 1));
}

function buildCandidate(seed: number, attempt: number): GeneratedWorld | undefined {
  const random = createRandom(seed, attempt);
  const baseline = buildBaselineGeometry(random);
  const baselineCells = freezeCells(baseline.cells);
  const baselineEdges = buildEdges(baselineCells, baseline.connectors);
  const baselinePath = findGeneratedPath(
    baselineCells,
    baselineEdges,
    baseline.start,
    baseline.goal,
  );
  const topology = analyzeTopology(
    baselineCells,
    baselineEdges,
    baseline.start,
    baseline.goal,
  );

  if (
    baseline.start.x === baseline.goal.x &&
    baseline.start.y === baseline.goal.y
  ) {
    return undefined;
  }
  if (
    baselinePath.length === 0 ||
    topology.wallCount === 0 ||
    topology.deadEndCount === 0 ||
    topology.articulationCount === 0 ||
    topology.cycleRank === 0
  ) {
    return undefined;
  }

  const pathIndex = barrierPathIndex(baselinePath, random);
  const barrierFrom = baselinePath[pathIndex]!;
  const barrierTo = baselinePath[pathIndex + 1]!;
  const barrierEdge = resolveEdge(baselineEdges, barrierFrom, barrierTo);
  if (!barrierEdge || barrierEdge.kind !== 'normal') {
    return undefined;
  }

  const finalCells = cloneCells(baselineCells);
  const barrierCell = finalCells[barrierTo.y]?.[barrierTo.x];
  if (!barrierCell) {
    return undefined;
  }
  barrierCell.elevation = barrierCell.elevation + 1;
  const frozenFinalCells = freezeCells(finalCells);
  const finalEdges = baselineEdges.map((edge) => {
    const isBarrier =
      (samePosition(edge.from, barrierFrom) && samePosition(edge.to, barrierTo)) ||
      (samePosition(edge.from, barrierTo) && samePosition(edge.to, barrierFrom));
    return isBarrier
      ? createTraversalEdge(edge.from, edge.to, 'height-barrier')
      : createTraversalEdge(edge.from, edge.to, edge.kind);
  });
  const finalPath = findGeneratedPath(
    frozenFinalCells,
    finalEdges,
    baseline.start,
    baseline.goal,
  );
  const baselineLength = baselinePath.length - 1;
  const finalLength = finalPath.length - 1;
  const finalTopology = analyzeTopology(
    frozenFinalCells,
    finalEdges,
    baseline.start,
    baseline.goal,
  );

  if (
    pathIsTraversable(frozenFinalCells, finalEdges, baselinePath) ||
    finalPath.length === 0 ||
    finalLength <= baselineLength
  ) {
    return undefined;
  }

  return deepFreeze({
    seed,
    generationAttempts: attempt + 1,
    width: GENERATED_WORLD_WIDTH,
    height: GENERATED_WORLD_HEIGHT,
    baselineCells,
    baselineEdges,
    cells: frozenFinalCells,
    edges: finalEdges,
    start: { ...baseline.start },
    goal: { ...baseline.goal },
    baselinePath,
    finalPath,
    perturbation: {
      edge: createTraversalEdge(barrierEdge.from, barrierEdge.to, 'height-barrier'),
      barrierCell: { x: barrierTo.x, y: barrierTo.y },
      baselinePathIndex: pathIndex,
      baselineShortestPathLength: baselineLength,
      finalShortestPathLength: finalLength,
    },
    topology,
    finalTopology,
    props: baseline.props,
    palette: baseline.palette,
  });
}

export function generateGeneratedWorld(
  seed: number,
  options: GeneratedWorldOptions = {},
): GeneratedWorld {
  if (!Number.isInteger(seed) || !Number.isFinite(seed)) {
    throw new Error(`Cannot generate world for invalid seed ${seed}`);
  }

  const maxAttempts = options.maxAttempts ?? MAX_GENERATION_ATTEMPTS;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error(`Generated world failed for seed ${seed} after 0 attempts`);
  }

  const attempts = Math.min(maxAttempts, MAX_GENERATION_ATTEMPTS);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = buildCandidate(seed, attempt);
    if (candidate && (options.acceptCandidate?.(candidate, attempt + 1) ?? true)) {
      return candidate;
    }
  }

  throw new Error(
    `Generated world failed for seed ${seed} after ${attempts} attempts`,
  );
}

/** Short alias for level authors and generator experiments. */
export const generate = generateGeneratedWorld;

export function resolveGeneratedEdge(
  world: GeneratedWorld,
  from: Position,
  to: Position,
  baseline = false,
): GeneratedEdge | undefined {
  return resolveEdge(baseline ? world.baselineEdges : world.edges, from, to);
}

export function generatedCellAt(
  world: GeneratedWorld,
  position: Position,
  baseline = false,
): GeneratedCell | undefined {
  return cellAt(baseline ? world.baselineCells : world.cells, position);
}

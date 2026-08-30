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

export type GeneratedTopologyFamily =
  | 'parallel-loop'
  | 'switchback'
  | 'ring'
  | 'hub-and-spoke'
  | 'two-region';

export const GENERATED_TOPOLOGY_FAMILIES: readonly GeneratedTopologyFamily[] = [
  'parallel-loop',
  'switchback',
  'ring',
  'hub-and-spoke',
  'two-region',
];

export type GeneratedTerrainType =
  | 'grass'
  | 'dirt'
  | 'stone'
  | 'snow'
  | 'crystal'
  | 'cliff';

export type GeneratedBiome =
  | 'meadow'
  | 'ridge'
  | 'wetland'
  | 'cavern'
  | 'crystal';

export type GeneratedWeather = 'clear' | 'windy' | 'rainy' | 'snowy';
export type GeneratedLighting = 'day' | 'dusk' | 'night';

export interface GeneratedEnvironment {
  readonly weather: GeneratedWeather;
  readonly lighting: GeneratedLighting;
}

export interface GeneratedRegion {
  readonly id: string;
  readonly cellKeys: readonly string[];
  readonly biome: GeneratedBiome;
  readonly environment?: GeneratedEnvironment;
}

export interface GeneratedPalette {
  readonly sky: number;
  readonly ground: number;
  readonly groundAlt: number;
  readonly edge: number;
  readonly glow: number;
}

export interface GeneratedCell extends TraversalCell {
  readonly terrainType: GeneratedTerrainType;
  readonly regionId: string;
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
  readonly disruption: GeneratedDisruption;
  readonly baselineShortestPathLength: number;
  readonly finalShortestPathLength: number;
}

export interface GeneratedDisruption {
  readonly id: string;
  readonly kind: 'height-region';
  readonly footprint: readonly [Position, Position, Position];
  readonly blockedEdges: readonly GeneratedEdge[];
  /** Index of footprint[0] in baselinePath. */
  readonly baselinePathIndex: number;
}

export interface GeneratedWorld {
  readonly seed: number;
  readonly generationAttempts: number;
  readonly topologyFamily: GeneratedTopologyFamily;
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
  readonly environment: GeneratedEnvironment;
  readonly regions: readonly GeneratedRegion[];
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
  terrainType: GeneratedTerrainType;
  regionId: string;
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

const BIOMES: readonly GeneratedBiome[] = [
  'meadow',
  'ridge',
  'wetland',
  'cavern',
  'crystal',
];

const WEATHER: readonly GeneratedWeather[] = [
  'clear',
  'windy',
  'rainy',
  'snowy',
];

const LIGHTING: readonly GeneratedLighting[] = [
  'day',
  'dusk',
  'night',
];

function positionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

function directedEdgeKey(from: Position, to: Position): string {
  return `${positionKey(from)}>${positionKey(to)}`;
}

export function chooseTopologyFamily(seed: number): GeneratedTopologyFamily {
  const unsignedSeed = seed >>> 0;
  return GENERATED_TOPOLOGY_FAMILIES[unsignedSeed % GENERATED_TOPOLOGY_FAMILIES.length]!;
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
  terrainType: GeneratedTerrainType = elevation > 0
    ? 'stone'
    : random.next() < 0.24
      ? random.pick(['grass', 'dirt'] as const)
      : 'grass',
): void {
  if (!inside(x, y)) {
    return;
  }

  const cell = cells[y]![x]!;
  cell.walkable = true;
  cell.elevation = elevation;
  cell.terrainType = terrainType;
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

interface RegionMeta {
  readonly id: string;
  readonly biome: GeneratedBiome;
  readonly environment?: GeneratedEnvironment;
}

interface CellDraft {
  readonly cells: MutableCell[][];
  readonly regions: readonly RegionMeta[];
  readonly environment: GeneratedEnvironment;
}

interface FamilyGeometry {
  readonly cells: MutableCell[][];
  readonly connectors: GeneratedEdge[];
  readonly start: Position;
  readonly goal: Position;
  readonly branch: Position;
  readonly landmark: Position;
  readonly regions: readonly RegionMeta[];
  readonly environment: GeneratedEnvironment;
  readonly palette: GeneratedPalette;
}

interface BaselineGeometry extends Omit<FamilyGeometry, 'regions'> {
  readonly regions: readonly GeneratedRegion[];
  readonly props: readonly GeneratedProp[];
}

function carveRectangle(
  cells: MutableCell[][],
  left: number,
  top: number,
  right: number,
  bottom: number,
  elevation: number,
  random: RandomSource,
  terrainType: GeneratedTerrainType = 'grass',
): void {
  for (let y = top; y <= bottom; y += 1) {
    carveHorizontal(cells, y, left, right, elevation, random, terrainType);
  }
}

function carveHorizontal(
  cells: MutableCell[][],
  y: number,
  fromX: number,
  toX: number,
  elevation: number,
  random: RandomSource,
  terrainType?: GeneratedTerrainType,
): void {
  const step = fromX <= toX ? 1 : -1;
  for (let x = fromX; ; x += step) {
    carve(cells, x, y, elevation, random, terrainType);
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
  terrainType?: GeneratedTerrainType,
): void {
  const step = fromY <= toY ? 1 : -1;
  for (let y = fromY; ; y += step) {
    carve(cells, x, y, elevation, random, terrainType);
    if (y === toY) {
      break;
    }
  }
}

function createFamilyCells(
  random: RandomSource,
  family: GeneratedTopologyFamily,
): CellDraft {
  const split = 16 + random.int(9);
  const isTwoRegion = family === 'two-region';
  const environment = {
    weather: random.pick(WEATHER),
    lighting: random.pick(LIGHTING),
  } satisfies GeneratedEnvironment;
  const regions: RegionMeta[] = [
    {
      id: isTwoRegion ? 'region-west' : 'region-north',
      biome: random.pick(BIOMES),
      environment: random.next() < 0.55
        ? { weather: random.pick(WEATHER), lighting: random.pick(LIGHTING) }
        : undefined,
    },
    {
      id: isTwoRegion ? 'region-east' : 'region-south',
      biome: random.pick(BIOMES),
      environment: random.next() < 0.55
        ? { weather: random.pick(WEATHER), lighting: random.pick(LIGHTING) }
        : undefined,
    },
  ];

  return {
    cells: Array.from({ length: GENERATED_WORLD_HEIGHT }, (_, y) =>
      Array.from({ length: GENERATED_WORLD_WIDTH }, (_, x) => ({
        x,
        y,
        elevation: 0,
        terrainType: 'cliff' as GeneratedTerrainType,
        regionId: isTwoRegion
          ? x < split ? 'region-west' : 'region-east'
          : y < split ? 'region-north' : 'region-south',
        walkable: false,
      })),
    ),
    regions,
    environment,
  };
}

function addElevatedIsland(
  cells: MutableCell[][],
  connectors: GeneratedEdge[],
  routeY: number,
  random: RandomSource,
): Position {
  const plateauX = 8 + random.int(20);
  const plateauY = 3 + random.int(5);
  const plateauWidth = 3 + random.int(3);
  const plateauHeight = 2 + random.int(3);
  carveRectangle(
    cells,
    plateauX,
    plateauY,
    plateauX + plateauWidth - 1,
    plateauY + plateauHeight - 1,
    1,
    random,
    'stone',
  );
  const stairGround = { x: plateauX - 1, y: plateauY + 1 };
  const stairTop = { x: plateauX, y: plateauY + 1 };
  carve(cells, stairGround.x, stairGround.y, 0, random, 'dirt');
  carveVertical(cells, stairGround.x, routeY, stairGround.y, 0, random, 'dirt');
  addConnector(connectors, stairGround, stairTop, 'stairs');
  return stairTop;
}

function addGuaranteedDeadEnd(cells: MutableCell[][], random: RandomSource): void {
  for (const row of cells) {
    for (const source of row) {
      if (!source.walkable) {
        continue;
      }
      for (const delta of DIRECTIONS) {
        const x = source.x + delta.x;
        const y = source.y + delta.y;
        const candidate = cells[y]?.[x];
        if (!candidate || candidate.walkable || candidate.regionId !== source.regionId) {
          continue;
        }
        const walkableNeighbors = DIRECTIONS.filter(({ x: dx, y: dy }) =>
          cells[y + dy]?.[x + dx]?.walkable === true,
        ).length;
        if (walkableNeighbors === 1) {
          carve(cells, x, y, source.elevation, random, 'dirt');
          return;
        }
      }
    }
  }
}

function buildParallelLoop(random: RandomSource): FamilyGeometry {
  const draft = createFamilyCells(random, 'parallel-loop');
  const connectors: GeneratedEdge[] = [];
  const mainY = 10 + random.int(7);
  const detourY = mainY + 7 + random.int(3);
  const leftX = 3 + random.int(3);
  const rightX = 35 + random.int(3);
  carveHorizontal(draft.cells, mainY, leftX, rightX, 0, random);
  carveHorizontal(draft.cells, detourY, leftX, rightX, 0, random, 'dirt');
  carveVertical(draft.cells, leftX, mainY, detourY, 0, random);
  carveVertical(draft.cells, rightX, mainY, detourY, 0, random);
  const branch = { x: leftX + 7 + random.int(15), y: mainY - 5 };
  carveVertical(draft.cells, branch.x, mainY, branch.y, 0, random);
  const landmark = { x: rightX - 5, y: detourY };
  return {
    ...draft,
    connectors,
    start: { x: leftX, y: mainY },
    goal: { x: rightX, y: mainY },
    branch,
    landmark,
    palette: random.pick(PALETTES),
  };
}

function buildSwitchback(random: RandomSource): FamilyGeometry {
  const draft = createFamilyCells(random, 'switchback');
  const connectors: GeneratedEdge[] = [];
  const start = { x: 3, y: 6 + random.int(3) };
  const goal = { x: 36, y: 21 + random.int(3) };
  const x1 = 10 + random.int(3);
  const x2 = 20 + random.int(4);
  const x3 = 29 + random.int(3);
  const y1 = 11 + random.int(3);
  const y2 = 16 + random.int(3);
  carveHorizontal(draft.cells, start.y, start.x, x1, 0, random);
  carveVertical(draft.cells, x1, start.y, y1, 0, random);
  carveHorizontal(draft.cells, y1, x1, x2, 0, random);
  carveVertical(draft.cells, x2, y1, y2, 0, random);
  carveHorizontal(draft.cells, y2, x2, x3, 0, random);
  carveVertical(draft.cells, x3, y2, goal.y, 0, random);
  carveHorizontal(draft.cells, goal.y, x3, goal.x, 0, random);
  const bypassY = 35;
  carveVertical(draft.cells, start.x, start.y, bypassY, 0, random, 'dirt');
  carveHorizontal(draft.cells, bypassY, start.x, goal.x, 0, random, 'dirt');
  carveVertical(draft.cells, goal.x, bypassY, goal.y, 0, random, 'dirt');
  const branch = { x: x2, y: y1 - 5 };
  carveVertical(draft.cells, x2, y1, branch.y, 0, random);
  const landmark = { x: x3 - 2, y: goal.y };
  return {
    ...draft,
    connectors,
    start,
    goal,
    branch,
    landmark,
    palette: random.pick(PALETTES),
  };
}

function buildRing(random: RandomSource): FamilyGeometry {
  const draft = createFamilyCells(random, 'ring');
  const connectors: GeneratedEdge[] = [];
  const left = 6 + random.int(3);
  const right = 32 + random.int(3);
  const top = 7 + random.int(2);
  const bottom = 30 + random.int(2);
  const middle = Math.floor((top + bottom) / 2);
  carveHorizontal(draft.cells, top, left, right, 0, random, 'stone');
  carveHorizontal(draft.cells, bottom, left, right, 0, random, 'dirt');
  carveVertical(draft.cells, left, top, bottom, 0, random);
  carveVertical(draft.cells, right, top, bottom, 0, random);
  const branch = { x: left + 8 + random.int(10), y: 3 };
  carveVertical(draft.cells, branch.x, top, branch.y, 0, random);
  const landmark = { x: right - 2, y: bottom };
  return {
    ...draft,
    connectors,
    start: { x: left, y: middle },
    goal: { x: right, y: middle },
    branch,
    landmark,
    palette: random.pick(PALETTES),
  };
}

function buildHubAndSpoke(random: RandomSource): FamilyGeometry {
  const draft = createFamilyCells(random, 'hub-and-spoke');
  const connectors: GeneratedEdge[] = [];
  const hubLeft = 17;
  const hubRight = 23;
  const hubTop = 14;
  const hubBottom = 22;
  const start = { x: 3, y: 18 };
  const goal = { x: 36, y: 18 };
  carveRectangle(draft.cells, hubLeft, hubTop, hubRight, hubBottom, 0, random);
  carveHorizontal(draft.cells, start.y, start.x, hubLeft, 0, random);
  carveHorizontal(draft.cells, goal.y, hubRight, goal.x, 0, random);
  const bypassY = 31;
  carveVertical(draft.cells, start.x, start.y, bypassY, 0, random, 'dirt');
  carveHorizontal(draft.cells, bypassY, start.x, goal.x, 0, random, 'dirt');
  carveVertical(draft.cells, goal.x, bypassY, goal.y, 0, random, 'dirt');
  const branch = { x: 20, y: 7 };
  carveVertical(draft.cells, 20, hubTop, branch.y, 0, random);
  carveHorizontal(draft.cells, 17, 17, 11, 0, random);
  carveHorizontal(draft.cells, 19, 23, 29, 0, random);
  carveVertical(draft.cells, 20, hubBottom, 27, 0, random);
  const landmark = { x: hubRight - 1, y: hubBottom - 1 };
  return {
    ...draft,
    connectors,
    start,
    goal,
    branch,
    landmark,
    palette: random.pick(PALETTES),
  };
}

function buildTwoRegion(random: RandomSource): FamilyGeometry {
  const draft = createFamilyCells(random, 'two-region');
  const connectors: GeneratedEdge[] = [];
  const start = { x: 8, y: 20 };
  const goal = { x: 31, y: 20 };
  carveRectangle(draft.cells, 3, 10, 15, 30, 0, random, 'grass');
  carveRectangle(draft.cells, 24, 10, 36, 30, 0, random, 'stone');
  const upperBridgeY = 13;
  const lowerBridgeY = 28;
  carveHorizontal(draft.cells, upperBridgeY, 15, 24, 0, random, 'stone');
  carveHorizontal(draft.cells, lowerBridgeY, 15, 24, 0, random, 'dirt');
  const branch = { x: 10, y: 5 };
  carveVertical(draft.cells, branch.x, 10, branch.y, 0, random);
  const landmark = { x: 29, y: 24 };
  return {
    ...draft,
    connectors,
    start,
    goal,
    branch,
    landmark,
    palette: random.pick(PALETTES),
  };
}

function buildBaselineGeometry(
  random: RandomSource,
  family: GeneratedTopologyFamily,
): BaselineGeometry {
  const geometry = family === 'parallel-loop'
    ? buildParallelLoop(random)
    : family === 'switchback'
      ? buildSwitchback(random)
      : family === 'ring'
        ? buildRing(random)
        : family === 'hub-and-spoke'
          ? buildHubAndSpoke(random)
          : buildTwoRegion(random);
  const stairTop = addElevatedIsland(
    geometry.cells,
    geometry.connectors,
    geometry.start.y,
    random,
  );
  addGuaranteedDeadEnd(geometry.cells, random);
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
      x: geometry.branch.x,
      y: geometry.branch.y,
      elevation: 0,
      foreground: true,
      blocks: false,
    },
    {
      id: 'generated-landmark',
      assetKey: random.next() < 0.5 ? 'rocks' : 'flowers',
      x: geometry.landmark.x,
      y: geometry.landmark.y,
      elevation: 0,
      foreground: false,
      blocks: false,
    },
  ];

  const regions: GeneratedRegion[] = geometry.regions.map((region) => ({
    ...region,
    cellKeys: geometry.cells.flatMap((row) =>
      row.filter((cell) => cell.regionId === region.id).map(positionKey),
    ),
  }));

  return {
    ...geometry,
    regions,
    props,
  };
}

function cloneCells(cells: readonly (readonly GeneratedCell[])[]): MutableCell[][] {
  return cells.map((row) =>
    row.map((cell) => ({
      x: cell.x,
      y: cell.y,
      elevation: cell.elevation,
      terrainType: cell.terrainType,
      regionId: cell.regionId,
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
      terrainType: cell.terrainType,
      regionId: cell.regionId,
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

function indexGeneratedEdges(
  edges: readonly GeneratedEdge[],
): Map<string, GeneratedEdge> {
  const index = new Map<string, GeneratedEdge>();
  for (const edge of edges) {
    const key = directedEdgeKey(edge.from, edge.to);
    if (!index.has(key)) {
      index.set(key, edge);
    }
  }
  return index;
}

function traversableNeighbors(
  cells: readonly (readonly GeneratedCell[])[],
  edgeIndex: ReadonlyMap<string, GeneratedEdge>,
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
    const edge = edgeIndex.get(directedEdgeKey(position, toPosition));
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
  const edgeIndex = indexGeneratedEdges(edges);
  const visited = new Set<string>([positionKey(start)]);
  const previous = new Map<string, string>();

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const current = queue[queueIndex]!;
    if (samePosition(current, goal)) {
      break;
    }

    for (const next of traversableNeighbors(cells, edgeIndex, current)) {
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
  const edgeIndex = indexGeneratedEdges(edges);

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const position = queue[queueIndex]!;
    const key = positionKey(position);
    if (reachable.has(key)) {
      continue;
    }
    reachable.add(key);
    for (const next of traversableNeighbors(cells, edgeIndex, position)) {
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

function createUndirectedAdjacency(
  cells: readonly (readonly GeneratedCell[])[],
  edges: readonly GeneratedEdge[],
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const row of cells) {
    for (const cell of row) {
      if (cell.walkable) {
        adjacency.set(positionKey(cell), new Set<string>());
      }
    }
  }

  for (const edge of edges) {
    const from = cellAt(cells, edge.from);
    const to = cellAt(cells, edge.to);
    if (!from || !to || !canTraverse(from, to, edge, {})) {
      continue;
    }
    const fromKey = positionKey(edge.from);
    const toKey = positionKey(edge.to);
    adjacency.get(fromKey)?.add(toKey);
    adjacency.get(toKey)?.add(fromKey);
  }
  return adjacency;
}

function countDirectionChanges(path: readonly Position[]): number {
  let changes = 0;
  let previous: string | undefined;
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1]!;
    const to = path[index]!;
    const direction = `${Math.sign(to.x - from.x)},${Math.sign(to.y - from.y)}`;
    if (previous && direction !== previous) {
      changes += 1;
    }
    previous = direction;
  }
  return changes;
}

function countHorizontalCorridors(
  cells: readonly (readonly GeneratedCell[])[],
  edges: readonly GeneratedEdge[],
  start: Position,
  goal: Position,
): number {
  const left = Math.min(start.x, goal.x);
  const right = Math.max(start.x, goal.x);
  let count = 0;
  for (let y = 1; y < GENERATED_WORLD_HEIGHT - 1; y += 1) {
    let complete = true;
    for (let x = left; x <= right; x += 1) {
      const cell = cellAt(cells, { x, y });
      if (!cell?.walkable || cell.elevation !== 0) {
        complete = false;
        break;
      }
      if (x < right) {
        const next = cellAt(cells, { x: x + 1, y });
        const edge = resolveEdge(edges, { x, y }, { x: x + 1, y });
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

function countInterRegionCorridors(
  cells: readonly (readonly GeneratedCell[])[],
  edges: readonly GeneratedEdge[],
): number {
  const crossings = new Set<string>();
  for (const edge of edges) {
    const from = cellAt(cells, edge.from);
    const to = cellAt(cells, edge.to);
    if (!from || !to || from.regionId === to.regionId || !canTraverse(from, to, edge, {})) {
      continue;
    }
    crossings.add([positionKey(edge.from), positionKey(edge.to)].sort().join('|'));
  }
  return crossings.size;
}

function hasAlternativeRoute(
  cells: readonly (readonly GeneratedCell[])[],
  edges: readonly GeneratedEdge[],
  start: Position,
  goal: Position,
  path: readonly Position[],
): boolean {
  if (path.length < 3) {
    return false;
  }
  const middle = Math.floor((path.length - 1) / 2);
  const from = path[middle]!;
  const to = path[middle + 1]!;
  const alternateEdges = edges.filter(
    (edge) => !(
      (samePosition(edge.from, from) && samePosition(edge.to, to)) ||
      (samePosition(edge.from, to) && samePosition(edge.to, from))
    ),
  );
  return findGeneratedPath(cells, alternateEdges, start, goal).length > 0;
}

/** Structural acceptance predicate; the family is not just metadata. */
export function isGeneratedTopologyFamily(
  family: GeneratedTopologyFamily,
  cells: readonly (readonly GeneratedCell[])[],
  edges: readonly GeneratedEdge[],
  start: Position,
  goal: Position,
  path: readonly Position[],
  topology: GeneratedTopologyMetrics,
): boolean {
  switch (family) {
    case 'parallel-loop':
      return countHorizontalCorridors(cells, edges, start, goal) >= 2;
    case 'switchback':
      return countDirectionChanges(path) >= 2;
    case 'ring':
      return topology.cycleRank > 0 && hasAlternativeRoute(cells, edges, start, goal, path);
    case 'hub-and-spoke': {
      const adjacency = createUndirectedAdjacency(cells, edges);
      const maxDegree = Math.max(0, ...Array.from(adjacency.values(), (neighbors) => neighbors.size));
      return maxDegree >= 3 && topology.deadEndCount > 0;
    }
    case 'two-region':
      return countInterRegionCorridors(cells, edges) === 2;
  }
}

function disruptionPathIndex(path: readonly Position[], random: RandomSource): number {
  const first = Math.max(2, Math.floor(path.length * 0.35));
  const last = Math.min(path.length - 3, Math.floor(path.length * 0.65));
  return first + random.int(Math.max(1, last - first + 1));
}

function createDisruptionFootprint(
  cells: readonly (readonly GeneratedCell[])[],
  path: readonly Position[],
  start: Position,
  goal: Position,
  random: RandomSource,
): { readonly footprint: readonly [Position, Position, Position]; readonly baselinePathIndex: number } | undefined {
  if (path.length < 5) {
    return undefined;
  }

  const preferred = disruptionPathIndex(path, random);
  const candidates = Array.from({ length: path.length - 2 }, (_, offset) =>
    (preferred + offset) % (path.length - 2),
  );
  for (const index of candidates) {
    const footprint = [path[index]!, path[index + 1]!, path[index + 2]!] as const;
    const valid = footprint.every((position) => {
      const cell = cellAt(cells, position);
      return (
        position.x > 0 &&
        position.x < GENERATED_WORLD_WIDTH - 1 &&
        position.y > 0 &&
        position.y < GENERATED_WORLD_HEIGHT - 1 &&
        !samePosition(position, start) &&
        !samePosition(position, goal) &&
        cell?.walkable === true
      );
    });
    const sameElevation = footprint.every((position) =>
      cellAt(cells, position)?.elevation === cellAt(cells, footprint[0]!)?.elevation,
    );
    const connected =
      Math.abs(footprint[0]!.x - footprint[1]!.x) + Math.abs(footprint[0]!.y - footprint[1]!.y) === 1 &&
      Math.abs(footprint[1]!.x - footprint[2]!.x) + Math.abs(footprint[1]!.y - footprint[2]!.y) === 1;
    if (valid && sameElevation && connected) {
      return { footprint, baselinePathIndex: index };
    }
  }
  return undefined;
}

function buildCandidate(
  seed: number,
  attempt: number,
  family: GeneratedTopologyFamily,
): GeneratedWorld | undefined {
  const random = createRandom(seed, attempt);
  const baseline = buildBaselineGeometry(random, family);
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
    topology.cycleRank === 0 ||
    !isGeneratedTopologyFamily(
      family,
      baselineCells,
      baselineEdges,
      baseline.start,
      baseline.goal,
      baselinePath,
      topology,
    )
  ) {
    return undefined;
  }

  const selectedDisruption = createDisruptionFootprint(
    baselineCells,
    baselinePath,
    baseline.start,
    baseline.goal,
    random,
  );
  if (!selectedDisruption) {
    return undefined;
  }

  const footprintKeys = new Set(selectedDisruption.footprint.map(positionKey));
  const finalCells = cloneCells(baselineCells);
  for (const position of selectedDisruption.footprint) {
    const cell = finalCells[position.y]?.[position.x];
    if (cell) {
      cell.elevation += 1;
      cell.terrainType = 'cliff';
    }
  }
  const frozenFinalCells = freezeCells(finalCells);
  const blockedEdges: GeneratedEdge[] = [];
  const blockedEdgeKeys = new Set<string>();
  const finalEdges = baselineEdges.map((edge) => {
    const fromInFootprint = footprintKeys.has(positionKey(edge.from));
    const toInFootprint = footprintKeys.has(positionKey(edge.to));
    const crossesFootprintBoundary = fromInFootprint !== toInFootprint;
    const finalEdge = crossesFootprintBoundary
      ? createTraversalEdge(edge.from, edge.to, 'height-barrier')
      : createTraversalEdge(edge.from, edge.to, edge.kind);
    const edgeKey = `${positionKey(edge.from)}>${positionKey(edge.to)}`;
    if (crossesFootprintBoundary && !blockedEdgeKeys.has(edgeKey)) {
      blockedEdges.push(finalEdge);
      blockedEdgeKeys.add(edgeKey);
    }
    return finalEdge;
  });
  if (blockedEdges.length === 0) {
    return undefined;
  }
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
    finalLength <= baselineLength ||
    finalPath.some((position) => footprintKeys.has(positionKey(position)))
  ) {
    return undefined;
  }

  return deepFreeze({
    seed,
    generationAttempts: attempt + 1,
    topologyFamily: family,
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
      disruption: {
        id: `height-region-${seed >>> 0}-${attempt + 1}`,
        kind: 'height-region',
        footprint: selectedDisruption.footprint.map((position) => ({ ...position })) as unknown as readonly [Position, Position, Position],
        blockedEdges,
        baselinePathIndex: selectedDisruption.baselinePathIndex,
      },
      baselineShortestPathLength: baselineLength,
      finalShortestPathLength: finalLength,
    },
    topology,
    finalTopology,
    environment: baseline.environment,
    regions: baseline.regions,
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
  // The family is a property of the seed, not of a retry. Retries may vary
  // geometry, but they must never silently change the topology grammar.
  const topologyFamily = chooseTopologyFamily(seed);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = buildCandidate(seed, attempt, topologyFamily);
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

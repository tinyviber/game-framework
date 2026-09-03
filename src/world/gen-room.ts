import {
  cardinalNeighbors,
  cellAt,
  isCellTraversable,
  positionKey,
  type Cell,
  type GroundType,
  type ObstacleType,
  type Position,
} from './grid';
import { reachablePositions, validateRoom } from './analyze';
import {
  DEFAULT_ROOM_SIZE,
  type Room,
  type RoomGenerationConfig,
} from './room';

interface MutableCell {
  ground: GroundType;
  obstacle: ObstacleType;
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(
  random: () => number,
  min: number,
  maxInclusive: number,
): number {
  return min + Math.floor(random() * (maxInclusive - min + 1));
}

function choose<T>(random: () => number, values: readonly T[]): T {
  return values[randInt(random, 0, values.length - 1)]!;
}

function isInterior(
  width: number,
  height: number,
  position: Position,
): boolean {
  return (
    position.x > 0 &&
    position.y > 0 &&
    position.x < width - 1 &&
    position.y < height - 1
  );
}

function paintPatch(
  cells: MutableCell[][],
  random: () => number,
  ground: GroundType,
  targetSize: number,
): void {
  const height = cells.length;
  const width = cells[0]?.length ?? 0;
  if (width < 3 || height < 3) {
    return;
  }

  const start = {
    x: randInt(random, 1, width - 2),
    y: randInt(random, 1, height - 2),
  };
  const frontier: Position[] = [start];
  const seen = new Set<string>();

  while (frontier.length > 0 && seen.size < targetSize) {
    const index = randInt(random, 0, frontier.length - 1);
    const current = frontier.splice(index, 1)[0]!;
    const key = positionKey(current);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    const cell = cells[current.y]?.[current.x];
    if (!cell) {
      continue;
    }

    cell.ground = ground;

    for (const neighbor of cardinalNeighbors(width, height, current)) {
      if (
        isInterior(width, height, neighbor) &&
        !seen.has(positionKey(neighbor)) &&
        random() < 0.78
      ) {
        frontier.push(neighbor);
      }
    }
  }
}

function paintObstacleCluster(
  cells: MutableCell[][],
  random: () => number,
  obstacle: Exclude<ObstacleType, null>,
  targetSize: number,
  protectedKeys: ReadonlySet<string>,
): void {
  const height = cells.length;
  const width = cells[0]?.length ?? 0;
  if (width < 3 || height < 3) {
    return;
  }

  const start = {
    x: randInt(random, 1, width - 2),
    y: randInt(random, 1, height - 2),
  };
  const frontier: Position[] = [start];
  const seen = new Set<string>();

  while (frontier.length > 0 && seen.size < targetSize) {
    const index = randInt(random, 0, frontier.length - 1);
    const current = frontier.splice(index, 1)[0]!;
    const key = positionKey(current);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    if (!protectedKeys.has(key)) {
      const cell = cells[current.y]?.[current.x];
      if (cell && cell.ground !== 'water') {
        cell.obstacle = obstacle;
      }
    }

    for (const neighbor of cardinalNeighbors(width, height, current)) {
      if (
        isInterior(width, height, neighbor) &&
        !seen.has(positionKey(neighbor)) &&
        random() < 0.72
      ) {
        frontier.push(neighbor);
      }
    }
  }
}

function makeProtectedArea(
  width: number,
  height: number,
  spawn: Position,
): Set<string> {
  const protectedKeys = new Set<string>();

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const position = { x: spawn.x + dx, y: spawn.y + dy };
      if (isInterior(width, height, position)) {
        protectedKeys.add(positionKey(position));
      }
    }
  }

  return protectedKeys;
}

function freezeRoom(room: {
  seed: number;
  width: number;
  height: number;
  cells: Cell[][];
  spawn: Position;
  goal: Position;
}): Room {
  const cells = room.cells.map((row) =>
    Object.freeze(row.map((cell) => Object.freeze({ ...cell }))),
  );

  return Object.freeze({
    seed: room.seed,
    width: room.width,
    height: room.height,
    cells: Object.freeze(cells),
    spawn: Object.freeze({ ...room.spawn }),
    goal: Object.freeze({ ...room.goal }),
  });
}

function asRoom(
  seed: number,
  cells: MutableCell[][],
  spawn: Position,
  goal: Position,
): Room {
  return freezeRoom({
    seed,
    width: cells[0]?.length ?? 0,
    height: cells.length,
    cells,
    spawn,
    goal,
  });
}

function keepSpawnComponent(
  seed: number,
  cells: MutableCell[][],
  spawn: Position,
): void {
  const provisional = asRoom(seed, cells, spawn, spawn);
  const reachable = new Set(
    reachablePositions(provisional).map(positionKey),
  );

  for (let y = 0; y < provisional.height; y += 1) {
    for (let x = 0; x < provisional.width; x += 1) {
      const position = { x, y };
      const cell = cells[y]?.[x];

      if (
        cell &&
        isCellTraversable(cellAt(provisional.cells, position)) &&
        !reachable.has(positionKey(position))
      ) {
        cell.ground = 'water';
        cell.obstacle = null;
      }
    }
  }
}

function farthestReachable(
  room: Room,
  spawn: Position,
): Position {
  const reachable = reachablePositions(room, spawn);

  return reachable.reduce((best, candidate) => {
    const bestDistance =
      Math.abs(best.x - spawn.x) + Math.abs(best.y - spawn.y);
    const candidateDistance =
      Math.abs(candidate.x - spawn.x) + Math.abs(candidate.y - spawn.y);

    return candidateDistance > bestDistance ? candidate : best;
  }, spawn);
}

export function genRoom(
  seed: number,
  config: RoomGenerationConfig = {},
): Room {
  const width = Math.max(8, config.width ?? DEFAULT_ROOM_SIZE);
  const height = Math.max(8, config.height ?? DEFAULT_ROOM_SIZE);
  const random = createRandom(seed);
  const cells: MutableCell[][] = Array.from(
    { length: height },
    () => Array.from(
      { length: width },
      (): MutableCell => ({ ground: 'grass', obstacle: null }),
    ),
  );

  for (let x = 0; x < width; x += 1) {
    cells[0]![x]!.obstacle = 'wall';
    cells[height - 1]![x]!.obstacle = 'wall';
  }
  for (let y = 0; y < height; y += 1) {
    cells[y]![0]!.obstacle = 'wall';
    cells[y]![width - 1]!.obstacle = 'wall';
  }

  const spawn = {
    x: randInt(random, 2, width - 3),
    y: randInt(random, 2, height - 3),
  };
  const protectedKeys = makeProtectedArea(width, height, spawn);

  const groundPatchCount = randInt(random, 3, 7);
  for (let index = 0; index < groundPatchCount; index += 1) {
    paintPatch(
      cells,
      random,
      choose(random, ['dirt', 'stone'] as const),
      randInt(random, 12, 55),
    );
  }

  const waterPatchCount = randInt(random, 1, 3);
  for (let index = 0; index < waterPatchCount; index += 1) {
    paintPatch(cells, random, 'water', randInt(random, 8, 26));
  }

  for (const key of protectedKeys) {
    const [xText, yText] = key.split(',');
    const cell = cells[Number(yText)]?.[Number(xText)];
    if (cell) {
      cell.ground = 'grass';
      cell.obstacle = null;
    }
  }

  const obstacleClusterCount = randInt(random, 4, 9);
  for (let index = 0; index < obstacleClusterCount; index += 1) {
    paintObstacleCluster(
      cells,
      random,
      choose(random, ['tree', 'rock'] as const),
      randInt(random, 4, 18),
      protectedKeys,
    );
  }

  keepSpawnComponent(seed, cells, spawn);

  const provisional = asRoom(seed, cells, spawn, spawn);
  const goal = farthestReachable(provisional, spawn);
  const room = asRoom(seed, cells, spawn, goal);
  const issues = validateRoom(room);

  if (issues.length > 0) {
    throw new Error(
      `Generated invalid room for seed ${seed}: ${issues.join('; ')}`,
    );
  }

  return room;
}

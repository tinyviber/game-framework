import {
  cardinalNeighbors,
  cellAt,
  isCellTraversable,
  positionKey,
  type Position,
} from './grid';
import type { Room } from './room';

export function reachablePositions(
  room: Room,
  start: Position = room.spawn,
): Position[] {
  if (!isCellTraversable(cellAt(room.cells, start))) {
    return [];
  }

  const queue: Position[] = [start];
  const visited = new Set<string>([positionKey(start)]);
  const result: Position[] = [];

  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    result.push(current);

    for (const neighbor of cardinalNeighbors(
      room.width,
      room.height,
      current,
    )) {
      const key = positionKey(neighbor);
      if (
        visited.has(key) ||
        !isCellTraversable(cellAt(room.cells, neighbor))
      ) {
        continue;
      }

      visited.add(key);
      queue.push(neighbor);
    }
  }

  return result;
}

export function shortestPath(
  room: Room,
  start: Position,
  goal: Position,
): Position[] | null {
  if (
    !isCellTraversable(cellAt(room.cells, start)) ||
    !isCellTraversable(cellAt(room.cells, goal))
  ) {
    return null;
  }

  const queue: Position[] = [start];
  const previous = new Map<string, Position | null>([
    [positionKey(start), null],
  ]);

  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    if (current.x === goal.x && current.y === goal.y) {
      const path: Position[] = [];
      let cursor: Position | null = current;

      while (cursor) {
        path.push(cursor);
        cursor = previous.get(positionKey(cursor)) ?? null;
      }

      return path.reverse();
    }

    for (const neighbor of cardinalNeighbors(
      room.width,
      room.height,
      current,
    )) {
      const key = positionKey(neighbor);
      if (
        previous.has(key) ||
        !isCellTraversable(cellAt(room.cells, neighbor))
      ) {
        continue;
      }

      previous.set(key, current);
      queue.push(neighbor);
    }
  }

  return null;
}

export function validateRoom(room: Room): string[] {
  const issues: string[] = [];

  if (
    room.width <= 0 ||
    room.height <= 0 ||
    room.cells.length !== room.height ||
    room.cells.some((row) => row.length !== room.width)
  ) {
    issues.push('room dimensions do not match cell grid');
    return issues;
  }

  if (!isCellTraversable(cellAt(room.cells, room.spawn))) {
    issues.push('spawn must be traversable');
  }

  if (!isCellTraversable(cellAt(room.cells, room.goal))) {
    issues.push('goal must be traversable');
  }

  if (!shortestPath(room, room.spawn, room.goal)) {
    issues.push('goal must be reachable from spawn');
  }

  const reachable = new Set(
    reachablePositions(room).map(positionKey),
  );

  for (let y = 0; y < room.height; y += 1) {
    for (let x = 0; x < room.width; x += 1) {
      const position = { x, y };
      if (
        isCellTraversable(cellAt(room.cells, position)) &&
        !reachable.has(positionKey(position))
      ) {
        issues.push(`traversable cell ${x},${y} is disconnected`);
        return issues;
      }
    }
  }

  return issues;
}

export interface Position {
  readonly x: number;
  readonly y: number;
}

export type GroundType = 'grass' | 'dirt' | 'stone' | 'water';
export type ObstacleType = 'tree' | 'rock' | 'wall' | null;

export interface Cell {
  readonly ground: GroundType;
  readonly obstacle: ObstacleType;
}

export type Grid = readonly (readonly Cell[])[];

export const CARDINAL_DIRECTIONS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
] as const;

export function positionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

export function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

export function inBounds(
  width: number,
  height: number,
  position: Position,
): boolean {
  return (
    position.x >= 0 &&
    position.y >= 0 &&
    position.x < width &&
    position.y < height
  );
}

export function cellAt(
  grid: Grid,
  position: Position,
): Cell | undefined {
  return grid[position.y]?.[position.x];
}

export function isCellTraversable(cell: Cell | undefined): boolean {
  return Boolean(
    cell &&
    cell.ground !== 'water' &&
    cell.obstacle === null,
  );
}

export function cardinalNeighbors(
  width: number,
  height: number,
  position: Position,
): Position[] {
  return CARDINAL_DIRECTIONS
    .map((delta) => ({
      x: position.x + delta.x,
      y: position.y + delta.y,
    }))
    .filter((candidate) => inBounds(width, height, candidate));
}

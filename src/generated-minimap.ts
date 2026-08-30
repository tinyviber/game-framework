export interface GeneratedMinimapPosition {
  readonly x: number;
  readonly y: number;
}

export interface GeneratedMinimapSourceCell {
  readonly elevation: number;
  readonly walkable: boolean;
}

export interface GeneratedMinimapInput {
  readonly cells: readonly (readonly GeneratedMinimapSourceCell[])[];
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly start: GeneratedMinimapPosition;
  readonly goal: GeneratedMinimapPosition;
  readonly disruption: readonly GeneratedMinimapPosition[];
  readonly columns: number;
  readonly rows: number;
}

export interface GeneratedMinimapTile {
  readonly x: number;
  readonly y: number;
  readonly walkable: boolean;
  readonly elevated: boolean;
  readonly start: boolean;
  readonly goal: boolean;
  readonly disrupted: boolean;
}

export interface GeneratedMinimap {
  readonly columns: number;
  readonly rows: number;
  readonly tiles: readonly GeneratedMinimapTile[];
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function positionKey(position: GeneratedMinimapPosition): string {
  return `${position.x},${position.y}`;
}

function clamp(value: number, maxExclusive: number): number {
  return Math.max(0, Math.min(maxExclusive - 1, value));
}

export function projectGridCell(
  position: GeneratedMinimapPosition,
  sourceWidth: number,
  sourceHeight: number,
  targetColumns: number,
  targetRows: number,
): GeneratedMinimapPosition {
  assertPositiveInteger(sourceWidth, 'sourceWidth');
  assertPositiveInteger(sourceHeight, 'sourceHeight');
  assertPositiveInteger(targetColumns, 'targetColumns');
  assertPositiveInteger(targetRows, 'targetRows');
  return {
    x: clamp(Math.floor(position.x * targetColumns / sourceWidth), targetColumns),
    y: clamp(Math.floor(position.y * targetRows / sourceHeight), targetRows),
  };
}

export function projectGeneratedMinimap(input: GeneratedMinimapInput): GeneratedMinimap {
  const {
    cells,
    sourceWidth,
    sourceHeight,
    start,
    goal,
    disruption,
    columns,
    rows,
  } = input;
  assertPositiveInteger(sourceWidth, 'sourceWidth');
  assertPositiveInteger(sourceHeight, 'sourceHeight');
  assertPositiveInteger(columns, 'columns');
  assertPositiveInteger(rows, 'rows');
  if (cells.length !== sourceHeight || cells.some((row) => row.length !== sourceWidth)) {
    throw new Error('cells dimensions must match source dimensions');
  }

  const startTile = projectGridCell(start, sourceWidth, sourceHeight, columns, rows);
  const goalTile = projectGridCell(goal, sourceWidth, sourceHeight, columns, rows);
  const disruptedTiles = new Set(
    disruption.map((position) =>
      positionKey(projectGridCell(position, sourceWidth, sourceHeight, columns, rows)),
    ),
  );
  const tiles: GeneratedMinimapTile[] = [];

  for (let y = 0; y < rows; y += 1) {
    const sourceTop = Math.floor(y * sourceHeight / rows);
    const sourceBottom = Math.floor((y + 1) * sourceHeight / rows) - 1;
    for (let x = 0; x < columns; x += 1) {
      const sourceLeft = Math.floor(x * sourceWidth / columns);
      const sourceRight = Math.floor((x + 1) * sourceWidth / columns) - 1;
      let walkable = false;
      let elevated = false;
      for (let sourceY = sourceTop; sourceY <= sourceBottom; sourceY += 1) {
        for (let sourceX = sourceLeft; sourceX <= sourceRight; sourceX += 1) {
          const cell = cells[sourceY]![sourceX]!;
          walkable ||= cell.walkable;
          elevated ||= cell.elevation > 0;
        }
      }
      const tile = { x, y };
      tiles.push({
        ...tile,
        walkable,
        elevated,
        start: startTile.x === x && startTile.y === y,
        goal: goalTile.x === x && goalTile.y === y,
        disrupted: disruptedTiles.has(positionKey(tile)),
      });
    }
  }

  return { columns, rows, tiles };
}

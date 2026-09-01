import type {
  Bounds,
  ObjectDefinition,
  ObjectId,
  Position,
} from './types';

export interface SpatialIndex {
  /**
   * Ids of definition-positioned objects (static objects and mutable
   * objects at their definition position) occupying the given cell.
   * Objects whose runtime position can diverge (for example NPCs)
   * must be checked against live state by gameplay code, not here.
   */
  readonly objectsAt: (position: Position) => readonly ObjectId[];
}

function positionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

export function createSpatialIndex(
  objects: readonly ObjectDefinition[],
): SpatialIndex {
  const cells = new Map<string, ObjectId[]>();

  for (const object of objects) {
    const key = positionKey(object.position);
    const existing = cells.get(key);

    if (existing) {
      existing.push(object.id);
    } else {
      cells.set(key, [object.id]);
    }
  }

  return {
    objectsAt: (position) => cells.get(positionKey(position)) ?? [],
  };
}

export function movementIsLegal(
  bounds: Bounds | undefined,
  target: Position,
): boolean {
  if (!bounds) {
    return true;
  }

  return (
    target.x >= bounds.minX &&
    target.x <= bounds.maxX &&
    target.y >= bounds.minY &&
    target.y <= bounds.maxY
  );
}

import {
  clonePlainData,
  deepFreeze,
  type Position,
  type RoomId,
} from './types';
import type { TraversalCell } from './traversal';

export type AuthoredDirection = 'up' | 'down' | 'left' | 'right';

export type AuthoredSurface =
  | 'grass'
  | 'dirt'
  | 'stone'
  | 'sand'
  | 'snow'
  | 'water';

export type AuthoredObstacle = 'forest' | 'rock' | 'building' | null;

export interface AuthoredCell {
  readonly surface: AuthoredSurface;
  readonly elevation: number;
  readonly obstacle: AuthoredObstacle;
  readonly walkable: boolean;
}

export interface AuthoredExit {
  readonly id: string;
  readonly direction: AuthoredDirection;
  readonly position: Position;
  readonly targetRoomId: RoomId;
  readonly targetEntry: Position;
  readonly reciprocalExitId?: string;
}

export interface AuthoredRoom {
  readonly id: RoomId;
  readonly title: string;
  readonly description: string;
  readonly width: number;
  readonly height: number;
  /** Human-readable rows; the legend resolves each character to semantics. */
  readonly grid: readonly string[];
  readonly legend: Readonly<Record<string, AuthoredCell>>;
  readonly spawn: Position;
  readonly exits: readonly AuthoredExit[];
}

export interface AuthoredWorld {
  readonly startRoomId: RoomId;
  readonly startPosition: Position;
  readonly rooms: readonly AuthoredRoom[];
}

export interface AuthoredSemanticCell extends TraversalCell {
  readonly surface: AuthoredSurface;
  readonly obstacle: AuthoredObstacle;
}

interface ExitRecord {
  readonly room: AuthoredRoom;
  readonly exit: AuthoredExit;
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isPosition(value: unknown): value is Position {
  return Boolean(value) && typeof value === 'object'
    && isInteger((value as Position).x)
    && isInteger((value as Position).y);
}

function isInside(room: AuthoredRoom, position: Position): boolean {
  return position.x >= 0 && position.x < room.width
    && position.y >= 0 && position.y < room.height;
}

function isAuthoredCell(value: unknown): value is AuthoredCell {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const cell = value as Record<string, unknown>;
  return (
    ['grass', 'dirt', 'stone', 'sand', 'snow', 'water'].includes(cell.surface as string)
    && isInteger(cell.elevation)
    && cell.elevation >= 0
    && ['forest', 'rock', 'building', null].includes(cell.obstacle as string | null)
    && typeof cell.walkable === 'boolean'
  );
}

function cellAtUnchecked(
  room: AuthoredRoom,
  position: Position,
): AuthoredSemanticCell | undefined {
  const symbol = room.grid[position.y]?.[position.x];
  const cell = typeof symbol === 'string' ? room.legend[symbol] : undefined;
  if (!isAuthoredCell(cell)) {
    return undefined;
  }
  return {
    x: position.x,
    y: position.y,
    surface: cell.surface,
    elevation: cell.elevation,
    obstacle: cell.obstacle,
    walkable: cell.walkable,
  };
}

export function authoredCellAt(
  room: AuthoredRoom,
  position: Position,
): AuthoredSemanticCell | undefined {
  if (!isInside(room, position)) {
    return undefined;
  }
  return cellAtUnchecked(room, position);
}

export function authoredCells(
  room: AuthoredRoom,
): readonly (readonly AuthoredSemanticCell[])[] {
  return deepFreeze(
    room.grid.map((_, y) =>
      Array.from({ length: room.width }, (_, x) =>
        cellAtUnchecked(room, { x, y }),
      ),
    ),
  ) as readonly (readonly AuthoredSemanticCell[])[];
}

function opposite(direction: AuthoredDirection): AuthoredDirection {
  return direction === 'up'
    ? 'down'
    : direction === 'down'
      ? 'up'
      : direction === 'left'
        ? 'right'
        : 'left';
}

function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

export function validateAuthoredWorld(
  world: AuthoredWorld,
): readonly string[] {
  const errors: string[] = [];
  const rooms = Array.isArray(world?.rooms) ? world.rooms : [];
  const roomsById = new Map<string, AuthoredRoom>();
  const exitsById = new Map<string, ExitRecord>();

  if (!Array.isArray(world?.rooms)) {
    errors.push('rooms must be an array');
  }

  for (const room of rooms) {
    const roomId = String(room?.id ?? '');
    if (roomId.length === 0) {
      errors.push('room id must not be empty');
    } else if (roomsById.has(roomId)) {
      errors.push(`duplicate room id: ${roomId}`);
    } else {
      roomsById.set(roomId, room);
    }

    if (!isInteger(room?.width) || room.width <= 0 || !isInteger(room?.height) || room.height <= 0) {
      errors.push(`invalid room dimensions: ${roomId}`);
      continue;
    }

    if (!Array.isArray(room.grid) || room.grid.length !== room.height) {
      errors.push(`malformed row count: ${roomId}`);
    }

    for (const [rowIndex, row] of (Array.isArray(room.grid) ? room.grid : []).entries()) {
      if (typeof row !== 'string' || row.length !== room.width) {
        errors.push(`malformed row width: ${roomId}:${rowIndex}`);
        continue;
      }
      for (const symbol of row) {
        if (!isAuthoredCell(room.legend?.[symbol])) {
          errors.push(`unknown or malformed cell: ${roomId}:${symbol}`);
        }
      }
    }

    if (!isPosition(room.spawn) || !isInside(room, room.spawn)) {
      errors.push(`spawn outside bounds: ${roomId}`);
    } else if (cellAtUnchecked(room, room.spawn)?.walkable !== true) {
      errors.push(`spawn on non-walkable cell: ${roomId}`);
    }

    for (const exit of Array.isArray(room.exits) ? room.exits : []) {
      if (exitsById.has(exit.id)) {
        errors.push(`duplicate exit id: ${exit.id}`);
      } else {
        exitsById.set(exit.id, { room, exit });
      }

      if (!isPosition(exit.position) || !isInside(room, exit.position)) {
        errors.push(`exit outside bounds: ${roomId}:${exit.id}`);
      } else if (cellAtUnchecked(room, exit.position)?.walkable !== true) {
        errors.push(`exit on non-walkable cell: ${roomId}:${exit.id}`);
      }

    }
  }

  if (!roomsById.has(String(world?.startRoomId ?? ''))) {
    errors.push('unknown start room');
  }

  for (const record of exitsById.values()) {
    const { room, exit } = record;
    const targetRoom = roomsById.get(String(exit.targetRoomId));
    if (!targetRoom) {
      errors.push(`unknown target room: ${room.id}:${exit.id}`);
      continue;
    }
    if (!isPosition(exit.targetEntry) || !isInside(targetRoom, exit.targetEntry)) {
      errors.push(`target entry outside bounds: ${room.id}:${exit.id}`);
    } else if (cellAtUnchecked(targetRoom, exit.targetEntry)?.walkable !== true) {
      errors.push(`target entry on non-walkable cell: ${room.id}:${exit.id}`);
    }

    if (!exit.reciprocalExitId) {
      continue;
    }
    const reciprocal = exitsById.get(exit.reciprocalExitId);
    if (!reciprocal) {
      errors.push(`unknown reciprocal exit: ${room.id}:${exit.id}`);
      continue;
    }
    if (
      reciprocal.exit.targetRoomId !== room.id
      || reciprocal.exit.direction !== opposite(exit.direction)
      || !samePosition(reciprocal.exit.position, exit.targetEntry)
      || !samePosition(reciprocal.exit.targetEntry, exit.position)
      || reciprocal.exit.reciprocalExitId !== exit.id
    ) {
      errors.push(`reciprocal mismatch: ${room.id}:${exit.id}`);
    }
  }

  const startRoom = roomsById.get(String(world?.startRoomId ?? ''));
  if (startRoom && (!isPosition(world.startPosition) || !isInside(startRoom, world.startPosition))) {
    errors.push('start position outside bounds');
  } else if (startRoom && cellAtUnchecked(startRoom, world.startPosition)?.walkable !== true) {
    errors.push('start position on non-walkable cell');
  }

  return errors;
}

export function createAuthoredWorld(world: AuthoredWorld): AuthoredWorld {
  const errors = validateAuthoredWorld(world);
  if (errors.length > 0) {
    throw new Error(`Invalid authored world: ${errors.join('; ')}`);
  }
  return deepFreeze(clonePlainData(world));
}

export function getAuthoredRoom(
  world: AuthoredWorld,
  roomId: RoomId,
): AuthoredRoom {
  const room = world.rooms.find((candidate) => candidate.id === roomId);
  if (!room) {
    throw new Error(`Unknown authored room: ${roomId}`);
  }
  return room;
}

import type { Position } from './types';
import {
  isWallAt,
  type ExitDefinition,
  type ExitDirection,
  type TileRoom,
} from './tilemap';
import type { TileGameState } from './tile-world';

export type TileRoomCatalog = Readonly<
  Record<string, TileRoom | undefined>
>;

export type TileExitResolution =
  | {
      readonly accepted: true;
      readonly roomId: string;
      readonly spawn: Position;
    }
  | {
      readonly accepted: false;
      readonly reason:
        | 'no-exit'
        | 'unknown-room'
        | 'invalid-spawn';
    };

function edgeDirectionsAt(
  room: Pick<TileRoom, 'width' | 'height'>,
  position: Position,
): readonly ExitDirection[] {
  const directions: ExitDirection[] = [];

  if (position.y === 0) {
    directions.push('up');
  }

  if (position.y === room.height - 1) {
    directions.push('down');
  }

  if (position.x === 0) {
    directions.push('left');
  }

  if (position.x === room.width - 1) {
    directions.push('right');
  }

  return directions;
}

function resolveSpawn(
  room: TileRoom,
  exit: ExitDefinition,
): TileExitResolution {
  const target = room;

  if (isWallAt(target, exit.spawn.x, exit.spawn.y)) {
    return { accepted: false, reason: 'invalid-spawn' };
  }

  return {
    accepted: true,
    roomId: target.id,
    spawn: exit.spawn,
  };
}

/**
 * Resolves the exit the player is currently standing on. The player
 * must be on a boundary cell whose compass side declares an exit in
 * the room JSON; the target room must exist and its spawn must be
 * walkable. Pure: reads only the given state and catalog.
 */
export function resolveTileExit(
  state: TileGameState,
  room: TileRoom,
  catalog: TileRoomCatalog,
): TileExitResolution {
  if (state.roomId !== room.id) {
    return { accepted: false, reason: 'no-exit' };
  }

  for (const direction of edgeDirectionsAt(room, state.player)) {
    const exit = room.exits[direction];

    if (!exit) {
      continue;
    }

    const target = catalog[exit.room];

    if (!target || target.id !== exit.room) {
      return { accepted: false, reason: 'unknown-room' };
    }

    return resolveSpawn(target, exit);
  }

  return { accepted: false, reason: 'no-exit' };
}

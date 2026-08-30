import type { Position } from './types';
import { isWallAt, type TileRoom } from './tilemap';
import type { TileGameState } from './tile-world';

export type TileRoomCatalog = Readonly<
  Record<string, TileRoom | undefined>
>;

export type TileExitResolution =
  | {
      readonly accepted: true;
      readonly exitId: string;
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

/**
 * Resolves the exit whose trigger cell the player is standing on.
 * A room may declare any number of exits (multiple per side,
 * interior portals); triggers are unique per room, enforced by
 * parseTileRoom, so resolution is deterministic. Pure: reads only
 * the given state and catalog.
 */
export function resolveTileExit(
  state: TileGameState,
  room: TileRoom,
  catalog: TileRoomCatalog,
): TileExitResolution {
  if (state.roomId !== room.id) {
    return { accepted: false, reason: 'no-exit' };
  }

  const exit = room.exits.find(
    (candidate) =>
      candidate.at.x === state.player.x &&
      candidate.at.y === state.player.y,
  );

  if (!exit) {
    return { accepted: false, reason: 'no-exit' };
  }

  const target = catalog[exit.room];

  if (!target || target.id !== exit.room) {
    return { accepted: false, reason: 'unknown-room' };
  }

  if (isWallAt(target, exit.spawn.x, exit.spawn.y)) {
    return { accepted: false, reason: 'invalid-spawn' };
  }

  return {
    accepted: true,
    exitId: exit.id,
    roomId: target.id,
    spawn: exit.spawn,
  };
}

export interface TileCatalogProblem {
  readonly roomId: string;
  readonly exitId: string;
  readonly detail: string;
}

/**
 * Cross-room validation: exit triggers and object positions are
 * checked per room by parseTileRoom, but an exit's target room and
 * spawn live in ANOTHER room's coordinate space. The wiring layer
 * (and the test suite) runs this over the full catalog so a broken
 * room graph fails at boot/test time, never during play.
 */
export function validateTileRoomCatalog(
  catalog: TileRoomCatalog,
): readonly TileCatalogProblem[] {
  const problems: TileCatalogProblem[] = [];

  for (const [key, room] of Object.entries(catalog)) {
    if (!room) {
      problems.push({
        roomId: key,
        exitId: '-',
        detail: 'catalog entry is missing',
      });

      continue;
    }

    if (room.id !== key) {
      problems.push({
        roomId: key,
        exitId: '-',
        detail: `room id "${room.id}" does not match catalog key "${key}"`,
      });
    }

    for (const exit of room.exits) {
      const target = catalog[exit.room];

      if (!target || target.id !== exit.room) {
        problems.push({
          roomId: room.id,
          exitId: exit.id,
          detail: `references unknown room "${exit.room}"`,
        });

        continue;
      }

      if (isWallAt(target, exit.spawn.x, exit.spawn.y)) {
        problems.push({
          roomId: room.id,
          exitId: exit.id,
          detail: `spawn (${exit.spawn.x},${exit.spawn.y}) is not walkable in "${exit.room}"`,
        });
      }
    }
  }

  return problems;
}

import {
  deepFreeze,
  type Position,
} from './types';

/**
 * Tile value legend used by every room JSON file:
 *   0 = floor (walkable), 1 = wall (blocking).
 */
export type TileValue = 0 | 1;

export type ExitDirection = 'up' | 'down' | 'left' | 'right';

export const EXIT_DIRECTIONS: readonly ExitDirection[] = [
  'up',
  'down',
  'left',
  'right',
];

export interface ExitDefinition {
  readonly room: string;
  readonly spawn: Position;
}

export interface DoorDefinition {
  readonly id: string;
  readonly pos: Position;
  /** When set, the door opens while the flag with this name is true. */
  readonly lockedBy?: string;
}

export interface PressurePlateDefinition {
  readonly id: string;
  readonly pos: Position;
  /** Doors held open while something (player or block) stands on the plate. */
  readonly doors: readonly string[];
}

export interface LeverDefinition {
  readonly id: string;
  readonly pos: Position;
  /** Doors opened while the lever is on, closed while it is off. */
  readonly doors: readonly string[];
}

export interface BlockOnTargetEffect {
  readonly setFlag?: string;
  readonly openDoors?: readonly string[];
}

export interface BlockDefinition {
  readonly id: string;
  readonly pos: Position;
  /** When the block reaches this cell, `onTarget` fires exactly once. */
  readonly target?: Position;
  readonly onTarget?: BlockOnTargetEffect;
}

export interface ChestDefinition {
  readonly id: string;
  readonly pos: Position;
  /** Opening the chest only sets this flag; it never holds items. */
  readonly setFlag: string;
}

export interface TileRoom {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  /** Row-major: tiles[y][x]. */
  readonly tiles: readonly (readonly TileValue[])[];
  readonly spawn: Position;
  readonly exits: Readonly<
    Partial<Record<ExitDirection, ExitDefinition>>
  >;
  readonly doors: readonly DoorDefinition[];
  readonly pressurePlates: readonly PressurePlateDefinition[];
  readonly levers: readonly LeverDefinition[];
  readonly blocks: readonly BlockDefinition[];
  readonly chests: readonly ChestDefinition[];
}

export class TileRoomParseError extends Error {
  constructor(detail: string) {
    super(`Invalid room JSON: ${detail}`);
    this.name = 'TileRoomParseError';
  }
}

interface RawPosition {
  x: unknown;
  y: unknown;
}

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isTile(
  value: unknown,
): value is TileValue {
  return value === 0 || value === 1;
}

function parsePosition(
  value: unknown,
  detail: string,
): Position {
  if (
    !isPlainObject(value) ||
    !Number.isInteger(value.x) ||
    !Number.isInteger(value.y)
  ) {
    throw new TileRoomParseError(`${detail} needs integer x/y`);
  }

  const position = value as unknown as RawPosition;

  return {
    x: position.x as number,
    y: position.y as number,
  };
}

function parseStringId(
  value: unknown,
  detail: string,
): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TileRoomParseError(`${detail} needs a non-empty id`);
  }

  return value;
}

function parseStringList(
  value: unknown,
  detail: string,
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string' || entry.length === 0)
  ) {
    throw new TileRoomParseError(
      `${detail} needs an array of non-empty strings`,
    );
  }

  return value as readonly string[];
}

function parseTiles(
  value: unknown,
): readonly (readonly TileValue[])[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TileRoomParseError('tiles must be a non-empty 2D array');
  }

  const width = (value[0] as unknown[]).length;

  if (width === 0) {
    throw new TileRoomParseError('tile rows must not be empty');
  }

  return value.map((row, y) => {
    if (
      !Array.isArray(row) ||
      row.length !== width ||
      !row.every(isTile)
    ) {
      throw new TileRoomParseError(
        `tile row ${y} must be a rectangular array of 0/1 values`,
      );
    }

    return row as readonly TileValue[];
  });
}

function parseExits(
  value: unknown,
): Readonly<Partial<Record<ExitDirection, ExitDefinition>>> {
  if (value === undefined) {
    return {};
  }

  if (!isPlainObject(value)) {
    throw new TileRoomParseError('exits must be an object');
  }

  const exits: Partial<Record<ExitDirection, ExitDefinition>> = {};

  for (const direction of EXIT_DIRECTIONS) {
    const raw = value[direction];

    if (raw === undefined) {
      continue;
    }

    if (!isPlainObject(raw)) {
      throw new TileRoomParseError(
        `exit "${direction}" must be an object`,
      );
    }

    exits[direction] = deepFreeze({
      room: parseStringId(raw.room, `exit "${direction}"`),
      spawn: parsePosition(raw.spawn, `exit "${direction}" spawn`),
    });
  }

  return exits;
}

function parseDoors(value: unknown): readonly DoorDefinition[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new TileRoomParseError('doors must be an array');
  }

  return value.map((raw, index) => {
    if (!isPlainObject(raw)) {
      throw new TileRoomParseError(`doors[${index}] must be an object`);
    }

    return deepFreeze({
      id: parseStringId(raw.id, `doors[${index}]`),
      pos: parsePosition(raw.pos, `doors[${index}] pos`),
      ...(raw.lockedBy === undefined
        ? {}
        : {
            lockedBy: parseStringId(
              raw.lockedBy,
              `doors[${index}] lockedBy`,
            ),
          }),
    });
  });
}

function parsePressurePlates(
  value: unknown,
): readonly PressurePlateDefinition[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new TileRoomParseError('pressurePlates must be an array');
  }

  return value.map((raw, index) => {
    if (!isPlainObject(raw)) {
      throw new TileRoomParseError(
        `pressurePlates[${index}] must be an object`,
      );
    }

    return deepFreeze({
      id: parseStringId(raw.id, `pressurePlates[${index}]`),
      pos: parsePosition(raw.pos, `pressurePlates[${index}] pos`),
      doors: parseStringList(
        raw.doors,
        `pressurePlates[${index}] doors`,
      ),
    });
  });
}

function parseLevers(value: unknown): readonly LeverDefinition[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new TileRoomParseError('levers must be an array');
  }

  return value.map((raw, index) => {
    if (!isPlainObject(raw)) {
      throw new TileRoomParseError(`levers[${index}] must be an object`);
    }

    return deepFreeze({
      id: parseStringId(raw.id, `levers[${index}]`),
      pos: parsePosition(raw.pos, `levers[${index}] pos`),
      doors: parseStringList(raw.doors, `levers[${index}] doors`),
    });
  });
}

function parseBlocks(value: unknown): readonly BlockDefinition[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new TileRoomParseError('blocks must be an array');
  }

  return value.map((raw, index) => {
    if (!isPlainObject(raw)) {
      throw new TileRoomParseError(`blocks[${index}] must be an object`);
    }

    const onTarget = isPlainObject(raw.onTarget)
      ? deepFreeze({
          ...(raw.onTarget.setFlag === undefined
            ? {}
            : {
                setFlag: parseStringId(
                  raw.onTarget.setFlag,
                  `blocks[${index}] onTarget.setFlag`,
                ),
              }),
          ...(raw.onTarget.openDoors === undefined
            ? {}
            : {
                openDoors: parseStringList(
                  raw.onTarget.openDoors,
                  `blocks[${index}] onTarget.openDoors`,
                ),
              }),
        })
      : undefined;

    return deepFreeze({
      id: parseStringId(raw.id, `blocks[${index}]`),
      pos: parsePosition(raw.pos, `blocks[${index}] pos`),
      ...(raw.target === undefined
        ? {}
        : { target: parsePosition(raw.target, `blocks[${index}] target`) }),
      ...(onTarget ? { onTarget } : {}),
    });
  });
}

function parseChests(value: unknown): readonly ChestDefinition[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new TileRoomParseError('chests must be an array');
  }

  return value.map((raw, index) => {
    if (!isPlainObject(raw)) {
      throw new TileRoomParseError(`chests[${index}] must be an object`);
    }

    return deepFreeze({
      id: parseStringId(raw.id, `chests[${index}]`),
      pos: parsePosition(raw.pos, `chests[${index}] pos`),
      setFlag: parseStringId(
        raw.setFlag,
        `chests[${index}] setFlag`,
      ),
    });
  });
}

function assertInsideRoom(
  room: Pick<TileRoom, 'width' | 'height'>,
  position: Position,
  detail: string,
): void {
  if (
    position.x < 0 ||
    position.y < 0 ||
    position.x >= room.width ||
    position.y >= room.height
  ) {
    throw new TileRoomParseError(`${detail} is outside the room`);
  }
}

/**
 * Parses and validates a room JSON document into a frozen TileRoom.
 * Throws TileRoomParseError with a precise detail on any violation.
 */
export function parseTileRoom(json: unknown): TileRoom {
  if (!isPlainObject(json)) {
    throw new TileRoomParseError('root must be an object');
  }

  const tiles = parseTiles(json.tiles);
  const spawn = parsePosition(json.spawn, 'spawn');
  const doors = parseDoors(json.doors);
  const pressurePlates = parsePressurePlates(json.pressurePlates);
  const levers = parseLevers(json.levers);
  const blocks = parseBlocks(json.blocks);
  const chests = parseChests(json.chests);
  const exits = parseExits(json.exits);

  const room: TileRoom = deepFreeze({
    id: parseStringId(json.id, 'root'),
    width: tiles[0].length,
    height: tiles.length,
    tiles,
    spawn,
    exits,
    doors,
    pressurePlates,
    levers,
    blocks,
    chests,
  });

  assertInsideRoom(room, room.spawn, 'spawn');

  if (isWallAt(room, room.spawn.x, room.spawn.y)) {
    throw new TileRoomParseError('spawn must be on a floor tile');
  }

  for (const door of room.doors) {
    assertInsideRoom(room, door.pos, `door "${door.id}"`);
  }

  for (const plate of room.pressurePlates) {
    assertInsideRoom(room, plate.pos, `plate "${plate.id}"`);
  }

  for (const lever of room.levers) {
    assertInsideRoom(room, lever.pos, `lever "${lever.id}"`);
  }

  for (const block of room.blocks) {
    assertInsideRoom(room, block.pos, `block "${block.id}"`);

    if (block.target) {
      assertInsideRoom(room, block.target, `block "${block.id}" target`);
    }
  }

  for (const chest of room.chests) {
    assertInsideRoom(room, chest.pos, `chest "${chest.id}"`);
  }

  // Exit spawns live in the TARGET room's coordinate space, so they
  // are validated at transition time (see resolveTileExit), not here.

  return room;
}

export function isWallAt(
  room: Pick<TileRoom, 'tiles' | 'width' | 'height'>,
  x: number,
  y: number,
): boolean {
  if (x < 0 || y < 0 || x >= room.width || y >= room.height) {
    return true;
  }

  return room.tiles[y][x] === 1;
}

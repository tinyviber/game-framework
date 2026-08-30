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

/**
 * A single room exit. `at` is the trigger cell in THIS room's tile
 * space; `spawn` is the entry cell in the TARGET room's tile space.
 * Triggers are explicit cells, so a room may declare any number of
 * exits per side — plus interior staircases or portals — without the
 * spatial graph being locked to one exit per cardinal direction.
 */
export interface ExitDefinition {
  readonly id: string;
  readonly at: Position;
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
  readonly exits: readonly ExitDefinition[];
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

const ROOT_KEYS = [
  'id',
  'tiles',
  'spawn',
  'exits',
  'doors',
  'pressurePlates',
  'levers',
  'blocks',
  'chests',
] as const;

const EXIT_KEYS = ['id', 'at', 'room', 'spawn'] as const;
const DOOR_KEYS = ['id', 'pos', 'lockedBy'] as const;
const PLATE_KEYS = ['id', 'pos', 'doors'] as const;
const LEVER_KEYS = ['id', 'pos', 'doors'] as const;
const BLOCK_KEYS = ['id', 'pos', 'target', 'onTarget'] as const;
const ON_TARGET_KEYS = ['setFlag', 'openDoors'] as const;
const CHEST_KEYS = ['id', 'pos', 'setFlag'] as const;

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

/**
 * Typos in room JSON (a misspelled key, a copied object) must fail
 * at parse time, not produce a world that parses but cannot be
 * played. Every object rejects keys outside its schema.
 */
function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  detail: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new TileRoomParseError(
        `${detail} has unknown key "${key}" (allowed: ${allowed.join(', ')})`,
      );
    }
  }
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

  if (!Array.isArray(value[0])) {
    // The first row decides the room width; anything that is not an
    // array (null, a number, an object) is a malformed document and
    // must surface as a parse error, never as a raw TypeError.
    throw new TileRoomParseError('tiles must be a non-empty 2D array');
  }

  const width = value[0].length;

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

function parseExits(value: unknown): readonly ExitDefinition[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new TileRoomParseError('exits must be an array of exit objects');
  }

  return value.map((raw, index) => {
    if (!isPlainObject(raw)) {
      throw new TileRoomParseError(`exits[${index}] must be an object`);
    }

    rejectUnknownKeys(raw, EXIT_KEYS, `exits[${index}]`);

    return deepFreeze({
      id: parseStringId(raw.id, `exits[${index}] id`),
      at: parsePosition(raw.at, `exits[${index}] at`),
      room: parseStringId(raw.room, `exits[${index}] room`),
      spawn: parsePosition(raw.spawn, `exits[${index}] spawn`),
    });
  });
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

    rejectUnknownKeys(raw, DOOR_KEYS, `doors[${index}]`);

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

    rejectUnknownKeys(raw, PLATE_KEYS, `pressurePlates[${index}]`);

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

    rejectUnknownKeys(raw, LEVER_KEYS, `levers[${index}]`);

    return deepFreeze({
      id: parseStringId(raw.id, `levers[${index}]`),
      pos: parsePosition(raw.pos, `levers[${index}] pos`),
      doors: parseStringList(
        raw.doors,
        `levers[${index}] doors`,
      ),
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

    rejectUnknownKeys(raw, BLOCK_KEYS, `blocks[${index}]`);

    if (raw.onTarget !== undefined && !isPlainObject(raw.onTarget)) {
      throw new TileRoomParseError(
        `blocks[${index}] onTarget must be an object`,
      );
    }

    const onTarget = isPlainObject(raw.onTarget)
      ? ((): BlockOnTargetEffect => {
          rejectUnknownKeys(
            raw.onTarget as Record<string, unknown>,
            ON_TARGET_KEYS,
            `blocks[${index}] onTarget`,
          );

          return deepFreeze({
            ...((raw.onTarget as Record<string, unknown>).setFlag ===
            undefined
              ? {}
              : {
                  setFlag: parseStringId(
                    (raw.onTarget as Record<string, unknown>).setFlag,
                    `blocks[${index}] onTarget.setFlag`,
                  ),
                }),
            ...((raw.onTarget as Record<string, unknown>).openDoors ===
            undefined
              ? {}
              : {
                  openDoors: parseStringList(
                    (raw.onTarget as Record<string, unknown>).openDoors,
                    `blocks[${index}] onTarget.openDoors`,
                  ),
                }),
          });
        })()
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

    rejectUnknownKeys(raw, CHEST_KEYS, `chests[${index}]`);

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

function assertOnFloor(
  room: TileRoom,
  position: Position,
  detail: string,
): void {
  if (isWallAt(room, position.x, position.y)) {
    throw new TileRoomParseError(`${detail} must be on a floor tile`);
  }
}

function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

function positionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

function claimId(
  claimed: Map<string, string>,
  id: string,
  owner: string,
): void {
  const existing = claimed.get(id);

  if (existing) {
    throw new TileRoomParseError(
      `duplicate id "${id}" is used by ${existing} and ${owner}`,
    );
  }

  claimed.set(id, owner);
}

function claimCell(
  cells: Map<string, string>,
  position: Position,
  owner: string,
): void {
  const key = positionKey(position);
  const existing = cells.get(key);

  if (existing) {
    throw new TileRoomParseError(
      `${owner} at (${key}) overlaps ${existing}`,
    );
  }

  cells.set(key, owner);
}

function assertDoorExists(
  doorIds: ReadonlySet<string>,
  doorId: string,
  owner: string,
): void {
  if (!doorIds.has(doorId)) {
    throw new TileRoomParseError(
      `${owner} references unknown door "${doorId}"`,
    );
  }
}

/**
 * Parses and validates a room JSON document into a frozen TileRoom.
 * Throws TileRoomParseError with a precise detail on any violation.
 * Room JSON is the level-authoring boundary: unknown keys, duplicate
 * ids, dangling door references, objects on wall tiles, overlapping
 * definitions and exit triggers that cannot be stood on all fail
 * here, at load time, instead of producing an unplayable world.
 */
export function parseTileRoom(json: unknown): TileRoom {
  if (!isPlainObject(json)) {
    throw new TileRoomParseError('root must be an object');
  }

  rejectUnknownKeys(json, ROOT_KEYS, 'root');

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

  // ── Authoring-boundary validation ────────────────────────────
  // Ids are unique across every entity category (plus exits); every
  // object sits on a floor tile at a position it does not share
  // with another object.
  const claimedIds = new Map<string, string>();
  const entityCells = new Map<string, string>();
  const plateCells = new Set<string>();
  const doorIds = new Set<string>();

  for (const door of room.doors) {
    claimId(claimedIds, door.id, `door "${door.id}"`);
    doorIds.add(door.id);
    assertInsideRoom(room, door.pos, `door "${door.id}"`);
    assertOnFloor(room, door.pos, `door "${door.id}"`);
    claimCell(entityCells, door.pos, `door "${door.id}"`);
  }

  for (const plate of room.pressurePlates) {
    claimId(claimedIds, plate.id, `plate "${plate.id}"`);

    for (const doorId of plate.doors) {
      assertDoorExists(doorIds, doorId, `plate "${plate.id}"`);
    }

    assertInsideRoom(room, plate.pos, `plate "${plate.id}"`);
    assertOnFloor(room, plate.pos, `plate "${plate.id}"`);
    plateCells.add(positionKey(plate.pos));
    claimCell(entityCells, plate.pos, `plate "${plate.id}"`);
  }

  for (const lever of room.levers) {
    claimId(claimedIds, lever.id, `lever "${lever.id}"`);

    for (const doorId of lever.doors) {
      assertDoorExists(doorIds, doorId, `lever "${lever.id}"`);
    }

    assertInsideRoom(room, lever.pos, `lever "${lever.id}"`);
    assertOnFloor(room, lever.pos, `lever "${lever.id}"`);
    claimCell(entityCells, lever.pos, `lever "${lever.id}"`);
  }

  for (const chest of room.chests) {
    claimId(claimedIds, chest.id, `chest "${chest.id}"`);
    assertInsideRoom(room, chest.pos, `chest "${chest.id}"`);
    assertOnFloor(room, chest.pos, `chest "${chest.id}"`);
    claimCell(entityCells, chest.pos, `chest "${chest.id}"`);
  }

  for (const block of room.blocks) {
    claimId(claimedIds, block.id, `block "${block.id}"`);

    for (const doorId of block.onTarget?.openDoors ?? []) {
      assertDoorExists(doorIds, doorId, `block "${block.id}" onTarget`);
    }

    assertInsideRoom(room, block.pos, `block "${block.id}"`);
    assertOnFloor(room, block.pos, `block "${block.id}"`);
    claimCell(entityCells, block.pos, `block "${block.id}"`);
  }

  // Block targets must be reachable floor. A target may sit on a
  // pressure plate (the classic plate+target combo) but never on a
  // door, lever, chest, block start or another block's target.
  const targetCells = new Map<string, string>();

  for (const block of room.blocks) {
    if (!block.target) {
      continue;
    }

    assertInsideRoom(room, block.target, `block "${block.id}" target`);
    assertOnFloor(room, block.target, `block "${block.id}" target`);

    const key = positionKey(block.target);
    const occupant = entityCells.get(key);

    if (occupant && !plateCells.has(key)) {
      throw new TileRoomParseError(
        `block "${block.id}" target (${key}) overlaps ${occupant}`,
      );
    }

    const otherTarget = targetCells.get(key);

    if (otherTarget) {
      throw new TileRoomParseError(
        `block "${block.id}" target (${key}) overlaps ${otherTarget}`,
      );
    }

    targetCells.set(key, `block "${block.id}" target`);
  }

  // The player may stand on plates, levers and chests (the cellar
  // lever and vault chest rely on it) but must not start inside a
  // door or a block.
  for (const door of room.doors) {
    if (samePosition(door.pos, room.spawn)) {
      throw new TileRoomParseError('spawn must not be on a door');
    }
  }

  for (const block of room.blocks) {
    if (samePosition(block.pos, room.spawn)) {
      throw new TileRoomParseError('spawn must not be on a block');
    }
  }

  // Exit triggers must be standable floor cells, unique per exit,
  // and distinct from the spawn (entering a room must not place the
  // player directly on a transition trigger).
  const exitCells = new Map<string, string>();

  for (const exit of room.exits) {
    claimId(claimedIds, exit.id, `exit "${exit.id}"`);
    assertInsideRoom(room, exit.at, `exit "${exit.id}" at`);
    assertOnFloor(room, exit.at, `exit "${exit.id}" at`);

    const key = positionKey(exit.at);
    const other = exitCells.get(key);

    if (other) {
      throw new TileRoomParseError(
        `exit "${exit.id}" trigger (${key}) is already used by ${other}`,
      );
    }

    exitCells.set(key, `exit "${exit.id}"`);

    if (samePosition(exit.at, room.spawn)) {
      throw new TileRoomParseError(
        `spawn is on exit "${exit.id}" trigger cell`,
      );
    }
  }

  // Exit spawns live in the TARGET room's coordinate space, so they
  // are validated by validateTileRoomCatalog (which sees the whole
  // catalog), not here.
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

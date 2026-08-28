import {
  deepFreeze,
  type Position,
} from './types';
import {
  isWallAt,
  type DoorDefinition,
  type ExitDirection,
  type TileRoom,
} from './tilemap';

/**
 * Cross-room state that must survive room transitions (and page
 * reloads, via the FlagStore mirror): flags, opened chests, fired
 * block targets and latched doors. Lever states and block positions
 * are per-room puzzle state and intentionally reset on entry.
 */
export interface CarriedState {
  readonly flags: Readonly<Record<string, boolean>>;
  readonly openedChests: Readonly<Record<string, boolean>>;
  readonly onTargetFired: Readonly<Record<string, boolean>>;
  readonly latchedOpenDoors: Readonly<Record<string, boolean>>;
}

export function emptyCarried(): CarriedState {
  return {
    flags: {},
    openedChests: {},
    onTargetFired: {},
    latchedOpenDoors: {},
  };
}

export function extractCarriedState(
  state: TileGameState,
): CarriedState {
  return {
    flags: { ...state.flags },
    openedChests: { ...state.openedChests },
    onTargetFired: { ...state.onTargetFired },
    latchedOpenDoors: { ...state.latchedOpenDoors },
  };
}

export type TileEvent =
  | { readonly tag: 'moved'; readonly x: number; readonly y: number }
  | {
      readonly tag: 'pushed';
      readonly blockId: string;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly tag: 'blocked';
      readonly reason: 'wall' | 'locked-door' | 'block-stuck';
    }
  | { readonly tag: 'door-opened'; readonly doorId: string }
  | { readonly tag: 'door-closed'; readonly doorId: string }
  | { readonly tag: 'plate-pressed'; readonly plateId: string }
  | { readonly tag: 'plate-released'; readonly plateId: string }
  | {
      readonly tag: 'lever-toggled';
      readonly leverId: string;
      readonly on: boolean;
    }
  | { readonly tag: 'block-on-target'; readonly blockId: string }
  | {
      readonly tag: 'chest-opened';
      readonly chestId: string;
      readonly flag: string;
    }
  | {
      readonly tag: 'flag-set';
      readonly key: string;
      readonly value: boolean;
    }
  | { readonly tag: 'interact-noop' };

export interface TileGameState {
  readonly roomId: string;
  readonly player: Position;
  readonly flags: Readonly<Record<string, boolean>>;
  readonly doors: Readonly<
    Record<string, { readonly open: boolean }>
  >;
  readonly levers: Readonly<
    Record<string, { readonly on: boolean }>
  >;
  readonly blocks: Readonly<
    Record<string, { readonly x: number; readonly y: number }>
  >;
  readonly chests: Readonly<
    Record<string, { readonly opened: boolean }>
  >;
  readonly openedChests: Readonly<Record<string, boolean>>;
  readonly onTargetFired: Readonly<Record<string, boolean>>;
  readonly latchedOpenDoors: Readonly<Record<string, boolean>>;
  readonly lastEvents: readonly TileEvent[];
}

export type TileOperation =
  | {
      readonly kind: 'move';
      readonly direction: ExitDirection;
    }
  | { readonly kind: 'interact' };

export type TileOperationResult =
  | {
      readonly accepted: true;
      readonly state: TileGameState;
      readonly events: readonly TileEvent[];
    }
  | {
      readonly accepted: false;
      readonly state: TileGameState;
      readonly events: readonly TileEvent[];
      readonly reason:
        | 'wall'
        | 'locked-door'
        | 'block-stuck'
        | 'unknown-operation';
    };

const DIRECTION_DELTAS: Readonly<
  Record<ExitDirection, Position>
> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function directionDelta(
  direction: ExitDirection,
): Position {
  return DIRECTION_DELTAS[direction];
}

const NEIGHBOR_ORDER: readonly ExitDirection[] = [
  'up',
  'down',
  'left',
  'right',
];

function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

interface DoorEvalContext {
  readonly flags: Readonly<Record<string, boolean>>;
  readonly latchedOpenDoors: Readonly<Record<string, boolean>>;
  readonly levers: Readonly<
    Record<string, { readonly on: boolean }>
  >;
  readonly plateHeld: Readonly<Record<string, boolean>>;
}

/**
 * A door is open iff it is latched (block onTarget fired), its
 * lockedBy flag is set, or any linked plate is held / lever is on.
 * Pure OR: a latched or flag-opened door cannot be closed again by
 * releasing a plate.
 */
function doorOpen(
  room: TileRoom,
  door: DoorDefinition,
  context: DoorEvalContext,
): boolean {
  if (context.latchedOpenDoors[door.id]) {
    return true;
  }

  if (door.lockedBy && context.flags[door.lockedBy]) {
    return true;
  }

  for (const plate of room.pressurePlates) {
    if (
      plate.doors.includes(door.id) &&
      context.plateHeld[plate.id]
    ) {
      return true;
    }
  }

  for (const lever of room.levers) {
    if (
      lever.doors.includes(door.id) &&
      context.levers[lever.id]?.on
    ) {
      return true;
    }
  }

  return false;
}

function computePlateHeld(
  room: TileRoom,
  player: Position,
  blocks: TileGameState['blocks'],
): Record<string, boolean> {
  const held: Record<string, boolean> = {};

  for (const plate of room.pressurePlates) {
    const onPlate =
      samePosition(player, plate.pos) ||
      Object.values(blocks).some((block) =>
        samePosition(block, plate.pos),
      );
    held[plate.id] = onPlate;
  }

  return held;
}

function computeDoorStates(
  room: TileRoom,
  context: DoorEvalContext,
): Record<string, { open: boolean }> {
  const doors: Record<string, { open: boolean }> = {};

  for (const door of room.doors) {
    doors[door.id] = { open: doorOpen(room, door, context) };
  }

  return doors;
}

function doorAt(
  room: TileRoom,
  x: number,
  y: number,
): DoorDefinition | undefined {
  return room.doors.find((door) => door.pos.x === x && door.pos.y === y);
}

function blockAt(
  room: TileRoom,
  blocks: TileGameState['blocks'],
  x: number,
  y: number,
): string | undefined {
  for (const [id, block] of Object.entries(blocks)) {
    if (block.x === x && block.y === y) {
      return id;
    }
  }

  void room;
  return undefined;
}

function objectAt(
  room: TileRoom,
  x: number,
  y: number,
): { kind: 'lever'; id: string } | { kind: 'chest'; id: string } | null {
  for (const lever of room.levers) {
    if (lever.pos.x === x && lever.pos.y === y) {
      return { kind: 'lever', id: lever.id };
    }
  }

  for (const chest of room.chests) {
    if (chest.pos.x === x && chest.pos.y === y) {
      return { kind: 'chest', id: chest.id };
    }
  }

  return null;
}

/**
 * Creates the initial state for a room. `spawn` may override the
 * room default (room transitions); `carried` restores cross-room
 * state (flags, opened chests, fired targets, latched doors) that
 * must survive transitions and reloads. Lever states and block
 * positions always reset to the room definition.
 */
export function createTileRoomState(
  room: TileRoom,
  spawn: Position = room.spawn,
  carried: CarriedState = emptyCarried(),
): TileGameState {
  if (isWallAt(room, spawn.x, spawn.y)) {
    throw new Error(
      `Room ${room.id}: spawn (${spawn.x},${spawn.y}) is a wall`,
    );
  }

  const blocks: Record<string, { x: number; y: number }> = {};

  for (const block of room.blocks) {
    blocks[block.id] = { x: block.pos.x, y: block.pos.y };
  }

  const plateHeld = computePlateHeld(room, spawn, blocks);
  const context: DoorEvalContext = {
    flags: carried.flags,
    latchedOpenDoors: carried.latchedOpenDoors,
    levers: {},
    plateHeld,
  };

  return deepFreeze({
    roomId: room.id,
    player: { ...spawn },
    flags: { ...carried.flags },
    doors: computeDoorStates(room, context),
    levers: Object.fromEntries(
      room.levers.map((lever) => [lever.id, { on: false }]),
    ),
    blocks,
    chests: Object.fromEntries(
      room.chests.map((chest) => [
        chest.id,
        { opened: carried.openedChests[chest.id] === true },
      ]),
    ),
    openedChests: { ...carried.openedChests },
    onTargetFired: { ...carried.onTargetFired },
    latchedOpenDoors: { ...carried.latchedOpenDoors },
    lastEvents: [],
  });
}

/**
 * All-or-nothing tile operation application. Accepted operations
 * return a new frozen state; rejected operations return the input
 * state by reference — nothing is mutated, ever.
 */
export function applyTileOperation(
  state: TileGameState,
  room: TileRoom,
  operation: TileOperation,
): TileOperationResult {
  if (room.id !== state.roomId) {
    throw new Error(
      `State room ${state.roomId} does not match room ${room.id}`,
    );
  }

  if (operation.kind === 'interact') {
    return applyInteract(state, room);
  }

  if (operation.kind !== 'move') {
    return {
      accepted: false,
      state,
      events: [],
      reason: 'unknown-operation',
    };
  }

  return applyMove(state, room, operation.direction);
}

function applyMove(
  state: TileGameState,
  room: TileRoom,
  direction: ExitDirection,
): TileOperationResult {
  const delta = directionDelta(direction);
  const target: Position = {
    x: state.player.x + delta.x,
    y: state.player.y + delta.y,
  };

  if (isWallAt(room, target.x, target.y)) {
    return reject(state, 'wall');
  }

  const preMovePlateHeld = computePlateHeld(
    room,
    state.player,
    state.blocks,
  );

  const preMoveContext: DoorEvalContext = {
    flags: state.flags,
    latchedOpenDoors: state.latchedOpenDoors,
    levers: state.levers,
    plateHeld: preMovePlateHeld,
  };
  const preMoveDoors = computeDoorStates(room, preMoveContext);

  const targetDoor = doorAt(room, target.x, target.y);

  if (targetDoor && !preMoveDoors[targetDoor.id].open) {
    return reject(state, 'locked-door');
  }

  const blockedBlockId = blockAt(room, state.blocks, target.x, target.y);

  if (blockedBlockId !== undefined) {
    const pushCell: Position = {
      x: target.x + delta.x,
      y: target.y + delta.y,
    };

    if (isWallAt(room, pushCell.x, pushCell.y)) {
      return reject(state, 'block-stuck');
    }

    if (blockAt(room, state.blocks, pushCell.x, pushCell.y) !== undefined) {
      return reject(state, 'block-stuck');
    }

    const pushDoor = doorAt(room, pushCell.x, pushCell.y);

    if (pushDoor && !preMoveDoors[pushDoor.id].open) {
      return reject(state, 'block-stuck');
    }

    const pushObject = objectAt(room, pushCell.x, pushCell.y);

    if (pushObject) {
      return reject(state, 'block-stuck');
    }
  }

  // ── Accept: build the next state ──────────────────────────────
  const blocks: Record<string, { x: number; y: number }> = {};

  for (const [id, block] of Object.entries(state.blocks)) {
    blocks[id] = { ...block };
  }

  let pushedBlockId: string | undefined;

  if (blockedBlockId !== undefined) {
    pushedBlockId = blockedBlockId;
    blocks[blockedBlockId] = {
      x: target.x + delta.x,
      y: target.y + delta.y,
    };
  }

  const player: Position = { ...target };
  const events: TileEvent[] = [
    { tag: 'moved', x: player.x, y: player.y },
  ];

  if (pushedBlockId) {
    events.push({
      tag: 'pushed',
      blockId: pushedBlockId,
      x: blocks[pushedBlockId].x,
      y: blocks[pushedBlockId].y,
    });
  }

  // Plates re-evaluated with post-move positions.
  const postMovePlateHeld = computePlateHeld(room, player, blocks);

  for (const plate of room.pressurePlates) {
    const wasHeld = preMovePlateHeld[plate.id];
    const isHeld = postMovePlateHeld[plate.id];

    if (isHeld && !wasHeld) {
      events.push({ tag: 'plate-pressed', plateId: plate.id });
    } else if (!isHeld && wasHeld) {
      events.push({ tag: 'plate-released', plateId: plate.id });
    }
  }

  // Block target latch (fires exactly once).
  const flags = { ...state.flags };
  const onTargetFired = { ...state.onTargetFired };
  const latchedOpenDoors = { ...state.latchedOpenDoors };

  if (pushedBlockId) {
    const moved = blocks[pushedBlockId];
    const definition = room.blocks.find(
      (block) => block.id === pushedBlockId,
    );

    if (
      definition?.target &&
      samePosition(moved, definition.target) &&
      !onTargetFired[pushedBlockId]
    ) {
      onTargetFired[pushedBlockId] = true;
      events.push({ tag: 'block-on-target', blockId: pushedBlockId });

      if (definition.onTarget?.setFlag) {
        flags[definition.onTarget.setFlag] = true;
        events.push({
          tag: 'flag-set',
          key: definition.onTarget.setFlag,
          value: true,
        });
      }

      for (const doorId of definition.onTarget?.openDoors ?? []) {
        latchedOpenDoors[doorId] = true;
      }
    }
  }

  // Doors recomputed from the full predicate (latches included).
  const postMoveContext: DoorEvalContext = {
    flags,
    latchedOpenDoors,
    levers: state.levers,
    plateHeld: postMovePlateHeld,
  };
  const postMoveDoors = computeDoorStates(room, postMoveContext);

  for (const [doorId, after] of Object.entries(postMoveDoors)) {
    const before = preMoveDoors[doorId];

    if (before && !before.open && after.open) {
      events.push({ tag: 'door-opened', doorId });
    } else if (before && before.open && !after.open) {
      events.push({ tag: 'door-closed', doorId });
    }
  }

  const nextState = deepFreeze({
    ...state,
    player,
    flags,
    doors: postMoveDoors,
    blocks,
    onTargetFired,
    latchedOpenDoors,
    lastEvents: events,
  });

  return {
    accepted: true,
    state: nextState,
    events: nextState.lastEvents,
  };
}

function applyInteract(
  state: TileGameState,
  room: TileRoom,
): TileOperationResult {
  const cells: Position[] = [
    state.player,
    ...NEIGHBOR_ORDER.map((direction) => {
      const delta = directionDelta(direction);

      return {
        x: state.player.x + delta.x,
        y: state.player.y + delta.y,
      };
    }),
  ];

  for (const cell of cells) {
    const target = objectAt(room, cell.x, cell.y);

    if (!target) {
      continue;
    }

    if (target.kind === 'chest') {
      if (state.chests[target.id]?.opened) {
        // Already opened: keep scanning neighbors (e.g. a lever
        // standing behind an opened chest) instead of stopping.
        continue;
      }

      const chest = room.chests.find(
        (entry) => entry.id === target.id,
      );

      if (!chest) {
        continue;
      }

      const flags = { ...state.flags };
      flags[chest.setFlag] = true;

      const events: TileEvent[] = [
        {
          tag: 'chest-opened',
          chestId: target.id,
          flag: chest.setFlag,
        },
        { tag: 'flag-set', key: chest.setFlag, value: true },
      ];

      const doors = computeDoorStates(room, {
        flags,
        latchedOpenDoors: state.latchedOpenDoors,
        levers: state.levers,
        plateHeld: computePlateHeld(room, state.player, state.blocks),
      });

      for (const [doorId, after] of Object.entries(doors)) {
        const before = state.doors[doorId];

        if (before && !before.open && after.open) {
          events.push({ tag: 'door-opened', doorId });
        }
      }

      const nextState = deepFreeze({
        ...state,
        flags,
        chests: {
          ...state.chests,
          [target.id]: { opened: true },
        },
        openedChests: {
          ...state.openedChests,
          [target.id]: true,
        },
        doors,
        lastEvents: events,
      });

      return {
        accepted: true,
        state: nextState,
        events: nextState.lastEvents,
      };
    }

    if (target.kind === 'lever') {
      const lever = room.levers.find(
        (entry) => entry.id === target.id,
      );

      if (!lever) {
        continue;
      }

      const on = !state.levers[target.id]?.on;
      const levers = {
        ...state.levers,
        [target.id]: { on },
      };

      const events: TileEvent[] = [
        { tag: 'lever-toggled', leverId: target.id, on },
      ];

      const doors = computeDoorStates(room, {
        flags: state.flags,
        latchedOpenDoors: state.latchedOpenDoors,
        levers,
        plateHeld: computePlateHeld(room, state.player, state.blocks),
      });

      for (const [doorId, after] of Object.entries(doors)) {
        const before = state.doors[doorId];

        if (before && !before.open && after.open) {
          events.push({ tag: 'door-opened', doorId });
        } else if (before && before.open && !after.open) {
          events.push({ tag: 'door-closed', doorId });
        }
      }

      const nextState = deepFreeze({
        ...state,
        levers,
        doors,
        lastEvents: events,
      });

      return {
        accepted: true,
        state: nextState,
        events: nextState.lastEvents,
      };
    }
  }

  return {
    accepted: true,
    state,
    events: [{ tag: 'interact-noop' }],
  };
}

/**
 * External flag change (console `setFlag`): sets flags[key] and
 * recomputes door states in a new frozen state. Never rejects.
 */
export function applyExternalFlag(
  state: TileGameState,
  room: TileRoom,
  key: string,
  value: boolean,
): TileGameState {
  if (state.flags[key] === value) {
    return state;
  }

  const flags = { ...state.flags };

  if (value) {
    flags[key] = true;
  } else {
    delete flags[key];
  }

  const events: TileEvent[] = [
    { tag: 'flag-set', key, value },
  ];

  const doors = computeDoorStates(room, {
    flags,
    latchedOpenDoors: state.latchedOpenDoors,
    levers: state.levers,
    plateHeld: computePlateHeld(room, state.player, state.blocks),
  });

  for (const [doorId, after] of Object.entries(doors)) {
    const before = state.doors[doorId];

    if (before && !before.open && after.open) {
      events.push({ tag: 'door-opened', doorId });
    } else if (before && before.open && !after.open) {
      events.push({ tag: 'door-closed', doorId });
    }
  }

  return deepFreeze({
    ...state,
    flags,
    doors,
    lastEvents: events,
  });
}

function reject(
  state: TileGameState,
  reason: 'wall' | 'locked-door' | 'block-stuck',
): TileOperationResult {
  return {
    accepted: false,
    state,
    events: [{ tag: 'blocked', reason }],
    reason,
  };
}

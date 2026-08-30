import {
  createObjectId,
  deepFreeze,
  type ObjectId,
  type OperationEvent,
  type Position,
} from './types';
import {
  canTraverse,
  createTraversalEdge,
  isAdjacent,
  type GeneratedEdge,
} from './traversal';

export const ADVENTURE_COLUMNS = 4;
export const ADVENTURE_ROWS = 5;
export const ADVENTURE_ROOM_WIDTH = 12;
export const ADVENTURE_ROOM_HEIGHT = 9;

export type AdventureDirection = 'up' | 'down' | 'left' | 'right';
export type AdventureSurface =
  | 'meadow'
  | 'sky'
  | 'rain'
  | 'night'
  | 'snow'
  | 'cave'
  | 'crystal'
  | 'sunset';

export interface AdventurePalette {
  readonly sky: number;
  readonly ground: number;
  readonly groundAlt: number;
  readonly edge: number;
  readonly glow: number;
}

export interface AdventureCell {
  readonly x: number;
  readonly y: number;
  readonly elevation: number;
  readonly surface: AdventureSurface;
  readonly walkable: boolean;
}

export interface AdventureProp {
  readonly id: string;
  readonly assetKey: string;
  readonly x: number;
  readonly y: number;
  readonly elevation: number;
  readonly foreground: boolean;
  readonly blocks: boolean;
}

export interface AdventureNpc {
  readonly id: string;
  readonly name: string;
  readonly line: string;
  readonly assetKey: string;
  readonly x: number;
  readonly y: number;
  readonly elevation: number;
}

export interface AdventureExit {
  readonly id: string;
  readonly direction: AdventureDirection;
  readonly at: Position;
  readonly targetRoom: string;
  readonly spawn: Position;
}

export interface AdventureNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly label: string;
}

export interface AdventureRoom {
  readonly id: string;
  readonly gridX: number;
  readonly gridY: number;
  readonly title: string;
  readonly description: string;
  readonly surface: AdventureSurface;
  readonly palette: AdventurePalette;
  readonly width: number;
  readonly height: number;
  readonly cells: readonly (readonly AdventureCell[])[];
  readonly spawn: Position;
  readonly exits: readonly AdventureExit[];
  readonly connectors: readonly GeneratedEdge[];
  readonly node: AdventureNode;
  readonly props: readonly AdventureProp[];
  readonly npcs: readonly AdventureNpc[];
}

export interface AdventureRoomSpec {
  readonly id: string;
  readonly gridX: number;
  readonly gridY: number;
  readonly title: string;
  readonly description: string;
  readonly surface: AdventureSurface;
  readonly palette: AdventurePalette;
  readonly layout: readonly string[];
  readonly connectors?: readonly GeneratedEdge[];
  readonly node: AdventureNode;
  readonly props: readonly AdventureProp[];
  readonly npcs: readonly AdventureNpc[];
}

export interface AdventureCatalog {
  readonly rooms: Readonly<Record<string, AdventureRoom>>;
  readonly roomList: readonly AdventureRoom[];
  readonly startRoomId: string;
}

export interface AdventureState {
  readonly roomId: string;
  readonly player: Position;
  readonly windMarks: Readonly<Record<string, boolean>>;
  readonly lastEvents: readonly OperationEvent[];
}

export type AdventureAction =
  | { readonly kind: 'move'; readonly direction: AdventureDirection }
  | { readonly kind: 'interact' }
  | { readonly kind: 'reset' };

export interface AdventureOperationResult {
  readonly accepted: boolean;
  readonly state: AdventureState;
  readonly events: readonly OperationEvent[];
}

export interface AdventureExitResolution {
  readonly accepted: boolean;
  readonly roomId?: string;
  readonly spawn?: Position;
  readonly direction?: AdventureDirection;
}

const DIRECTIONS: readonly AdventureDirection[] = [
  'up',
  'down',
  'left',
  'right',
];

const DELTAS: Readonly<Record<AdventureDirection, Position>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const EXIT_AT: Readonly<Record<AdventureDirection, Position>> = {
  up: { x: 6, y: 0 },
  down: { x: 6, y: 8 },
  left: { x: 0, y: 4 },
  right: { x: 11, y: 4 },
};

const ROOM_SPAWN: Readonly<Record<AdventureDirection, Position>> = {
  up: { x: 6, y: 7 },
  down: { x: 6, y: 1 },
  left: { x: 10, y: 4 },
  right: { x: 1, y: 4 },
};

function roomIdAt(gridX: number, gridY: number): string | undefined {
  if (
    gridX < 0 ||
    gridX >= ADVENTURE_COLUMNS ||
    gridY < 0 ||
    gridY >= ADVENTURE_ROWS
  ) {
    return undefined;
  }

  return `wind-${String(gridY * ADVENTURE_COLUMNS + gridX).padStart(2, '0')}`;
}

function parseLayout(
  spec: AdventureRoomSpec,
): readonly (readonly AdventureCell[])[] {
  if (
    spec.layout.length !== ADVENTURE_ROOM_HEIGHT ||
    spec.layout.some((row) => row.length !== ADVENTURE_ROOM_WIDTH)
  ) {
    throw new Error(`${spec.id}: layout must be 12 columns x 9 rows`);
  }

  return spec.layout.map((row, y) =>
    Array.from(row, (token, x) => {
      const elevation = token === '2' ? 2 : token === '^' ? 1 : 0;
      const walkable = token !== '#' && token !== '~';

      if (!'.^2s~#'.includes(token)) {
        throw new Error(`${spec.id}: unsupported layout token ${token}`);
      }

      return {
        x,
        y,
        elevation,
        surface: spec.surface,
        walkable,
      };
    }),
  );
}

function buildExits(spec: AdventureRoomSpec): readonly AdventureExit[] {
  return DIRECTIONS.flatMap((direction) => {
    const targetRoom = roomIdAt(
      spec.gridX + (direction === 'left' ? -1 : direction === 'right' ? 1 : 0),
      spec.gridY + (direction === 'up' ? -1 : direction === 'down' ? 1 : 0),
    );

    if (!targetRoom) {
      return [];
    }

    return [
      {
        id: `${spec.id}-to-${targetRoom}`,
        direction,
        at: EXIT_AT[direction],
        targetRoom,
        spawn: ROOM_SPAWN[direction],
      },
    ];
  });
}

function buildConnectors(
  spec: AdventureRoomSpec,
  cells: readonly (readonly AdventureCell[])[],
): readonly GeneratedEdge[] {
  const explicit = spec.connectors ?? [];
  if (explicit.length > 0) {
    return explicit.map((edge) =>
      createTraversalEdge(edge.from, edge.to, edge.kind),
    );
  }

  const connectors: GeneratedEdge[] = [];

  for (const prop of spec.props) {
    if (prop.assetKey !== 'stairs' && prop.assetKey !== 'ramp') {
      continue;
    }

    const from = { x: prop.x, y: prop.y };
    const fromCell = cells[from.y]?.[from.x];
    if (!fromCell?.walkable) {
      continue;
    }

    const neighbor = DIRECTIONS.map((direction) => {
      const delta = DELTAS[direction];
      return { x: from.x + delta.x, y: from.y + delta.y };
    }).find((position) => {
      const toCell = cells[position.y]?.[position.x];
      return (
        toCell?.walkable === true &&
        Math.abs(fromCell.elevation - toCell.elevation) === 1
      );
    });

    if (!neighbor) {
      continue;
    }

    const kind = prop.assetKey === 'ramp' ? 'ramp' : 'stairs';
    connectors.push(createTraversalEdge(from, neighbor, kind));
    connectors.push(createTraversalEdge(neighbor, from, kind));
  }

  return connectors;
}

function isWithin(room: AdventureRoom, position: Position): boolean {
  return (
    position.x >= 0 &&
    position.x < room.width &&
    position.y >= 0 &&
    position.y < room.height
  );
}

function cellAt(
  room: AdventureRoom,
  position: Position,
): AdventureCell | undefined {
  return room.cells[position.y]?.[position.x];
}

function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

function edgeFor(
  room: AdventureRoom,
  from: Position,
  to: Position,
): GeneratedEdge | undefined {
  const explicit = room.connectors.find(
    (edge) => samePosition(edge.from, from) && samePosition(edge.to, to),
  );
  if (explicit) {
    return explicit;
  }

  const fromCell = cellAt(room, from);
  const toCell = cellAt(room, to);
  if (!fromCell?.walkable || !toCell?.walkable || !isAdjacent(from, to)) {
    return undefined;
  }

  return createTraversalEdge(from, to);
}

function adjacent(a: Position, b: Position): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

function playerObjectId(): ObjectId {
  return createObjectId('wind-player');
}

function roomObjectId(roomId: string, kind: string): ObjectId {
  return createObjectId(`wind-${kind}-${roomId}`);
}

export function createAdventureCatalog(
  specs: readonly AdventureRoomSpec[],
): AdventureCatalog {
  const rooms: Record<string, AdventureRoom> = {};

  for (const spec of specs) {
    const cells = parseLayout(spec);
    const room: AdventureRoom = {
      id: spec.id,
      gridX: spec.gridX,
      gridY: spec.gridY,
      title: spec.title,
      description: spec.description,
      surface: spec.surface,
      palette: spec.palette,
      width: ADVENTURE_ROOM_WIDTH,
      height: ADVENTURE_ROOM_HEIGHT,
      cells,
      spawn: { x: 6, y: 4 },
      exits: buildExits(spec),
      connectors: buildConnectors(spec, cells),
      node: spec.node,
      props: spec.props,
      npcs: spec.npcs,
    };

    if (rooms[room.id]) {
      throw new Error(`Duplicate adventure room ${room.id}`);
    }

    rooms[room.id] = deepFreeze(room);
  }

  const catalog: AdventureCatalog = {
    rooms,
    roomList: Object.values(rooms),
    startRoomId: 'wind-00',
  };
  const problems = validateAdventureCatalog(catalog);

  if (problems.length > 0) {
    throw new Error(`Invalid adventure catalog:\n${problems.join('\n')}`);
  }

  return deepFreeze(catalog);
}

export function validateAdventureCatalog(
  catalog: AdventureCatalog,
): readonly string[] {
  const problems: string[] = [];

  if (catalog.roomList.length !== ADVENTURE_COLUMNS * ADVENTURE_ROWS) {
    problems.push('catalog must contain exactly 20 rooms');
  }

  const coordinates = new Set<string>();
  for (const room of catalog.roomList) {
    const coordinate = `${room.gridX},${room.gridY}`;

    if (coordinates.has(coordinate)) {
      problems.push(`${room.id}: duplicate grid coordinate ${coordinate}`);
    }
    coordinates.add(coordinate);

    if (!roomIdAt(room.gridX, room.gridY)) {
      problems.push(`${room.id}: grid coordinate is outside 4x5 map`);
    }

    if (!cellAt(room, room.spawn)?.walkable) {
      problems.push(`${room.id}: spawn is not walkable`);
    }

    for (const exit of room.exits) {
      const expected = EXIT_AT[exit.direction];
      const target = catalog.rooms[exit.targetRoom];

      if (!samePosition(exit.at, expected)) {
        problems.push(`${room.id}: ${exit.id} is not on its boundary midpoint`);
      }
      if (!cellAt(room, exit.at)?.walkable) {
        problems.push(`${room.id}: ${exit.id} is not walkable`);
      }
      if (!target || !cellAt(target, exit.spawn)?.walkable) {
        problems.push(`${room.id}: ${exit.id} has an invalid target spawn`);
      }

      const reverseDirection =
        exit.direction === 'up'
          ? 'down'
          : exit.direction === 'down'
            ? 'up'
            : exit.direction === 'left'
              ? 'right'
              : 'left';
      if (
        !target?.exits.some(
          (candidate) =>
            candidate.targetRoom === room.id &&
            candidate.direction === reverseDirection,
        )
      ) {
        problems.push(`${room.id}: ${exit.id} has no reverse edge`);
      }
    }

    for (const edge of room.connectors) {
      const from = cellAt(room, edge.from);
      const to = cellAt(room, edge.to);
      if (!from?.walkable || !to?.walkable || !isAdjacent(edge.from, edge.to)) {
        problems.push(`${room.id}: connector has invalid endpoints`);
      } else if (
        Math.abs(from.elevation - to.elevation) !== 1 ||
        (edge.kind !== 'stairs' && edge.kind !== 'ramp')
      ) {
        problems.push(`${room.id}: connector must bridge exactly one elevation`);
      }
      if (
        !room.connectors.some(
          (candidate) =>
            samePosition(candidate.from, edge.to) &&
            samePosition(candidate.to, edge.from) &&
            candidate.kind === edge.kind,
        )
      ) {
        problems.push(`${room.id}: connector ${edge.kind} is missing its reverse edge`);
      }
    }

    if (!cellAt(room, room.node)?.walkable) {
      problems.push(`${room.id}: wind node is not walkable`);
    }

    for (const prop of room.props) {
      if (!cellAt(room, prop)?.walkable) {
        problems.push(`${room.id}: prop ${prop.id} is on an unwalkable cell`);
      }
    }
    for (const npc of room.npcs) {
      if (!cellAt(room, npc)?.walkable) {
        problems.push(`${room.id}: npc ${npc.id} is on an unwalkable cell`);
      }
    }
  }

  if (!catalog.rooms[catalog.startRoomId]) {
    problems.push(`missing start room ${catalog.startRoomId}`);
  }

  if (catalog.roomList.length > 0 && catalog.rooms[catalog.startRoomId]) {
    const visited = new Set<string>([catalog.startRoomId]);
    const queue = [catalog.startRoomId];

    while (queue.length > 0) {
      const roomId = queue.shift()!;
      for (const exit of catalog.rooms[roomId]!.exits) {
        if (!visited.has(exit.targetRoom)) {
          visited.add(exit.targetRoom);
          queue.push(exit.targetRoom);
        }
      }
    }

    if (visited.size !== catalog.roomList.length) {
      problems.push(`catalog graph reaches ${visited.size}/${catalog.roomList.length} rooms`);
    }
  }

  return problems;
}

export function createAdventureState(
  room: AdventureRoom,
  spawn: Position = room.spawn,
  windMarks: Readonly<Record<string, boolean>> = {},
): AdventureState {
  if (!isWithin(room, spawn) || !cellAt(room, spawn)?.walkable) {
    throw new Error(`${room.id}: invalid adventure spawn`);
  }

  return deepFreeze({
    roomId: room.id,
    player: { ...spawn },
    windMarks: { ...windMarks },
    lastEvents: [],
  });
}

function rejected(
  state: AdventureState,
  event: OperationEvent,
): AdventureOperationResult {
  return { accepted: false, state, events: [event] };
}

function nextState(
  state: AdventureState,
  player: Position,
  windMarks = state.windMarks,
  events: readonly OperationEvent[],
): AdventureOperationResult {
  return {
    accepted: true,
    state: deepFreeze({
      ...state,
      player: { ...player },
      windMarks: { ...windMarks },
      lastEvents: [...events],
    }),
    events,
  };
}

export function applyAdventureAction(
  state: AdventureState,
  room: AdventureRoom,
  action: AdventureAction,
): AdventureOperationResult {
  if (state.roomId !== room.id) {
    throw new Error(`State room ${state.roomId} does not match ${room.id}`);
  }

  if (action.kind === 'reset') {
    return nextState(state, room.spawn, state.windMarks, [
      { tag: 'noop' },
    ]);
  }

  if (action.kind === 'move') {
    const delta = DELTAS[action.direction];
    const target = {
      x: state.player.x + delta.x,
      y: state.player.y + delta.y,
    };
    const fromCell = cellAt(room, state.player);
    const targetCell = cellAt(room, target);
    const blockingProp = room.props.find(
      (prop) => prop.blocks && samePosition(prop, target),
    );
    const blockingNpc = room.npcs.find((npc) => samePosition(npc, target));

    if (
      !targetCell?.walkable ||
      !fromCell ||
      !canTraverse(
        fromCell,
        targetCell,
        edgeFor(room, state.player, target),
        {},
      ) ||
      blockingProp !== undefined ||
      blockingNpc !== undefined
    ) {
      return rejected(state, {
        tag: 'move-blocked',
        objectId: playerObjectId(),
        blockedBy: blockingProp
          ? createObjectId(blockingProp.id)
          : blockingNpc
            ? createObjectId(blockingNpc.id)
            : undefined,
      });
    }

    return nextState(state, target, state.windMarks, [
      { tag: 'moved', objectId: playerObjectId() },
    ]);
  }

  const npc = room.npcs.find((candidate) => adjacent(state.player, candidate));
  if (npc) {
    return nextState(state, state.player, state.windMarks, [
      {
        tag: 'dialogue-progressed',
        objectId: playerObjectId(),
        targetId: createObjectId(npc.id),
      },
    ]);
  }

  if (adjacent(state.player, room.node)) {
    const markKey = room.id;
    if (state.windMarks[markKey] !== true) {
      return nextState(
        state,
        state.player,
        { ...state.windMarks, [markKey]: true },
        [
          {
            tag: 'activated',
            objectId: playerObjectId(),
            targetId: roomObjectId(room.id, 'node'),
          },
        ],
      );
    }
  }

  return rejected(state, { tag: 'noop' });
}

export function resolveAdventureExit(
  state: AdventureState,
  room: AdventureRoom,
  catalog: AdventureCatalog,
): AdventureExitResolution {
  const exit = room.exits.find((candidate) => samePosition(candidate.at, state.player));

  if (!exit || !catalog.rooms[exit.targetRoom]) {
    return { accepted: false };
  }

  return {
    accepted: true,
    roomId: exit.targetRoom,
    spawn: exit.spawn,
    direction: exit.direction,
  };
}

export function reachableCells(room: AdventureRoom, start = room.spawn): ReadonlySet<string> {
  const visited = new Set<string>();
  const queue = [start];

  while (queue.length > 0) {
    const position = queue.shift()!;
    const key = `${position.x},${position.y}`;

    const occupiedByProp = room.props.some(
      (prop) => prop.blocks && samePosition(prop, position),
    );
    const occupiedByNpc = room.npcs.some((npc) => samePosition(npc, position));

    if (
      visited.has(key) ||
      !cellAt(room, position)?.walkable ||
      occupiedByProp ||
      occupiedByNpc
    ) {
      continue;
    }
    visited.add(key);

    for (const direction of DIRECTIONS) {
      const delta = DELTAS[direction];
      const next = { x: position.x + delta.x, y: position.y + delta.y };
      const fromCell = cellAt(room, position);
      const toCell = cellAt(room, next);
      if (
        fromCell &&
        toCell &&
        canTraverse(
          fromCell,
          toCell,
          edgeFor(room, position, next),
          {},
        )
      ) {
        queue.push(next);
      }
    }
  }

  return visited;
}

export function adventureIsComplete(
  state: AdventureState,
  catalog: AdventureCatalog,
): boolean {
  return catalog.roomList.every((room) => state.windMarks[room.id] === true);
}

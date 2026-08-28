import { describe, expect, it } from 'vitest';
import {
  createRoomTopology,
  projectReachability,
  transitionThroughTopology,
} from '@/world/topology';
import { initializeLocalWorld } from '@/world/local-world';
import {
  createClosureId,
  createObjectId,
  createRoomId,
  type RoomDefinition,
} from '@/world/types';
import type { RoomCatalog } from '@/world/transition';

const characterId = createObjectId('character');
const roomAId = createRoomId('a');
const roomBId = createRoomId('b');
const roomCId = createRoomId('c');

function createRoom(
  roomId: ReturnType<typeof createRoomId>,
  closureId: ReturnType<typeof createClosureId>,
): RoomDefinition {
  return {
    roomId,
    closureId,
    staticObjects: [],
    mutableObjects: [
      {
        id: characterId,
        kind: 'main-character',
        position: { x: 0, y: 0 },
        tags: [],
        initialState: {
          kind: 'main-character',
          position: { x: 0, y: 0 },
          facing: 'right',
        },
      },
    ],
    validateEntry: (entry) =>
      typeof entry.spawnX === 'number' &&
      Number.isInteger(entry.spawnX),
    initialize: ({ entry, persistentMetadata }) => ({
      roomId,
      closureId,
      entry,
      persistentMetadata,
      objects: {
        [characterId]: {
          kind: 'main-character',
          position: {
            x: entry.spawnX as number,
            y: 0,
          },
          facing: 'right',
        },
      },
      lastEvents: [],
    }),
  };
}

const roomA = createRoom(roomAId, createClosureId('closure-a'));
const roomB = createRoom(roomBId, createClosureId('closure-b'));
const roomC = createRoom(roomCId, createClosureId('closure-c'));
const catalog: RoomCatalog = {
  [roomAId]: roomA,
  [roomBId]: roomB,
  [roomCId]: roomC,
};

const topology = createRoomTopology({
  routes: [
    {
      fromRoomId: roomAId,
      toRoomId: roomBId,
      entry: { spawnX: 1 },
    },
    {
      fromRoomId: roomBId,
      toRoomId: roomCId,
      entry: { spawnX: 2 },
      canTraverse: ({ persistentMetadata }) =>
        persistentMetadata.bridgePowered === true,
    },
    {
      fromRoomId: roomAId,
      toRoomId: roomCId,
      entry: { spawnX: 3 },
      canTraverse: ({ persistentMetadata }) =>
        persistentMetadata.shortcutOpen === true,
    },
  ],
});

describe('Chapter 8 room topology', () => {
  it('snapshots topology entries and freezes the definition', () => {
    const entry = { spawnX: 1 };
    const snapshot = createRoomTopology({
      routes: [
        {
          fromRoomId: roomAId,
          toRoomId: roomBId,
          entry,
        },
      ],
    });

    entry.spawnX = 9;

    expect(snapshot.routes[0]?.entry).toEqual({
      spawnX: 1,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.routes)).toBe(true);
    expect(Object.isFrozen(snapshot.routes[0]?.entry)).toBe(
      true,
    );
  });

  it('projects only reachable rooms and preserves explicit shortcuts', () => {
    const initial = initializeLocalWorld(
      roomA,
      { spawnX: 0 },
      {
        bridgePowered: false,
        shortcutOpen: false,
      },
    );

    const blocked = projectReachability(
      initial,
      catalog,
      topology,
    );
    expect(blocked.reachableRoomIds).toEqual([
      roomAId,
      roomBId,
    ]);
    expect(
      blocked.availableRoutes.map((route) => route.toRoomId),
    ).toEqual([roomBId]);

    const shortcutState = initializeLocalWorld(
      roomA,
      { spawnX: 0 },
      {
        bridgePowered: false,
        shortcutOpen: true,
      },
    );
    const shortcut = projectReachability(
      shortcutState,
      catalog,
      topology,
    );

    expect(shortcut.reachableRoomIds).toEqual([
      roomAId,
      roomBId,
      roomCId,
    ]);
    expect(
      shortcut.availableRoutes.map((route) => route.toRoomId),
    ).toEqual([roomBId, roomCId]);
  });

  it('does not infer reverse routes or use an unrelated capability graph', () => {
    const roomBState = initializeLocalWorld(
      roomB,
      { spawnX: 1 },
      { bridgePowered: false, shortcutOpen: true },
    );
    const projection = projectReachability(
      roomBState,
      catalog,
      topology,
    );

    expect(projection.reachableRoomIds).toEqual([roomBId]);
    expect(projection.availableRoutes).toEqual([]);
  });

  it('handles cycles without inferring unknown rooms', () => {
    const initial = initializeLocalWorld(
      roomA,
      { spawnX: 0 },
      {},
    );
    const cyclicTopology = createRoomTopology({
      routes: [
        {
          fromRoomId: roomAId,
          toRoomId: roomBId,
          entry: { spawnX: 1 },
        },
        {
          fromRoomId: roomBId,
          toRoomId: roomAId,
          entry: { spawnX: 0 },
        },
        {
          fromRoomId: roomAId,
          toRoomId: createRoomId('missing'),
          entry: { spawnX: 4 },
        },
      ],
    });

    const projection = projectReachability(
      initial,
      catalog,
      cyclicTopology,
    );

    expect(projection.reachableRoomIds).toEqual([
      roomAId,
      roomBId,
    ]);
    expect(
      projection.availableRoutes.map((route) => route.toRoomId),
    ).toEqual([roomBId, roomAId]);
  });

  it('keeps route predicates from mutating persistent metadata', () => {
    const initial = initializeLocalWorld(
      roomA,
      { spawnX: 0 },
      {
        nested: { opened: false },
      },
    );
    const mutatingTopology = createRoomTopology({
      routes: [
        {
          fromRoomId: roomAId,
          toRoomId: roomBId,
          entry: { spawnX: 1 },
          canTraverse: ({ persistentMetadata }) => {
            const nested = persistentMetadata.nested as {
              opened: boolean;
            };
            nested.opened = true;
            return true;
          },
        },
      ],
    });

    projectReachability(
      initial,
      catalog,
      mutatingTopology,
    );

    expect(initial.persistentMetadata).toEqual({
      nested: { opened: false },
    });
  });

  it('rejects blocked routes without changing the current world', () => {
    const initial = initializeLocalWorld(
      roomA,
      { spawnX: 0 },
      {
        bridgePowered: false,
        shortcutOpen: false,
      },
    );

    const result = transitionThroughTopology(
      initial,
      catalog,
      topology,
      roomCId,
    );

    expect(result).toMatchObject({
      accepted: false,
      reason: 'route-not-reachable',
      state: initial,
    });
  });

  it('uses the explicit shortcut entry when a route is available', () => {
    const initial = initializeLocalWorld(
      roomA,
      { spawnX: 0 },
      {
        bridgePowered: false,
        shortcutOpen: true,
      },
    );

    const result = transitionThroughTopology(
      initial,
      catalog,
      topology,
      roomCId,
    );

    expect(result).toMatchObject({
      accepted: true,
      fromRoomId: roomAId,
      toRoomId: roomCId,
      state: {
        roomId: roomCId,
        objects: {
          [characterId]: {
            position: { x: 3, y: 0 },
          },
        },
      },
    });
    expect(result.state.persistentMetadata).toEqual({
      bridgePowered: false,
      shortcutOpen: true,
    });
  });

  it('lets the existing transition validator reject invalid route entries', () => {
    const invalidTopology = createRoomTopology({
      routes: [
        {
          fromRoomId: roomAId,
          toRoomId: roomBId,
          entry: { spawnX: 1.5 },
        },
      ],
    });
    const initial = initializeLocalWorld(
      roomA,
      { spawnX: 0 },
      {},
    );

    const result = transitionThroughTopology(
      initial,
      catalog,
      invalidTopology,
      roomBId,
    );

    expect(result).toMatchObject({
      accepted: false,
      reason: 'invalid-entry-parameters',
      state: initial,
    });
  });
});

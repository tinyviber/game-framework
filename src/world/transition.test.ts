import { describe, expect, it } from 'vitest';
import {
  initializeLocalWorld,
} from '@/world/local-world';
import {
  transitionRoom,
  type RoomCatalog,
} from '@/world/transition';
import {
  createClosureId,
  createObjectId,
  createRoomId,
  type RoomDefinition,
} from '@/world/types';

const characterId = createObjectId('character');

function createRoom(
  roomId: string,
  closureId: string,
): RoomDefinition {
  const typedRoomId = createRoomId(roomId);
  const typedClosureId = createClosureId(closureId);

  return {
    roomId: typedRoomId,
    closureId: typedClosureId,
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
      roomId: typedRoomId,
      closureId: typedClosureId,
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

describe('room transition', () => {
  it('rebuilds A to B to A from definitions and entry parameters', () => {
    const roomA = createRoom('a', 'closure-a');
    const roomB = createRoom('b', 'closure-b');
    const catalog: RoomCatalog = {
      [roomA.roomId]: roomA,
      [roomB.roomId]: roomB,
    };
    const persistentMetadata = {
      campaign: {
        powered: true,
      },
    };
    const initial = initializeLocalWorld(
      roomA,
      { spawnX: 0 },
      persistentMetadata,
    );

    const enteredB = transitionRoom(
      initial,
      catalog,
      roomB.roomId,
      { spawnX: 4 },
    );
    const enteredA = transitionRoom(
      enteredB.state,
      catalog,
      roomA.roomId,
      { spawnX: 1 },
    );

    expect(enteredB).toMatchObject({
      accepted: true,
      fromRoomId: roomA.roomId,
      toRoomId: roomB.roomId,
      state: {
        roomId: roomB.roomId,
        closureId: roomB.closureId,
        objects: {
          [characterId]: {
            position: { x: 4, y: 0 },
          },
        },
      },
    });
    expect(enteredA).toMatchObject({
      accepted: true,
      state: {
        roomId: roomA.roomId,
        closureId: roomA.closureId,
        objects: {
          [characterId]: {
            position: { x: 1, y: 0 },
          },
        },
      },
    });
    expect(enteredA.state.persistentMetadata).toEqual(
      persistentMetadata,
    );
  });

  it('keeps the current world when the room or entry is invalid', () => {
    const room = createRoom('room', 'closure');
    const catalog: RoomCatalog = {
      [room.roomId]: room,
    };
    const initial = initializeLocalWorld(
      room,
      { spawnX: 0 },
      {},
    );

    const unknownRoom = transitionRoom(
      initial,
      catalog,
      createRoomId('missing'),
      { spawnX: 1 },
    );
    const invalidEntry = transitionRoom(
      initial,
      catalog,
      room.roomId,
      { spawnX: 1.5 },
    );

    expect(unknownRoom).toMatchObject({
      accepted: false,
      reason: 'unknown-room',
      state: initial,
    });
    expect(invalidEntry).toMatchObject({
      accepted: false,
      reason: 'invalid-entry-parameters',
      state: initial,
    });
  });
});

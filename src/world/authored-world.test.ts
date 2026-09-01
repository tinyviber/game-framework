import { describe, expect, it } from 'vitest';
import {
  createAuthoredWorld,
  validateAuthoredWorld,
  type AuthoredWorld,
} from './authored-world';
import { createRoomId } from './types';

const legend = {
  '.': {
    surface: 'grass' as const,
    elevation: 0,
    obstacle: null,
    walkable: true,
  },
};

const roomA = createRoomId('a');
const roomB = createRoomId('b');

function validWorld(): AuthoredWorld {
  return {
    startRoomId: roomA,
    startPosition: { x: 1, y: 1 },
    rooms: [
      {
        id: roomA,
        title: 'A',
        description: 'A',
        width: 3,
        height: 3,
        grid: ['...', '...', '...'],
        legend,
        spawn: { x: 1, y: 1 },
        exits: [
          {
            id: 'a-east',
            direction: 'right',
            position: { x: 2, y: 1 },
            targetRoomId: roomB,
            targetEntry: { x: 0, y: 1 },
            reciprocalExitId: 'b-west',
          },
        ],
      },
      {
        id: roomB,
        title: 'B',
        description: 'B',
        width: 3,
        height: 3,
        grid: ['...', '...', '...'],
        legend,
        spawn: { x: 1, y: 1 },
        exits: [
          {
            id: 'b-west',
            direction: 'left',
            position: { x: 0, y: 1 },
            targetRoomId: roomA,
            targetEntry: { x: 2, y: 1 },
            reciprocalExitId: 'a-east',
          },
        ],
      },
    ],
  };
}

describe('authored world validation', () => {
  it('accepts a valid reciprocal two-room world', () => {
    expect(validateAuthoredWorld(validWorld())).toEqual([]);
    expect(() => createAuthoredWorld(validWorld())).not.toThrow();
  });

  it('rejects unknown targets, invalid spawns, and invalid target entries', () => {
    const world = validWorld();
    const invalid = {
      ...world,
      startPosition: { x: 1, y: 1 },
      rooms: world.rooms.map((room, index) => index === 0
        ? {
            ...room,
            spawn: { x: 9, y: 9 },
            exits: [{
              ...room.exits[0]!,
              targetRoomId: createRoomId('missing'),
              targetEntry: { x: 9, y: 9 },
            }],
          }
        : room),
    } as AuthoredWorld;
    const errors = validateAuthoredWorld(invalid);
    expect(errors.some((error) => error.includes('unknown target room'))).toBe(true);
    expect(errors.some((error) => error.includes('spawn outside bounds'))).toBe(true);
    const invalidEntry = {
      ...world,
      rooms: world.rooms.map((room, index) => index === 0
        ? {
            ...room,
            exits: [{
              ...room.exits[0]!,
              targetEntry: { x: 9, y: 9 },
            }],
          }
        : room),
    };
    expect(validateAuthoredWorld(invalidEntry).some((error) => error.includes('target entry outside bounds'))).toBe(true);
  });

  it('rejects a reciprocal direction or entry mismatch', () => {
    const world = validWorld();
    const invalid = {
      ...world,
      rooms: world.rooms.map((room) => room.id === roomB
        ? {
            ...room,
            exits: [{ ...room.exits[0]!, direction: 'right' as const }],
          }
        : room),
    };
    expect(validateAuthoredWorld(invalid).some((error) => error.includes('reciprocal mismatch'))).toBe(true);
  });

  it('rejects duplicate ids and malformed rows', () => {
    const world = validWorld();
    const invalid = {
      ...world,
      rooms: [
        { ...world.rooms[0]!, id: roomB, grid: ['..', '...', '...'] },
        { ...world.rooms[1]!, exits: [{ ...world.rooms[1]!.exits[0]!, id: 'a-east' }] },
      ],
    };
    const errors = validateAuthoredWorld(invalid);
    expect(errors.some((error) => error.includes('duplicate room id'))).toBe(true);
    expect(errors.some((error) => error.includes('duplicate exit id'))).toBe(true);
    expect(errors.some((error) => error.includes('malformed row width'))).toBe(true);
  });
});

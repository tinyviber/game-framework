import { describe, expect, it } from 'vitest';
import { initializeLocalWorld } from '@/world/local-world';
import {
  createClosureId,
  createObjectId,
  createRoomId,
  createRoomDefinition,
  isObjectState,
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

describe('Local World foundation', () => {
  it('keeps a frozen snapshot of definition data', () => {
    const definition = createRoom(
      'snapshot',
      'closure-snapshot',
    );
    const snapshot = createRoomDefinition(definition);
    const mutableObjects =
      definition.mutableObjects as unknown as Array<{
        initialState: {
          position: { x: number; y: number };
        };
      }>;

    mutableObjects[0]!.initialState.position.x = 42;

    expect(snapshot.mutableObjects[0]).toMatchObject({
      initialState: {
        position: { x: 0, y: 0 },
      },
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.mutableObjects)).toBe(
      true,
    );
  });

  it('initializes from copied entry and persistent data', () => {
    const definition = createRoom('a', 'closure-a');
    const entry = {
      spawnX: 2,
      nested: {
        note: 'entry',
      },
    };
    const persistentMetadata = {
      progress: {
        opened: false,
      },
    };

    const state = initializeLocalWorld(
      definition,
      entry,
      persistentMetadata,
    );

    entry.spawnX = 99;
    entry.nested.note = 'changed';
    persistentMetadata.progress.opened = true;

    expect(state.entry).toEqual({
      spawnX: 2,
      nested: { note: 'entry' },
    });
    expect(state.persistentMetadata).toEqual({
      progress: { opened: false },
    });
    expect(state.objects[characterId]).toMatchObject({
      position: { x: 2, y: 0 },
    });
  });

  it('accepts every built-in object state kind via the validator registry', () => {
    const validStates: unknown[] = [
      {
        kind: 'main-character',
        position: { x: 0, y: 0 },
        facing: 'left',
      },
      {
        kind: 'npc',
        position: { x: 1, y: 2 },
        mood: 'neutral',
        dialogueStage: 0,
      },
      { kind: 'mechanism', active: true },
      { kind: 'door', status: 'closed' },
      { kind: 'obstacle', status: 'cleared' },
    ];

    for (const state of validStates) {
      expect(isObjectState(state)).toBe(true);
    }

    expect(
      isObjectState({ kind: 'future-kind', anything: 1 }),
    ).toBe(false);
  });

  it('never throws and never accepts junk shapes', () => {
    // Deterministic pseudo-random fuzz over plausible junk values.
    let seed = 123456789;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const pick = <T>(items: readonly T[]): T =>
      items[Math.floor(next() * items.length)] as T;

    const junk: readonly unknown[] = [
      null,
      undefined,
      0,
      1,
      NaN,
      Infinity,
      '',
      'door',
      true,
      false,
      [],
      {},
      [1, 'door'],
      { kind: 'door' },
      { position: { x: 0, y: 0 } },
    ];

    const makeValue = (depth: number): unknown => {
      const roll = next();

      if (depth > 2 || roll < 0.4) {
        return pick(junk);
      }

      if (roll < 0.7) {
        return [makeValue(depth + 1)];
      }

      return {
        kind: pick([
          'door',
          'npc',
          'mechanism',
          'obstacle',
          'main-character',
          'bogus',
          undefined,
        ]),
        position: makeValue(depth + 1),
        status: makeValue(depth + 1),
        active: makeValue(depth + 1),
        facing: makeValue(depth + 1),
        mood: makeValue(depth + 1),
        dialogueStage: makeValue(depth + 1),
      };
    };

    for (let index = 0; index < 300; index += 1) {
      const value = makeValue(0);

      expect(() => isObjectState(value)).not.toThrow();

      if (isObjectState(value)) {
        // Anything accepted must at least carry a known kind.
        expect(
          [
            'main-character',
            'npc',
            'mechanism',
            'door',
            'obstacle',
          ].includes((value as { kind: string }).kind),
        ).toBe(true);
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  createSpatialIndex,
  movementIsLegal,
} from './spatial';
import {
  createObjectId,
  type ObjectDefinition,
} from './types';

const rockId = createObjectId('rock');
const doorId = createObjectId('door');
const exitId = createObjectId('exit');

const objects: ObjectDefinition[] = [
  {
    id: rockId,
    kind: 'terrain',
    position: { x: 0, y: 0 },
    tags: [],
  },
  {
    id: doorId,
    kind: 'door',
    position: { x: 2, y: 0 },
    tags: [],
    initialState: { kind: 'door', status: 'closed' },
  },
  {
    id: exitId,
    kind: 'exit',
    position: { x: 2, y: 1 },
    tags: [],
  },
];

describe('spatial primitives', () => {
  it('indexes definition positions and finds co-located objects', () => {
    const index = createSpatialIndex(objects);

    expect(index.objectsAt({ x: 2, y: 0 })).toEqual([doorId]);
    expect(index.objectsAt({ x: 2, y: 1 })).toEqual([exitId]);
    expect(index.objectsAt({ x: 9, y: 9 })).toEqual([]);
  });

  it('returns a stable order for objects sharing a cell', () => {
    const gateId = createObjectId('gate-obstacle');
    const index = createSpatialIndex([
      ...objects,
      {
        id: gateId,
        kind: 'obstacle',
        position: { x: 2, y: 0 },
        tags: [],
        initialState: { kind: 'obstacle', status: 'blocking' },
      },
    ]);

    expect(index.objectsAt({ x: 2, y: 0 })).toEqual([
      doorId,
      gateId,
    ]);
  });

  it('treats missing bounds as unbounded space', () => {
    expect(movementIsLegal(undefined, { x: -999, y: 999 })).toBe(
      true,
    );
  });

  it('rejects positions outside bounds on any edge', () => {
    const bounds = { minX: 0, maxX: 3, minY: 0, maxY: 1 };

    expect(movementIsLegal(bounds, { x: 0, y: 0 })).toBe(true);
    expect(movementIsLegal(bounds, { x: 3, y: 1 })).toBe(true);
    expect(movementIsLegal(bounds, { x: -1, y: 0 })).toBe(false);
    expect(movementIsLegal(bounds, { x: 4, y: 0 })).toBe(false);
    expect(movementIsLegal(bounds, { x: 0, y: -1 })).toBe(false);
    expect(movementIsLegal(bounds, { x: 0, y: 2 })).toBe(false);
  });
});

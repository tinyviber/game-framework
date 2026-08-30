import { describe, expect, it } from 'vitest';
import { canTraverse } from './traversal';

type Cell = { readonly x: number; readonly y: number; readonly elevation: number; readonly walkable: boolean };
type Edge = { readonly from: { readonly x: number; readonly y: number }; readonly to: { readonly x: number; readonly y: number }; readonly kind: 'normal' | 'stairs' | 'ramp' | 'height-barrier' };

const cell = (x: number, y: number, elevation = 0, walkable = true): Cell => ({ x, y, elevation, walkable });
const edge = (from: Cell, to: Cell, kind: Edge['kind']): Edge => ({ from, to, kind });
const open = {};

describe('edge traversal', () => {
  it('allows same-height normal edges and rejects ordinary height changes', () => {
    const low = cell(1, 1);
    const same = cell(2, 1);
    const high = cell(2, 1, 1);

    expect(canTraverse(low, same, edge(low, same, 'normal'), open)).toBe(true);
    expect(canTraverse(low, high, edge(low, high, 'normal'), open)).toBe(false);
  });

  it.each(['stairs', 'ramp'] as const)('allows a %s edge in both directions only when both directed edges exist', (kind) => {
    const low = cell(1, 1);
    const high = cell(2, 1, 1);
    const sameHeight = cell(2, 1);

    expect(canTraverse(low, high, edge(low, high, kind), open)).toBe(true);
    expect(canTraverse(high, low, edge(high, low, kind), open)).toBe(true);
    expect(canTraverse(low, sameHeight, edge(low, sameHeight, kind), open)).toBe(true);
    expect(canTraverse(high, low, undefined, open)).toBe(false);
    expect(canTraverse(high, low, edge(low, high, kind), open)).toBe(false);
  });

  it('blocks barriers, walls, missing edges, wrong endpoints, non-adjacent cells, and height differences over one', () => {
    const low = cell(1, 1);
    const high = cell(2, 1, 2);
    const wall = cell(2, 1, 0, false);
    const far = cell(4, 1, 0);

    expect(canTraverse(low, high, edge(low, high, 'stairs'), open)).toBe(false);
    expect(canTraverse(low, cell(2, 1), edge(low, cell(2, 1), 'height-barrier'), open)).toBe(false);
    expect(canTraverse(low, wall, edge(low, wall, 'normal'), open)).toBe(false);
    expect(canTraverse(low, cell(2, 1), undefined, open)).toBe(false);
    expect(canTraverse(low, cell(2, 1), edge(cell(9, 9), cell(2, 1), 'normal'), open)).toBe(false);
    expect(canTraverse(low, far, edge(low, far, 'normal'), open)).toBe(false);
  });
});

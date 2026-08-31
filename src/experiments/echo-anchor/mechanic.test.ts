import { describe, expect, it } from 'vitest';
import {
  canEnterCell,
  collapseAfterMove,
  createEchoLayout,
  createInitialEchoState,
  gateIsOpen,
  isCollapsed,
  isStranded,
  placeEcho,
  positionKey,
  pullLever,
  recallEcho,
} from './mechanic';
import type { Position } from '@/world/types';

const PATH: readonly Position[] = Array.from({ length: 20 }, (_, index) => ({
  x: index,
  y: 7,
}));

describe('echo layout', () => {
  it('lays out gate, goal, bridge and lever in path order', () => {
    const layout = createEchoLayout(PATH);
    // leverIndex = 17, bridge = 13..15, goal = 12, gate = 11
    expect(layout.gate).toEqual({ x: 11, y: 7 });
    expect(layout.goal).toEqual({ x: 12, y: 7 });
    expect(layout.bridge.map(positionKey)).toEqual(['13,7', '14,7', '15,7']);
    expect(layout.lever).toEqual({ x: 17, y: 7 });
  });

  it('rejects short paths', () => {
    expect(() => createEchoLayout(PATH.slice(0, 8))).toThrow();
  });
});

describe('echo anchor', () => {
  it('anchors at the player position and replaces any old echo', () => {
    let state = createInitialEchoState();
    state = placeEcho(state, { x: 3, y: 7 });
    expect(state.echo).toEqual({ x: 3, y: 7 });
    state = placeEcho(state, { x: 9, y: 7 });
    expect(state.echo).toEqual({ x: 9, y: 7 });
  });

  it('recall returns the anchor and consumes it', () => {
    const state = placeEcho(createInitialEchoState(), { x: 10, y: 7 });
    const result = recallEcho(state);
    expect(result.ok).toBe(true);
    expect(result.ok && result.destination).toEqual({ x: 10, y: 7 });
    expect(result.ok && result.state.echo).toBeNull();
  });

  it('recall without an anchor fails without touching state', () => {
    const state = createInitialEchoState();
    const result = recallEcho(state);
    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
  });
});

describe('collapsing bridge', () => {
  const layout = createEchoLayout(PATH);

  it('collapses a plank only after the player steps off it', () => {
    let state = createInitialEchoState();
    state = collapseAfterMove(layout, state, layout.bridge[0]!, layout.bridge[1]!);
    expect(isCollapsed(state, layout.bridge[0]!)).toBe(true);
    expect(isCollapsed(state, layout.bridge[1]!)).toBe(false);
  });

  it('never collapses ordinary ground', () => {
    let state = createInitialEchoState();
    state = collapseAfterMove(layout, state, { x: 2, y: 7 }, { x: 3, y: 7 });
    expect(state.collapsedKeys).toEqual([]);
  });

  it('collapsed planks block entry', () => {
    let state = createInitialEchoState();
    state = collapseAfterMove(layout, state, layout.bridge[0]!, layout.bridge[1]!);
    expect(canEnterCell(layout, state, layout.bridge[0]!)).toBe(false);
    expect(canEnterCell(layout, state, layout.bridge[1]!)).toBe(true);
  });

  it('flags the stranded hint on the far side without an echo', () => {
    let state = createInitialEchoState();
    state = collapseAfterMove(layout, state, layout.bridge[0]!, layout.bridge[1]!);
    expect(isStranded(layout, state, layout.bridge[2]!)).toBe(true);
    expect(isStranded(layout, placeEcho(state, { x: 5, y: 7 }), layout.bridge[2]!)).toBe(false);
    expect(isStranded(layout, state, { x: 2, y: 7 })).toBe(false);
  });
});

describe('lever and gate', () => {
  const layout = createEchoLayout(PATH);

  it('gate blocks until the lever is pulled', () => {
    const state = createInitialEchoState();
    expect(gateIsOpen(state)).toBe(false);
    expect(canEnterCell(layout, state, layout.gate)).toBe(false);
    const pulled = pullLever(layout, state, layout.lever);
    expect(gateIsOpen(pulled)).toBe(true);
    expect(canEnterCell(layout, pulled, layout.gate)).toBe(true);
  });

  it('lever only responds on the lever cell, and only once', () => {
    const state = createInitialEchoState();
    expect(pullLever(layout, state, { x: 0, y: 0 })).toBe(state);
    const pulled = pullLever(layout, state, layout.lever);
    expect(pullLever(layout, pulled, layout.lever)).toBe(pulled);
  });
});

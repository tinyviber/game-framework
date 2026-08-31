import { describe, expect, it } from 'vitest';
import {
  CARRY_LIMIT,
  canEnterCell,
  createInitialSiftingState,
  createSiftingLayout,
  dropCarried,
  gateIsOpen,
  placeOnPedestal,
  siftFromUrn,
  tossIntoUrn,
  type SiftingState,
} from './mechanic';
import type { Position } from '@/world/types';

const PATH: readonly Position[] = Array.from({ length: 24 }, (_, index) => ({
  x: index,
  y: 5,
}));
const GOAL: Position = { x: 23, y: 5 };

function sifting(
  overrides: Partial<SiftingState> = {},
): SiftingState {
  return { ...createInitialSiftingState(), ...overrides };
}

describe('sifting shrine layout', () => {
  it('places every interactive cell on distinct path cells', () => {
    const layout = createSiftingLayout(PATH, GOAL);
    const keys = [
      layout.urn,
      layout.lightPedestal,
      layout.heavyPedestal,
      layout.gate,
    ].map((position) => `${position.x},${position.y}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(layout.gate).toEqual(PATH[PATH.length - 2]);
    expect(layout.goal).toEqual(GOAL);
  });

  it('rejects short paths', () => {
    expect(() => createSiftingLayout(PATH.slice(0, 10), GOAL)).toThrow();
  });
});

describe('urn ordering rule (lightest first, oldest breaks ties)', () => {
  it('releases feather before pebble before gold regardless of insertion order', () => {
    let state = createInitialSiftingState();
    const order: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const result = siftFromUrn(state);
      expect(result.ok).toBe(true);
      order.push(result.ok ? result.state.carried.at(-1)! : 'none');
      // Free the hands so the next sift is allowed (carry limit is 2).
      state = { ...result.state, carried: [] };
    }
    expect(order).toEqual(['feather', 'pebble', 'gold']);
  });

  it('tossed items join the same ordering: a lighter newcomer jumps the queue', () => {
    let state = sifting({ urn: [{ kind: 'gold', insertedAt: 0 }], carried: ['pebble', 'feather'], insertCounter: 1 });
    const tossed = tossIntoUrn(state);
    expect(tossed.ok).toBe(true);
    state = tossed.state;
    expect(state.carried).toEqual([]);
    const first = siftFromUrn(state);
    expect(first.ok && first.state.carried.at(-1)).toBe('feather');
  });

  it('breaks weight ties by insertion order', () => {
    const state = sifting({
      urn: [
        { kind: 'pebble', insertedAt: 5 },
        { kind: 'pebble', insertedAt: 2 },
      ],
    });
    const first = siftFromUrn(state);
    expect(first.ok).toBe(true);
    expect(first.ok && first.state.urn[0]?.insertedAt).toBe(5);
  });

  it('refuses to sift into full hands', () => {
    const state = sifting({ carried: ['pebble', 'gold'] });
    const result = siftFromUrn(state);
    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
  });

  it('never exceeds the carry limit', () => {
    let state = createInitialSiftingState();
    state = siftFromUrn(state).state;
    state = siftFromUrn(state).state;
    expect(state.carried.length).toBe(CARRY_LIMIT);
    expect(siftFromUrn(state).ok).toBe(false);
  });
});

describe('pedestals and the gate', () => {
  it('rejects the wrong offering with an explanation', () => {
    const state = sifting({ carried: ['pebble'] });
    const light = placeOnPedestal(state, 'light');
    expect(light.ok).toBe(false);
    const heavy = placeOnPedestal(state, 'heavy');
    expect(heavy.ok).toBe(false);
    expect(state.carried).toEqual(['pebble']);
  });

  it('accepts the matching seed and consumes it', () => {
    const state = sifting({ carried: ['feather', 'gold'] });
    const result = placeOnPedestal(state, 'light');
    expect(result.ok).toBe(true);
    expect(result.ok && result.state.lightPedestal).toBe('feather');
    expect(result.ok && result.state.carried).toEqual(['gold']);
  });

  it('opens the gate only when both pedestals are filled', () => {
    const layout = createSiftingLayout(PATH, GOAL);
    let state = sifting({ carried: ['feather', 'gold'] });
    expect(gateIsOpen(state)).toBe(false);
    expect(canEnterCell(layout, state, layout.gate)).toBe(false);
    state = placeOnPedestal(state, 'light').state;
    expect(canEnterCell(layout, state, layout.gate)).toBe(false);
    state = placeOnPedestal(state, 'heavy').state;
    expect(gateIsOpen(state)).toBe(true);
    expect(canEnterCell(layout, state, layout.gate)).toBe(true);
  });

  it('never blocks ordinary cells', () => {
    const layout = createSiftingLayout(PATH, GOAL);
    const state = createInitialSiftingState();
    expect(canEnterCell(layout, state, { x: 0, y: 0 })).toBe(true);
  });
});

describe('dropping', () => {
  it('drops the oldest carried seed', () => {
    const state = sifting({ carried: ['pebble', 'gold'] });
    const result = dropCarried(state);
    expect(result.ok).toBe(true);
    expect(result.ok && result.state.carried).toEqual(['gold']);
  });

  it('refuses to drop from empty hands', () => {
    const state = createInitialSiftingState();
    expect(dropCarried(state).ok).toBe(false);
  });
});

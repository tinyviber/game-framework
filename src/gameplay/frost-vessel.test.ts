import { describe, expect, it } from 'vitest';
import { MAIN_WORLD } from '@/content/main-world';
import {
  authoredPlayerPosition,
  castAuthoredFrost,
  createAuthoredGame,
  createAuthoredPlayState,
  interactAuthoredPlayer,
  moveAuthoredPlayer,
} from './authored-world';
import {
  advanceFrost,
  castFrost,
  createInitialFrostState,
  FROST_LIFETIME,
  FROST_RADIUS,
  isFrozen,
} from './frost-vessel';
import { authoredCells } from '@/world/authored-world';

const game = createAuthoredGame(MAIN_WORLD);
const room = MAIN_WORLD.rooms.find((candidate) => candidate.id === 'ruins-entrance')!;
const shore = room.spawn;

function acquiredState() {
  const initial = createAuthoredPlayState(game, room.id);
  return interactAuthoredPlayer(initial).state;
}

function move(
  state: ReturnType<typeof acquiredState>,
  direction: 'up' | 'down' | 'left' | 'right',
) {
  const result = moveAuthoredPlayer(state, direction);
  expect(result.accepted).toBe(true);
  if (!result.accepted) {
    throw new Error('expected movement to be accepted');
  }
  return result.state;
}

function cast(state: ReturnType<typeof acquiredState>) {
  const result = castAuthoredFrost(state);
  expect(result.accepted).toBe(true);
  if (!result.accepted) {
    throw new Error('expected frost cast to be accepted');
  }
  return result.state;
}

describe('Frost Vessel', () => {
  it('freezes only authored water within the Manhattan radius', () => {
    const before = authoredCells(room);
    const result = castFrost(createInitialFrostState(), room, shore);

    expect(result.newlyFrozen).toBeGreaterThan(0);
    for (const key of Object.keys(result.state.frozen)) {
      const [x, y] = key.split(',').map(Number);
      expect(Math.abs(x - shore.x) + Math.abs(y - shore.y)).toBeLessThanOrEqual(FROST_RADIUS);
      expect(room.grid[y]![x]).toBe('~');
    }
    expect(isFrozen(result.state, { x: 7, y: 5 })).toBe(false);
    expect(authoredCells(room)).toEqual(before);
  });

  it('refreshes aging ice without stacking another patch', () => {
    const first = castFrost(createInitialFrostState(), room, shore).state;
    const aging = advanceFrost(first, room, shore).state;
    const key = Object.keys(first.frozen)[0]!;
    expect(aging.frozen[key]).toBe(FROST_LIFETIME - 1);

    const refreshed = castFrost(aging, room, shore).state;
    expect(refreshed.frozen[key]).toBe(FROST_LIFETIME);
    expect(Object.keys(refreshed.frozen)).toEqual(Object.keys(first.frozen));
  });

  it('blocks unfrozen water and ages ice only after accepted movement', () => {
    const initial = acquiredState();
    const blocked = moveAuthoredPlayer(initial, 'right');
    expect(blocked.accepted).toBe(false);
    expect(blocked.state).toBe(initial);

    let state = cast(initial);
    state = move(state, 'right');
    expect(state.frostVessel.frozen['4,5']).toBe(FROST_LIFETIME - 1);

    state = move(state, 'up');
    const blockedByWall = moveAuthoredPlayer(state, 'up');
    expect(blockedByWall.accepted).toBe(false);
    expect(blockedByWall.state).toBe(state);
    expect(blockedByWall.state.frostVessel.frozen['4,5']).toBe(FROST_LIFETIME - 2);

    const unfrozen = moveAuthoredPlayer(move(state, 'left'), 'right');
    expect(unfrozen.accepted).toBe(true);
  });

  it('requires relay casting to reach the relic', () => {
    let state = cast(acquiredState());
    state = move(state, 'right');
    state = move(state, 'right');
    const oneCastOnly = moveAuthoredPlayer(state, 'right');
    expect(oneCastOnly.accepted).toBe(false);

    state = cast(state);
    state = move(state, 'right');
    state = cast(state);
    const reached = moveAuthoredPlayer(state, 'right');
    expect(reached.accepted).toBe(true);
    if (reached.accepted) {
      expect(reached.event).toBe('relic-taken');
      expect(reached.state.frostVessel.relicTaken).toBe(true);
      expect(authoredPlayerPosition(reached.state)).toEqual({ x: 7, y: 5 });
    }
  });

  it('soft-resets to the authored shore when ice melts under the player', () => {
    const initial = acquiredState();
    const worn = {
      ...initial,
      frostVessel: Object.freeze({
        ...initial.frostVessel,
        frozen: Object.freeze({ '4,5': 1 }),
      }),
    };
    const result = moveAuthoredPlayer(worn, 'right');

    expect(result.accepted).toBe(true);
    if (result.accepted) {
      expect(result.event).toBe('drowned');
      expect(authoredPlayerPosition(result.state)).toEqual(shore);
      expect(result.state.frostVessel.drownCount).toBe(1);
      expect(result.state.frostVessel.frozen).toEqual({});
    }
  });
});

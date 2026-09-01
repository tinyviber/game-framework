import { describe, expect, it } from 'vitest';
import { MAIN_WORLD } from '@/content/main-world';
import {
  authoredCurrentRoom,
  authoredPlayerPosition,
  castAuthoredFrost,
  interactAuthoredPlayer,
  createAuthoredGame,
  createAuthoredPlayState,
  moveAuthoredPlayer,
  resetAuthoredPlayState,
} from './authored-world';

const game = createAuthoredGame(MAIN_WORLD);

function move(
  state: ReturnType<typeof createAuthoredPlayState>,
  direction: 'up' | 'down' | 'left' | 'right',
) {
  const result = moveAuthoredPlayer(state, direction);
  expect(result.accepted).toBe(true);
  if (!result.accepted) {
    throw new Error('expected movement to be accepted');
  }
  return result.state;
}

describe('authored connected world gameplay', () => {
  it('accepts the four authored rooms and preserves their graph', () => {
    expect(MAIN_WORLD.rooms.map((room) => room.id)).toEqual([
      'village-square',
      'east-road',
      'ruins-entrance',
      'elder-house',
    ]);
    expect(MAIN_WORLD.rooms.flatMap((room) => room.exits)).toHaveLength(6);
  });

  it('keeps blocked terrain still and commits legal movement', () => {
    const initial = createAuthoredPlayState(game, MAIN_WORLD.rooms[0]!.id, { x: 3, y: 1 });
    const blocked = moveAuthoredPlayer(initial, 'left');
    expect(blocked.accepted).toBe(false);
    expect(blocked.state).toBe(initial);

    const moved = moveAuthoredPlayer(initial, 'right');
    expect(moved.accepted).toBe(true);
    if (moved.accepted) {
      expect(authoredPlayerPosition(moved.state)).toEqual({ x: 4, y: 1 });
    }
  });

  it('crosses village square and returns from east road at authored entries', () => {
    let state = resetAuthoredPlayState(game);
    for (let index = 0; index < 6; index += 1) {
      state = move(state, 'right');
    }
    expect(state.currentRoomId).toBe('village-square');
    expect(authoredPlayerPosition(state)).toEqual({ x: 12, y: 5 });
    state = move(state, 'right');
    expect(state.currentRoomId).toBe('east-road');
    expect(authoredPlayerPosition(state)).toEqual({ x: 0, y: 4 });

    state = move(state, 'left');
    expect(state.currentRoomId).toBe('village-square');
    expect(authoredPlayerPosition(state)).toEqual({ x: 12, y: 5 });
  });

  it('connects east road to ruins and back', () => {
    let state = resetAuthoredPlayState(game);
    for (let index = 0; index < 6; index += 1) {
      state = move(state, 'right');
    }
    state = move(state, 'right');
    for (let index = 0; index < 16; index += 1) {
      state = move(state, 'right');
    }
    expect(state.currentRoomId).toBe('east-road');
    expect(authoredPlayerPosition(state)).toEqual({ x: 16, y: 4 });
    state = move(state, 'right');
    expect(state.currentRoomId).toBe('ruins-entrance');
    expect(authoredPlayerPosition(state)).toEqual({ x: 0, y: 3 });

    state = move(state, 'left');
    expect(state.currentRoomId).toBe('east-road');
    expect(authoredPlayerPosition(state)).toEqual({ x: 16, y: 4 });
  });

  it('connects village square to elder house and back', () => {
    let state = resetAuthoredPlayState(game);
    for (let index = 0; index < 5; index += 1) {
      state = move(state, 'up');
    }
    expect(state.currentRoomId).toBe('village-square');
    expect(authoredPlayerPosition(state)).toEqual({ x: 6, y: 0 });
    state = move(state, 'up');
    expect(state.currentRoomId).toBe('elder-house');
    expect(authoredPlayerPosition(state)).toEqual({ x: 6, y: 10 });

    state = move(state, 'up');
    state = move(state, 'up');
    expect(authoredPlayerPosition(state)).toEqual({ x: 6, y: 8 });
    state = move(state, 'left');
    state = move(state, 'right');
    state = move(state, 'down');
    state = move(state, 'down');
    state = move(state, 'down');
    expect(state.currentRoomId).toBe('village-square');
    expect(authoredPlayerPosition(state)).toEqual({ x: 6, y: 0 });
    expect(authoredCurrentRoom(state).title).toBe('Village Square');
  });

  it('runs the authored Ruins Entrance route from arrival through relic return', () => {
    let state = resetAuthoredPlayState(game);
    for (let index = 0; index < 6; index += 1) state = move(state, 'right');
    state = move(state, 'right');
    for (let index = 0; index < 16; index += 1) state = move(state, 'right');
    state = move(state, 'right');
    expect(state.currentRoomId).toBe('ruins-entrance');

    state = move(state, 'right');
    state = move(state, 'right');
    state = move(state, 'down');
    state = move(state, 'down');
    state = move(state, 'right');
    const blockedWater = moveAuthoredPlayer(state, 'right');
    expect(blockedWater.accepted).toBe(false);

    expect(interactAuthoredPlayer(state).kind).toBe('vessel-acquired');
    state = interactAuthoredPlayer(state).state;

    const cast = (current: typeof state) => {
      const result = castAuthoredFrost(current);
      expect(result.accepted).toBe(true);
      if (!result.accepted) throw new Error('expected frost cast');
      return result.state;
    };
    state = cast(state);
    state = move(state, 'right');
    state = cast(state);
    state = move(state, 'right');
    state = cast(state);
    state = move(state, 'right');
    const relic = moveAuthoredPlayer(state, 'right');
    expect(relic.accepted).toBe(true);
    if (!relic.accepted) return;
    state = relic.state;
    expect(relic.event).toBe('relic-taken');
    expect(state.frostVessel.relicTaken).toBe(true);

    state = cast(state);
    state = move(state, 'left');
    state = cast(state);
    state = move(state, 'left');
    state = cast(state);
    state = move(state, 'left');
    state = move(state, 'left');
    expect(authoredPlayerPosition(state)).toEqual({ x: 3, y: 5 });

    for (let index = 0; index < 2; index += 1) state = move(state, 'up');
    state = move(state, 'left');
    state = move(state, 'left');
    state = move(state, 'left');
    state = move(state, 'left');
    expect(state.currentRoomId).toBe('east-road');

    for (let index = 0; index < 16; index += 1) state = move(state, 'left');
    state = move(state, 'left');
    expect(state.currentRoomId).toBe('village-square');
    expect(state.frostVessel.relicTaken).toBe(true);
  });

  it('uses the requested room spawn when no explicit position is given', () => {
    const state = createAuthoredPlayState(game, MAIN_WORLD.rooms.find((room) => room.id === 'ruins-entrance')!.id);
    expect(authoredPlayerPosition(state)).toEqual({ x: 3, y: 5 });
  });
});

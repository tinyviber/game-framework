import { describe, expect, it } from 'vitest';
import type { Room } from '@/world/room';
import { createGameState, reduceGame } from './game';

const room: Room = {
  seed: 1,
  width: 4,
  height: 3,
  cells: [
    [
      { ground: 'grass', obstacle: 'wall' },
      { ground: 'grass', obstacle: 'wall' },
      { ground: 'grass', obstacle: 'wall' },
      { ground: 'grass', obstacle: 'wall' },
    ],
    [
      { ground: 'grass', obstacle: 'wall' },
      { ground: 'grass', obstacle: null },
      { ground: 'grass', obstacle: null },
      { ground: 'grass', obstacle: 'wall' },
    ],
    [
      { ground: 'grass', obstacle: 'wall' },
      { ground: 'grass', obstacle: 'wall' },
      { ground: 'grass', obstacle: 'wall' },
      { ground: 'grass', obstacle: 'wall' },
    ],
  ],
  spawn: { x: 1, y: 1 },
  goal: { x: 2, y: 1 },
};

describe('game reducer', () => {
  it('moves through traversable cells and reaches the goal', () => {
    const initial = createGameState(room);
    const next = reduceGame(room, initial, {
      type: 'move',
      direction: 'right',
    });

    expect(next.player).toEqual({ x: 2, y: 1 });
    expect(next.goalReached).toBe(true);
  });

  it('returns the same state when movement is blocked', () => {
    const initial = createGameState(room);
    const next = reduceGame(room, initial, {
      type: 'move',
      direction: 'left',
    });

    expect(next).toBe(initial);
  });

  it('resets to spawn', () => {
    const reached = reduceGame(
      room,
      createGameState(room),
      { type: 'move', direction: 'right' },
    );

    expect(reduceGame(room, reached, { type: 'reset' })).toEqual({
      player: { x: 1, y: 1 },
      goalReached: false,
    });
  });
});

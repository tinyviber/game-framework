import {
  CARDINAL_DIRECTIONS,
  cellAt,
  isCellTraversable,
  samePosition,
  type Position,
} from '@/world/grid';
import type { Room } from '@/world/room';

export type Direction = 'up' | 'right' | 'down' | 'left';

export type GameAction =
  | { readonly type: 'move'; readonly direction: Direction }
  | { readonly type: 'reset' };

export interface GameState {
  readonly player: Position;
  readonly goalReached: boolean;
}

const DIRECTION_INDEX: Readonly<Record<Direction, number>> = {
  up: 0,
  right: 1,
  down: 2,
  left: 3,
};

function freezeState(
  player: Position,
  goalReached: boolean,
): GameState {
  return Object.freeze({
    player: Object.freeze({ ...player }),
    goalReached,
  });
}

export function createGameState(room: Room): GameState {
  return freezeState(room.spawn, samePosition(room.spawn, room.goal));
}

export function canEnter(
  room: Room,
  position: Position,
): boolean {
  return isCellTraversable(cellAt(room.cells, position));
}

export function reduceGame(
  room: Room,
  state: GameState,
  action: GameAction,
): GameState {
  if (action.type === 'reset') {
    return createGameState(room);
  }

  const delta = CARDINAL_DIRECTIONS[DIRECTION_INDEX[action.direction]];
  const next = {
    x: state.player.x + delta.x,
    y: state.player.y + delta.y,
  };

  if (!canEnter(room, next)) {
    return state;
  }

  return freezeState(
    next,
    samePosition(next, room.goal),
  );
}

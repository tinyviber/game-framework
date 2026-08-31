import type { Position } from '@/world/types';

/**
 * Echo Anchor — player-state / backtracking spike.
 *
 * The player can anchor an "echo" of themselves on the ground (Q). Pressing Q
 * again snaps them back to the echo and consumes it. One anchor at a time.
 *
 * Puzzle shape in this spike: a fragile plank bridge collapses behind you.
 * Past the bridge sits a lever that opens the stone gate standing between you
 * and the goal. The intuitive plan (walk back) is destroyed by the collapsing
 * bridge; the echo is the repair.
 */

export interface EchoLayout {
  readonly gate: Position;
  readonly goal: Position;
  readonly bridge: readonly Position[];
  readonly lever: Position;
}

export interface EchoState {
  readonly echo: Position | null;
  readonly collapsedKeys: readonly string[];
  readonly leverPulled: boolean;
}

export function positionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

export function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Places the experiment on the world's validated final path:
 *   start … gate, goal, bridge×3, lever … (old path end beyond the lever is
 *   just scenery for this spike).
 */
export function createEchoLayout(path: readonly Position[]): EchoLayout {
  if (path.length < 12) {
    throw new Error(`Echo anchor needs a longer path (got ${path.length})`);
  }
  const leverIndex = path.length - 3;
  const bridgeStart = leverIndex - 4;
  return {
    gate: { ...path[bridgeStart - 2]! },
    goal: { ...path[bridgeStart - 1]! },
    bridge: [
      { ...path[bridgeStart]! },
      { ...path[bridgeStart + 1]! },
      { ...path[bridgeStart + 2]! },
    ],
    lever: { ...path[leverIndex]! },
  };
}

export function createInitialEchoState(): EchoState {
  return { echo: null, collapsedKeys: [], leverPulled: false };
}

export function gateIsOpen(state: EchoState): boolean {
  return state.leverPulled;
}

export function isBridgeCell(layout: EchoLayout, position: Position): boolean {
  return layout.bridge.some((cell) => samePosition(cell, position));
}

export function isCollapsed(state: EchoState, position: Position): boolean {
  return state.collapsedKeys.includes(positionKey(position));
}

/** Gate cells and collapsed bridge planks are impassable. */
export function canEnterCell(layout: EchoLayout, state: EchoState, cell: Position): boolean {
  if (isCollapsed(state, cell)) {
    return false;
  }
  if (samePosition(cell, layout.gate)) {
    return gateIsOpen(state);
  }
  return true;
}

/** Anchor or replace the echo at the player's feet. */
export function placeEcho(state: EchoState, position: Position): EchoState {
  return { ...state, echo: { ...position } };
}

export type RecallResult =
  | { readonly ok: true; readonly state: EchoState; readonly destination: Position }
  | { readonly ok: false; readonly state: EchoState };

/** Snap back to the echo; the echo is consumed. */
export function recallEcho(state: EchoState): RecallResult {
  if (!state.echo) {
    return { ok: false, state };
  }
  return {
    ok: true,
    state: { ...state, echo: null },
    destination: { ...state.echo },
  };
}

/** A plank collapses the moment the player steps off it. */
export function collapseAfterMove(
  layout: EchoLayout,
  state: EchoState,
  from: Position,
  to: Position,
): EchoState {
  if (samePosition(from, to) || !isBridgeCell(layout, from)) {
    return state;
  }
  if (isCollapsed(state, from)) {
    return state;
  }
  return { ...state, collapsedKeys: [...state.collapsedKeys, positionKey(from)] };
}

export function pullLever(layout: EchoLayout, state: EchoState, position: Position): EchoState {
  if (!samePosition(position, layout.lever) || state.leverPulled) {
    return state;
  }
  return { ...state, leverPulled: true };
}

/**
 * Heuristic for the spike's hint text: the player stands on the far side of
 * the bridge, planks have collapsed, and no echo is anchored. Alternate
 * routes may still exist (worlds have cycles), so this is a nudge, not a
 * hard failure detector.
 */
export function isStranded(layout: EchoLayout, state: EchoState, position: Position): boolean {
  if (state.echo) {
    return false;
  }
  const farSide = layout.bridge.some((cell) => samePosition(cell, position))
    || samePosition(position, layout.lever);
  return farSide && state.collapsedKeys.length > 0;
}

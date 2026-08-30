import { describe, expect, it } from 'vitest';
import { adventureCatalog } from '@/data/adventure/catalog';
import {
  adventureIsComplete,
  applyAdventureAction,
  createAdventureState,
  reachableCells,
  resolveAdventureExit,
} from './adventure';

const room = adventureCatalog.rooms['wind-00']!;

function walk(
  state: ReturnType<typeof createAdventureState>,
  directions: readonly ('up' | 'down' | 'left' | 'right')[],
) {
  let next = state;
  for (const direction of directions) {
    next = applyAdventureAction(next, room, { kind: 'move', direction }).state;
  }
  return next;
}

describe('Windweave adventure world', () => {
  it('builds a 4x5 graph with 20 rooms and 62 paired exits', () => {
    expect(adventureCatalog.roomList).toHaveLength(20);
    expect(new Set(adventureCatalog.roomList.map((entry) => entry.id)).size).toBe(20);
    expect(new Set(adventureCatalog.roomList.map((entry) => `${entry.gridX},${entry.gridY}`)).size).toBe(20);
    expect(adventureCatalog.roomList.reduce((total, entry) => total + entry.exits.length, 0)).toBe(62);

    for (const entry of adventureCatalog.roomList) {
      for (const exit of entry.exits) {
        const target = adventureCatalog.rooms[exit.targetRoom]!;
        const reverse = exit.direction === 'up'
          ? 'down'
          : exit.direction === 'down'
            ? 'up'
            : exit.direction === 'left'
              ? 'right'
              : 'left';
        expect(target.exits.some((candidate) => candidate.direction === reverse && candidate.targetRoom === entry.id)).toBe(true);
      }
    }
  });

  it('keeps every node and exit on a reachable walkable route around obstacles', () => {
    for (const entry of adventureCatalog.roomList) {
      const reachable = reachableCells(entry);
      expect(reachable.has(`${entry.node.x},${entry.node.y}`), entry.id).toBe(true);
      for (const exit of entry.exits) {
        expect(reachable.has(`${exit.at.x},${exit.at.y}`), `${entry.id}:${exit.id}`).toBe(true);
      }
    }
  });

  it('moves immutably, rejects walls by reference, and resets safely', () => {
    const initial = createAdventureState(room, { x: 3, y: 3 });
    const blocked = applyAdventureAction(initial, room, { kind: 'move', direction: 'up' });
    expect(blocked.accepted).toBe(false);
    expect(blocked.state).toBe(initial);
    expect(blocked.events[0]?.tag).toBe('move-blocked');

    const moved = applyAdventureAction(initial, room, { kind: 'move', direction: 'right' });
    expect(moved.accepted).toBe(true);
    expect(moved.state).not.toBe(initial);
    expect(Object.isFrozen(moved.state)).toBe(true);
    expect(Object.isFrozen(moved.state.player)).toBe(true);

    const reset = applyAdventureAction(moved.state, room, { kind: 'reset' });
    expect(reset.state.player).toEqual(room.spawn);
    expect(Object.isFrozen(reset.state.windMarks)).toBe(true);
  });

  it('awakens a room node and reports a typed activation event', () => {
    const state = walk(createAdventureState(room), ['left', 'left', 'left']);
    const result = applyAdventureAction(state, room, { kind: 'interact' });
    expect(result.accepted).toBe(true);
    expect(result.state.windMarks[room.id]).toBe(true);
    expect(result.events[0]?.tag).toBe('activated');

    const complete = createAdventureState(room, room.spawn, Object.fromEntries(adventureCatalog.roomList.map((entry) => [entry.id, true])));
    expect(adventureIsComplete(complete, adventureCatalog)).toBe(true);
  });

  it('lets the player talk to an adjacent NPC and resolve a border exit', () => {
    const npcRoom = adventureCatalog.rooms['wind-00']!;
    const npcState = createAdventureState(npcRoom, { x: 7, y: 4 });
    const dialogue = applyAdventureAction(npcState, npcRoom, { kind: 'interact' });
    expect(dialogue.accepted).toBe(true);
    expect(dialogue.events[0]?.tag).toBe('dialogue-progressed');

    const edgeRoom = adventureCatalog.rooms['wind-01']!;
    const edgeState = createAdventureState(edgeRoom, { x: 0, y: 4 });
    const exit = resolveAdventureExit(edgeState, edgeRoom, adventureCatalog);
    expect(exit.accepted).toBe(true);
    expect(exit.roomId).toBe('wind-00');
    expect(exit.spawn).toEqual({ x: 10, y: 4 });
  });
});

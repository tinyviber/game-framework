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
  it('treats unconnected elevation changes as blocked traversal', () => {
    for (const entry of adventureCatalog.roomList) {
      const connectors = (entry as unknown as { readonly connectors?: readonly { readonly from: { readonly x: number; readonly y: number }; readonly to: { readonly x: number; readonly y: number } }[] }).connectors ?? [];
      for (const row of entry.cells) for (const from of row) {
        for (const to of entry.cells.flat().filter((candidate) => Math.abs(candidate.x - from.x) + Math.abs(candidate.y - from.y) === 1 && candidate.elevation !== from.elevation)) {
          const connected = connectors.some((connector) => (connector.from.x === from.x && connector.from.y === from.y && connector.to.x === to.x && connector.to.y === to.y) || (connector.to.x === from.x && connector.to.y === from.y && connector.from.x === to.x && connector.from.y === to.y));
          if (!connected && from.walkable && to.walkable) {
            const direction = to.x > from.x ? 'right' : to.x < from.x ? 'left' : to.y > from.y ? 'down' : 'up';
            const result = applyAdventureAction(createAdventureState(entry, { x: from.x, y: from.y }), entry, { kind: 'move', direction });
            expect(result.accepted).toBe(false);
            expect(result.state.player).toEqual({ x: from.x, y: from.y });
            return;
          }
        }
      }
    }
    throw new Error('showcase must contain an unconnected elevation edge');
  });

  it('allows a connected showcase staircase in both directions', () => {
    for (const entry of adventureCatalog.roomList) {
      const connector = entry.connectors.find(
        (candidate) => candidate.kind === 'stairs' || candidate.kind === 'ramp',
      );
      if (!connector) {
        continue;
      }

      const direction = connector.to.x > connector.from.x
        ? 'right'
        : connector.to.x < connector.from.x
          ? 'left'
          : connector.to.y > connector.from.y
            ? 'down'
            : 'up';
      const reverseDirection = direction === 'left'
        ? 'right'
        : direction === 'right'
          ? 'left'
          : direction === 'up'
            ? 'down'
            : 'up';
      const climbed = applyAdventureAction(
        createAdventureState(entry, connector.from),
        entry,
        { kind: 'move', direction },
      );
      expect(climbed.accepted).toBe(true);

      const descended = applyAdventureAction(
        climbed.state,
        entry,
        { kind: 'move', direction: reverseDirection },
      );
      expect(descended.accepted).toBe(true);
      return;
    }
    throw new Error('showcase must contain a connected staircase');
  });

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

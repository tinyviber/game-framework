import { describe, expect, it } from 'vitest';
import {
  generateGeneratedWorld,
  generatedCellAt,
  resolveGeneratedEdge,
} from '@/world/generated-world';
import { tryInitializeLocalWorld } from '@/world/local-world';
import {
  createGeneratedPlayground,
  generatedGoalReached,
  moveGeneratedPlayer,
  playerPosition,
} from './generated-playground';

function direction(
  from: { x: number; y: number },
  to: { x: number; y: number },
): 'up' | 'down' | 'left' | 'right' {
  return to.x > from.x
    ? 'right'
    : to.x < from.x
      ? 'left'
      : to.y > from.y
        ? 'down'
        : 'up';
}

function assertFrozen(value: unknown, seen = new Set<object>()): void {
  if (!value || typeof value !== 'object' || seen.has(value)) {
    return;
  }
  const object = value as object;
  seen.add(object);
  expect(Object.isFrozen(object)).toBe(true);
  for (const child of Object.values(object)) {
    assertFrozen(child, seen);
  }
}

describe('generated playground LocalWorld adapter', () => {
  it('initializes through tryInitializeLocalWorld with only one mutable player', () => {
    const playground = createGeneratedPlayground(generateGeneratedWorld(0));

    const result = tryInitializeLocalWorld(
      playground.definition,
      { spawnX: playground.world.start.x, spawnY: playground.world.start.y },
      {},
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    assertFrozen(result.state);
    expect(playground.definition.mutableObjects).toHaveLength(1);
    expect(playground.definition.mutableObjects[0]?.kind).toBe('main-character');
    expect(Object.values(result.state.objects)).toHaveLength(1);
    expect(Object.values(result.state.objects)[0]?.kind).toBe('main-character');
  });

  it('returns the original state for blocked terrain and commits legal movement through the scoped operation', () => {
    const playground = createGeneratedPlayground(generateGeneratedWorld(0));
    const initial = playground.initialState;
    const blocked = moveGeneratedPlayer(playground, initial, 'left');
    expect(blocked.accepted).toBe(false);
    expect(blocked.state).toBe(initial);

    const start = playerPosition(initial);
    const next = playground.world.baselinePath[1]!;
    const moved = moveGeneratedPlayer(playground, initial, direction(start, next));
    expect(moved.accepted).toBe(true);
    expect(moved.state).not.toBe(initial);
    expect(Object.keys(moved.state.objects)).toEqual(Object.keys(initial.objects));
    expect(Object.values(moved.state.objects)[0]).toMatchObject({
      kind: 'main-character',
      position: next,
    });
  });

  it('returns the original state when the perturbed edge is hit directly', () => {
    const world = generateGeneratedWorld(2026);
    const barrier = world.perturbation.disruption.blockedEdges[0]!;
    const playground = createGeneratedPlayground(world, barrier.from);
    const result = moveGeneratedPlayer(
      playground,
      playground.initialState,
      direction(barrier.from, barrier.to),
    );

    expect(result.accepted).toBe(false);
    expect(result.state).toBe(playground.initialState);
  });

  it('allows generated stairs but keeps ordinary elevated adjacencies blocked', () => {
    const world = generateGeneratedWorld(2026);
    const stairs = world.edges.find((edge) => edge.kind === 'stairs');
    expect(stairs).toBeDefined();
    if (!stairs) {
      return;
    }

    const staircase = createGeneratedPlayground(world, stairs.from);
    const climbed = moveGeneratedPlayer(
      staircase,
      staircase.initialState,
      direction(stairs.from, stairs.to),
    );
    expect(climbed.accepted).toBe(true);

    let ordinaryHeightChange: { from: { x: number; y: number }; to: { x: number; y: number } } | undefined;
    for (const row of world.cells) {
      for (const from of row) {
        for (const delta of [{ x: 1, y: 0 }, { x: 0, y: 1 }]) {
          const to = { x: from.x + delta.x, y: from.y + delta.y };
          const toCell = generatedCellAt(world, to);
          if (
            from.walkable &&
            toCell?.walkable &&
            Math.abs(from.elevation - toCell.elevation) > 0 &&
            !resolveGeneratedEdge(world, from, to)
          ) {
            ordinaryHeightChange = { from, to };
            break;
          }
        }
        if (ordinaryHeightChange) {
          break;
        }
      }
      if (ordinaryHeightChange) {
        break;
      }
    }

    expect(ordinaryHeightChange).toBeDefined();
    if (!ordinaryHeightChange) {
      return;
    }
    const blocked = createGeneratedPlayground(world, ordinaryHeightChange.from);
    const result = moveGeneratedPlayer(
      blocked,
      blocked.initialState,
      direction(ordinaryHeightChange.from, ordinaryHeightChange.to),
    );
    expect(result.accepted).toBe(false);
    expect(result.state).toBe(blocked.initialState);
  });

  it('reaches the generated goal by following the final alternate route', () => {
    const playground = createGeneratedPlayground(generateGeneratedWorld(1));
    let state = playground.initialState;

    for (let index = 1; index < playground.world.finalPath.length; index += 1) {
      const from = playground.world.finalPath[index - 1]!;
      const to = playground.world.finalPath[index]!;
      const result = moveGeneratedPlayer(playground, state, direction(from, to));
      expect(result.accepted).toBe(true);
      state = result.state;
    }

    expect(generatedGoalReached(playground, state)).toBe(true);
  });
});

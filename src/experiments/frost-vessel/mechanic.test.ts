import { describe, expect, it } from 'vitest';
import { generateGeneratedWorld } from '@/world/generated-world';
import { createGeneratedPlayground, playerPosition } from '@/chapters/chapter-13/generated-playground';
import {
  advanceFrost,
  castFrost,
  createInitialFrostState,
  findFrostTrial,
  FROST_LIFETIME,
  isFrozen,
  isWaterAt,
  isWalkableAt,
  tryMoveFrost,
  type FrostVesselState,
} from './mechanic';

const SEED = 2026;

function setup(): {
  step: (state: FrostVesselState, direction: 'up' | 'down' | 'left' | 'right', castFirst?: boolean) => {
    frost: FrostVesselState;
    event: string;
  };
  position: () => { x: number; y: number };
} {
  const world = generateGeneratedWorld(SEED);
  const trial = findFrostTrial(world);
  if (!trial) {
    throw new Error('Seed 2026 must contain a frost trial');
  }
  const playground = createGeneratedPlayground(world, trial.spawn);
  let state = playground.initialState;

  const step = (
    current: FrostVesselState,
    direction: 'up' | 'down' | 'left' | 'right',
    castFirst = false,
  ): { frost: FrostVesselState; event: string } => {
    let working = current;
    if (castFirst) {
      const cast = castFrost(working, world, playerPosition(state));
      working = cast.state;
    }
    const result = tryMoveFrost(playground, state, working, direction, trial.treasure);
    state = result.worldState;
    return { frost: result.state, event: result.event };
  };

  return {
    step,
    position: () => playerPosition(state),
  };
}

describe('frost vessel trial scenario', () => {
  it('seed 2026 yields a playable 3-step river trial', () => {
    const world = generateGeneratedWorld(SEED);
    const trial = findFrostTrial(world);
    expect(trial).not.toBeNull();
    if (!trial) {
      return;
    }
    expect(trial.depth).toBe(3);
    expect(isWalkableAt(world, trial.spawn)).toBe(true);
    expect(isWaterAt(world, trial.treasure)).toBe(true);
    const delta = Math.abs(trial.treasure.x - trial.spawn.x) + Math.abs(trial.treasure.y - trial.spawn.y);
    expect(delta).toBeGreaterThanOrEqual(3);
  });
});

describe('castFrost', () => {
  it('freezes only water cells inside the radius and records the count', () => {
    const world = generateGeneratedWorld(SEED);
    const trial = findFrostTrial(world)!;
    const initial = createInitialFrostState();
    const cast = castFrost(initial, world, trial.spawn);

    expect(cast.frozenCount).toBeGreaterThan(0);
    const frozenKeys = Object.keys(cast.state.frozen);
    expect(frozenKeys.length).toBe(cast.frozenCount + Object.keys(initial.frozen).length);
    // Every frozen cell is water and within radius of the shore.
    for (const key of frozenKeys) {
      const [x, y] = key.split(',').map(Number);
      const position = { x, y };
      expect(isWaterAt(world, position)).toBe(true);
      expect(Math.abs(position.x - trial.spawn.x) + Math.abs(position.y - trial.spawn.y)).toBeLessThanOrEqual(2);
    }
    // The treasure itself is 3 steps out, outside the first cast's radius.
    expect(isFrozen(cast.state, trial.treasure)).toBe(false);
  });

  it('refreshes life of already frozen cells instead of stacking', () => {
    const world = generateGeneratedWorld(SEED);
    const trial = findFrostTrial(world)!;
    const first = castFrost(createInitialFrostState(), world, trial.spawn);
    const key = Object.keys(first.state.frozen)[0]!;
    expect(first.state.frozen[key]).toBe(FROST_LIFETIME);
    const second = castFrost(first.state, world, trial.spawn);
    expect(second.state.frozen[key]).toBe(FROST_LIFETIME);
    expect(Object.keys(second.state.frozen).length).toBe(Object.keys(first.state.frozen).length);
  });
});

describe('tryMoveFrost', () => {
  it('blocks walking onto unfrozen water', () => {
    const world = generateGeneratedWorld(SEED);
    const trial = findFrostTrial(world)!;
    // Find the actual water neighbour of the spawn (the trial's BFS start).
    const deltas = [
      ['up', { x: 0, y: -1 }],
      ['down', { x: 0, y: 1 }],
      ['left', { x: -1, y: 0 }],
      ['right', { x: 1, y: 0 }],
    ] as const;
    const waterDirection = deltas.find(([, delta]) => {
      const neighbor = { x: trial.spawn.x + delta.x, y: trial.spawn.y + delta.y };
      return isWaterAt(world, neighbor);
    })!;
    const { step } = setup();
    const result = step(createInitialFrostState(), waterDirection[0]);
    expect(result.event).toBe('blocked');
  });

  it('allows walking onto frozen water', () => {
    const { step } = setup();
    const result = step(createInitialFrostState(), 'down', true);
    expect(result.event).toBe('moved');
  });

  it('takes the treasure through a relay of casts (the core loop)', () => {
    const harness = setup();
    // Seed 2026: spawn (3,0) → ice (4,0) → ice (4,1) → treasure (5,1).
    // The first cast from shore cannot reach the treasure (3 steps out, radius
    // 2), so the player must step onto the ice and cast again — a relay.
    let result = harness.step(createInitialFrostState(), 'right', true);
    expect(result.event).toBe('moved');
    result = harness.step(result.frost, 'down', true);
    expect(result.event).toBe('moved');
    result = harness.step(result.frost, 'right', true);
    expect(result.event).toBe('took-treasure');
    expect(result.frost.treasureTaken).toBe(true);
  });
});

describe('advanceFrost', () => {
  it('wears ice down by one per step and melts it at zero', () => {
    const world = generateGeneratedWorld(SEED);
    const trial = findFrostTrial(world)!;
    const cast = castFrost(createInitialFrostState(), world, trial.spawn);
    const key = Object.keys(cast.state.frozen)[0]!;
    expect(cast.state.frozen[key]).toBe(FROST_LIFETIME);
    const advanced = advanceFrost(cast.state, world, trial.spawn);
    expect(advanced.state.frozen[key]).toBe(FROST_LIFETIME - 1);
    expect(advanced.drowned).toBe(false);
  });

  it('drowns a player standing on ice that just melted and shatters the spell', () => {
    const world = generateGeneratedWorld(SEED);
    const trial = findFrostTrial(world)!;
    // Stand on a real water cell adjacent to the shore; force its ice life
    // to 1 and advance so the standing cell itself becomes water again.
    const cast = castFrost(createInitialFrostState(), world, trial.spawn);
    const waterKey = Object.keys(cast.state.frozen)[0]!;
    const [wx, wy] = waterKey.split(',').map(Number);
    const standCell = { x: wx, y: wy };
    const state: FrostVesselState = {
      frozen: { [waterKey]: 1 },
      treasureTaken: false,
      drownCount: 0,
    };
    const advanced = advanceFrost(state, world, standCell);
    expect(advanced.drowned).toBe(true);
    expect(advanced.state.drownCount).toBe(1);
    // The whole spell shatters: nothing is frozen anymore.
    expect(Object.keys(advanced.state.frozen)).toHaveLength(0);
  });

  it('does not drown a player on walkable ground', () => {
    const world = generateGeneratedWorld(SEED);
    const trial = findFrostTrial(world)!;
    const cast = castFrost(createInitialFrostState(), world, trial.spawn);
    const advanced = advanceFrost(cast.state, world, trial.spawn);
    expect(advanced.drowned).toBe(false);
    expect(advanced.state.drownCount).toBe(0);
  });
});

describe('drowning integration', () => {
  it('sweeps the player to a walkable shore cell on a real move', () => {
    const harness = setup();
    const world = generateGeneratedWorld(SEED);
    const trial = findFrostTrial(world)!;
    // Pick the water cell right next to the spawn and make it a one-life ice
    // sheet: stepping onto it melts it underfoot → the player drowns.
    const deltas = [
      ['up', { x: 0, y: -1 }],
      ['down', { x: 0, y: 1 }],
      ['left', { x: -1, y: 0 }],
      ['right', { x: 1, y: 0 }],
    ] as const;
    const entry = deltas.find(([, delta]) =>
      isWaterAt(world, { x: trial.spawn.x + delta.x, y: trial.spawn.y + delta.y }),
    )!;
    const target = { x: trial.spawn.x + entry[1].x, y: trial.spawn.y + entry[1].y };
    const worn: FrostVesselState = {
      frozen: { [`${target.x},${target.y}`]: 1 },
      treasureTaken: false,
      drownCount: 0,
    };
    const result = harness.step(worn, entry[0]);
    expect(result.event).toBe('drowned');
    expect(result.frost.drownCount).toBe(1);
    expect(Object.keys(result.frost.frozen)).toHaveLength(0);
    const position = harness.position();
    expect(isWalkableAt(world, position)).toBe(true);
  });
});

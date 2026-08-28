import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { createChapter6Renderer } from './pixi-view';
import {
  createWorldScene,
  WORLD_LAYER_LABELS,
} from '@/rendering/world-scene';
import type { Chapter4View } from '@/chapters/chapter-4/view';

const view: Chapter4View = {
  helper: { x: 80 },
  activator: { x: 176, active: false },
  gate: { x: 272, open: false, blocked: true },
  exit: { x: 368, reached: false },
  feedback: {
    status: 'running',
    action: 'move',
    failureReason: 'locked-gate',
  },
};

describe('Chapter 6 Pixi presentation', () => {
  it('renders a view model into stable world layers', () => {
    const world = new Container();
    const scene = createWorldScene(world);
    const renderer = createChapter6Renderer(scene);

    renderer.render(view);
    expect(world.children.map((child) => child.label)).toEqual(
      WORLD_LAYER_LABELS,
    );
    expect(world.children[0]?.children.length).toBe(6);
    expect(world.children[1]?.children.length).toBe(1);
    expect(world.children[2]?.children.length).toBe(3);
    expect(world.children[3]?.children.length).toBe(1);
    expect(world.children[4]?.children.length).toBe(1);
    expect(world.children[5]?.children.length).toBe(1);
    const initialCameraX = world.position.x;

    renderer.render({
      ...view,
      helper: { x: 176 },
      gate: { x: 272, open: true, blocked: false },
    });

    expect(world.position.x).not.toBe(initialCameraX);

    scene.destroy();
    world.destroy();
  });

  it('reuses persistent graphics slots instead of rebuilding the frame', () => {
    const world = new Container();
    const scene = createWorldScene(world);
    const renderer = createChapter6Renderer(scene);

    renderer.render(view);

    const ground = scene.layers.ground;
    const entities = scene.layers.entities;
    const helperFrame = entities.children[0];
    const tileFrame = ground.children[0];
    const warning = scene.layers.effects.children[0];
    const obstacle = scene.layers.objects.children[2];

    renderer.render({
      ...view,
      helper: { x: 176 },
      gate: { ...view.gate, blocked: false },
    });

    expect(ground.children[0]).toBe(tileFrame);
    expect(entities.children[0]).toBe(helperFrame);
    expect(scene.layers.ground.children.length).toBe(6);
    // Blocked-only decorations stay mounted but hidden.
    expect(warning?.visible).toBe(false);
    expect(obstacle?.visible).toBe(false);

    renderer.render({
      ...view,
      gate: { ...view.gate, blocked: true },
    });
    expect(warning?.visible).toBe(true);
    expect(obstacle?.visible).toBe(true);

    scene.destroy();
    world.destroy();
  });
});

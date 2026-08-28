import {
  createWorldScene,
  WORLD_LAYER_LABELS,
} from './world-scene';
import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';

describe('Pixi world scene foundation', () => {
  it('creates stable world layers for 3/4 presentation', () => {
    const root = new Container();
    const scene = createWorldScene(root);

    expect(root.label).toBe('WorldRoot');
    expect(root.children.map((child) => child.label)).toEqual(
      WORLD_LAYER_LABELS,
    );
    expect(scene.layers.entities.sortableChildren).toBe(true);
    expect(scene.layers.foreground.sortableChildren).toBe(true);

    scene.destroy();
    expect(root.children).toHaveLength(0);
    root.destroy();
  });

  it('creates an independent scene per root, without a global registry', () => {
    const rootA = new Container();
    const rootB = new Container();
    const sceneA = createWorldScene(rootA);
    const sceneB = createWorldScene(rootB);

    expect(sceneA).not.toBe(sceneB);
    expect(rootA.children).toHaveLength(WORLD_LAYER_LABELS.length);
    expect(rootB.children).toHaveLength(WORLD_LAYER_LABELS.length);

    sceneA.destroy();
    sceneB.destroy();
    expect(rootA.children).toHaveLength(0);
    expect(rootB.children).toHaveLength(0);
    rootA.destroy();
    rootB.destroy();
  });

  it('applies a camera transform without changing the world model', () => {
    const root = new Container();
    const scene = createWorldScene(root);

    scene.setCamera(
      { x: 100, y: 80, zoom: 1.5 },
      { width: 900, height: 440 },
    );

    expect(root.scale.x).toBe(1.5);
    expect(root.scale.y).toBe(1.5);
    expect(root.position.x).toBe(300);
    expect(root.position.y).toBe(100);

    scene.destroy();
    root.destroy();
  });
});

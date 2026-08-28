import { Container } from 'pixi.js';

export const WORLD_LAYER_LABELS = [
  'GroundLayer',
  'TerrainLayer',
  'ObjectLayer',
  'EntityLayer',
  'EffectLayer',
  'ForegroundLayer',
] as const;

export interface WorldSceneLayers {
  readonly ground: Container;
  readonly terrain: Container;
  readonly objects: Container;
  readonly entities: Container;
  readonly effects: Container;
  readonly foreground: Container;
}

export interface WorldCamera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface WorldViewport {
  readonly width: number;
  readonly height: number;
}

export interface WorldScene {
  readonly root: Container;
  readonly layers: WorldSceneLayers;
  clear(): void;
  setCamera(
    camera: WorldCamera,
    viewport: WorldViewport,
  ): void;
  destroy(): void;
}

function createLayer(
  label: string,
  sortableChildren = false,
): Container {
  const layer = new Container();
  layer.label = label;
  layer.sortableChildren = sortableChildren;
  return layer;
}

function clearLayer(layer: Container): void {
  layer.removeChildren().forEach((child) => {
    child.destroy();
  });
}

/**
 * Creates a new scene for the given root. Ownership is explicit: the
 * caller (the Pixi host) creates and destroys exactly one scene per
 * root container; there is no hidden registry.
 */
export function createWorldScene(
  root: Container,
): WorldScene {
  root.label = 'WorldRoot';

  const layers: WorldSceneLayers = {
    ground: createLayer(WORLD_LAYER_LABELS[0]),
    terrain: createLayer(WORLD_LAYER_LABELS[1]),
    objects: createLayer(WORLD_LAYER_LABELS[2]),
    entities: createLayer(WORLD_LAYER_LABELS[3], true),
    effects: createLayer(WORLD_LAYER_LABELS[4]),
    foreground: createLayer(WORLD_LAYER_LABELS[5], true),
  };
  const orderedLayers = [
    layers.ground,
    layers.terrain,
    layers.objects,
    layers.entities,
    layers.effects,
    layers.foreground,
  ];

  root.addChild(...orderedLayers);

  const scene: WorldScene = {
    root,
    layers,

    clear(): void {
      orderedLayers.forEach(clearLayer);
    },

    setCamera(camera, viewport): void {
      root.scale.set(camera.zoom);
      root.position.set(
        viewport.width / 2 - camera.x * camera.zoom,
        viewport.height / 2 - camera.y * camera.zoom,
      );
    },

    destroy(): void {
      scene.clear();
      root.removeChild(...orderedLayers);
      orderedLayers.forEach((layer) => {
        layer.destroy({ children: true });
      });
    },
  };

  return scene;
}

import {
  Application,
  Container,
} from 'pixi.js';
import {
  defaultPixiHostConfig,
  type PixiHostConfig,
} from './pixi-host-config';
import {
  createWorldScene,
  type WorldScene,
} from './world-scene';

export interface PixiHostHandle {
  readonly app: Application;
  readonly world: Container;
  readonly scene: WorldScene;
  readonly ui: Container;
  destroy(): void;
}

export async function createPixiHost(
  root: HTMLElement,
  config: PixiHostConfig = defaultPixiHostConfig,
): Promise<PixiHostHandle> {
  const app = new Application();

  await app.init({
    width: config.width,
    height: config.height,
    backgroundColor: config.backgroundColor,
    antialias: true,
  });

  const world = new Container();
  world.label = 'WorldRoot';
  const ui = new Container();
  ui.label = 'UIRoot';

  app.stage.addChild(world, ui);
  root.replaceChildren(app.canvas);

  // The host owns the scene lifecycle explicitly: it creates the one
  // scene for the world root and destroys it before the application.
  const scene = createWorldScene(world);

  return {
    app,
    world,
    scene,
    ui,

    destroy(): void {
      scene.destroy();
      app.destroy(true, {
        children: true,
      });

      root.replaceChildren();
    },
  };
}

import { Container, Graphics } from 'pixi.js';
import type { Chapter4View } from '@/chapters/chapter-4/view';
import type { WorldScene } from '@/rendering/world-scene';
import {
  CELL_SIZE,
  VIEWPORT,
  WORLD_Y,
  cellToWorldX,
} from '@/rendering/layout';

const GROUND_TILE_COUNT = 5;

function drawDiamond(
  graphics: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  graphics
    .moveTo(x, y - height / 2)
    .lineTo(x + width / 2, y)
    .lineTo(x, y + height / 2)
    .lineTo(x - width / 2, y)
    .closePath();
}

/**
 * Presentation slots are created once and redrawn in place per frame.
 * This removes the previous destroy-and-recreate churn for every
 * interaction while keeping the renderer a pure consumer of the view
 * model (no gameplay state lives here).
 */
export interface Chapter6Renderer {
  render(view: Chapter4View): void;
}

export function createChapter6Renderer(
  scene: WorldScene,
): Chapter6Renderer {
  const slots = new Map<string, Graphics>();

  const slot = (key: string, parent: Container): Graphics => {
    let graphics = slots.get(key);

    if (!graphics) {
      graphics = new Graphics();
      slots.set(key, graphics);
      parent.addChild(graphics);
    }

    return graphics;
  };

  const draw = (
    key: string,
    parent: Container,
    visible: boolean,
    paint: (graphics: Graphics) => void,
  ): void => {
    const graphics = slot(key, parent);

    if (graphics.parent !== parent) {
      parent.addChild(graphics);
    }

    graphics.visible = visible;
    graphics.clear();
    paint(graphics);
  };

  const renderGroundTiles = (): void => {
    const startX = cellToWorldX(0);

    for (let index = 0; index < GROUND_TILE_COUNT; index += 1) {
      draw(
        `tile-${index}`,
        scene.layers.ground,
        true,
        (tile) => {
          const x = startX + index * CELL_SIZE;

          drawDiamond(tile, x, WORLD_Y + 24, CELL_SIZE, 44);
          tile
            .fill({
              color: index % 2 === 0 ? 0x334155 : 0x3f4f65,
            })
            .stroke({
              color: 0x64748b,
              width: 1,
              alpha: 0.8,
            });
        },
      );
    }
  };

  // Static scenery is painted once at construction.
  renderGroundTiles();

  return {
    render(view): void {
      draw(
        'shadow',
        scene.layers.ground,
        true,
        (shadow) => {
          shadow
            .ellipse(view.helper.x, WORLD_Y + 12, 24, 8)
            .fill({ color: 0x020617, alpha: 0.45 });
        },
      );

      draw('gate', scene.layers.terrain, true, (gate) => {
        drawDiamond(
          gate,
          view.gate.x,
          WORLD_Y - 72,
          72,
          28,
        );
        gate.fill({
          color: view.gate.open ? 0x475569 : 0x7f1d1d,
          alpha: view.gate.open ? 0.65 : 1,
        });
        gate
          .rect(
            view.gate.x - 22,
            WORLD_Y - 66,
            44,
            66,
          )
          .fill({
            color: view.gate.open ? 0x334155 : 0xef4444,
            alpha: view.gate.open ? 0.35 : 1,
          })
          .stroke({
            color: view.gate.blocked
              ? 0xf87171
              : 0xffffff,
            width: 3,
          });
        gate
          .rect(
            view.gate.x - 34,
            WORLD_Y - 72,
            68,
            10,
          )
          .fill({ color: 0x1e293b });
      });

      draw(
        'activator',
        scene.layers.objects,
        true,
        (activator) => {
          activator
            .circle(view.activator.x, WORLD_Y - 4, 18)
            .fill({
              color: view.activator.active
                ? 0x22c55e
                : 0xf59e0b,
            })
            .stroke({ color: 0xfef3c7, width: 2 });
        },
      );

      draw('exit', scene.layers.objects, true, (exit) => {
        exit
          .rect(
            view.exit.x - 20,
            WORLD_Y - 54,
            40,
            54,
          )
          .fill({
            color: view.exit.reached
              ? 0x22c55e
              : 0x38bdf8,
            alpha: 0.75,
          })
          .stroke({ color: 0xe0f2fe, width: 2 });
        drawDiamond(
          exit,
          view.exit.x,
          WORLD_Y - 54,
          40,
          18,
        );
        exit.fill({
          color: view.exit.reached ? 0x86efac : 0x7dd3fc,
          alpha: 0.9,
        });
      });

      draw(
        'obstacle',
        scene.layers.objects,
        view.gate.blocked,
        (obstacle) => {
          obstacle
            .rect(
              view.gate.x - 16,
              WORLD_Y + 2,
              32,
              18,
            )
            .fill({ color: 0x92400e })
            .stroke({ color: 0xfbbf24, width: 2 });
        },
      );

      draw('helper', scene.layers.entities, true, (helper) => {
        helper
          .ellipse(view.helper.x, WORLD_Y - 20, 20, 28)
          .fill({ color: 0xe2e8f0 })
          .stroke({ color: 0x0f172a, width: 4 });
        helper.zIndex = WORLD_Y - 20;
      });

      draw(
        'blocked-warning',
        scene.layers.effects,
        view.gate.blocked,
        (warning) => {
          warning
            .circle(view.gate.x, WORLD_Y - 26, 34)
            .stroke({
              color: 0xf87171,
              width: 2,
              alpha: 0.75,
            });
        },
      );

      draw(
        'ground-line',
        scene.layers.foreground,
        true,
        (foreground) => {
          foreground
            .moveTo(32, WORLD_Y + 48)
            .lineTo(view.exit.x + 64, WORLD_Y + 48)
            .stroke({
              color: 0x0f172a,
              width: 10,
              alpha: 0.35,
            });
        },
      );

      scene.setCamera(
        {
          x: (view.helper.x + view.exit.x) / 2,
          y: WORLD_Y,
          zoom: 1,
        },
        VIEWPORT,
      );
    },
  };
}

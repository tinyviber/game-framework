import { Graphics } from 'pixi.js';
import type { WorldScene } from './world-scene';

export const TOP_DOWN_TILE_SIZE = 24;

export type TopDownGroundView =
  | 'grass'
  | 'dirt'
  | 'stone'
  | 'water';

export type TopDownObstacleView =
  | 'tree'
  | 'rock'
  | 'wall'
  | null;

export interface TopDownCellView {
  readonly ground: TopDownGroundView;
  readonly obstacle: TopDownObstacleView;
}

export interface TopDownPositionView {
  readonly x: number;
  readonly y: number;
}

export interface TopDownRoomView {
  readonly width: number;
  readonly height: number;
  readonly cells: readonly (readonly TopDownCellView[])[];
  readonly player: TopDownPositionView;
  readonly goal: TopDownPositionView;
}

export interface TopDownSceneRenderer {
  render(view: TopDownRoomView): void;
  focus(position: TopDownPositionView, zoom?: number): void;
  destroy(): void;
}

const GROUND_COLORS: Readonly<Record<TopDownGroundView, number>> = {
  grass: 0x5f8f58,
  dirt: 0x9a7448,
  stone: 0x7c8585,
  water: 0x3f7690,
};

export function projectTopDownCell(
  x: number,
  y: number,
): TopDownPositionView {
  return {
    x: x * TOP_DOWN_TILE_SIZE,
    y: y * TOP_DOWN_TILE_SIZE,
  };
}

function drawObstacle(
  graphics: Graphics,
  obstacle: Exclude<TopDownObstacleView, null>,
  x: number,
  y: number,
): void {
  const left = x * TOP_DOWN_TILE_SIZE;
  const top = y * TOP_DOWN_TILE_SIZE;
  const centerX = left + TOP_DOWN_TILE_SIZE / 2;
  const centerY = top + TOP_DOWN_TILE_SIZE / 2;

  if (obstacle === 'tree') {
    graphics
      .circle(centerX, centerY - 2, 8)
      .fill(0x245b37)
      .rect(centerX - 2, centerY + 4, 4, 7)
      .fill(0x5b3a24);
    return;
  }

  if (obstacle === 'rock') {
    graphics
      .roundRect(left + 5, top + 6, 14, 12, 4)
      .fill(0x4c5659);
    return;
  }

  graphics
    .rect(left, top, TOP_DOWN_TILE_SIZE, TOP_DOWN_TILE_SIZE)
    .fill(0x253036);
}

export function createTopDownScene(
  scene: WorldScene,
): TopDownSceneRenderer {
  const ground = new Graphics();
  const obstacles = new Graphics();
  const entities = new Graphics();
  const effects = new Graphics();

  scene.layers.ground.addChild(ground);
  scene.layers.objects.addChild(obstacles);
  scene.layers.entities.addChild(entities);
  scene.layers.effects.addChild(effects);

  return {
    render(view): void {
      ground.clear();
      obstacles.clear();
      entities.clear();
      effects.clear();

      for (let y = 0; y < view.height; y += 1) {
        for (let x = 0; x < view.width; x += 1) {
          const cell = view.cells[y]?.[x];
          if (!cell) {
            continue;
          }

          const point = projectTopDownCell(x, y);
          ground
            .rect(
              point.x,
              point.y,
              TOP_DOWN_TILE_SIZE,
              TOP_DOWN_TILE_SIZE,
            )
            .fill(GROUND_COLORS[cell.ground]);

          if (cell.ground !== 'water') {
            ground
              .rect(
                point.x,
                point.y,
                TOP_DOWN_TILE_SIZE,
                TOP_DOWN_TILE_SIZE,
              )
              .stroke({ width: 1, color: 0x000000, alpha: 0.08 });
          }

          if (cell.obstacle) {
            drawObstacle(obstacles, cell.obstacle, x, y);
          }
        }
      }

      const goal = projectTopDownCell(view.goal.x, view.goal.y);
      effects
        .circle(
          goal.x + TOP_DOWN_TILE_SIZE / 2,
          goal.y + TOP_DOWN_TILE_SIZE / 2,
          7,
        )
        .stroke({ width: 3, color: 0xf2c66d, alpha: 0.95 });

      const player = projectTopDownCell(view.player.x, view.player.y);
      entities
        .circle(
          player.x + TOP_DOWN_TILE_SIZE / 2,
          player.y + TOP_DOWN_TILE_SIZE / 2,
          8,
        )
        .fill(0xf4f8ea)
        .circle(
          player.x + TOP_DOWN_TILE_SIZE / 2,
          player.y + TOP_DOWN_TILE_SIZE / 2 - 1,
          3,
        )
        .fill(0x25493c);
    },

    focus(position, zoom = 1.4): void {
      const point = projectTopDownCell(position.x, position.y);
      scene.setCamera(
        {
          x: point.x + TOP_DOWN_TILE_SIZE / 2,
          y: point.y + TOP_DOWN_TILE_SIZE / 2,
          zoom,
        },
        { width: 900, height: 440 },
      );
    },

    destroy(): void {
      scene.clear();
    },
  };
}

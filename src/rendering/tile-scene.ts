import {
  Container,
  Graphics,
  Sprite,
} from 'pixi.js';
import type {
  WorldScene,
  WorldViewport,
} from './world-scene';
import type {
  TileTextureName,
  TileTextureSet,
} from './tile-textures';

/**
 * Single source of truth for the top-down tile view. Cell (x, y)
 * occupies the pixel rectangle (x*TILE_SIZE, y*TILE_SIZE, …).
 */
export const TILE_SIZE = 48;

export const TILE_VIEWPORT: WorldViewport = {
  width: 720,
  height: 480,
};

const COLORS = {
  floor: 0x2c3a4f,
  floorGrid: 0x35455e,
  wall: 0x151d2b,
  wallEdge: 0x46587a,
  player: 0x4cc9f0,
  plate: 0xf4d35e,
  lever: 0x9aa5b1,
  leverOn: 0x70e390,
  chest: 0xe0a458,
  chestOpened: 0x7c6a4f,
  door: 0xa05c2c,
  doorOpen: 0x57708f,
  block: 0x9d6bd8,
} as const;

export interface TileSceneEntityView {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export interface TileScenePlateView extends TileSceneEntityView {
  readonly pressed: boolean;
}

export interface TileSceneDoorView {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly open: boolean;
}

export interface TileSceneLeverView {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly on: boolean;
}

export interface TileSceneChestView {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly opened: boolean;
}

/**
 * Pure view model consumed by the tile scene. The renderer never
 * reads gameplay state back from display objects.
 */
export interface TileSceneView {
  readonly tiles: readonly (readonly number[])[];
  readonly player: { readonly x: number; readonly y: number };
  readonly doors: readonly TileSceneDoorView[];
  readonly plates: readonly TileScenePlateView[];
  readonly levers: readonly TileSceneLeverView[];
  readonly blocks: readonly TileSceneEntityView[];
  readonly chests: readonly TileSceneChestView[];
}

export interface TileSceneRenderer {
  render(view: TileSceneView): void;
  setCamera(x: number, y: number): void;
}

function tileRect(
  graphics: Graphics,
  x: number,
  y: number,
  inset = 0,
): void {
  graphics.rect(
    x * TILE_SIZE + inset,
    y * TILE_SIZE + inset,
    TILE_SIZE - inset * 2,
    TILE_SIZE - inset * 2,
  );
}

function drawGround(
  graphics: Graphics,
  tiles: readonly (readonly number[])[],
): void {
  for (let y = 0; y < tiles.length; y += 1) {
    const row = tiles[y];

    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === 1) {
        graphics.rect(
          x * TILE_SIZE,
          y * TILE_SIZE,
          TILE_SIZE,
          TILE_SIZE,
        );
        graphics.fill(COLORS.wall);
        graphics.rect(
          x * TILE_SIZE + 2,
          y * TILE_SIZE + 2,
          TILE_SIZE - 4,
          TILE_SIZE - 4,
        );
        graphics.stroke({ width: 1, color: COLORS.wallEdge });
      } else {
        graphics.rect(
          x * TILE_SIZE,
          y * TILE_SIZE,
          TILE_SIZE,
          TILE_SIZE,
        );
        graphics.fill(COLORS.floor);
        graphics.rect(
          x * TILE_SIZE + 0.5,
          y * TILE_SIZE + 0.5,
          TILE_SIZE - 1,
          TILE_SIZE - 1,
        );
        graphics.stroke({ width: 1, color: COLORS.floorGrid });
      }
    }
  }
}

function drawDoor(
  graphics: Graphics,
  door: TileSceneDoorView,
): void {
  if (door.open) {
    tileRect(graphics, door.x, door.y, 16);
    graphics.stroke({ width: 2, color: COLORS.doorOpen });
    return;
  }

  tileRect(graphics, door.x, door.y, 2);
  graphics.fill(COLORS.door);
  graphics.rect(
    door.x * TILE_SIZE + 10,
    door.y * TILE_SIZE + 10,
    TILE_SIZE - 20,
    TILE_SIZE - 20,
  );
  graphics.stroke({ width: 2, color: 0x3f2a12 });
}

function drawPlate(
  graphics: Graphics,
  plate: TileScenePlateView,
): void {
  tileRect(graphics, plate.x, plate.y, 14);
  graphics.fill(plate.pressed ? COLORS.leverOn : COLORS.plate);
}

function drawLever(
  graphics: Graphics,
  lever: TileSceneLeverView,
): void {
  graphics.circle(
    (lever.x + 0.5) * TILE_SIZE,
    (lever.y + 0.5) * TILE_SIZE,
    10,
  );
  graphics.fill(lever.on ? COLORS.leverOn : COLORS.lever);
}

function drawChest(
  graphics: Graphics,
  chest: TileSceneChestView,
): void {
  tileRect(graphics, chest.x, chest.y, 8);
  graphics.fill(chest.opened ? COLORS.chestOpened : COLORS.chest);
  graphics.rect(
    chest.x * TILE_SIZE + 8,
    (chest.y + 0.5) * TILE_SIZE - 2,
    TILE_SIZE - 16,
    4,
  );
  graphics.fill(0x3f2a12);
}

function drawBlock(
  graphics: Graphics,
  block: TileSceneEntityView,
): void {
  tileRect(graphics, block.x, block.y, 5);
  graphics.fill(COLORS.block);
  graphics.rect(
    block.x * TILE_SIZE + 12,
    block.y * TILE_SIZE + 12,
    TILE_SIZE - 24,
    TILE_SIZE - 24,
  );
  graphics.stroke({ width: 2, color: 0x5d3a8e });
}

function drawPlayer(
  graphics: Graphics,
  player: { readonly x: number; readonly y: number },
): void {
  graphics.circle(
    (player.x + 0.5) * TILE_SIZE,
    (player.y + 0.5) * TILE_SIZE,
    TILE_SIZE * 0.32,
  );
  graphics.fill(COLORS.player);
}

function spriteAt(
  textures: TileTextureSet,
  layer: Container,
  name: TileTextureName,
  x: number,
  y: number,
): void {
  const sprite = new Sprite(textures[name]);

  sprite.x = x * TILE_SIZE;
  sprite.y = y * TILE_SIZE;
  sprite.width = TILE_SIZE;
  sprite.height = TILE_SIZE;
  layer.addChild(sprite);
}

function drawGroundSprites(
  textures: TileTextureSet,
  layer: Container,
  tiles: readonly (readonly number[])[],
): void {
  for (let y = 0; y < tiles.length; y += 1) {
    const row = tiles[y];

    for (let x = 0; x < row.length; x += 1) {
      spriteAt(
        textures,
        layer,
        row[x] === 1 ? 'wall' : 'floor',
        x,
        y,
      );
    }
  }
}

/**
 * Creates a tile renderer bound to the given scene. Rendering is a
 * pure projection: every call rebuilds the stage from the view model
 * and never reads state back. When a texture set is provided the
 * scene renders sprites; otherwise it falls back to flat-color
 * graphics so the game always works, with or without art assets.
 */
export function createTileSceneRenderer(
  scene: WorldScene,
  textures: TileTextureSet | null = null,
): TileSceneRenderer {
  const groundSprites = new Container();
  const objectsSprites = new Container();
  const entitiesSprites = new Container();
  const groundGraphics = new Graphics();
  const objectsGraphics = new Graphics();
  const entitiesGraphics = new Graphics();

  groundSprites.label = 'TileGroundSprites';
  objectsSprites.label = 'TileObjectSprites';
  entitiesSprites.label = 'TileEntitySprites';

  // Sprites go into their own container per layer so per-render
  // rebuilds never destroy the persistent Graphics canvases.
  scene.layers.ground.addChild(groundSprites, groundGraphics);
  scene.layers.objects.addChild(objectsSprites, objectsGraphics);
  scene.layers.entities.addChild(entitiesSprites, entitiesGraphics);

  const clearSprites = (layer: Container): void => {
    layer.removeChildren().forEach((child) => {
      child.destroy();
    });
  };

  const renderGround = (view: TileSceneView): void => {
    if (textures) {
      clearSprites(groundSprites);
      drawGroundSprites(textures, groundSprites, view.tiles);
      return;
    }

    groundGraphics.clear();
    drawGround(groundGraphics, view.tiles);
  };

  const renderObjects = (view: TileSceneView): void => {
    objectsGraphics.clear();

    if (textures) {
      clearSprites(objectsSprites);

      for (const plate of view.plates) {
        spriteAt(textures, objectsSprites, 'plate', plate.x, plate.y);

        if (plate.pressed) {
          objectsGraphics.circle(
            (plate.x + 0.5) * TILE_SIZE,
            (plate.y + 0.5) * TILE_SIZE,
            6,
          );
          objectsGraphics.fill(COLORS.leverOn);
        }
      }

      for (const lever of view.levers) {
        spriteAt(
          textures,
          objectsSprites,
          lever.on ? 'leverOn' : 'leverOff',
          lever.x,
          lever.y,
        );
      }

      for (const chest of view.chests) {
        spriteAt(
          textures,
          objectsSprites,
          chest.opened ? 'chestOpened' : 'chest',
          chest.x,
          chest.y,
        );
      }

      for (const door of view.doors) {
        spriteAt(
          textures,
          objectsSprites,
          door.open ? 'doorOpen' : 'door',
          door.x,
          door.y,
        );
      }

      for (const block of view.blocks) {
        spriteAt(textures, objectsSprites, 'block', block.x, block.y);
      }

      return;
    }

    for (const plate of view.plates) {
      drawPlate(objectsGraphics, plate);
    }

    for (const lever of view.levers) {
      drawLever(objectsGraphics, lever);
    }

    for (const chest of view.chests) {
      drawChest(objectsGraphics, chest);
    }

    for (const door of view.doors) {
      drawDoor(objectsGraphics, door);
    }

    for (const block of view.blocks) {
      drawBlock(objectsGraphics, block);
    }
  };

  const renderEntities = (view: TileSceneView): void => {
    if (textures) {
      clearSprites(entitiesSprites);
      spriteAt(textures, entitiesSprites, 'player', view.player.x, view.player.y);
      return;
    }

    entitiesGraphics.clear();
    drawPlayer(entitiesGraphics, view.player);
  };

  return {
    render(view: TileSceneView): void {
      renderGround(view);
      renderObjects(view);
      renderEntities(view);
    },

    setCamera(x: number, y: number): void {
      scene.setCamera({ x, y, zoom: 1 }, TILE_VIEWPORT);
    },
  };
}

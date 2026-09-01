import { Graphics } from 'pixi.js';
import {
  ISO_HEIGHT_STEP,
  ISO_TILE_HEIGHT,
  ISO_TILE_WIDTH,
  projectIsoCell,
  type IsoCellView,
  type IsoRoomView,
  type IsoSceneView,
  type IsometricSceneRenderer,
} from './isometric-scene';
import type { WorldScene } from './world-scene';

export const CAPTURE_VIEWPORT = {
  width: 1280,
  height: 960,
} as const;

export const CAPTURE_ROCK_HEIGHT = 2.4;
export const CAPTURE_BUILDING_HEIGHT = 3.2;
export const CAPTURE_TREE_HEIGHT = 4.6;
export const CAPTURE_WATER_RECESS = 0.7;
export const CAPTURE_PADDING = 0.12;

interface CaptureBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface CaptureCamera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface CaptureObstacleFaces {
  readonly east: boolean;
  readonly south: boolean;
}

const CAPTURE_COLORS = {
  background: 0xb9c6bd,
  grass: 0x729061,
  dirt: 0xa77d58,
  stone: 0x8b9293,
  sand: 0xb8a16e,
  snow: 0xc4d5d1,
  water: 0x3c7884,
  waterEdge: 0x285760,
  rockTop: 0xa7ada9,
  rockEast: 0x666e70,
  rockSouth: 0x818988,
  buildingTop: 0xb09b7f,
  buildingEast: 0x6e6255,
  buildingSouth: 0x897863,
  treeTrunk: 0x6b5038,
  treeCanopy: 0x355d47,
  treeCanopyLight: 0x52785a,
  shadow: 0x283b34,
} as const;

function surfaceOf(cell: IsoCellView): string {
  return cell.surface ?? cell.terrainType;
}

function cellAt(
  cells: readonly (readonly IsoCellView[])[],
  x: number,
  y: number,
): IsoCellView | undefined {
  return cells[y]?.[x];
}

function sameRaisedMass(
  cell: IsoCellView,
  neighbour: IsoCellView | undefined,
): boolean {
  return Boolean(
    cell.obstacle
    && neighbour
    && neighbour.obstacle === cell.obstacle,
  );
}

export function exposedObstacleFaces(
  cells: readonly (readonly IsoCellView[])[],
  cell: IsoCellView,
): CaptureObstacleFaces {
  if (!cell.obstacle) {
    return { east: false, south: false };
  }
  return {
    east: !sameRaisedMass(cell, cellAt(cells, cell.x + 1, cell.y)),
    south: !sameRaisedMass(cell, cellAt(cells, cell.x, cell.y + 1)),
  };
}

export function captureVisualHeight(cell: IsoCellView): number {
  return cell.obstacle === 'building'
    ? CAPTURE_BUILDING_HEIGHT
    : cell.obstacle === 'forest'
      ? CAPTURE_TREE_HEIGHT
      : cell.obstacle === 'rock'
        ? CAPTURE_ROCK_HEIGHT
        : 0;
}

export function createCaptureSceneView(room: IsoRoomView): IsoSceneView {
  return {
    room: {
      ...room,
      props: [],
      npcs: [],
      exits: [],
      connectors: [],
      node: undefined,
      roadPath: undefined,
      start: undefined,
      goal: undefined,
      debugOverlay: undefined,
    },
    windMarks: {},
  };
}

function boundsFor(room: IsoRoomView): CaptureBounds {
  const bounds: CaptureBounds = {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };

  const include = (x: number, y: number): void => {
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxY = Math.max(bounds.maxY, y);
  };

  for (const row of room.cells) {
    for (const cell of row) {
      const point = projectIsoCell(cell.x, cell.y, surfaceOf(cell) === 'water'
        ? -CAPTURE_WATER_RECESS
        : captureVisualHeight(cell));
      include(point.x - ISO_TILE_WIDTH / 2, point.y - ISO_TILE_HEIGHT / 2);
      include(point.x + ISO_TILE_WIDTH / 2, point.y + ISO_TILE_HEIGHT / 2);
      if (captureVisualHeight(cell) > 0 || surfaceOf(cell) === 'water') {
        const base = projectIsoCell(cell.x, cell.y);
        include(base.x - ISO_TILE_WIDTH / 2, base.y - ISO_TILE_HEIGHT / 2);
        include(base.x + ISO_TILE_WIDTH / 2, base.y + ISO_TILE_HEIGHT / 2);
      }
      if (cell.obstacle === 'forest') {
        const base = projectIsoCell(cell.x, cell.y);
        include(base.x - 28, base.y - 10);
        include(base.x + 28, base.y - CAPTURE_TREE_HEIGHT * ISO_HEIGHT_STEP * 1.4);
      }
    }
  }

  return bounds;
}

export function fitCaptureCamera(
  room: IsoRoomView,
  viewport = CAPTURE_VIEWPORT,
  padding = CAPTURE_PADDING,
): CaptureCamera {
  const bounds = boundsFor(room);
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const availableWidth = viewport.width * (1 - padding * 2);
  const availableHeight = viewport.height * (1 - padding * 2);
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    zoom: Math.min(availableWidth / width, availableHeight / height),
  };
}

function fillDiamond(
  graphics: Graphics,
  point: { readonly x: number; readonly y: number },
  color: number,
  alpha = 1,
): void {
  graphics
    .moveTo(point.x, point.y - ISO_TILE_HEIGHT / 2)
    .lineTo(point.x + ISO_TILE_WIDTH / 2, point.y)
    .lineTo(point.x, point.y + ISO_TILE_HEIGHT / 2)
    .lineTo(point.x - ISO_TILE_WIDTH / 2, point.y)
    .closePath()
    .fill({ color, alpha });
}

function drawGround(
  graphics: Graphics,
  cell: IsoCellView,
): void {
  const point = projectIsoCell(cell.x, cell.y);
  const color = CAPTURE_COLORS[surfaceOf(cell) as keyof typeof CAPTURE_COLORS]
    ?? CAPTURE_COLORS.grass;
  fillDiamond(graphics, point, color);
}

function drawWater(
  graphics: Graphics,
  cells: readonly (readonly IsoCellView[])[],
  cell: IsoCellView,
): void {
  const top = projectIsoCell(cell.x, cell.y, -CAPTURE_WATER_RECESS);
  const base = projectIsoCell(cell.x, cell.y);
  const east = cellAt(cells, cell.x + 1, cell.y);
  const south = cellAt(cells, cell.x, cell.y + 1);

  if (!east || surfaceOf(east) !== 'water') {
    graphics
      .moveTo(top.x, top.y)
      .lineTo(top.x + ISO_TILE_WIDTH / 2, top.y + ISO_TILE_HEIGHT / 2)
      .lineTo(base.x + ISO_TILE_WIDTH / 2, base.y + ISO_TILE_HEIGHT / 2)
      .lineTo(base.x, base.y)
      .closePath()
      .fill(CAPTURE_COLORS.waterEdge);
  }
  if (!south || surfaceOf(south) !== 'water') {
    graphics
      .moveTo(top.x, top.y)
      .lineTo(top.x - ISO_TILE_WIDTH / 2, top.y + ISO_TILE_HEIGHT / 2)
      .lineTo(base.x - ISO_TILE_WIDTH / 2, base.y + ISO_TILE_HEIGHT / 2)
      .lineTo(base.x, base.y)
      .closePath()
      .fill({ color: CAPTURE_COLORS.waterEdge, alpha: 0.82 });
  }
  fillDiamond(graphics, top, CAPTURE_COLORS.water);
}

function drawShadow(
  graphics: Graphics,
  cell: IsoCellView,
): void {
  if (!cell.obstacle) {
    return;
  }
  const point = projectIsoCell(cell.x, cell.y);
  graphics.ellipse(point.x, point.y + 12, 24, 8).fill({
    color: CAPTURE_COLORS.shadow,
    alpha: 0.24,
  });
}

function drawPrism(
  graphics: Graphics,
  cells: readonly (readonly IsoCellView[])[],
  cell: IsoCellView,
  topColor: number,
  eastColor: number,
  southColor: number,
): void {
  const top = projectIsoCell(cell.x, cell.y, captureVisualHeight(cell));
  const base = projectIsoCell(cell.x, cell.y);
  const faces = exposedObstacleFaces(cells, cell);

  if (faces.east) {
    graphics
      .moveTo(top.x, top.y)
      .lineTo(top.x + ISO_TILE_WIDTH / 2, top.y + ISO_TILE_HEIGHT / 2)
      .lineTo(base.x + ISO_TILE_WIDTH / 2, base.y + ISO_TILE_HEIGHT / 2)
      .lineTo(base.x, base.y)
      .closePath()
      .fill(eastColor);
  }
  if (faces.south) {
    graphics
      .moveTo(top.x, top.y)
      .lineTo(top.x - ISO_TILE_WIDTH / 2, top.y + ISO_TILE_HEIGHT / 2)
      .lineTo(base.x - ISO_TILE_WIDTH / 2, base.y + ISO_TILE_HEIGHT / 2)
      .lineTo(base.x, base.y)
      .closePath()
      .fill(southColor);
  }
  fillDiamond(graphics, top, topColor);
}

function drawTree(
  graphics: Graphics,
  cell: IsoCellView,
): void {
  const point = projectIsoCell(cell.x, cell.y);
  const height = CAPTURE_TREE_HEIGHT * ISO_HEIGHT_STEP;
  graphics
    .rect(point.x - 4, point.y - height * 0.58, 8, height * 0.58 + 2)
    .fill(CAPTURE_COLORS.treeTrunk);
  graphics
    .circle(point.x - 14, point.y - height * 0.77, 22)
    .fill(CAPTURE_COLORS.treeCanopy);
  graphics
    .circle(point.x + 12, point.y - height * 0.87, 26)
    .fill(CAPTURE_COLORS.treeCanopyLight);
  graphics
    .circle(point.x, point.y - height * 1.1, 24)
    .fill(CAPTURE_COLORS.treeCanopy);
}

function sortCells(room: IsoRoomView): IsoCellView[] {
  return room.cells.flat().sort((a, b) => {
    const aKey = (a.x + a.y) * 1000 + a.x;
    const bKey = (b.x + b.y) * 1000 + b.x;
    return aKey - bKey;
  });
}

export function createIsometricCaptureScene(
  scene: WorldScene,
): IsometricSceneRenderer {
  const groundGraphics = new Graphics();
  const objectGraphics = new Graphics();
  scene.layers.ground.addChild(groundGraphics);
  scene.layers.objects.addChild(objectGraphics);

  return {
    render(view): void {
      groundGraphics.clear();
      objectGraphics.clear();
      const { room } = view;
      groundGraphics
        .rect(-2000, -1600, 4000, 3200)
        .fill(CAPTURE_COLORS.background);

      for (const cell of sortCells(room)) {
        drawGround(groundGraphics, cell);
        drawShadow(groundGraphics, cell);
      }
      for (const cell of sortCells(room)) {
        if (surfaceOf(cell) === 'water') {
          drawWater(objectGraphics, room.cells, cell);
        }
        if (cell.obstacle === 'rock') {
          drawPrism(
            objectGraphics,
            room.cells,
            cell,
            CAPTURE_COLORS.rockTop,
            CAPTURE_COLORS.rockEast,
            CAPTURE_COLORS.rockSouth,
          );
        } else if (cell.obstacle === 'building') {
          drawPrism(
            objectGraphics,
            room.cells,
            cell,
            CAPTURE_COLORS.buildingTop,
            CAPTURE_COLORS.buildingEast,
            CAPTURE_COLORS.buildingSouth,
          );
        } else if (cell.obstacle === 'forest') {
          drawTree(objectGraphics, cell);
        }
      }
    },

    setCamera(x, y, zoom = 1): void {
      scene.setCamera({ x, y, zoom }, CAPTURE_VIEWPORT);
    },

    destroy(): void {
      scene.clear();
    },
  };
}

import {
  Container,
  Graphics,
  Sprite,
} from 'pixi.js';
import type {
  IsoCellView,
  IsoEnvironmentView,
  IsoRoomView,
  IsoSceneView,
  IsoMarkerView,
  IsoFrostCellView,
  IsoObjectView,
  IsoPropView,
} from './isometric-scene';
import type { WorldScene } from './world-scene';
import type { OrthogonalTextureSet } from './orthogonal-textures';
import { ORTHO_DECORATION_TILE_IDS } from './orthogonal-textures';
import type { MarkTextureSet } from './isometric-scene';
import { terrainTileIdForCell } from './terrain-presentation';
import {
  KENNEY_GENERATOR_TILE_IDS,
  KENNEY_PLATEAU_TILE_IDS,
} from '@/assets/kenney-map-pack/metadata';
import {
  kenneyForestTileFor,
} from '@/assets/kenney-map-pack/kenney-resolver';

export const ORTHO_TILE_SIZE = 32;
export const ORTHO_ELEVATION_STEP = 14;

export interface OrthogonalPoint {
  readonly x: number;
  readonly y: number;
}

export interface OrthogonalSceneRenderer {
  render(view: IsoSceneView): void;
  setCamera(x: number, y: number, zoom?: number): void;
  destroy(): void;
}

export function projectOrthogonalCell(
  x: number,
  y: number,
  elevation = 0,
): OrthogonalPoint {
  return {
    x: x * ORTHO_TILE_SIZE,
    y: y * ORTHO_TILE_SIZE - elevation * ORTHO_ELEVATION_STEP,
  };
}

export function orthogonalSortKey(x: number, y: number): number {
  return y * 10000 + x;
}

function clearContainer(container: Container): void {
  container.removeChildren().forEach((child) => child.destroy());
}

function colorForTerrain(
  terrainType: string,
  biome: string,
  environment: IsoEnvironmentView,
  palette: IsoRoomView['palette'],
): number {
  const base = (() => {
    switch (terrainType) {
      case 'dirt':
        return 0x9a6a4d;
      case 'stone':
        return 0x788793;
      case 'snow':
        return 0xbad4d3;
      case 'crystal':
        return 0x6f63a1;
      case 'water':
        return 0x2d5f7f;
      case 'cliff':
        return 0x6e8852;
      case 'grass':
      default:
        return palette.ground;
    }
  })();
  const biomeShift = biome === 'wetland' ? 0x07140d : biome === 'ridge' ? 0x090909 : 0;
  const weatherShift = environment.weather === 'rainy' ? 0x060b12 : 0;
  const lightingShift = environment.lighting === 'night'
    ? 0x202020
    : environment.lighting === 'dusk'
      ? 0x0b0710
      : 0;
  return Math.max(0, base - biomeShift - weatherShift - lightingShift);
}

function cellTopLeft(cell: Pick<IsoCellView, 'x' | 'y' | 'elevation'>): OrthogonalPoint {
  return projectOrthogonalCell(cell.x, cell.y, cell.elevation);
}

function cellBaseTopLeft(cell: Pick<IsoCellView, 'x' | 'y'>): OrthogonalPoint {
  return projectOrthogonalCell(cell.x, cell.y);
}

function drawShadow(graphics: Graphics, point: OrthogonalPoint, alpha = 0.18): void {
  graphics.ellipse(
    point.x + ORTHO_TILE_SIZE / 2,
    point.y + ORTHO_TILE_SIZE - 2,
    13,
    5,
  ).fill({ color: 0x05080d, alpha });
}

const PLATEAU_BOTTOM_FILL_FOR_SURFACE: Record<string, string> = {
  grass: 'kenney.mapTile.022',
  dirt: 'kenney.mapTile.082',
  stone: 'kenney.mapTile.027',
  sand: 'kenney.mapTile.017',
  water: 'kenney.mapTile.171',
  snow: 'kenney.mapTile.077',
};

function fillTileIdForSurface(surface: string): string | undefined {
  return PLATEAU_BOTTOM_FILL_FOR_SURFACE[surface] ?? KENNEY_GENERATOR_TILE_IDS[surface as keyof typeof KENNEY_GENERATOR_TILE_IDS]?.[0];
}

const SIDE_EDGE_TILE_IDS: Record<string, { readonly west?: string; readonly east?: string }> = {
  grass: { west: 'kenney.mapTile.021', east: 'kenney.mapTile.023' },
  dirt: { west: 'kenney.mapTile.081', east: 'kenney.mapTile.083' },
  stone: { west: 'kenney.mapTile.026', east: 'kenney.mapTile.028' },
  sand: { west: 'kenney.mapTile.006' },
};

const SOUTH_EDGE_TILE_IDS: Record<string, string> = {
  grass: 'kenney.mapTile.006',
};

const STONE_SOUTH_EDGE_TILE_IDS = {
  left: 'kenney.mapTile.041',
  middle: 'kenney.mapTile.042',
  right: 'kenney.mapTile.043',
} as const;

export function sideEdgeTileId(surface: string, side: 'west' | 'east'): string | undefined {
  return SIDE_EDGE_TILE_IDS[surface]?.[side];
}

/**
 * A blocked stone south row reads as one cliff: straight bottom tile in the
 * interior (042), rounded left cap where the row starts (041) and rounded
 * right cap where it ends (043).
 */
export function stoneSouthEdgeTileId(westHasSouthEdge: boolean, eastHasSouthEdge: boolean): string {
  if (!westHasSouthEdge) return STONE_SOUTH_EDGE_TILE_IDS.left;
  if (!eastHasSouthEdge) return STONE_SOUTH_EDGE_TILE_IDS.right;
  return STONE_SOUTH_EDGE_TILE_IDS.middle;
}

/**
 * A non-walkable barrier cell splits only from walkable ground of a
 * different surface; same-surface neighbours stay smooth and read the
 * barrier from its rock/forest feature instead. The cell then carries the
 * side-edge tile of its own surface towards that neighbour.
 */
export function barrierSideEdgeTileId(
  surface: string,
  westSplit: boolean,
  eastSplit: boolean,
): string | undefined {
  if (westSplit) return sideEdgeTileId(surface, 'west');
  if (eastSplit) return sideEdgeTileId(surface, 'east');
  return undefined;
}

function drawGroundCell(
  graphics: Graphics,
  cell: IsoCellView,
  palette: IsoRoomView['palette'],
  hasElevatedTexture: boolean,
): void {
  const top = cellTopLeft(cell);
  const base = cellBaseTopLeft(cell);
  const sideHeight = Math.max(0, base.y - top.y);
  const surface = cell.surface ?? cell.terrainType;
  const color = colorForTerrain(surface, cell.biome, cell.environment, palette);

  if (sideHeight > 0) {
    // Vertical cliff face under a raised cell: the plateau itself is normal
    // world; only the height transition constrains traversal.
    graphics
      .rect(top.x, top.y + ORTHO_TILE_SIZE - 2, ORTHO_TILE_SIZE, sideHeight + 2)
      .fill(hasElevatedTexture || surface === 'cliff' ? palette.edge : Math.max(0, palette.edge - 0x0b0b0b));
    graphics
      .rect(top.x, base.y + ORTHO_TILE_SIZE - 3, ORTHO_TILE_SIZE, 3)
      .fill(hasElevatedTexture ? palette.edge : Math.max(0, palette.edge - 0x171717));
  }

  // The ground tile is always real world terrain - non-walkable cells are
  // water, forest or rock features, never a generic void marker.
  graphics.rect(top.x, top.y, ORTHO_TILE_SIZE, ORTHO_TILE_SIZE).fill(color);
  if (!hasElevatedTexture && (surface === 'cliff' || cell.elevation > 0)) {
    graphics
      .moveTo(top.x + 2, top.y + ORTHO_TILE_SIZE - 3)
      .lineTo(top.x + ORTHO_TILE_SIZE - 2, top.y + ORTHO_TILE_SIZE - 3)
      .stroke({ width: 2, color: 0xd8c27f, alpha: 0.65 });
    graphics
      .moveTo(top.x + 2, top.y + 4)
      .lineTo(top.x + ORTHO_TILE_SIZE - 2, top.y + 4)
      .stroke({ width: 1, color: 0xf2e6a4, alpha: 0.38 });
  }
  if (surface === 'water') {
    graphics
      .moveTo(top.x + 6, top.y + 12)
      .lineTo(top.x + 14, top.y + 12)
      .moveTo(top.x + 18, top.y + 21)
      .lineTo(top.x + 27, top.y + 21)
      .stroke({ width: 1, color: 0x8fd2e8, alpha: 0.35 });
  }
}

function drawForestFallback(
  graphics: Graphics,
  cell: IsoCellView,
  palette: IsoRoomView['palette'],
): void {
  const top = cellTopLeft(cell);
  const canopy = Math.max(0, palette.edge - 0x0a140a);
  for (const [cx, cy, size] of [[10, 20, 7], [22, 17, 8], [16, 26, 6]] as const) {
    graphics
      .moveTo(top.x + cx, top.y + cy - size)
      .lineTo(top.x + cx - size * 0.7, top.y + cy + 3)
      .lineTo(top.x + cx + size * 0.7, top.y + cy + 3)
      .closePath()
      .fill(canopy);
  }
}

/**
 * The Kenney rock sprite is the same cool grey as stone/snow ground, so it
 * vanishes on those surfaces. A warm multiplicative tint pushes it towards
 * brown stone while dirt/grass/sand keep the untouched (already contrasting)
 * cool grey.
 */
const ROCK_TINT_FOR_SURFACE: Record<string, number> = {
  stone: 0xd69c7b,
  snow: 0xc48f6a,
};

function drawRockFeature(
  textures: OrthogonalTextureSet,
  container: Container,
  graphics: Graphics,
  cell: IsoCellView,
): void {
  const rockId = ORTHO_DECORATION_TILE_IDS[0];
  const entry = rockId ? textures.decorations?.[rockId] : undefined;
  const point = cellTopLeft(cell);
  if (entry) {
    const sprite = new Sprite(entry.texture);
    const surface = cell.surface ?? cell.terrainType;
    sprite.tint = ROCK_TINT_FOR_SURFACE[surface] ?? 0xffffff;
    sprite.position.set(point.x, point.y);
    sprite.width = ORTHO_TILE_SIZE;
    sprite.height = ORTHO_TILE_SIZE;
    sprite.zIndex = orthogonalSortKey(cell.x, cell.y) + 0.2;
    sprite.label = `rock:${entry.regionId}`;
    container.addChild(sprite);
    return;
  }
  // Vector fallback: neutral stone greys. palette.edge is a biome tint and
  // rendered as blue slabs on the dirt strip; a rock is a rock everywhere.
  const top = point;
  graphics
    .roundRect(top.x + 6, top.y + 14, 12, 12, 4)
    .fill(0x8f949c)
    .roundRect(top.x + 17, top.y + 9, 9, 9, 3)
    .fill(0x6f747c);
  graphics
    .moveTo(top.x + 8, top.y + 16)
    .lineTo(top.x + 13, top.y + 16)
    .stroke({ width: 1, color: 0xffffff, alpha: 0.16 });
}

function drawBuildingFeature(
  graphics: Graphics,
  cell: IsoCellView,
  palette: IsoRoomView['palette'],
): void {
  const point = cellTopLeft(cell);
  graphics
    .rect(point.x + 3, point.y + 7, ORTHO_TILE_SIZE - 6, ORTHO_TILE_SIZE - 7)
    .fill(palette.edge)
    .moveTo(point.x + 2, point.y + 8)
    .lineTo(point.x + ORTHO_TILE_SIZE / 2, point.y + 1)
    .lineTo(point.x + ORTHO_TILE_SIZE - 2, point.y + 8)
    .closePath()
    .fill(Math.max(0, palette.edge - 0x16100c));
}

function drawTerrainTile(
  textures: OrthogonalTextureSet,
  container: Container,
  cells: readonly (readonly IsoCellView[])[],
  cell: IsoCellView,
): boolean {
  const tileId = terrainTileIdForCell(cells, cell);
  const entry = tileId
    ? textures.plateau?.[tileId] ?? textures.terrain?.[tileId]
    : undefined;
  if (!entry) {
    return false;
  }
  const point = cellTopLeft(cell);
  const sprite = new Sprite(entry.texture);
  sprite.position.set(point.x, point.y);
  sprite.width = ORTHO_TILE_SIZE;
  sprite.height = ORTHO_TILE_SIZE;
  sprite.zIndex = orthogonalSortKey(cell.x, cell.y);
  sprite.label = `terrain:${entry.regionId}`;
  container.addChild(sprite);
  return true;
}

function forestTileIdForCell(x: number, y: number): string {
  return kenneyForestTileFor(x, y);
}

function drawForestSprite(
  textures: OrthogonalTextureSet,
  container: Container,
  cell: Pick<IsoCellView, 'x' | 'y' | 'elevation'>,
): boolean {
  const tileId = forestTileIdForCell(cell.x, cell.y);
  const entry = textures.forest?.[tileId];
  if (!entry) {
    return false;
  }
  const point = cellTopLeft(cell);
  const sprite = new Sprite(entry.texture);
  sprite.anchor.set(0.5, 1);
  sprite.position.set(point.x + ORTHO_TILE_SIZE / 2, point.y + ORTHO_TILE_SIZE);
  sprite.width = ORTHO_TILE_SIZE;
  sprite.height = ORTHO_TILE_SIZE;
  // Above the +0.1 edge overlays and +0.0 fill so trees always sit on top
  // of their cell's ground.
  sprite.zIndex = orthogonalSortKey(cell.x, cell.y) + 0.15;
  sprite.label = `forest:${entry.regionId}`;
  container.addChild(sprite);
  return true;
}

function drawFallbackProp(
  graphics: Graphics,
  prop: IsoPropView,
  point: OrthogonalPoint,
  palette: IsoRoomView['palette'],
): void {
  const height = prop.elevation > 0 ? 28 : 18;
  graphics.ellipse(point.x + 16, point.y + 30, 15, 5).fill({ color: 0x05080d, alpha: 0.24 });
  graphics.roundRect(point.x + 5, point.y + 32 - height, 22, height, 6).fill(palette.edge);
  graphics.circle(point.x + 16, point.y + 32 - height, 9).fill(palette.glow);
}

function drawMarker(
  graphics: Graphics,
  room: IsoRoomView,
  marker: IsoMarkerView,
  color: number,
  active: boolean,
): void {
  const cell = room.cells[marker.y]?.[marker.x];
  const point = cell ? cellTopLeft(cell) : projectOrthogonalCell(marker.x, marker.y);
  const centerX = point.x + ORTHO_TILE_SIZE / 2;
  const centerY = point.y + ORTHO_TILE_SIZE / 2;
  graphics.ellipse(centerX, point.y + ORTHO_TILE_SIZE - 3, 14, 5).fill({ color: 0x05080d, alpha: 0.25 });
  graphics.circle(centerX, centerY - 4, active ? 14 : 11).fill({ color, alpha: active ? 0.28 : 0.14 });
  graphics.circle(centerX, centerY - 4, active ? 7 : 5).fill(color);
  graphics.circle(centerX, centerY - 4, active ? 12 : 9).stroke({ width: 2, color, alpha: 0.9 });
}

function drawFrostCell(
  graphics: Graphics,
  room: IsoRoomView,
  cell: IsoFrostCellView,
): void {
  const point = room.cells[cell.y]?.[cell.x]
    ? cellTopLeft(room.cells[cell.y]![cell.x]!)
    : projectOrthogonalCell(cell.x, cell.y);
  const ratio = Math.max(0, Math.min(1, cell.lifeRatio));
  graphics
    .roundRect(point.x + 2, point.y + 2, ORTHO_TILE_SIZE - 4, ORTHO_TILE_SIZE - 4, 7)
    .fill({ color: 0xbdeeff, alpha: 0.32 + ratio * 0.28 })
    .stroke({ width: ratio < 0.45 ? 2 : 1, color: 0xf4ffff, alpha: 0.9 });
  if (ratio < 0.45) {
    graphics
      .moveTo(point.x + 7, point.y + 12)
      .lineTo(point.x + 14, point.y + 18)
      .lineTo(point.x + 20, point.y + 11)
      .moveTo(point.x + 20, point.y + 23)
      .lineTo(point.x + 26, point.y + 16);
  }
}

function drawAuthoredObject(
  graphics: Graphics,
  room: IsoRoomView,
  object: IsoObjectView,
): void {
  if (object.kind === 'relic' && object.active === false) {
    return;
  }
  const point = room.cells[object.y]?.[object.x]
    ? cellTopLeft(room.cells[object.y]![object.x]!)
    : projectOrthogonalCell(object.x, object.y);
  const centerX = point.x + ORTHO_TILE_SIZE / 2;
  graphics.ellipse(centerX, point.y + 30, 13, 5).fill({ color: 0x05080d, alpha: 0.25 });
  if (object.kind === 'frost-vessel') {
    graphics
      .roundRect(point.x + 7, point.y + 14, 18, 13, 5)
      .fill(0x35515d)
      .stroke({ width: 2, color: 0xbdeeff, alpha: 0.9 });
    graphics.ellipse(centerX, point.y + 14, 10, 5).fill({ color: 0x416a7b, alpha: 0.96 });
    graphics.circle(centerX, point.y + 10, object.active ? 7 : 4).fill({
      color: 0xbdeeff,
      alpha: object.active ? 0.86 : 0.56,
    });
    return;
  }
  if (object.kind === 'relic') {
    graphics
      .moveTo(centerX, point.y + 3)
      .lineTo(centerX + 8, point.y + 15)
      .lineTo(centerX, point.y + 24)
      .lineTo(centerX - 8, point.y + 15)
      .closePath()
      .fill(0xf2c66d)
      .stroke({ width: 2, color: 0xfff0b0, alpha: 0.95 });
    graphics.circle(centerX, point.y + 15, 13).stroke({ width: 2, color: 0xf2c66d, alpha: 0.42 });
  }
}

function drawConnectorMarkers(graphics: Graphics, room: IsoRoomView): void {
  for (const connector of room.connectors ?? []) {
    const fromCell = room.cells[connector.from.y]?.[connector.from.x];
    const toCell = room.cells[connector.to.y]?.[connector.to.x];
    const from = fromCell ? cellTopLeft(fromCell) : projectOrthogonalCell(connector.from.x, connector.from.y);
    const to = toCell ? cellTopLeft(toCell) : projectOrthogonalCell(connector.to.x, connector.to.y);
    const fromX = from.x + ORTHO_TILE_SIZE / 2;
    const fromY = from.y + ORTHO_TILE_SIZE / 2;
    const toX = to.x + ORTHO_TILE_SIZE / 2;
    const toY = to.y + ORTHO_TILE_SIZE / 2;
    graphics
      .moveTo(fromX, fromY)
      .lineTo(toX, toY)
      .stroke({ width: 10, color: 0x6d6654, alpha: 0.92 });
    const horizontal = Math.abs(toX - fromX) > Math.abs(toY - fromY);
    const steps = 4;
    for (let index = 1; index < steps; index += 1) {
      const amount = index / steps;
      const x = fromX + (toX - fromX) * amount;
      const y = fromY + (toY - fromY) * amount;
      graphics
        .moveTo(x - (horizontal ? 0 : 8), y - (horizontal ? 8 : 0))
        .lineTo(x + (horizontal ? 0 : 8), y + (horizontal ? 8 : 0))
        .stroke({ width: 2, color: 0xe2d19c, alpha: 0.9 });
    }
  }
}

function drawPath(
  graphics: Graphics,
  room: IsoRoomView,
  path: readonly { readonly x: number; readonly y: number }[],
  color: number,
  alpha: number,
): void {
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1]!;
    const to = path[index]!;
    const fromCell = room.cells[from.y]?.[from.x];
    const toCell = room.cells[to.y]?.[to.x];
    const fromPoint = fromCell ? cellTopLeft(fromCell) : projectOrthogonalCell(from.x, from.y);
    const toPoint = toCell ? cellTopLeft(toCell) : projectOrthogonalCell(to.x, to.y);
    graphics
      .moveTo(fromPoint.x + ORTHO_TILE_SIZE / 2, fromPoint.y + ORTHO_TILE_SIZE / 2)
      .lineTo(toPoint.x + ORTHO_TILE_SIZE / 2, toPoint.y + ORTHO_TILE_SIZE / 2)
      .stroke({ width: 4, color, alpha });
  }
}



function drawDebugOverlay(graphics: Graphics, room: IsoRoomView): void {
  const overlay = room.debugOverlay;
  if (!overlay) {
    return;
  }
  // Diagnostic-only representation of blocked cells; normal play renders
  // semantic world terrain instead.
  if (overlay.showBlocked) {
    for (const row of room.cells) {
      for (const cell of row) {
        if (cell.walkable) {
          continue;
        }
        const point = cellTopLeft(cell);
        graphics
          .moveTo(point.x + 5, point.y + 5)
          .lineTo(point.x + ORTHO_TILE_SIZE - 5, point.y + ORTHO_TILE_SIZE - 5)
          .moveTo(point.x + ORTHO_TILE_SIZE - 5, point.y + 5)
          .lineTo(point.x + 5, point.y + ORTHO_TILE_SIZE - 5)
          .stroke({ width: 2, color: 0x081312, alpha: 0.55 });
      }
    }
  }
  if (overlay.baselinePath) {
    drawPath(graphics, room, overlay.baselinePath, 0x8de2c6, 0.55);
  }
  if (overlay.finalPath) {
    drawPath(graphics, room, overlay.finalPath, room.palette.glow, 0.8);
  }
  for (const position of overlay.disruptionFootprint ?? []) {
    const cell = room.cells[position.y]?.[position.x];
    const point = cell ? cellTopLeft(cell) : projectOrthogonalCell(position.x, position.y);
    graphics
      .rect(point.x + 2, point.y + 2, ORTHO_TILE_SIZE - 4, ORTHO_TILE_SIZE - 4)
      .fill({ color: 0xf08b73, alpha: 0.3 })
      .stroke({ width: 2, color: 0xffd1a3, alpha: 0.95 });
  }
}

function drawNode(graphics: Graphics, room: IsoRoomView, marked: boolean): void {
  if (!room.node) {
    return;
  }
  const cell = room.cells[room.node.y]?.[room.node.x];
  const point = cell ? cellTopLeft(cell) : projectOrthogonalCell(room.node.x, room.node.y);
  const centerX = point.x + ORTHO_TILE_SIZE / 2;
  const centerY = point.y + ORTHO_TILE_SIZE / 2 - 8;
  const color = marked ? room.palette.glow : 0xa9b7c6;
  graphics.circle(centerX, centerY, marked ? 10 : 7).fill({ color, alpha: marked ? 0.25 : 0.13 });
  graphics.circle(centerX, centerY, marked ? 5 : 4).fill(color);
  graphics.circle(centerX, centerY, marked ? 9 : 7).stroke({ width: 2, color, alpha: 0.82 });
}

function drawExitMarkers(graphics: Graphics, room: IsoRoomView): void {
  for (const exit of room.exits) {
    const cell = room.cells[exit.y]?.[exit.x];
    const point = cell ? cellTopLeft(cell) : projectOrthogonalCell(exit.x, exit.y);
    const centerX = point.x + ORTHO_TILE_SIZE / 2;
    const centerY = point.y + ORTHO_TILE_SIZE / 2;
    const offsetX = exit.direction === 'right' ? 10 : exit.direction === 'left' ? -10 : 0;
    const offsetY = exit.direction === 'down' ? 10 : exit.direction === 'up' ? -10 : 0;
    graphics
      .moveTo(centerX, centerY)
      .lineTo(centerX + offsetX, centerY + offsetY)
      .stroke({ width: 3, color: room.palette.glow, alpha: 0.92 });
  }
}

function drawProp(
  propGraphics: Graphics,
  props: Container,
  foreground: Container,
  prop: IsoPropView,
  textures: OrthogonalTextureSet,
  palette: IsoRoomView['palette'],
): void {
  const point = projectOrthogonalCell(prop.x, prop.y, prop.elevation);
  drawShadow(propGraphics, point, prop.foreground ? 0.22 : 0.14);
  const isTree = prop.assetKey === 'tree' || prop.assetKey === 'tree-pine';
  const didDraw = isTree
    ? drawForestSprite(textures, prop.foreground ? foreground : props, prop)
    : false;
  if (!didDraw) {
    drawFallbackProp(propGraphics, prop, point, palette);
  }
}

export function createOrthogonalScene(
  scene: WorldScene,
  textures: MarkTextureSet,
  orthogonalTextures: OrthogonalTextureSet = {},
): OrthogonalSceneRenderer {
  const terrain = new Container();
  const terrainSprites = new Container();
  const props = new Container();
  const entities = new Container();
  const foreground = new Container();
  const terrainGraphics = new Graphics();
  const propGraphics = new Graphics();
  const entityGraphics = new Graphics();

  terrain.label = 'OrthogonalTerrain';
  terrainSprites.label = 'OrthogonalTerrainSprites';
  props.label = 'OrthogonalProps';
  entities.label = 'OrthogonalEntities';
  foreground.label = 'OrthogonalForeground';
  props.sortableChildren = true;
  entities.sortableChildren = true;
  foreground.sortableChildren = true;
  terrainSprites.sortableChildren = true;
  scene.layers.ground.addChild(terrainGraphics, terrain);
  scene.layers.terrain.addChild(terrainSprites);
  scene.layers.objects.addChild(props, propGraphics);
  scene.layers.entities.addChild(entities, entityGraphics);
  scene.layers.foreground.addChild(foreground);

  return {
    render(view): void {
      clearContainer(terrain);
      clearContainer(terrainSprites);
      clearContainer(props);
      clearContainer(entities);
      clearContainer(foreground);
      terrainGraphics.clear();
      propGraphics.clear();
      entityGraphics.clear();

      const { room } = view;
      terrainGraphics
        .rect(-500, -500, room.width * ORTHO_TILE_SIZE + 1000, room.height * ORTHO_TILE_SIZE + 1000)
        .fill(room.palette.sky);

      for (const row of room.cells) {
        for (const cell of row) {
          const point = cellTopLeft(cell);
          drawShadow(terrainGraphics, point, cell.walkable ? 0.1 : 0.2);
          const surface = cell.surface ?? cell.terrainType;
          const hasPlateauTexture = cell.elevation > 0 && Boolean(KENNEY_PLATEAU_TILE_IDS[surface as keyof typeof KENNEY_PLATEAU_TILE_IDS]);
          drawGroundCell(
            terrainGraphics,
            cell,
            room.palette,
            hasPlateauTexture,
          );
          // Plateau bottom row has transparent pixels at its lower edge
          // (041-043). Without a backing, the sky / dark wall shows through
          // as the black strip in screenshot 2. Back it with the full fill
          // tile of the cell directly below, so the transparent lip reveals
          // neighbouring ground instead of black. Also overwrite the dark
          // cliff wall gap (14px between plateau bottom and ground) with the
          // same southern ground, otherwise the wall appears as a solid
          // black block below the plateau (screenshot 1 & 2).
          if (hasPlateauTexture) {
            const south = room.cells[cell.y + 1]?.[cell.x];
            const sameSouth = south?.elevation === cell.elevation && (south?.surface ?? south?.terrainType) === surface;
            if (!sameSouth && south) {
              const southSurface = (south.surface ?? south.terrainType) as string;
              const fillId = fillTileIdForSurface(southSurface);
              if (fillId) {
                const entry = orthogonalTextures.terrain?.[fillId] ?? orthogonalTextures.plateau?.[fillId];
                if (entry) {
                  const bg = new Sprite(entry.texture);
                  bg.position.set(point.x, point.y);
                  bg.width = ORTHO_TILE_SIZE;
                  bg.height = ORTHO_TILE_SIZE;
                  bg.zIndex = orthogonalSortKey(cell.x, cell.y) - 0.5;
                  bg.label = `plateau-bg:${fillId}`;
                  terrainSprites.addChild(bg);
                } else {
                  const bgColor = colorForTerrain(southSurface, south.biome, south.environment, room.palette);
                  terrainGraphics.rect(point.x, point.y, ORTHO_TILE_SIZE, ORTHO_TILE_SIZE).fill(bgColor);
                }
              }
              // Overwrite the dark cliff wall gap with southern ground so
              // the strip below the orange lip is not a black block.
              const gapY = point.y + ORTHO_TILE_SIZE;
              const gapHeight = ORTHO_ELEVATION_STEP;
              const bgColor = colorForTerrain(southSurface, south.biome, south.environment, room.palette);
              // Fill gap with solid southern colour; texture would be squashed
              // (14px vs 32px) and add little, colour is sufficient to hide black.
              terrainGraphics.rect(point.x, gapY, ORTHO_TILE_SIZE, gapHeight).fill(bgColor);
              // If a texture is available, also layer a cropped sprite over the gap
              // for visual consistency with the surrounding ground.
              const gapEntry = fillId ? (orthogonalTextures.terrain?.[fillId] ?? orthogonalTextures.plateau?.[fillId]) : undefined;
              if (gapEntry) {
                const gapSprite = new Sprite(gapEntry.texture);
                gapSprite.position.set(point.x, gapY);
                gapSprite.width = ORTHO_TILE_SIZE;
                gapSprite.height = gapHeight;
                gapSprite.zIndex = orthogonalSortKey(cell.x, cell.y) - 0.4;
                gapSprite.label = `plateau-gap:${fillId}`;
                terrainSprites.addChild(gapSprite);
              }
            }
          }
          // Walkable flats and blocking barrier cells draw the Kenney edge
          // variant of their own surface where traversal stops, so the player
          // can see why a side is closed without any painted-on borders.
          // Splits are only drawn where they add information: elevated
          // neighbours show their own plateau caps/walls and same-surface
          // rock/forest barriers show their own edge overlay and feature,
          // so the walkable side stays one smooth region.
          const isFlatWalkable = cell.walkable && cell.elevation === 0 && !hasPlateauTexture;
          {
            const isBlocked = (from: IsoCellView, nbr: IsoCellView | undefined, dir: 'west' | 'east' | 'south') => {
              if (!nbr) return true;
              const nbrSurface = nbr.surface ?? nbr.terrainType;
              const fromSurface = from.surface ?? from.terrainType;
              if (dir === 'south') {
                // Only a blocking feature on a different surface splits the
                // south edge; walkable height changes are shown by their own
                // caps/walls and same-surface obstacles stay smooth.
                return !nbr.walkable && nbrSurface !== fromSurface;
              }
              if (nbr.walkable) return false;
              return nbrSurface !== fromSurface || nbr.elevation !== from.elevation;
            };
            const drawEdgeSprite = (edgeId: string): boolean => {
              const entry = orthogonalTextures.terrain?.[edgeId] ?? orthogonalTextures.plateau?.[edgeId];
              if (!entry) return false;
              const point2 = cellTopLeft(cell);
              const s = new Sprite(entry.texture);
              s.position.set(point2.x, point2.y);
              s.width = ORTHO_TILE_SIZE;
              s.height = ORTHO_TILE_SIZE;
              // +0.1 keeps the edge above the cell's own fill sprite; the
              // fill stays visible beneath the transparent margins so the
              // split never reads as a dark void.
              s.zIndex = orthogonalSortKey(cell.x, cell.y) + 0.1;
              s.label = `terrain-edge:${edgeId}`;
              terrainSprites.addChild(s);
              return true;
            };
            const drawEdgeSpriteSide = (surface2: string, side: 'west' | 'east'): boolean => {
              const id = sideEdgeTileId(surface2, side);
              return Boolean(id && drawEdgeSprite(id));
            };
            const isSouthStoneEdge = (x: number, y: number) => {
              const n = room.cells[y]?.[x];
              if (!n || !n.walkable || n.elevation !== 0) return false;
              if ((n.surface ?? n.terrainType) !== 'stone') return false;
              return isBlocked(n, room.cells[y + 1]?.[x], 'south');
            };
            const west = room.cells[cell.y]?.[cell.x - 1];
            const east = room.cells[cell.y]?.[cell.x + 1];
            if (isFlatWalkable) {
              const surface2 = cell.surface ?? cell.terrainType;
              const westBlocked = isBlocked(cell, west, 'west');
              const eastBlocked = isBlocked(cell, east, 'east');
              const south = room.cells[cell.y + 1]?.[cell.x];
              const southBlocked = isBlocked(cell, south, 'south');
              if (westBlocked || eastBlocked || southBlocked) {
                const bandColor = Math.max(0, colorForTerrain(surface2, cell.biome, cell.environment, room.palette) - 0x1c1c1c);
                if (westBlocked && !drawEdgeSpriteSide(surface2, 'west')) {
                  const top = cellTopLeft(cell);
                  propGraphics.rect(top.x, top.y, 4, ORTHO_TILE_SIZE).fill(bandColor);
                }
                if (eastBlocked && !drawEdgeSpriteSide(surface2, 'east')) {
                  const top = cellTopLeft(cell);
                  propGraphics.rect(top.x + ORTHO_TILE_SIZE - 4, top.y, 4, ORTHO_TILE_SIZE).fill(bandColor);
                }
                if (southBlocked) {
                  const southId = surface2 === 'stone'
                    ? stoneSouthEdgeTileId(isSouthStoneEdge(cell.x - 1, cell.y), isSouthStoneEdge(cell.x + 1, cell.y))
                    : SOUTH_EDGE_TILE_IDS[surface2];
                  if (!southId || !drawEdgeSprite(southId)) {
                    const top = cellTopLeft(cell);
                    propGraphics.rect(top.x, top.y + ORTHO_TILE_SIZE - 4, ORTHO_TILE_SIZE, 4).fill(bandColor);
                  }
                }
              }
            } else if (!cell.walkable && cell.elevation === 0) {
              const surface2 = cell.surface ?? cell.terrainType;
              const westSplit = Boolean(west?.walkable) && (west?.surface ?? west?.terrainType) !== surface2;
              const eastSplit = Boolean(east?.walkable) && (east?.surface ?? east?.terrainType) !== surface2;
              const id = barrierSideEdgeTileId(surface2, westSplit, eastSplit);
              if (id) {
                // Overlay on top of the cell's fill so the transparent side
                // strip keeps the neighbouring texture instead of flat colour.
                drawEdgeSprite(id);
              }
            }
          }
          drawTerrainTile(orthogonalTextures, terrainSprites, room.cells, cell);
          if (cell.obstacle === 'rock') {
            // Rocks sit in the props layer so the Kenney rock sprite (or the
            // neutral vector fallback) stays visible above the terrain
            // sprites; a smooth same-surface rock cell is still readable as
            // blocking because of this feature.
            drawRockFeature(orthogonalTextures, props, propGraphics, cell);
          }
          if (cell.obstacle === 'building') {
            drawBuildingFeature(propGraphics, cell, room.palette);
          }
          if (cell.obstacle === 'forest') {
            const drewTrees = drawForestSprite(orthogonalTextures, terrainSprites, cell);
            if (!drewTrees) {
              drawForestFallback(terrainGraphics, cell, room.palette);
            }
          }
        }
      }

      for (const cell of view.frost ?? []) {
        drawFrostCell(terrainGraphics, room, cell);
      }

      drawExitMarkers(propGraphics, room);
      drawConnectorMarkers(propGraphics, room);
      if (room.start) {
        drawMarker(propGraphics, room, room.start, 0x8de2c6, false);
      }
      if (room.goal) {
        drawMarker(propGraphics, room, room.goal, room.palette.glow, view.goalReached === true);
      }
      drawDebugOverlay(propGraphics, room);
      drawNode(propGraphics, room, view.windMarks[room.id] === true);

      for (const object of room.objects ?? []) {
        drawAuthoredObject(propGraphics, room, object);
      }

      for (const prop of room.props) {
        drawProp(propGraphics, props, foreground, prop, orthogonalTextures, room.palette);
      }

      for (const npc of room.npcs) {
        const point = projectOrthogonalCell(npc.x, npc.y, npc.elevation);
        entityGraphics.ellipse(point.x + 16, point.y + 30, 12, 5).fill({ color: 0x05080d, alpha: 0.2 });
        const mark = textures[npc.assetKey as keyof MarkTextureSet];
        if (mark) {
          const sprite = new Sprite(mark);
          sprite.anchor.set(0.5, 1);
          sprite.position.set(point.x + 16, point.y + 32);
          sprite.scale.set(0.72);
          sprite.zIndex = orthogonalSortKey(npc.x, npc.y);
          entities.addChild(sprite);
        } else {
          entityGraphics.circle(point.x + 16, point.y + 10, 10).fill(room.palette.glow);
        }
      }

      const playerPoint = projectOrthogonalCell(view.player.x, view.player.y, view.player.elevation);
      entityGraphics.ellipse(playerPoint.x + 16, playerPoint.y + 30, 13, 5).fill({ color: 0x05080d, alpha: 0.3 });
      const playerTexture = textures['character-oobi'];
      if (playerTexture) {
        const playerSprite = new Sprite(playerTexture);
        playerSprite.anchor.set(0.5, 1);
        playerSprite.position.set(playerPoint.x + 16, playerPoint.y + 32);
        playerSprite.scale.set(0.9);
        playerSprite.zIndex = orthogonalSortKey(view.player.x, view.player.y) + 1000;
        entities.addChild(playerSprite);
      } else {
        entityGraphics.circle(playerPoint.x + 16, playerPoint.y + 9, 12).fill(room.palette.glow);
        entityGraphics.circle(playerPoint.x + 16, playerPoint.y + 5, 5).fill(0xffffff);
      }
    },

    setCamera(x: number, y: number, zoom = 1): void {
      scene.setCamera({ x, y, zoom }, { width: 960, height: 600 });
    },

    destroy(): void {
      clearContainer(terrain);
      clearContainer(terrainSprites);
      clearContainer(props);
      clearContainer(entities);
      clearContainer(foreground);
      scene.clear();
    },
  };
}

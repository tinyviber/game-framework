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
  IsoPropView,
} from './isometric-scene';
import type { WorldScene } from './world-scene';
import {
  orthogonalRegionForRole,
  type OrthogonalRenderRole,
} from '@/assets/orthogonal/semantic-mapping';
import type { OrthogonalTextureSet } from './orthogonal-textures';
import type { MarkTextureSet } from './isometric-scene';

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

function drawGroundCell(
  graphics: Graphics,
  cell: IsoCellView,
  palette: IsoRoomView['palette'],
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
      .fill(surface === 'cliff' ? palette.edge : Math.max(0, palette.edge - 0x0b0b0b));
    graphics
      .rect(top.x, base.y + ORTHO_TILE_SIZE - 3, ORTHO_TILE_SIZE, 3)
      .fill(Math.max(0, palette.edge - 0x171717));
  }

  // The ground tile is always real world terrain - non-walkable cells are
  // water, forest or rock features, never a generic void marker.
  graphics.rect(top.x, top.y, ORTHO_TILE_SIZE, ORTHO_TILE_SIZE).fill(color);
  if (surface === 'cliff' || cell.elevation > 0) {
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

function drawRockFeature(
  graphics: Graphics,
  cell: IsoCellView,
  palette: IsoRoomView['palette'],
): void {
  const top = cellTopLeft(cell);
  const color = Math.max(0, palette.edge + 0x2a2a2a);
  graphics
    .roundRect(top.x + 6, top.y + 14, 12, 12, 4)
    .fill(color)
    .roundRect(top.x + 17, top.y + 9, 9, 9, 3)
    .fill(Math.max(0, color - 0x121212));
  graphics
    .moveTo(top.x + 8, top.y + 16)
    .lineTo(top.x + 13, top.y + 16)
    .stroke({ width: 1, color: 0xffffff, alpha: 0.16 });
}

function drawRegionSprite(
  textures: OrthogonalTextureSet,
  role: OrthogonalRenderRole,
  container: Container,
  origin: OrthogonalPoint,
  scale: number,
  zIndex: number,
): boolean {
  const entry = textures[role];
  if (!entry) {
    return false;
  }
  const region = orthogonalRegionForRole(role);
  const [, , sourceWidth, sourceHeight] = region.source_rect;
  const sprite = new Sprite(entry.texture);
  sprite.anchor.set(region.anchor.x / sourceWidth, region.anchor.y / sourceHeight);
  sprite.scale.set(scale);
  sprite.position.set(origin.x, origin.y);
  sprite.zIndex = zIndex;
  sprite.label = `${role}:${entry.regionId}`;
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
  const cell = room.cells[room.node.y]?.[room.node.x];
  const point = cell ? cellTopLeft(cell) : projectOrthogonalCell(room.node.x, room.node.y);
  const centerX = point.x + ORTHO_TILE_SIZE / 2;
  const centerY = point.y + ORTHO_TILE_SIZE / 2 - 8;
  const color = marked ? room.palette.glow : 0xa9b7c6;
  graphics.circle(centerX, centerY, marked ? 10 : 7).fill({ color, alpha: marked ? 0.25 : 0.13 });
  graphics.circle(centerX, centerY, marked ? 5 : 4).fill(color);
  graphics.circle(centerX, centerY, marked ? 9 : 7).stroke({ width: 2, color, alpha: 0.82 });
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
  const foot = { x: point.x + ORTHO_TILE_SIZE / 2, y: point.y + ORTHO_TILE_SIZE };
  drawShadow(propGraphics, point, prop.foreground ? 0.22 : 0.14);
  const role = prop.assetKey === 'tree' || prop.assetKey === 'tree-pine' ? 'tree' : null;
  const didDraw = role
    ? drawRegionSprite(
      textures,
      role,
      prop.foreground ? foreground : props,
      foot,
      ORTHO_TILE_SIZE / 16,
      orthogonalSortKey(prop.x, prop.y),
    )
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
          drawGroundCell(terrainGraphics, cell, room.palette);
          if (cell.obstacle === 'rock') {
            drawRockFeature(terrainGraphics, cell, room.palette);
          }
          if (cell.obstacle === 'forest') {
            // Tree metadata is bottom-center anchored. Place that foot at
            // the cell's bottom-center rather than at its top-left corner.
            const foot = {
              x: point.x + ORTHO_TILE_SIZE / 2,
              y: point.y + ORTHO_TILE_SIZE,
            };
            const drewTrees = drawRegionSprite(
              orthogonalTextures,
              'tree',
              terrainSprites,
              foot,
              ORTHO_TILE_SIZE / 16,
              orthogonalSortKey(cell.x, cell.y),
            );
            if (!drewTrees) {
              drawForestFallback(terrainGraphics, cell, room.palette);
            }
          }
          const surface = cell.surface ?? cell.terrainType;
          const spriteRole = surface === 'water'
            ? 'water'
            : !cell.obstacle && (surface === 'grass' || surface === 'dirt')
              ? surface
              : null;
          if (spriteRole) {
            drawRegionSprite(
              orthogonalTextures,
              spriteRole,
              terrainSprites,
              point,
              ORTHO_TILE_SIZE / 16,
              orthogonalSortKey(cell.x, cell.y),
            );
          }
        }
      }

      drawConnectorMarkers(propGraphics, room);
      if (room.start) {
        drawMarker(propGraphics, room, room.start, 0x8de2c6, false);
      }
      if (room.goal) {
        drawMarker(propGraphics, room, room.goal, room.palette.glow, view.goalReached === true);
      }
      drawDebugOverlay(propGraphics, room);
      drawNode(propGraphics, room, view.windMarks[room.id] === true);

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

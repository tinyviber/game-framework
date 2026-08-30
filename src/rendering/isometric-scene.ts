import {
  Assets,
  Container,
  Graphics,
  SCALE_MODES,
  Sprite,
  Texture,
  type TextureSource,
} from 'pixi.js';
import type { WorldScene } from './world-scene';

export const ISO_TILE_WIDTH = 72;
export const ISO_TILE_HEIGHT = 36;
export const ISO_HEIGHT_STEP = 18;

export const MARK_ASSET_KEYS = [
  'grass',
  'block-grass',
  'block-grass-large',
  'block-snow',
  'block-snow-large',
  'tree',
  'tree-pine',
  'rocks',
  'flowers',
  'mushrooms',
  'fence-straight',
  'sign',
  'chest',
  'key',
  'star',
  'heart',
  'flag',
  'character-oobi',
  'character-oodi',
  'character-ooli',
  'character-oopi',
  'character-oozi',
  'gate-rock',
  'stairs',
  'building-sample-house-a',
  'building-sample-house-b',
  'building-sample-house-c',
] as const;

export type MarkAssetKey = (typeof MARK_ASSET_KEYS)[number];
export type MarkTextureSet = Readonly<Partial<Record<MarkAssetKey, Texture>>>;

export interface IsoPoint {
  readonly x: number;
  readonly y: number;
}

export interface IsoCellView {
  readonly x: number;
  readonly y: number;
  readonly elevation: number;
  readonly terrainType: string;
  /** Authoritative ground material; terrainType remains a legacy alias. */
  readonly surface?: string;
  /** Blocking feature on top of the surface ('forest' | 'rock'); iso/ortho. */
  readonly obstacle?: 'forest' | 'rock' | null;
  readonly biome: string;
  readonly environment: IsoEnvironmentView;
  readonly walkable: boolean;
}

export interface IsoEnvironmentView {
  readonly weather: string;
  readonly lighting: string;
}

export interface IsoPropView {
  readonly id: string;
  readonly assetKey: string;
  readonly x: number;
  readonly y: number;
  readonly elevation: number;
  readonly foreground: boolean;
  readonly blocks: boolean;
}

export interface IsoNpcView {
  readonly id: string;
  readonly name: string;
  readonly assetKey: string;
  readonly x: number;
  readonly y: number;
  readonly elevation: number;
}

export interface IsoNodeView {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly label: string;
}

export interface IsoExitView {
  readonly id: string;
  readonly direction: string;
  readonly x: number;
  readonly y: number;
}

export interface IsoConnectorView {
  readonly id: string;
  readonly kind: 'stairs' | 'ramp';
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
}

export interface IsoMarkerView {
  readonly x: number;
  readonly y: number;
  readonly label: string;
}

export interface IsoDebugOverlay {
  readonly baselinePath?: readonly IsoPoint[];
  readonly finalPath?: readonly IsoPoint[];
  readonly disruptionFootprint?: readonly IsoPoint[];
  /** Diagnostic-only: cross out non-walkable cells (debug=1). */
  readonly showBlocked?: boolean;
  readonly diagnostics?: Readonly<Record<string, string | number | boolean>>;
}

export interface IsoRoomView {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly width: number;
  readonly height: number;
  readonly cells: readonly (readonly IsoCellView[])[];
  readonly props: readonly IsoPropView[];
  readonly npcs: readonly IsoNpcView[];
  readonly node: IsoNodeView;
  readonly exits: readonly IsoExitView[];
  readonly connectors?: readonly IsoConnectorView[];
  readonly start?: IsoMarkerView;
  readonly goal?: IsoMarkerView;
  readonly environment: IsoEnvironmentView;
  readonly debugOverlay?: IsoDebugOverlay;
  readonly palette: {
    readonly sky: number;
    readonly ground: number;
    readonly groundAlt: number;
    readonly edge: number;
    readonly glow: number;
  };
}

export interface IsoWorldView extends IsoRoomView {}

export interface IsoSceneView {
  readonly room: IsoWorldView;
  readonly player: { readonly x: number; readonly y: number; readonly elevation: number };
  readonly windMarks: Readonly<Record<string, boolean>>;
  readonly goalReached?: boolean;
}

export interface IsometricSceneRenderer {
  render(view: IsoSceneView): void;
  setCamera(x: number, y: number, zoom?: number): void;
  destroy(): void;
}

export function projectIsoCell(
  x: number,
  y: number,
  elevation = 0,
): IsoPoint {
  return {
    x: (x - y) * (ISO_TILE_WIDTH / 2),
    y: (x + y) * (ISO_TILE_HEIGHT / 2) - elevation * ISO_HEIGHT_STEP,
  };
}

export function isoSortKey(x: number, y: number): number {
  return (x + y) * 1000 + x;
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
        return palette.edge;
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

function tintForCell(
  cell: IsoCellView,
  palette: IsoRoomView['palette'],
): number {
  const surface = cell.surface ?? cell.terrainType;
  if (surface === 'water') {
    return colorForTerrain('water', cell.biome, cell.environment, palette);
  }
  if (!cell.walkable && !cell.obstacle) {
    return palette.edge;
  }

  return (cell.x + cell.y) % 3 === 0
    ? palette.groundAlt
    : colorForTerrain(surface, cell.biome, cell.environment, palette);
}

function diamond(
  graphics: Graphics,
  center: IsoPoint,
  width = ISO_TILE_WIDTH,
  height = ISO_TILE_HEIGHT,
): void {
  graphics
    .moveTo(center.x, center.y - height / 2)
    .lineTo(center.x + width / 2, center.y)
    .lineTo(center.x, center.y + height / 2)
    .lineTo(center.x - width / 2, center.y)
    .closePath();
}

function drawCell(
  graphics: Graphics,
  cell: IsoCellView,
  palette: IsoRoomView['palette'],
): void {
  const top = projectIsoCell(cell.x, cell.y, cell.elevation);
  const baseY = top.y + cell.elevation * ISO_HEIGHT_STEP;
  const color = tintForCell(cell, palette);

  if (cell.elevation > 0) {
    graphics
      .moveTo(top.x, top.y)
      .lineTo(top.x + ISO_TILE_WIDTH / 2, top.y + ISO_TILE_HEIGHT / 2)
      .lineTo(top.x + ISO_TILE_WIDTH / 2, baseY + ISO_TILE_HEIGHT / 2)
      .lineTo(top.x, baseY + ISO_TILE_HEIGHT / 2)
      .closePath()
      .fill(palette.edge);
    graphics
      .moveTo(top.x, top.y)
      .lineTo(top.x - ISO_TILE_WIDTH / 2, top.y + ISO_TILE_HEIGHT / 2)
      .lineTo(top.x - ISO_TILE_WIDTH / 2, baseY + ISO_TILE_HEIGHT / 2)
      .lineTo(top.x, baseY + ISO_TILE_HEIGHT / 2)
      .closePath()
      .fill(Math.max(0, palette.edge - 0x111111));
  }

  diamond(graphics, top);
  graphics.fill(color);
  graphics.stroke({ width: 1, color: palette.edge, alpha: 0.48 });
}

function drawShadow(
  graphics: Graphics,
  point: IsoPoint,
  alpha = 0.18,
): void {
  graphics.ellipse(point.x, point.y + 12, 20, 7).fill({ color: 0x05080d, alpha });
}

function drawForestObstacleFallback(
  graphics: Graphics,
  point: IsoPoint,
  palette: IsoRoomView['palette'],
): void {
  const baseY = point.y + 8;
  graphics.rect(point.x - 3, baseY - 23, 6, 23).fill(0x5a4430);
  const canopy = Math.max(0, palette.ground - 0x102010);
  graphics
    .moveTo(point.x, baseY - 52)
    .lineTo(point.x - 18, baseY - 25)
    .lineTo(point.x + 18, baseY - 25)
    .closePath()
    .fill(canopy);
  graphics
    .moveTo(point.x, baseY - 39)
    .lineTo(point.x - 14, baseY - 17)
    .lineTo(point.x + 14, baseY - 17)
    .closePath()
    .fill(Math.max(0, canopy - 0x080808));
}

function drawRockObstacleFallback(
  graphics: Graphics,
  point: IsoPoint,
  palette: IsoRoomView['palette'],
): void {
  const color = Math.max(0, palette.edge + 0x303030);
  graphics
    .ellipse(point.x - 10, point.y - 1, 12, 8)
    .fill(color)
    .ellipse(point.x + 5, point.y - 5, 10, 7)
    .fill(Math.max(0, color - 0x121212));
  graphics
    .moveTo(point.x - 13, point.y - 3)
    .lineTo(point.x - 6, point.y - 6)
    .stroke({ width: 1, color: 0xffffff, alpha: 0.22 });
}

function makeSprite(
  textures: MarkTextureSet,
  assetKey: string,
  container: Container,
  point: IsoPoint,
  scale: number,
  zIndex: number,
): boolean {
  const texture = textures[assetKey as MarkAssetKey];
  if (!texture) {
    return false;
  }

  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5, 1);
  sprite.scale.set(scale);
  sprite.position.set(point.x, point.y + 8);
  sprite.zIndex = zIndex;
  sprite.label = assetKey;
  container.addChild(sprite);
  return true;
}

function drawObstacle(
  graphics: Graphics,
  props: Container,
  textures: MarkTextureSet,
  cell: IsoCellView,
  palette: IsoRoomView['palette'],
): void {
  if (!cell.obstacle) {
    return;
  }
  const point = projectIsoCell(cell.x, cell.y, cell.elevation);
  const assetKey = cell.obstacle === 'forest' ? 'tree' : 'rocks';
  const didDraw = makeSprite(
    textures,
    assetKey,
    props,
    point,
    cell.obstacle === 'forest' ? 0.82 : 0.72,
    isoSortKey(cell.x, cell.y) + 2,
  );
  if (didDraw) {
    return;
  }
  if (cell.obstacle === 'forest') {
    drawForestObstacleFallback(graphics, point, palette);
  } else {
    drawRockObstacleFallback(graphics, point, palette);
  }
}

function drawFallbackProp(
  graphics: Graphics,
  prop: IsoPropView,
  point: IsoPoint,
  palette: IsoRoomView['palette'],
): void {
  const height = prop.elevation > 0 ? 28 : 18;
  graphics.ellipse(point.x, point.y + 8, 16, 6).fill({ color: 0x05080d, alpha: 0.22 });
  graphics.roundRect(point.x - 12, point.y - height, 24, height, 6).fill(palette.edge);
  graphics.circle(point.x, point.y - height, 10).fill(palette.glow);
}

function drawNode(
  graphics: Graphics,
  room: IsoRoomView,
  marked: boolean,
): void {
  const cell = room.cells[room.node.y]?.[room.node.x];
  const point = projectIsoCell(room.node.x, room.node.y, cell?.elevation ?? 0);
  const color = marked ? room.palette.glow : 0xa9b7c6;

  graphics.ellipse(point.x, point.y + 7, 18, 7).fill({ color: 0x05080d, alpha: 0.22 });
  graphics.circle(point.x, point.y - 9, marked ? 15 : 11).fill({ color, alpha: marked ? 0.25 : 0.13 });
  graphics.circle(point.x, point.y - 9, marked ? 7 : 5).fill(color);
  graphics.circle(point.x, point.y - 9, marked ? 13 : 10).stroke({ width: 2, color, alpha: 0.82 });
}

function drawExitMarkers(
  graphics: Graphics,
  room: IsoRoomView,
): void {
  for (const exit of room.exits) {
    const elevation = room.cells[exit.y]?.[exit.x]?.elevation ?? 0;
    const point = projectIsoCell(exit.x, exit.y, elevation);
    graphics
      .moveTo(point.x, point.y - 9)
      .lineTo(point.x + (exit.direction === 'right' ? 10 : exit.direction === 'left' ? -10 : 0), point.y + (exit.direction === 'down' ? 10 : exit.direction === 'up' ? -10 : 0))
      .stroke({ width: 3, color: room.palette.glow, alpha: 0.92 });
  }
}

function drawConnectorMarkers(
  graphics: Graphics,
  room: IsoRoomView,
): void {
  for (const connector of room.connectors ?? []) {
    const fromCell = room.cells[connector.from.y]?.[connector.from.x];
    const toCell = room.cells[connector.to.y]?.[connector.to.x];
    const from = projectIsoCell(
      connector.from.x,
      connector.from.y,
      fromCell?.elevation ?? 0,
    );
    const to = projectIsoCell(
      connector.to.x,
      connector.to.y,
      toCell?.elevation ?? 0,
    );
    graphics
      .moveTo(from.x, from.y)
      .lineTo(to.x, to.y)
      .stroke({ width: 3, color: room.palette.glow, alpha: 0.72 });
  }
}

function drawMarker(
  graphics: Graphics,
  room: IsoRoomView,
  marker: IsoMarkerView,
  color: number,
  active = false,
): void {
  const elevation = room.cells[marker.y]?.[marker.x]?.elevation ?? 0;
  const point = projectIsoCell(marker.x, marker.y, elevation);
  graphics.ellipse(point.x, point.y + 7, 18, 7).fill({ color: 0x05080d, alpha: 0.26 });
  graphics.circle(point.x, point.y - 12, active ? 17 : 13).fill({
    color,
    alpha: active ? 0.28 : 0.14,
  });
  graphics.circle(point.x, point.y - 12, active ? 8 : 6).fill(color);
  graphics.circle(point.x, point.y - 12, active ? 15 : 11).stroke({
    width: 2,
    color,
    alpha: 0.9,
  });
}

function drawDebugOverlay(
  graphics: Graphics,
  room: IsoRoomView,
): void {
  const overlay = room.debugOverlay;
  if (!overlay) {
    return;
  }

  if (overlay.finalPath && overlay.finalPath.length > 1) {
    for (let index = 1; index < overlay.finalPath.length; index += 1) {
      const from = overlay.finalPath[index - 1]!;
      const to = overlay.finalPath[index]!;
      const fromCell = room.cells[from.y]?.[from.x];
      const toCell = room.cells[to.y]?.[to.x];
      const fromPoint = projectIsoCell(from.x, from.y, fromCell?.elevation ?? 0);
      const toPoint = projectIsoCell(to.x, to.y, toCell?.elevation ?? 0);
      graphics
        .moveTo(fromPoint.x, fromPoint.y - 3)
        .lineTo(toPoint.x, toPoint.y - 3)
        .stroke({ width: 3, color: room.palette.glow, alpha: 0.52 });
    }
  }

  for (const position of overlay.disruptionFootprint ?? []) {
    const cell = room.cells[position.y]?.[position.x];
    const point = projectIsoCell(position.x, position.y, cell?.elevation ?? 0);
    diamond(graphics, point, ISO_TILE_WIDTH * 0.62, ISO_TILE_HEIGHT * 0.62);
    graphics.fill({ color: 0xf08b73, alpha: 0.58 });
    graphics.stroke({ width: 2, color: 0xffd1a3, alpha: 0.9 });
  }
}

function backgroundBounds(room: IsoRoomView): {
  readonly width: number;
  readonly height: number;
  readonly top: number;
} {
  const diagonalWidth = (room.width + room.height) * (ISO_TILE_WIDTH / 2);
  const diagonalHeight = (room.width + room.height) * (ISO_TILE_HEIGHT / 2);
  return {
    width: Math.max(1800, diagonalWidth + 520),
    height: Math.max(1200, diagonalHeight + 560),
    top: -Math.max(280, diagonalHeight * 0.35),
  };
}

export function createIsometricScene(
  scene: WorldScene,
  textures: MarkTextureSet,
): IsometricSceneRenderer {
  const terrain = new Container();
  const props = new Container();
  const entities = new Container();
  const foreground = new Container();
  const terrainGraphics = new Graphics();
  const propGraphics = new Graphics();
  const entityGraphics = new Graphics();

  terrain.label = 'IsoTerrain';
  terrain.sortableChildren = true;
  props.label = 'IsoProps';
  entities.label = 'IsoEntities';
  foreground.label = 'IsoForeground';
  props.sortableChildren = true;
  entities.sortableChildren = true;
  foreground.sortableChildren = true;
  scene.layers.terrain.addChild(terrainGraphics, terrain);
  scene.layers.objects.addChild(props, propGraphics);
  scene.layers.entities.addChild(entities, entityGraphics);
  scene.layers.foreground.addChild(foreground);

  return {
    render(view): void {
      clearContainer(terrain);
      clearContainer(props);
      clearContainer(entities);
      clearContainer(foreground);
      terrainGraphics.clear();
      propGraphics.clear();
      entityGraphics.clear();

      const { room } = view;
      const background = backgroundBounds(room);
      terrainGraphics
        .rect(-background.width / 2, background.top, background.width, background.height)
        .fill(room.palette.sky);

      for (const row of room.cells) {
        for (const cell of row) {
          const point = projectIsoCell(cell.x, cell.y, cell.elevation);
          drawShadow(terrainGraphics, point, cell.walkable ? 0.12 : 0.25);
          drawCell(terrainGraphics, cell, room.palette);
          drawObstacle(propGraphics, props, textures, cell, room.palette);
          if (cell.walkable && (cell.x * 5 + cell.y * 3) % 11 === 0) {
            makeSprite(
              textures,
              'grass',
              terrain,
              point,
              0.42,
              isoSortKey(cell.x, cell.y) + 2,
            );
          }
        }
      }

      drawExitMarkers(propGraphics, room);
      drawConnectorMarkers(propGraphics, room);
      if (room.start) {
        drawMarker(propGraphics, room, room.start, 0x8de2c6);
      }
      if (room.goal) {
        drawMarker(propGraphics, room, room.goal, room.palette.glow, view.goalReached === true);
      }
      drawDebugOverlay(propGraphics, room);
      drawNode(propGraphics, room, view.windMarks[room.id] === true);
      makeSprite(
        textures,
        view.windMarks[room.id] === true ? 'star' : 'heart',
        props,
        projectIsoCell(room.node.x, room.node.y, room.cells[room.node.y]?.[room.node.x]?.elevation ?? 0),
        0.62,
        isoSortKey(room.node.x, room.node.y) + 5,
      );

      for (const prop of room.props) {
        const point = projectIsoCell(prop.x, prop.y, prop.elevation);
        drawShadow(propGraphics, point, prop.blocks ? 0.24 : 0.14);
        const didDraw = makeSprite(
          textures,
          prop.assetKey,
          prop.foreground ? foreground : props,
          point,
          prop.assetKey.startsWith('building') || prop.assetKey.startsWith('gate') ? 1.05 : 0.82,
          isoSortKey(prop.x, prop.y),
        );
        if (!didDraw) {
          drawFallbackProp(propGraphics, prop, point, room.palette);
        }
      }

      for (const npc of room.npcs) {
        const point = projectIsoCell(npc.x, npc.y, npc.elevation);
        drawShadow(entityGraphics, point, 0.2);
        const didDraw = makeSprite(textures, npc.assetKey, entities, point, 0.92, isoSortKey(npc.x, npc.y));
        if (!didDraw) {
          entityGraphics.circle(point.x, point.y - 22, 11).fill(room.palette.glow);
        }
      }

      const playerPoint = projectIsoCell(
        view.player.x,
        view.player.y,
        view.player.elevation,
      );
      drawShadow(entityGraphics, playerPoint, 0.3);
      const didDrawPlayer = makeSprite(
        textures,
        'character-oobi',
        entities,
        playerPoint,
        1.08,
        isoSortKey(view.player.x, view.player.y) + 50,
      );
      if (!didDrawPlayer) {
        entityGraphics.circle(playerPoint.x, playerPoint.y - 24, 13).fill(room.palette.glow);
        entityGraphics.circle(playerPoint.x, playerPoint.y - 27, 5).fill(0xffffff);
      }
    },

    setCamera(x, y, zoom = 1): void {
      scene.setCamera({ x, y, zoom }, { width: 960, height: 600 });
    },

    destroy(): void {
      clearContainer(terrain);
      clearContainer(props);
      clearContainer(entities);
      clearContainer(foreground);
      scene.clear();
    },
  };
}

function isUsableTexture(texture: Texture): boolean {
  const source: TextureSource | undefined = texture.source;
  return Boolean(source && source.width > 0 && source.height > 0);
}

export async function loadMarkTextures(
  baseUrl = '/assets/mark',
): Promise<MarkTextureSet> {
  const loaded: Partial<Record<MarkAssetKey, Texture>> = {};

  for (const key of MARK_ASSET_KEYS) {
    try {
      const texture = await Assets.load(`${baseUrl}/${key}.png`);
      if (texture instanceof Texture && isUsableTexture(texture)) {
        loaded[key] = texture;
        texture.source.scaleMode = SCALE_MODES.NEAREST;
      }
    } catch {
      // A missing art file is intentionally non-fatal; the scene has a
      // deterministic vector fallback for every terrain/entity role.
    }
  }

  return loaded;
}

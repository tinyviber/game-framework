import { Container, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { MAIN_WORLD } from '@/content/main-world';
import { authoredCells } from '@/world/authored-world';
import {
  createCaptureSceneView,
  createIsometricCaptureScene,
  exposedObstacleFaces,
  CAPTURE_BUILDING_HEIGHT,
  CAPTURE_ROCK_HEIGHT,
  CAPTURE_TREE_HEIGHT,
  captureVisualHeight,
  fitCaptureCamera,
} from './isometric-capture-scene';
import {
  createIsometricScene,
  type IsoCellView,
  type IsoRoomView,
} from './isometric-scene';
import { createWorldScene } from './world-scene';

const palette = {
  sky: 0x1d2931,
  ground: 0x4f805a,
  groundAlt: 0x648e62,
  edge: 0x3a4e42,
  glow: 0xf2c66d,
} as const;

function cell(
  x: number,
  y: number,
  obstacle: IsoCellView['obstacle'] = null,
  surface = 'grass',
): IsoCellView {
  return {
    x,
    y,
    elevation: 0,
    terrainType: surface,
    surface,
    obstacle,
    biome: 'meadow',
    environment: { weather: 'clear', lighting: 'day' },
    walkable: obstacle === null,
  };
}

function roomWithMarkers(): IsoRoomView {
  return {
    id: 'capture-test',
    title: 'Capture Test',
    description: 'A capture test room.',
    width: 2,
    height: 2,
    cells: [[cell(0, 0), cell(1, 0)], [cell(0, 1), cell(1, 1)]],
    props: [{
      id: 'vessel',
      assetKey: 'chest',
      x: 0,
      y: 0,
      elevation: 0,
      foreground: false,
      blocks: false,
    }],
    npcs: [{
      id: 'npc',
      name: 'NPC',
      assetKey: 'character-oobi',
      x: 1,
      y: 1,
      elevation: 0,
    }],
    node: { id: 'node', x: 0, y: 1, label: 'node' },
    exits: [{ id: 'exit', direction: 'right', x: 1, y: 0 }],
    connectors: [{
      id: 'connector',
      kind: 'stairs',
      from: { x: 0, y: 0 },
      to: { x: 1, y: 1 },
    }],
    start: { x: 0, y: 0, label: 'start' },
    goal: { x: 1, y: 1, label: 'goal' },
    debugOverlay: { showBlocked: true },
    environment: { weather: 'clear', lighting: 'day' },
    palette,
  };
}

describe('authored capture presentation', () => {
  it('omits player, exits, markers, and gameplay-only features', () => {
    const capture = createCaptureSceneView(roomWithMarkers());

    expect(capture.player).toBeUndefined();
    expect(capture.room.exits).toEqual([]);
    expect(capture.room.connectors).toEqual([]);
    expect(capture.room.props).toEqual([]);
    expect(capture.room.npcs).toEqual([]);
    expect(capture.room.node).toBeUndefined();
    expect(capture.room.start).toBeUndefined();
    expect(capture.room.goal).toBeUndefined();
    expect(capture.room.debugOverlay).toBeUndefined();
  });

  it('uses capture-only obstacle heights without changing cell elevation', () => {
    const source = roomWithMarkers();
    const rock = cell(0, 0, 'rock', 'stone');
    const building = cell(1, 0, 'building', 'stone');
    const tree = cell(0, 1, 'forest');

    expect(captureVisualHeight(rock)).toBe(CAPTURE_ROCK_HEIGHT);
    expect(captureVisualHeight(building)).toBe(CAPTURE_BUILDING_HEIGHT);
    expect(captureVisualHeight(tree)).toBe(CAPTURE_TREE_HEIGHT);
    expect(rock.elevation).toBe(0);
    expect(createCaptureSceneView(source).room.cells[0]![0]!.elevation).toBe(0);
    expect(MAIN_WORLD.rooms.every((room) =>
      authoredCells(room).flat().every((candidate) => candidate.elevation === 0),
    )).toBe(true);
  });

  it('hides internal faces inside contiguous raised masses', () => {
    const cells = [[
      cell(0, 0, 'rock', 'stone'),
      cell(1, 0, 'rock', 'stone'),
    ], [
      cell(0, 1, 'rock', 'stone'),
      cell(1, 1),
    ]] as const;

    expect(exposedObstacleFaces(cells, cells[0]![0]!)).toEqual({ east: false, south: false });
    expect(exposedObstacleFaces(cells, cells[0]![1]!)).toEqual({ east: true, south: true });
  });

  it('fits a deterministic camera around the entire room with padding', () => {
    const camera = fitCaptureCamera(roomWithMarkers());

    expect(Number.isFinite(camera.x)).toBe(true);
    expect(Number.isFinite(camera.y)).toBe(true);
    expect(camera.zoom).toBeGreaterThan(0);
    expect(camera).toEqual(fitCaptureCamera(roomWithMarkers()));
  });
});

describe('player presentation opt-out', () => {
  it('keeps normal ISO views rendering the player when supplied', () => {
    const root = new Container();
    const scene = createWorldScene(root);
    const renderer = createIsometricScene(scene, { 'character-oobi': Texture.WHITE });
    const room = { ...roomWithMarkers(), npcs: [] };

    renderer.render({ room, player: { x: 0, y: 0, elevation: 0 }, windMarks: {} });
    const entities = scene.layers.entities.children.find((child) => child.label === 'IsoEntities');
    expect(entities?.children).toHaveLength(1);

    renderer.render({ room, windMarks: {} });
    expect(entities?.children).toHaveLength(0);
    renderer.destroy();
    root.destroy();
  });
});

describe('capture renderer', () => {
  it('owns only the scene geometry and has no gameplay marker layer', () => {
    const root = new Container();
    const scene = createWorldScene(root);
    const renderer = createIsometricCaptureScene(scene);

    renderer.render(createCaptureSceneView(roomWithMarkers()));

    expect(scene.layers.entities.children).toHaveLength(0);
    expect(scene.layers.foreground.children).toHaveLength(0);
    expect(scene.layers.objects.children).toHaveLength(1);
    renderer.destroy();
    root.destroy();
  });
});

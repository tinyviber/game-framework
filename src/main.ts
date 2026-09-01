import './style.css';
import {
  generatedCellAt,
  generateGeneratedWorld,
  resolveGeneratedEdge,
  type GeneratedWorld,
} from '@/world/generated-world';
import {
  authoredCellAt,
  authoredCells,
  type AuthoredWorld,
} from '@/world/authored-world';
import { canTraverse } from '@/world/traversal';
import {
  createGeneratedPlayground,
  generatedGoalReached,
  moveGeneratedPlayer,
  playerPosition,
  type GeneratedDirection,
  type GeneratedPlayground,
} from '@/gameplay/generated-playground';
import {
  authoredCurrentRoom,
  authoredPlayerPosition,
  createAuthoredGame,
  createAuthoredPlayState,
  moveAuthoredPlayer,
  resetAuthoredPlayState,
  type AuthoredGame,
  type AuthoredPlayState,
} from '@/gameplay/authored-world';
import { MAIN_WORLD } from '@/content/main-world';
import type { LocalWorldState } from '@/world/types';
import {
  createIsometricScene,
  projectIsoCell,
  type IsometricSceneRenderer,
  type IsoRoomView,
  type IsoSceneView,
  loadMarkTextures,
  type MarkTextureSet,
} from '@/rendering/isometric-scene';
import {
  createOrthogonalScene,
  ORTHO_TILE_SIZE,
  projectOrthogonalCell,
  type OrthogonalSceneRenderer,
} from '@/rendering/orthogonal-scene';
import { kenneyPropAssetKeyFor } from '@/rendering/terrain-presentation';
import {
  loadOrthogonalTextures,
  type OrthogonalTextureSet,
} from '@/rendering/orthogonal-textures';
import { createPixiHost } from '@/rendering/pixi-host';
import {
  createDemoInventoryView,
  createInventoryUi,
} from '@/rendering/inventory-ui';
import { projectGeneratedMinimap } from '@/generated-minimap';
import {
  formatBlockedMovement,
  formatGeneratedInspection,
  formatGeneratedWorldDescription,
  isGeneratedDebugMode,
  parseGeneratedView,
  type GeneratedViewMode,
} from '@/generated-playground-ui';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Missing #app');
}

const DEFAULT_SEED = 2026;
const PLAYTEST_FEEDBACK_STORAGE_KEY = 'generated-playtest-feedback-v1';
const PLAYTEST_TAGS = ['interesting', 'boring', 'discovered', 'saved'] as const;
type PlaytestTag = (typeof PLAYTEST_TAGS)[number];
const IS_GENERATED_MODE = new URLSearchParams(window.location.search).get('world') === 'generated';
const DEBUG_MODE = IS_GENERATED_MODE && isGeneratedDebugMode(window.location.search);
const VIEW_MODE: GeneratedViewMode = IS_GENERATED_MODE
  ? parseGeneratedView(window.location.search)
  : new URLSearchParams(window.location.search).get('view') === 'iso' ? 'iso' : 'ortho';
const AUTHORED_PALETTE = {
  sky: 0x1d2931,
  ground: 0x4f805a,
  groundAlt: 0x648e62,
  edge: 0x3a4e42,
  glow: 0xf2c66d,
} as const;

function readSeed(): number {
  const value = new URLSearchParams(window.location.search).get('seed');
  const parsed = value === null ? DEFAULT_SEED : Number(value);
  return Number.isInteger(parsed) && Number.isFinite(parsed)
    ? parsed
    : DEFAULT_SEED;
}



const shell = document.createElement('main');
shell.className = 'adventure-shell';

const header = document.createElement('header');
header.className = 'game-header';
header.innerHTML = `
  <div class="brand-lockup">
    <span class="brand-mark">✦</span>
    <div>
      <p class="eyebrow">${IS_GENERATED_MODE ? 'SEED → GEOGRAPHY → PLAY' : 'WORLD → WALK → DISCOVER'}</p>
      <h1>${IS_GENERATED_MODE ? '地形实验场' : 'The Main World'}</h1>
    </div>
  </div>
  <span class="world-mode-label">${DEBUG_MODE ? 'DEBUG · ' : ''}${VIEW_MODE === 'ortho' ? 'ORTHO 3/4' : 'ISO VIEW'}</span>
`;

const stage = document.createElement('section');
stage.className = 'stage-shell';
const canvasRoot = document.createElement('div');
canvasRoot.className = 'canvas-root';

const sidePanel = document.createElement('aside');
sidePanel.className = 'side-panel';
const debugMapMarkup = DEBUG_MODE
  ? `
  <div class="panel-section map-section">
    <div class="section-row"><p class="section-label">40 × 40 FIELD</p><span id="seed-tag" class="grid-tag">SEED ${readSeed()}</span></div>
    <div id="minimap" class="minimap" aria-label="generated terrain overview"></div>
  </div>
  <div class="panel-section legend-section">
    <p class="section-label">FIELD NOTES</p>
    <div class="legend-line"><span class="legend-dot start-dot"></span><span>start</span></div>
    <div class="legend-line"><span class="legend-dot goal-dot"></span><span>goal</span></div>
    <div class="legend-line"><span class="legend-dot high-dot"></span><span>raised terrain</span></div>
  </div>`
  : '';
sidePanel.innerHTML = `
  <div class="panel-section location-section">
    <p class="section-label">${IS_GENERATED_MODE ? 'GENERATED WORLD' : 'MAIN WORLD'}</p>
    <h2 id="room-title">${IS_GENERATED_MODE ? 'Generated Field' : 'Village Square'}</h2>
    <p id="room-description" class="room-description"></p>
    <p id="room-status" class="room-status"></p>
  </div>
  ${debugMapMarkup}
`;

const controls = document.createElement('footer');
controls.className = 'controls-bar';
controls.innerHTML = `
  <span><kbd>W A S D</kbd> / <kbd>← ↑ ↓ →</kbd> move</span>
  <span><kbd>E</kbd> inspect ${IS_GENERATED_MODE ? 'terrain' : 'room'}</span>
  <span><kbd>R</kbd> reset</span>
  ${IS_GENERATED_MODE ? '<span><kbd>N</kbd> new seed</span>' : ''}
  <span><kbd>[ ]</kbd> zoom</span>
  <span><kbd>I</kbd> inventory</span>
  ${IS_GENERATED_MODE ? `<div class="playtest-feedback" aria-label="Playtest feedback">
    <button class="feedback-button" data-feedback="interesting" type="button">👍 interesting</button>
    <button class="feedback-button" data-feedback="boring" type="button">👎 boring</button>
    <button class="feedback-button" data-feedback="discovered" type="button">💡 discovered something</button>
    <button class="feedback-button" data-feedback="saved" type="button">⭐ save seed</button>
  </div>` : ''}
`;

stage.append(canvasRoot, sidePanel);
shell.append(header, stage, controls);
root.replaceChildren(shell);

const title = header.querySelector<HTMLHeadingElement>('h1')!;
const roomTitle = sidePanel.querySelector<HTMLHeadingElement>('#room-title')!;
const roomDescription = sidePanel.querySelector<HTMLParagraphElement>('#room-description')!;
const roomStatus = sidePanel.querySelector<HTMLParagraphElement>('#room-status')!;
const seedTag = sidePanel.querySelector<HTMLSpanElement>('#seed-tag');
const minimap = sidePanel.querySelector<HTMLDivElement>('#minimap');
const feedbackButtons = Array.from(
  controls.querySelectorAll<HTMLButtonElement>('[data-feedback]'),
);

if (!title || !roomTitle || !roomDescription || !roomStatus) {
  throw new Error('Generated playground UI failed to initialize');
}

let seed = readSeed();
let world: GeneratedWorld | null = IS_GENERATED_MODE ? generateGeneratedWorld(seed) : null;
let playground: GeneratedPlayground | null = world ? createGeneratedPlayground(world) : null;
const authoredWorld: AuthoredWorld | null = IS_GENERATED_MODE ? null : MAIN_WORLD;
const authoredGame: AuthoredGame | null = authoredWorld ? createAuthoredGame(authoredWorld) : null;
let authoredState: AuthoredPlayState | null = authoredGame ? createAuthoredPlayState(authoredGame) : null;
let state: LocalWorldState = playground?.initialState ?? authoredState!.localState;
let renderer: IsometricSceneRenderer | OrthogonalSceneRenderer;
let zoom = VIEW_MODE === 'ortho' ? 0.72 : 0.34;
const initialPosition = world?.start ?? authoredWorld!.startPosition;
let camera = VIEW_MODE === 'ortho'
  ? projectOrthogonalCell(initialPosition.x, initialPosition.y, 0)
  : projectIsoCell(initialPosition.x, initialPosition.y, 0);
const statusText = document.createElement('p');
statusText.id = 'game-status';
shell.append(statusText);
let feedback: string | null = null;
let playtestTags = new Set<PlaytestTag>();

function isPlaytestTag(value: unknown): value is PlaytestTag {
  return typeof value === 'string' && PLAYTEST_TAGS.includes(value as PlaytestTag);
}

function loadPlaytestAnnotations(): Record<string, PlaytestTag[]> {
  try {
    const serialized = localStorage.getItem(PLAYTEST_FEEDBACK_STORAGE_KEY);
    if (!serialized) {
      return {};
    }
    const parsed: unknown = JSON.parse(serialized);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const annotations: Record<string, PlaytestTag[]> = {};
    for (const [storedSeed, storedTags] of Object.entries(parsed)) {
      if (!Array.isArray(storedTags)) {
        continue;
      }
      const tags = storedTags.filter(isPlaytestTag);
      if (tags.length > 0) {
        annotations[storedSeed] = tags;
      }
    }
    return annotations;
  } catch {
    return {};
  }
}

function loadPlaytestTags(seedToLoad: number): Set<PlaytestTag> {
  return new Set(loadPlaytestAnnotations()[String(seedToLoad)] ?? []);
}

function savePlaytestTags(seedToSave: number, tags: ReadonlySet<PlaytestTag>): void {
  try {
    const annotations = loadPlaytestAnnotations();
    if (tags.size === 0) {
      delete annotations[String(seedToSave)];
    } else {
      annotations[String(seedToSave)] = [...tags];
    }
    localStorage.setItem(
      PLAYTEST_FEEDBACK_STORAGE_KEY,
      JSON.stringify(annotations),
    );
  } catch {
    // Local storage is optional; tagging should never interrupt play.
  }
}

function renderPlaytestFeedback(): void {
  for (const button of feedbackButtons) {
    const tag = button.dataset.feedback;
    if (!isPlaytestTag(tag)) {
      continue;
    }
    const active = playtestTags.has(tag);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    if (tag === 'saved') {
      button.textContent = active ? '⭐ saved' : '⭐ save seed';
    }
  }
}

function togglePlaytestTag(tag: PlaytestTag): void {
  if (tag === 'saved') {
    playtestTags.add(tag);
  } else if (playtestTags.has(tag)) {
    playtestTags.delete(tag);
  } else {
    if (tag === 'interesting' || tag === 'boring') {
      playtestTags.delete(tag === 'interesting' ? 'boring' : 'interesting');
    }
    playtestTags.add(tag);
  }
  savePlaytestTags(seed, playtestTags);
  feedback = tag === 'saved'
    ? `SEED ${seed} SAVED`
    : `${tag.toUpperCase()} · SEED ${seed}`;
  render();
}

playtestTags = loadPlaytestTags(seed);
for (const button of feedbackButtons) {
  button.addEventListener('click', () => {
    const tag = button.dataset.feedback;
    if (isPlaytestTag(tag)) {
      togglePlaytestTag(tag);
    }
  });
}
renderPlaytestFeedback();

function createAuthoredWorldView(playState: AuthoredPlayState): IsoRoomView {
  const room = authoredCurrentRoom(playState);
  const cells = authoredCells(room);
  return {
    id: room.id,
    title: room.title,
    description: room.description,
    width: room.width,
    height: room.height,
    cells: cells.map((row) => row.map((cell) => ({
      x: cell.x,
      y: cell.y,
      elevation: cell.elevation,
      terrainType: cell.surface,
      surface: cell.surface,
      obstacle: cell.obstacle,
      biome: room.id === 'elder-house' ? 'interior' : 'meadow',
      environment: { weather: 'clear', lighting: 'day' },
      walkable: cell.walkable,
    }))),
    props: [],
    npcs: [],
    node: {
      id: `${room.id}-landmark`,
      x: room.spawn.x,
      y: room.spawn.y,
      label: 'place to explore',
    },
    exits: room.exits.map((exit) => ({
      id: exit.id,
      direction: exit.direction,
      x: exit.position.x,
      y: exit.position.y,
    })),
    connectors: [],
    environment: { weather: 'clear', lighting: 'day' },
    palette: AUTHORED_PALETTE,
  };
}

function createWorldView(): IsoRoomView {
  if (!IS_GENERATED_MODE) {
    return createAuthoredWorldView(authoredState!);
  }

  const generatedWorld = world!;
  const regions = new Map(generatedWorld.regions.map((region) => [region.id, region]));
  const connectorEdges = generatedWorld.edges.filter((edge) => {
    if (edge.kind !== 'stairs' && edge.kind !== 'ramp') {
      return false;
    }
    return (
      edge.from.x < edge.to.x ||
      (edge.from.x === edge.to.x && edge.from.y < edge.to.y)
    );
  });

  const view: IsoRoomView = {
    id: `generated-${generatedWorld.seed}`,
    title: 'Generated Field',
    description: 'A seed-built field of distinct terrain regions.',
    width: generatedWorld.width,
    height: generatedWorld.height,
    cells: generatedWorld.cells.map((row) => row.map((cell) => {
      const region = regions.get(cell.regionId);
      return {
        x: cell.x,
        y: cell.y,
        elevation: cell.elevation,
        terrainType: cell.terrainType,
        surface: cell.surface,
        obstacle: cell.obstacle,
        biome: region?.biome ?? 'meadow',
        environment: region?.environment ?? generatedWorld.environment,
        walkable: cell.walkable,
      };
    })),
    props: generatedWorld.props.map((prop) => ({
      id: prop.id,
      assetKey: kenneyPropAssetKeyFor(prop),
      x: prop.x,
      y: prop.y,
      elevation: prop.elevation,
      foreground: prop.foreground,
      blocks: prop.blocks,
    })),
    npcs: [],
    node: {
      id: 'generated-goal-node',
      x: generatedWorld.goal.x,
      y: generatedWorld.goal.y,
      label: 'reach the goal',
    },
    exits: [],
    connectors: connectorEdges.map((edge) => ({
      id: `connector-${edge.from.x}-${edge.from.y}-${edge.to.x}-${edge.to.y}`,
      kind: edge.kind === 'ramp' ? 'ramp' : 'stairs',
      from: { ...edge.from },
      to: { ...edge.to },
    })),

    start: { x: generatedWorld.start.x, y: generatedWorld.start.y, label: 'start' },
    goal: { x: generatedWorld.goal.x, y: generatedWorld.goal.y, label: 'goal' },
    environment: generatedWorld.environment,
    palette: generatedWorld.palette,
  };

  if (DEBUG_MODE) {
    return {
      ...view,
      debugOverlay: {
        showBlocked: true,
        baselinePath: generatedWorld.baselinePath,
        finalPath: generatedWorld.finalPath,
        disruptionFootprint: generatedWorld.perturbation.disruption.footprint,
        diagnostics: {
          family: generatedWorld.topologyFamily,
          attempts: generatedWorld.generationAttempts,
          baselineLength: generatedWorld.perturbation.baselineShortestPathLength,
          finalLength: generatedWorld.perturbation.finalShortestPathLength,
          wallCount: generatedWorld.finalTopology.wallCount,
          cycleRank: generatedWorld.finalTopology.cycleRank,
        },
      },
    };
  }
  return view;
}

function buildView(): IsoSceneView {
  const position = IS_GENERATED_MODE
    ? playerPosition(state)
    : authoredPlayerPosition(authoredState!);
  const room = createWorldView();
  const cell = room.cells[position.y]?.[position.x];
  return {
    room,
    player: {
      x: position.x,
      y: position.y,
      elevation: cell?.elevation ?? 0,
    },
    windMarks: {},
    goalReached: IS_GENERATED_MODE
      ? generatedGoalReached(playground!, state)
      : undefined,
  };
}

function renderMinimap(): void {
  if (!IS_GENERATED_MODE || !DEBUG_MODE || !minimap) {
    return;
  }
  const generatedWorld = world!;
  minimap.replaceChildren();
  const map = projectGeneratedMinimap({
    cells: generatedWorld.cells,
    sourceWidth: generatedWorld.width,
    sourceHeight: generatedWorld.height,
    start: generatedWorld.start,
    goal: generatedWorld.goal,
    disruption: generatedWorld.perturbation.disruption.footprint,
    columns: 20,
    rows: 20,
  });
  const position = playerPosition(state);
  const activeX = Math.max(0, Math.min(19, Math.floor(position.x * 20 / generatedWorld.width)));
  const activeY = Math.max(0, Math.min(19, Math.floor(position.y * 20 / generatedWorld.height)));
  for (const mapTile of map.tiles) {
    const tile = document.createElement('span');
    tile.className = `map-cell ${mapTile.walkable ? 'open' : 'blocked'}`;
    if (mapTile.elevated) {
      tile.classList.add('high');
    }
    if (mapTile.start) {
      tile.classList.add('start');
    }
    if (mapTile.goal) {
      tile.classList.add('goal');
    }
    if (mapTile.disrupted) {
      tile.classList.add('disrupted');
    }
    if (mapTile.x === activeX && mapTile.y === activeY) {
      tile.classList.add('active');
    }
    minimap.append(tile);
  }
}

function render(): void {
  renderPlaytestFeedback();
  const position = IS_GENERATED_MODE
    ? playerPosition(state)
    : authoredPlayerPosition(authoredState!);
  if (IS_GENERATED_MODE) {
    const generatedWorld = world!;
    const reached = generatedGoalReached(playground!, state);
    title.innerHTML = `地形实验场 <span>· Seed ${generatedWorld.seed}</span>`;
    const currentCell = generatedWorld.cells[position.y]?.[position.x];
    const currentRegion = generatedWorld.regions.find((region) => region.id === currentCell?.regionId);
    roomTitle.textContent = 'Generated Field';
    roomDescription.textContent = formatGeneratedWorldDescription({
      width: generatedWorld.width,
      height: generatedWorld.height,
      biome: currentRegion?.biome ?? 'meadow',
      weather: currentRegion?.environment?.weather ?? generatedWorld.environment.weather,
      lighting: currentRegion?.environment?.lighting ?? generatedWorld.environment.lighting,
      topologyFamily: generatedWorld.topologyFamily,
      disruptionCellCount: generatedWorld.perturbation.disruption.footprint.length,
    });
    roomStatus.textContent = reached
      ? 'GOAL REACHED'
      : `POSITION ${position.x},${position.y}`;
    if (seedTag) {
      seedTag.textContent = `SEED ${generatedWorld.seed}`;
    }
    statusText.textContent = feedback ?? (reached ? 'GOAL REACHED' : `POSITION ${position.x},${position.y}`);
  } else {
    const room = authoredCurrentRoom(authoredState!);
    title.textContent = `The Main World · ${room.title}`;
    roomTitle.textContent = room.title;
    roomDescription.textContent = room.description;
    roomStatus.textContent = `POSITION ${position.x},${position.y}`;
    statusText.textContent = feedback ?? `POSITION ${position.x},${position.y}`;
  }
  renderer.render(buildView());
  renderMinimap();
}

function currentCameraTarget(): { x: number; y: number } {
  const position = IS_GENERATED_MODE
    ? playerPosition(state)
    : authoredPlayerPosition(authoredState!);
  const room = createWorldView();
  const cell = room.cells[position.y]?.[position.x];
  if (VIEW_MODE === 'ortho') {
    const point = projectOrthogonalCell(position.x, position.y, cell?.elevation ?? 0);
    return {
      x: point.x + ORTHO_TILE_SIZE / 2,
      y: point.y + ORTHO_TILE_SIZE / 2,
    };
  }
  return projectIsoCell(position.x, position.y, cell?.elevation ?? 0);
}

function tryMove(direction: GeneratedDirection): void {
  if (IS_GENERATED_MODE) {
    const result = moveGeneratedPlayer(playground!, state, direction);
    state = result.state;
    feedback = result.accepted ? null : formatBlockedMovement();
    render();
    return;
  }

  const result = moveAuthoredPlayer(authoredState!, direction);
  if (result.accepted) {
    authoredState = result.state;
    state = result.state.localState;
    feedback = null;
  } else {
    feedback = formatBlockedMovement();
  }
  render();
}

function inspectTerrain(): void {
  if (!IS_GENERATED_MODE) {
    const position = authoredPlayerPosition(authoredState!);
    const room = authoredCurrentRoom(authoredState!);
    const cell = authoredCellAt(room, position);
    if (cell) {
      feedback = `CELL ${position.x},${position.y} · SURFACE ${cell.surface} · ELEVATION ${cell.elevation}`;
      render();
    }
    return;
  }

  const position = playerPosition(state);
  const generatedWorld = world!;
  const cell = generatedCellAt(generatedWorld, position);
  if (!cell) {
    return;
  }
  const region = generatedWorld.regions.find((candidate) => candidate.id === cell.regionId);
  const directions: Array<[GeneratedDirection, { x: number; y: number }]> = [
    ['up', { x: 0, y: -1 }],
    ['down', { x: 0, y: 1 }],
    ['left', { x: -1, y: 0 }],
    ['right', { x: 1, y: 0 }],
  ];
  const facts = {
    x: position.x,
    y: position.y,
    terrainType: cell.terrainType,
    biome: region?.biome ?? 'unknown',
    weather: region?.environment?.weather ?? generatedWorld.environment.weather,
    lighting: region?.environment?.lighting ?? generatedWorld.environment.lighting,
    elevation: cell.elevation,
  };
  if (DEBUG_MODE) {
    const traversableDirections = directions
      .filter(([, delta]) => {
        const target = { x: position.x + delta.x, y: position.y + delta.y };
        const targetCell = generatedCellAt(generatedWorld, target);
        const edge = resolveGeneratedEdge(generatedWorld, position, target);
        return Boolean(targetCell && edge && canTraverse(cell, targetCell, edge, {}));
      })
      .map(([direction]) => direction);
    feedback = formatGeneratedInspection({
      ...facts,
      regionId: cell.regionId,
      traversableDirections,
    }, true);
  } else {
    feedback = formatGeneratedInspection(facts, false);
  }
  render();
}

function resetWorld(): void {
  if (IS_GENERATED_MODE) {
    state = playground!.initialState;
  } else {
    authoredState = resetAuthoredPlayState(authoredGame!);
    state = authoredState.localState;
  }
  camera = currentCameraTarget();
  feedback = 'RUN RESET';
  render();
}

function createNewSeed(): void {
  if (!IS_GENERATED_MODE) {
    return;
  }
  seed += 1;
  const generatedWorld = generateGeneratedWorld(seed);
  world = generatedWorld;
  playground = createGeneratedPlayground(generatedWorld);
  state = playground.initialState;
  playtestTags = loadPlaytestTags(seed);
  camera = currentCameraTarget();
  feedback = 'NEW FIELD GENERATED';
  renderMinimap();
  render();
}

function setZoom(nextZoom: number): void {
  zoom = Math.min(VIEW_MODE === 'ortho' ? 1 : 0.52, Math.max(0.24, nextZoom));
  renderer.setCamera(camera.x, camera.y, zoom);
}

void (async () => {
  try {
    const host = await createPixiHost(canvasRoot, {
      width: 960,
      height: 600,
      backgroundColor: IS_GENERATED_MODE ? world!.palette.sky : AUTHORED_PALETTE.sky,
    });
    const textures: MarkTextureSet = await loadMarkTextures();
    const orthogonalTextures: OrthogonalTextureSet = VIEW_MODE === 'ortho'
      ? await loadOrthogonalTextures()
      : {};
    renderer = VIEW_MODE === 'ortho'
      ? createOrthogonalScene(host.scene, textures, orthogonalTextures)
      : createIsometricScene(host.scene, textures);
    const inventoryUi = createInventoryUi(host.ui);
    inventoryUi.render(createDemoInventoryView(textures));
    renderMinimap();
    render();
    renderer.setCamera(camera.x, camera.y, zoom);

    host.app.ticker.add(() => {
      const target = currentCameraTarget();
      const amount = Math.min(1, host.app.ticker.deltaMS / 150);
      camera = {
        x: camera.x + (target.x - camera.x) * amount,
        y: camera.y + (target.y - camera.y) * amount,
      };
      renderer.setCamera(camera.x, camera.y, zoom);
    });

    const handleKeyDown = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if (key === 'i' || key === 'b') {
        event.preventDefault();
        inventoryUi.toggle();
        return;
      }
      if (inventoryUi.isOpen()) {
        if (key === 'escape') {
          event.preventDefault();
          inventoryUi.setOpen(false);
        }
        return;
      }
      if (key === 'e' || key === ' ') {
        event.preventDefault();
        inspectTerrain();
        return;
      }
      if (key === 'r') {
        event.preventDefault();
        resetWorld();
        return;
      }
      if (key === 'n') {
        event.preventDefault();
        createNewSeed();
        return;
      }
      if (key === '[') {
        event.preventDefault();
        setZoom(zoom - 0.04);
        return;
      }
      if (key === ']') {
        event.preventDefault();
        setZoom(zoom + 0.04);
        return;
      }

      const direction: GeneratedDirection | null =
        key === 'w' || key === 'arrowup'
          ? 'up'
          : key === 's' || key === 'arrowdown'
            ? 'down'
            : key === 'a' || key === 'arrowleft'
              ? 'left'
              : key === 'd' || key === 'arrowright'
                ? 'right'
                : null;
      if (direction) {
        event.preventDefault();
        tryMove(direction);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    import.meta.hot?.dispose(() => {
      window.removeEventListener('keydown', handleKeyDown);
      host.destroy();
    });
  } catch (error) {
    console.error(error);
    root.textContent = 'Failed to create world';
  }
})();

export {};

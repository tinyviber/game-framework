import './style.css';
import {
  generateGeneratedWorld,
  type GeneratedWorld,
} from '@/world/generated-world';
import {
  createGeneratedPlayground,
  generatedGoalReached,
  moveGeneratedPlayer,
  playerPosition,
  type GeneratedDirection,
  type GeneratedPlayground,
} from '@/chapters/chapter-13/generated-playground';
import {
  createIsometricScene,
  projectIsoCell,
  type IsoRoomView,
  type IsoSceneView,
  loadMarkTextures,
  type MarkTextureSet,
} from '@/rendering/isometric-scene';
import { createPixiHost } from '@/rendering/pixi-host';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Missing #app');
}

const DEFAULT_SEED = 2026;

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
      <p class="eyebrow">SEED → GEOGRAPHY → PLAY</p>
      <h1>地形实验场 <span>· Generated Playground</span></h1>
    </div>
  </div>
  <div class="progress-block">
    <span id="progress-label">BASELINE 00 · FINAL 00</span>
    <div class="progress-track"><i id="progress-fill"></i></div>
  </div>
`;

const stage = document.createElement('section');
stage.className = 'stage-shell';
const canvasRoot = document.createElement('div');
canvasRoot.className = 'canvas-root';

const sidePanel = document.createElement('aside');
sidePanel.className = 'side-panel';
sidePanel.innerHTML = `
  <div class="panel-section location-section">
    <p class="section-label">GENERATED WORLD</p>
    <h2 id="room-title">Seed 2026</h2>
    <p id="room-description" class="room-description"></p>
    <p id="room-status" class="room-status"></p>
  </div>
  <div class="panel-section map-section">
    <div class="section-row"><p class="section-label">40 × 40 FIELD</p><span id="seed-tag" class="grid-tag">SEED 2026</span></div>
    <div id="minimap" class="minimap" aria-label="generated terrain overview"></div>
  </div>
  <div class="panel-section legend-section">
    <p class="section-label">FIELD NOTES</p>
    <div class="legend-line"><span class="legend-dot start-dot"></span><span>start</span></div>
    <div class="legend-line"><span class="legend-dot goal-dot"></span><span>goal</span></div>
    <div class="legend-line"><span class="legend-dot barrier-dot"></span><span>height barrier</span></div>
    <div class="legend-line"><span class="legend-dot high-dot"></span><span>elevated ground</span></div>
  </div>
`;

const controls = document.createElement('footer');
controls.className = 'controls-bar';
controls.innerHTML = `
  <span><kbd>W A S D</kbd> / <kbd>← ↑ ↓ →</kbd> move</span>
  <span><kbd>E</kbd> inspect terrain</span>
  <span><kbd>R</kbd> reset</span>
  <span><kbd>N</kbd> new seed</span>
  <span><kbd>[ ]</kbd> zoom</span>
  <span id="hint-text" class="hint-text">Find the long way around the raised seam.</span>
`;

stage.append(canvasRoot, sidePanel);
shell.append(header, stage, controls);
root.replaceChildren(shell);

const title = header.querySelector<HTMLHeadingElement>('h1')!;
const progressLabel = header.querySelector<HTMLSpanElement>('#progress-label')!;
const progressFill = header.querySelector<HTMLElement>('#progress-fill')!;
const roomTitle = sidePanel.querySelector<HTMLHeadingElement>('#room-title')!;
const roomDescription = sidePanel.querySelector<HTMLParagraphElement>('#room-description')!;
const roomStatus = sidePanel.querySelector<HTMLParagraphElement>('#room-status')!;
const seedTag = sidePanel.querySelector<HTMLSpanElement>('#seed-tag')!;
const minimap = sidePanel.querySelector<HTMLDivElement>('#minimap')!;
const hintText = controls.querySelector<HTMLSpanElement>('#hint-text')!;

if (!title || !progressLabel || !progressFill || !roomTitle || !roomDescription || !roomStatus || !seedTag || !minimap || !hintText) {
  throw new Error('Generated playground UI failed to initialize');
}

let seed = readSeed();
let world: GeneratedWorld = generateGeneratedWorld(seed);
let playground: GeneratedPlayground = createGeneratedPlayground(world);
let state = playground.initialState;
let renderer: ReturnType<typeof createIsometricScene>;
let zoom = 0.34;
let camera = projectIsoCell(world.start.x, world.start.y, 0);
const statusText = document.createElement('p');
statusText.id = 'game-status';
shell.append(statusText);

function setHint(message: string, duration = 3000): void {
  hintText.textContent = message;
  window.setTimeout(() => {
    if (hintText.textContent === message) {
      hintText.textContent = 'Find the long way around the raised seam.';
    }
  }, duration);
}

function isSamePosition(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return a.x === b.x && a.y === b.y;
}

function createWorldView(): IsoRoomView {
  const connectorEdges = world.edges.filter((edge) => {
    if (edge.kind !== 'stairs' && edge.kind !== 'ramp') {
      return false;
    }
    return (
      edge.from.x < edge.to.x ||
      (edge.from.x === edge.to.x && edge.from.y < edge.to.y)
    );
  });

  return {
    id: `generated-${world.seed}`,
    title: `Seed ${world.seed}`,
    description: 'A seed-built field of walls, loops, a raised island and one deliberate height barrier.',
    width: world.width,
    height: world.height,
    cells: world.cells,
    props: world.props,
    npcs: [],
    node: {
      id: 'generated-goal-node',
      x: world.goal.x,
      y: world.goal.y,
      label: 'reach the goal',
    },
    exits: [],
    connectors: connectorEdges.map((edge) => ({
      id: `connector-${edge.from.x}-${edge.from.y}-${edge.to.x}-${edge.to.y}`,
      kind: edge.kind === 'ramp' ? 'ramp' : 'stairs',
      from: { ...edge.from },
      to: { ...edge.to },
    })),
    start: { x: world.start.x, y: world.start.y, label: 'start' },
    goal: { x: world.goal.x, y: world.goal.y, label: 'goal' },
    barrier: {
      from: { ...world.perturbation.edge.from },
      to: { ...world.perturbation.edge.to },
    },
    palette: world.palette,
  };
}

function buildView(): IsoSceneView {
  const position = playerPosition(state);
  const cell = world.cells[position.y]?.[position.x];
  return {
    room: createWorldView(),
    player: {
      x: position.x,
      y: position.y,
      elevation: cell?.elevation ?? 0,
    },
    windMarks: {},
    goalReached: generatedGoalReached(playground, state),
  };
}

function renderMinimap(): void {
  minimap.replaceChildren();
  for (let y = 0; y < 20; y += 1) {
    for (let x = 0; x < 20; x += 1) {
      const cell = world.cells[y * 2]?.[x * 2];
      const tile = document.createElement('span');
      tile.className = 'map-cell';
      if (!cell?.walkable) {
        tile.classList.add('blocked');
      } else {
        tile.classList.add('open');
        if (cell.elevation > 0) {
          tile.classList.add('high');
        }
      }
      if (cell && isSamePosition(cell, world.start)) {
        tile.classList.add('start');
      }
      if (cell && isSamePosition(cell, world.goal)) {
        tile.classList.add('goal');
      }
      minimap.append(tile);
    }
  }
}

function render(): void {
  const position = playerPosition(state);
  const reached = generatedGoalReached(playground, state);
  const baselineLength = world.perturbation.baselineShortestPathLength;
  const finalLength = world.perturbation.finalShortestPathLength;
  title.innerHTML = `地形实验场 <span>· Seed ${world.seed}</span>`;
  roomTitle.textContent = `Seed ${world.seed}`;
  roomDescription.textContent = `40×40 generated field · ${world.finalTopology.wallCount} walls · ${world.finalTopology.cycleRank} loops · ${world.finalTopology.articulationCount} bottlenecks`;
  roomStatus.textContent = reached
    ? 'GOAL REACHED · alternate route confirmed'
    : `POSITION ${position.x},${position.y} · ${world.finalTopology.deadEndCount} dead ends in the field`;
  seedTag.textContent = `SEED ${world.seed}`;
  progressLabel.textContent = `BASELINE ${String(baselineLength).padStart(2, '0')} · FINAL ${String(finalLength).padStart(2, '0')}`;
  progressFill.style.width = `${Math.min(100, (baselineLength / Math.max(1, finalLength)) * 100)}%`;
  statusText.textContent = `SEED ${world.seed} · ${position.x},${position.y} · ${reached ? 'goal reached' : 'barrier ahead — route around'}`;
  renderer.render(buildView());
}

function currentCameraTarget(): { x: number; y: number } {
  const position = playerPosition(state);
  const cell = world.cells[position.y]?.[position.x];
  return projectIsoCell(position.x, position.y, cell?.elevation ?? 0);
}

function tryMove(direction: GeneratedDirection): void {
  const previous = playerPosition(state);
  const result = moveGeneratedPlayer(playground, state, direction);
  state = result.state;
  render();
  if (!result.accepted) {
    const barrier = world.perturbation.edge;
    const next = {
      x: previous.x + ({ up: 0, down: 0, left: -1, right: 1 }[direction] ?? 0),
      y: previous.y + ({ up: -1, down: 1, left: 0, right: 0 }[direction] ?? 0),
    };
    if (
      (isSamePosition(previous, barrier.from) && isSamePosition(next, barrier.to)) ||
      (isSamePosition(previous, barrier.to) && isSamePosition(next, barrier.from))
    ) {
      setHint('The raised seam is a height barrier. Take the loop below it.', 4200);
    } else {
      setHint('No traversable edge there. Read the walls and find another opening.', 1800);
    }
  }
}

function inspectTerrain(): void {
  const position = playerPosition(state);
  const barrier = world.perturbation.edge;
  if (
    Math.abs(position.x - barrier.from.x) + Math.abs(position.y - barrier.from.y) <= 1 ||
    Math.abs(position.x - barrier.to.x) + Math.abs(position.y - barrier.to.y) <= 1
  ) {
    setHint('The ground rises here without a connector. The lower loop is the natural route.', 4200);
    return;
  }
  if (generatedGoalReached(playground, state)) {
    setHint('Goal reached. Reset or press N to see a new geography.', 3600);
    return;
  }
  setHint('Stairs connect the elevated island. The bright seam is intentionally impassable.', 2600);
}

function resetWorld(): void {
  state = playground.initialState;
  camera = currentCameraTarget();
  render();
  setHint('Run reset. The seed and geography stayed the same.', 2400);
}

function createNewSeed(): void {
  seed += 1;
  world = generateGeneratedWorld(seed);
  playground = createGeneratedPlayground(world);
  state = playground.initialState;
  camera = currentCameraTarget();
  renderMinimap();
  render();
  setHint(`New geography generated from seed ${seed}.`, 3200);
}

function setZoom(nextZoom: number): void {
  zoom = Math.min(0.52, Math.max(0.24, nextZoom));
  renderer.setCamera(camera.x, camera.y, zoom);
}

void (async () => {
  try {
    const host = await createPixiHost(canvasRoot, {
      width: 960,
      height: 600,
      backgroundColor: world.palette.sky,
    });
    const textures: MarkTextureSet = await loadMarkTextures();
    renderer = createIsometricScene(host.scene, textures);
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
    window.setTimeout(() => setHint('The direct route is visible. Cross the field, then notice the raised seam.', 5200), 600);

    import.meta.hot?.dispose(() => {
      window.removeEventListener('keydown', handleKeyDown);
      host.destroy();
    });
  } catch (error) {
    console.error(error);
    root.textContent = 'Failed to create generated playground';
  }
})();

export {};

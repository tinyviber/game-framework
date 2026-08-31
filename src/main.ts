import './style.css';
import { Graphics } from 'pixi.js';
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
  createOrthogonalScene,
  ORTHO_TILE_SIZE,
  projectOrthogonalCell,
  type OrthogonalSceneRenderer,
} from '@/rendering/orthogonal-scene';
import {
  loadOrthogonalTextures,
  type OrthogonalTextureSet,
} from '@/rendering/orthogonal-textures';
import { createPixiHost, type PixiHostHandle } from '@/rendering/pixi-host';
import {
  canEnterCell,
  createInitialSiftingState,
  createSiftingLayout,
  dropCarried,
  gateIsOpen,
  placeOnPedestal,
  positionKey,
  siftFromUrn,
  tossIntoUrn,
  SEED_LABEL,
  type SiftingLayout,
  type SiftingState,
} from '@/experiments/sifting-shrine/mechanic';
import type { Position } from '@/world/types';

/**
 * NIGHT PROTOTYPE A — 轻重祭坛 (Sifting Shrine)
 * Diegetic ordered container: the urn always returns the lightest seed first.
 * Ortho view only; the iso renderer is untouched on main.
 */

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('Missing #app');
}

const DEFAULT_SEED = 2026;

function readSeed(): number {
  const value = new URLSearchParams(window.location.search).get('seed');
  const parsed = value === null ? DEFAULT_SEED : Number(value);
  return Number.isInteger(parsed) && Number.isFinite(parsed) ? parsed : DEFAULT_SEED;
}

const shell = document.createElement('main');
shell.className = 'adventure-shell';

const header = document.createElement('header');
header.className = 'game-header';
header.innerHTML = `
  <div class="brand-lockup">
    <span class="brand-mark">✦</span>
    <div>
      <p class="eyebrow">NIGHT PROTOTYPE A · ORDERED CONTAINER</p>
      <h1>轻重祭坛 <span>· Sifting Shrine</span></h1>
    </div>
  </div>
  <span class="world-mode-label">ORTHO 3/4 · SPIKE</span>
`;

const stage = document.createElement('section');
stage.className = 'stage-shell';
const canvasRoot = document.createElement('div');
canvasRoot.className = 'canvas-root';

const sidePanel = document.createElement('aside');
sidePanel.className = 'side-panel';
sidePanel.innerHTML = `
  <div class="panel-section location-section">
    <p class="section-label">SHRINE TRIAL</p>
    <h2 id="room-title">轻重祭坛</h2>
    <p id="room-description" class="room-description"></p>
    <p id="room-status" class="room-status"></p>
  </div>
  <div class="panel-section legend-section">
    <p class="section-label">FIELD NOTES</p>
    <div class="legend-line"><span class="legend-dot" style="background:#b0653a"></span><span>祭坛：投进去的东西，最轻的先出来</span></div>
    <div class="legend-line"><span class="legend-dot" style="background:#a8f0dc"></span><span>轻之石台：刻着一片羽毛</span></div>
    <div class="legend-line"><span class="legend-dot" style="background:#f2c66d"></span><span>重之石台：刻着一枚金种</span></div>
    <div class="legend-line"><span class="legend-dot" style="background:#8d99a8"></span><span>石门：两座石台都安放好才会开</span></div>
  </div>
`;

const controls = document.createElement('footer');
controls.className = 'controls-bar';
controls.innerHTML = `
  <span><kbd>W A S D</kbd> / <kbd>← ↑ ↓ →</kbd> move</span>
  <span><kbd>E</kbd> interact (祭坛/石台)</span>
  <span><kbd>G</kbd> drop seed</span>
  <span><kbd>R</kbd> reset</span>
  <span><kbd>N</kbd> new seed</span>
  <span><kbd>[ ]</kbd> zoom</span>
`;

stage.append(canvasRoot, sidePanel);
shell.append(header, stage, controls);
root.replaceChildren(shell);

const roomDescription = sidePanel.querySelector<HTMLParagraphElement>('#room-description')!;
const roomStatus = sidePanel.querySelector<HTMLParagraphElement>('#room-status')!;
const statusText = document.createElement('p');
statusText.id = 'game-status';
shell.append(statusText);

let seed = readSeed();
let world: GeneratedWorld = generateGeneratedWorld(seed);
let playground: GeneratedPlayground = createGeneratedPlayground(world);
let state = playground.initialState;
let layout: SiftingLayout = createSiftingLayout(world.finalPath, world.goal);
let sifting: SiftingState = createInitialSiftingState();
let renderer: OrthogonalSceneRenderer;
let overlay: Graphics;
let zoom = 0.72;
let camera = projectOrthogonalCell(world.start.x, world.start.y, 0);
let feedback: string | null = '跟着小路走：先找到祭坛，再读懂两座石台。';

function buildView() {
  const position = playerPosition(state);
  const cell = world.cells[position.y]?.[position.x];
  return {
    room: {
      id: `sifting-${world.seed}`,
      title: 'Sifting Shrine',
      description: 'Night prototype A',
      width: world.width,
      height: world.height,
      cells: world.cells.map((row) => row.map((cell) => ({
        x: cell.x,
        y: cell.y,
        elevation: cell.elevation,
        terrainType: cell.terrainType,
        surface: cell.surface,
        terrainTileId: cell.terrainTileId,
        obstacle: cell.obstacle,
        biome: 'meadow' as const,
        environment: world.environment,
        walkable: cell.walkable,
      }))),
      props: world.props,
      npcs: [],
      node: { id: 'goal', x: world.goal.x, y: world.goal.y, label: 'goal' },
      exits: [],
      connectors: [],
      start: { x: world.start.x, y: world.start.y, label: 'start' },
      goal: { x: world.goal.x, y: world.goal.y, label: 'goal' },
      environment: world.environment,
      palette: world.palette,
    },
    player: { x: position.x, y: position.y, elevation: cell?.elevation ?? 0 },
    windMarks: {},
    goalReached: false,
  };
}

function cellCenter(position: Position): { x: number; y: number } {
  const cell = world.cells[position.y]?.[position.x];
  const point = projectOrthogonalCell(position.x, position.y, cell?.elevation ?? 0);
  return { x: point.x + ORTHO_TILE_SIZE / 2, y: point.y + ORTHO_TILE_SIZE / 2 };
}

const SEED_COLORS = { feather: 0xa8f0dc, pebble: 0x9aa7b5, gold: 0xf2c66d } as const;

function drawSeedGlyph(kind: 'feather' | 'pebble' | 'gold', x: number, y: number, radius: number): void {
  if (kind === 'feather') {
    overlay.ellipse(x, y, radius * 0.55, radius).fill({ color: SEED_COLORS.feather });
    overlay.moveTo(x, y - radius).lineTo(x, y + radius).stroke({ color: 0x3a6a5c, width: 1.5 });
  } else if (kind === 'pebble') {
    overlay.circle(x, y, radius * 0.8).fill({ color: SEED_COLORS.pebble });
    overlay.circle(x - radius * 0.2, y - radius * 0.2, radius * 0.3).fill({ color: 0xc3cdd8, alpha: 0.8 });
  } else {
    overlay.circle(x, y, radius * 0.85).fill({ color: SEED_COLORS.gold });
    overlay.circle(x, y, radius * 0.85).stroke({ color: 0x8a6420, width: 2 });
  }
}

function drawOverlay(): void {
  overlay.clear();

  // Urn: squat pot with a glow sized by contents.
  const urn = cellCenter(layout.urn);
  overlay.circle(urn.x, urn.y - 4, 13).fill({ color: 0xb0653a });
  overlay.rect(urn.x - 9, urn.y - 20, 18, 7).fill({ color: 0x8a4e2c });
  overlay.circle(urn.x, urn.y - 17, 5 + Math.min(3, sifting.urn.length)).fill({
    color: 0xf2c66d,
    alpha: sifting.urn.length > 0 ? 0.85 : 0.15,
  });

  // Pedestals: engraved silhouettes; filled when the right seed rests there.
  const light = cellCenter(layout.lightPedestal);
  overlay.rect(light.x - 12, light.y - 8, 24, 14).fill({ color: 0x2d3f50 });
  overlay.rect(light.x - 12, light.y - 8, 24, 14).stroke({ color: 0xa8f0dc, width: 2 });
  if (sifting.lightPedestal) {
    drawSeedGlyph('feather', light.x, light.y - 14, 8);
  } else {
    overlay.ellipse(light.x, light.y - 2, 4, 7).stroke({ color: 0xa8f0dc, width: 1.5, alpha: 0.7 });
  }

  const heavy = cellCenter(layout.heavyPedestal);
  overlay.rect(heavy.x - 12, heavy.y - 8, 24, 14).fill({ color: 0x2d3f50 });
  overlay.rect(heavy.x - 12, heavy.y - 8, 24, 14).stroke({ color: 0xf2c66d, width: 2 });
  if (sifting.heavyPedestal) {
    drawSeedGlyph('gold', heavy.x, heavy.y - 14, 8);
  } else {
    overlay.circle(heavy.x, heavy.y - 2, 6).stroke({ color: 0xf2c66d, width: 1.5, alpha: 0.7 });
  }

  // Gate: barred slab until both pedestals are satisfied.
  const gate = cellCenter(layout.gate);
  if (!gateIsOpen(sifting)) {
    overlay.rect(gate.x - 15, gate.y - 14, 30, 26).fill({ color: 0x4d5a6a, alpha: 0.95 });
    for (let bar = -9; bar <= 9; bar += 6) {
      overlay.moveTo(gate.x + bar, gate.y - 14).lineTo(gate.x + bar, gate.y + 12)
        .stroke({ color: 0x232d38, width: 3 });
    }
  } else {
    overlay.rect(gate.x - 15, gate.y - 14, 30, 26).stroke({ color: 0x8d99a8, width: 2, alpha: 0.35 });
  }

  // Carried seeds hover over the player.
  const position = playerPosition(state);
  const playerPoint = cellCenter(position);
  sifting.carried.forEach((kind, index) => {
    drawSeedGlyph(kind, playerPoint.x - 8 + index * 16, playerPoint.y - 26, 5);
  });
}

function trialComplete(): boolean {
  return gateIsOpen(sifting) && generatedGoalReached(playground, state);
}

function render(): void {
  const position = playerPosition(state);
  const carried = sifting.carried.length > 0
    ? `怀里：${sifting.carried.map((kind) => SEED_LABEL[kind]).join('、')}`
    : '怀里空空';
  const urnText = sifting.urn.length > 0 ? `祭坛里有 ${sifting.urn.length} 枚种子` : '祭坛空了';
  roomDescription.textContent = `${urnText} · ${carried} · 轻台 ${sifting.lightPedestal ? '✓' : '…'} 重台 ${sifting.heavyPedestal ? '✓' : '…'}`;
  roomStatus.textContent = trialComplete()
    ? 'SHRINE TRIAL COMPLETE'
    : `POSITION ${position.x},${position.y} · SEED ${world.seed}`;
  statusText.textContent = feedback ?? (trialComplete()
    ? '石门之后，风吹了进来。祭坛的秘密你已经读懂。'
    : '……');
  renderer.render(buildView());
  drawOverlay();
}

function currentCameraTarget(): { x: number; y: number } {
  const position = playerPosition(state);
  const cell = world.cells[position.y]?.[position.x];
  const point = projectOrthogonalCell(position.x, position.y, cell?.elevation ?? 0);
  return { x: point.x + ORTHO_TILE_SIZE / 2, y: point.y + ORTHO_TILE_SIZE / 2 };
}

function tryMove(direction: GeneratedDirection): void {
  const position = playerPosition(state);
  const delta = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  }[direction];
  const target = { x: position.x + delta.x, y: position.y + delta.y };
  if (!canEnterCell(layout, sifting, target)) {
    feedback = '石门紧闭。门楣上刻着两座石台的影子。';
    render();
    return;
  }
  const result = moveGeneratedPlayer(playground, state, direction);
  state = result.state;
  feedback = result.accepted ? null : '走不过去。';
  render();
}

function interact(): void {
  const position = playerPosition(state);
  const key = positionKey(position);
  if (key === positionKey(layout.urn)) {
    const result = sifting.carried.length > 0 ? tossIntoUrn(sifting) : siftFromUrn(sifting);
    sifting = result.state;
    feedback = result.message;
  } else if (key === positionKey(layout.lightPedestal)) {
    const result = placeOnPedestal(sifting, 'light');
    sifting = result.state;
    feedback = result.message;
  } else if (key === positionKey(layout.heavyPedestal)) {
    const result = placeOnPedestal(sifting, 'heavy');
    sifting = result.state;
    feedback = result.message;
  } else {
    feedback = '这里没有可以互动的东西。（祭坛=投入/取出，石台=安放）';
  }
  render();
}

function drop(): void {
  const result = dropCarried(sifting);
  sifting = result.state;
  feedback = result.message;
  render();
}

function resetRun(): void {
  state = playground.initialState;
  sifting = createInitialSiftingState();
  camera = currentCameraTarget();
  feedback = '试炼重置。';
  render();
}

function newSeed(): void {
  seed += 1;
  world = generateGeneratedWorld(seed);
  playground = createGeneratedPlayground(world);
  state = playground.initialState;
  layout = createSiftingLayout(world.finalPath, world.goal);
  sifting = createInitialSiftingState();
  camera = currentCameraTarget();
  feedback = `新的世界 · SEED ${seed}`;
  render();
}

void (async () => {
  try {
    const host: PixiHostHandle = await createPixiHost(canvasRoot, {
      width: 960,
      height: 600,
      backgroundColor: world.palette.sky,
    });
    const orthogonalTextures: OrthogonalTextureSet = await loadOrthogonalTextures();
    renderer = createOrthogonalScene(host.scene, {}, orthogonalTextures);
    overlay = new Graphics();
    overlay.label = 'SiftingShrineOverlay';
    host.scene.layers.effects.addChild(overlay);
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
        interact();
        return;
      }
      if (key === 'g') {
        event.preventDefault();
        drop();
        return;
      }
      if (key === 'r') {
        event.preventDefault();
        resetRun();
        return;
      }
      if (key === 'n') {
        event.preventDefault();
        newSeed();
        return;
      }
      if (key === '[') {
        event.preventDefault();
        zoom = Math.min(1, Math.max(0.24, zoom - 0.04));
        renderer.setCamera(camera.x, camera.y, zoom);
        return;
      }
      if (key === ']') {
        event.preventDefault();
        zoom = Math.min(1, Math.max(0.24, zoom + 0.04));
        renderer.setCamera(camera.x, camera.y, zoom);
        return;
      }
      const direction: GeneratedDirection | null =
        key === 'w' || key === 'arrowup' ? 'up'
          : key === 's' || key === 'arrowdown' ? 'down'
            : key === 'a' || key === 'arrowleft' ? 'left'
              : key === 'd' || key === 'arrowright' ? 'right'
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
    root.textContent = 'Failed to create sifting shrine prototype';
  }
})();

export {};

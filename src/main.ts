import './style.css';
import { Graphics } from 'pixi.js';
import {
  generateGeneratedWorld,
  type GeneratedWorld,
} from '@/world/generated-world';
import type { Position } from '@/world/types';
import {
  createGeneratedPlayground,
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
  castFrost,
  createInitialFrostState,
  findFrostTrial,
  isFrozen,
  tryMoveFrost,
  type FrostTrial,
  type FrostVesselState,
} from '@/experiments/frost-vessel/mechanic';

/**
 * NIGHT PROTOTYPE C — 冻泉法器 (Frost Vessel)
 * Terrain state rewrite: F freezes nearby water into walkable ice; every step
 * wears the ice down; standing on ice when it melts drowns you and shatters
 * the spell. The river's heart holds a treasure that demands a relay of casts.
 */

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) {
  throw new Error('Missing #app');
}

const DEFAULT_SEED = 2026;
const MAX_TRIAL_SEARCH = 40;

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
    <span class="brand-mark">❄</span>
    <div>
      <p class="eyebrow">NIGHT PROTOTYPE C · TERRAIN STATE REWRITE</p>
      <h1>冻泉法器 <span>· Frost Vessel</span></h1>
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
    <p class="section-label">FROST TRIAL</p>
    <h2 id="room-title">冻泉法器</h2>
    <p id="room-description" class="room-description"></p>
    <p id="room-status" class="room-status"></p>
  </div>
  <div class="panel-section legend-section">
    <p class="section-label">FIELD NOTES</p>
    <div class="legend-line"><span class="legend-dot" style="background:#bfe9ff"></span><span>冰：F 把身边的水冻成可走的冰</span></div>
    <div class="legend-line"><span class="legend-dot" style="background:#f2c66d"></span><span>河心珠：在水的深处，等着你</span></div>
    <div class="legend-line"><span class="legend-dot" style="background:#9fb6c9"></span><span>冰每走一步就变脆；寿命将尽的冰会裂开</span></div>
    <div class="legend-line"><span class="legend-dot" style="background:#e05a4e"></span><span>落水：冰碎时还站在上面，会被冲回岸边</span></div>
  </div>
`;

const controls = document.createElement('footer');
controls.className = 'controls-bar';
controls.innerHTML = `
  <span><kbd>W A S D</kbd> / <kbd>← ↑ ↓ →</kbd> move</span>
  <span><kbd>F</kbd> 凝霜（冻结身边的水）</span>
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

function findTrialSeed(start: number): { readonly seed: number; readonly trial: FrostTrial } {
  for (let offset = 0; offset < MAX_TRIAL_SEARCH; offset += 1) {
    const candidate = start + offset;
    const world = generateGeneratedWorld(candidate);
    const trial = findFrostTrial(world);
    if (trial) {
      return { seed: candidate, trial };
    }
  }
  throw new Error(`No frost trial found in seeds ${start}..${start + MAX_TRIAL_SEARCH - 1}`);
}

let seed = readSeed();
let trialSetup = findTrialSeed(seed);
seed = trialSetup.seed;
let world: GeneratedWorld = generateGeneratedWorld(seed);
let trial: FrostTrial = trialSetup.trial;
let playground: GeneratedPlayground = createGeneratedPlayground(world, trial.spawn);
let state = playground.initialState;
let frost: FrostVesselState = createInitialFrostState();
let renderer: OrthogonalSceneRenderer;
let overlay: Graphics;
let zoom = 0.72;
let camera = projectOrthogonalCell(trial.spawn.x, trial.spawn.y, 0);
let feedback: string | null =
  '河心深处有什么在发光——但那片水，走不过去。试试按 F 凝霜。';

function cellCenter(position: Position): { x: number; y: number } {
  const cell = world.cells[position.y]?.[position.x];
  const point = projectOrthogonalCell(position.x, position.y, cell?.elevation ?? 0);
  return { x: point.x + ORTHO_TILE_SIZE / 2, y: point.y + ORTHO_TILE_SIZE / 2 };
}

function drawOverlay(): void {
  overlay.clear();

  // Frost patch: opaque pale ice that reads clearly against the river.
  for (const [key, life] of Object.entries(frost.frozen)) {
    const [x, y] = key.split(',').map(Number);
    const center = cellCenter({ x, y });
    const fragile = life <= 1;
    const alpha = fragile ? 0.85 : 0.95;
    overlay.rect(center.x - 16, center.y - 16, 32, 32).fill({ color: 0xf2faff, alpha });
    overlay.rect(center.x - 16, center.y - 16, 32, 32).stroke({
      color: fragile ? 0x556b82 : 0x7aa6c8,
      width: fragile ? 2.5 : 2,
      alpha: 1,
    });
    if (fragile) {
      overlay.moveTo(center.x - 12, center.y - 10).lineTo(center.x + 12, center.y + 10)
        .stroke({ color: 0x556b82, width: 2.5, alpha: 1 });
      overlay.moveTo(center.x + 12, center.y - 10).lineTo(center.x - 12, center.y + 10)
        .stroke({ color: 0x556b82, width: 2.5, alpha: 1 });
    } else {
      overlay.circle(center.x, center.y, 4).fill({ color: 0xffffff, alpha: 0.9 });
    }
  }

  // The river-heart treasure: a warm gold gem that contrasts with the ice.
  if (!frost.treasureTaken) {
    const center = cellCenter(trial.treasure);
    overlay.poly([
      { x: center.x, y: center.y - 12 },
      { x: center.x + 10, y: center.y },
      { x: center.x, y: center.y + 12 },
      { x: center.x - 10, y: center.y },
    ]).fill({ color: 0xf2c66d, alpha: 0.95 });
    overlay.circle(center.x, center.y, 4).fill({ color: 0xfff2c8 });
    overlay.circle(center.x, center.y, 14).stroke({ color: 0xf2c66d, width: 1.5, alpha: 0.5 });
  }
}

function buildView() {
  const position = playerPosition(state);
  const cell = world.cells[position.y]?.[position.x];
  return {
    room: {
      id: `frost-${world.seed}`,
      title: 'Frost Vessel',
      description: 'Night prototype C',
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
      node: { id: 'treasure', x: trial.treasure.x, y: trial.treasure.y, label: '河心珠' },
      exits: [],
      connectors: [],
      start: { x: trial.spawn.x, y: trial.spawn.y, label: 'start' },
      goal: { x: trial.treasure.x, y: trial.treasure.y, label: '河心珠' },
      environment: world.environment,
      palette: world.palette,
    },
    player: { x: position.x, y: position.y, elevation: cell?.elevation ?? 0 },
    windMarks: {},
    goalReached: frost.treasureTaken,
  };
}

function trialComplete(): boolean {
  return frost.treasureTaken;
}

function render(): void {
  const position = playerPosition(state);
  const frozenCount = Object.keys(frost.frozen).length;
  roomDescription.textContent = trialComplete()
    ? '河心珠入手。冰晶随着你的呼吸渐渐散去——你可以随便逛逛，或按 R 再来一次。'
    : `珠子就在水心（${trial.treasure.x}, ${trial.treasure.y}）。直接下水不行；按 F 把身边的水冻成冰，踩上去，再用 F 继续往前。`;
  roomStatus.textContent = trialComplete()
    ? `✦ 河心珠已取 · 落水 ${frost.drownCount} 次 · SEED ${world.seed}`
    : `冰 ${frozenCount} 格 · 落水 ${frost.drownCount} 次 · SEED ${world.seed}`;
  statusText.textContent = feedback ?? (trialComplete()
    ? '✦ 你拿到了河心珠！冰上的每一步都是预算——你学会了在冰化之前抵达。'
    : isFrozen(frost, position)
      ? '脚下是冰。冰会随你的每一步变脆——别停太久。'
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
  const result = tryMoveFrost(playground, state, frost, direction, trial.treasure);
  state = result.worldState;
  frost = result.state;
  if (!result.accepted) {
    feedback = '水太深了。脚下没有冰，也没有路。按 F 凝霜试试。';
  } else if (result.event === 'drowned') {
    feedback = '冰在你脚下碎裂——你掉进水里，被冲回了岸边。整片霜都散了。';
  } else if (result.event === 'took-treasure') {
    feedback = '✦ 指尖触到河心珠——冰晶的寒意裹住了它，你拿到了！';
  } else {
    feedback = null;
  }
  render();
}

function castFrostNow(): void {
  if (trialComplete()) {
    feedback = '河心珠已经到手。冰霜之泉仍然回应着你——随便玩玩吧。';
  } else {
    const result = castFrost(frost, world, playerPosition(state));
    if (result.frozenCount === 0) {
      feedback = '身边没有可冻结的水。';
    } else {
      feedback = `霜气漫开，${result.frozenCount} 格水面凝成了冰。每走一步，冰都会变脆。`;
    }
    frost = result.state;
  }
  render();
}

function resetRun(): void {
  state = playground.initialState;
  frost = createInitialFrostState();
  camera = currentCameraTarget();
  feedback = '霜雾散尽，河流回到原样。再来一次。';
  render();
}

function newSeed(): void {
  trialSetup = findTrialSeed(seed + 1);
  seed = trialSetup.seed;
  world = generateGeneratedWorld(seed);
  trial = trialSetup.trial;
  playground = createGeneratedPlayground(world, trial.spawn);
  state = playground.initialState;
  frost = createInitialFrostState();
  camera = projectOrthogonalCell(trial.spawn.x, trial.spawn.y, 0);
  feedback = `新的水脉 · SEED ${seed} · 珠子在水心 (${trial.treasure.x}, ${trial.treasure.y})`;
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
    overlay.label = 'FrostVesselOverlay';
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
      if (key === 'f') {
        event.preventDefault();
        castFrostNow();
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
    root.textContent = 'Failed to create frost vessel prototype';
  }
})();

export {};

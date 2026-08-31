import './style.css';
import { Graphics } from 'pixi.js';
import {
  generateGeneratedWorld,
  type GeneratedWorld,
} from '@/world/generated-world';
import { applyScopedOperation } from '@/world/operation';
import type { ObjectState, Position } from '@/world/types';
import {
  createGeneratedPlayground,
  GENERATED_PLAYER_ID,
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
  collapseAfterMove,
  createEchoLayout,
  createInitialEchoState,
  gateIsOpen,
  isCollapsed,
  isStranded,
  placeEcho,
  pullLever,
  recallEcho,
  samePosition,
  type EchoLayout,
  type EchoState,
} from '@/experiments/echo-anchor/mechanic';

/**
 * NIGHT PROTOTYPE B — 回声锚点 (Echo Anchor)
 * Player-state verb: anchor an echo (Q), snap back to it (Q again).
 * A fragile bridge collapses behind you; the lever past the bridge opens the
 * gate before the goal. The echo is the repair for the destroyed way back.
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
      <p class="eyebrow">NIGHT PROTOTYPE B · PLAYER STATE / BACKTRACKING</p>
      <h1>回声锚点 <span>· Echo Anchor</span></h1>
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
    <p class="section-label">ECHO TRIAL</p>
    <h2 id="room-title">回声锚点</h2>
    <p id="room-description" class="room-description"></p>
    <p id="room-status" class="room-status"></p>
  </div>
  <div class="panel-section legend-section">
    <p class="section-label">FIELD NOTES</p>
    <div class="legend-line"><span class="legend-dot" style="background:#9be8ff"></span><span>回声：Q 放下，再按 Q 回到它身边</span></div>
    <div class="legend-line"><span class="legend-dot" style="background:#b07a45"></span><span>木板桥：走过就会塌</span></div>
    <div class="legend-line"><span class="legend-dot" style="background:#f0975c"></span><span>扳杆：E 扳动，打开远处的石门</span></div>
    <div class="legend-line"><span class="legend-dot" style="background:#8d99a8"></span><span>石门：挡在你和目标之间</span></div>
  </div>
`;

const controls = document.createElement('footer');
controls.className = 'controls-bar';
controls.innerHTML = `
  <span><kbd>W A S D</kbd> / <kbd>← ↑ ↓ →</kbd> move</span>
  <span><kbd>Q</kbd> echo 放置/返回</span>
  <span><kbd>E</kbd> pull lever</span>
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
let layout: EchoLayout = createEchoLayout(world.finalPath);
let echo: EchoState = createInitialEchoState();
let renderer: OrthogonalSceneRenderer;
let overlay: Graphics;
let zoom = 0.72;
let camera = projectOrthogonalCell(world.start.x, world.start.y, 0);
let feedback: string | null = '石门挡住了目标。桥那头有一根扳杆——但桥，看起来不太结实。';

function buildView() {
  const position = playerPosition(state);
  const cell = world.cells[position.y]?.[position.x];
  return {
    room: {
      id: `echo-${world.seed}`,
      title: 'Echo Anchor',
      description: 'Night prototype B',
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
      node: { id: 'goal', x: layout.goal.x, y: layout.goal.y, label: 'goal' },
      exits: [],
      connectors: [],
      start: { x: world.start.x, y: world.start.y, label: 'start' },
      goal: { x: layout.goal.x, y: layout.goal.y, label: 'goal' },
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

function drawOverlay(): void {
  overlay.clear();

  // Bridge planks (or dark holes where they collapsed).
  for (const plank of layout.bridge) {
    const center = cellCenter(plank);
    if (isCollapsed(echo, plank)) {
      overlay.rect(center.x - 15, center.y - 15, 30, 30).fill({ color: 0x0b111c, alpha: 0.92 });
      overlay.rect(center.x - 15, center.y - 15, 30, 30).stroke({ color: 0x31404f, width: 1, alpha: 0.6 });
    } else {
      overlay.rect(center.x - 15, center.y - 13, 30, 26).fill({ color: 0xb07a45, alpha: 0.9 });
      overlay.moveTo(center.x - 15, center.y - 4).lineTo(center.x + 15, center.y - 4)
        .stroke({ color: 0x7a4f2a, width: 2 });
      overlay.moveTo(center.x - 15, center.y + 5).lineTo(center.x + 15, center.y + 5)
        .stroke({ color: 0x7a4f2a, width: 2 });
    }
  }

  // Lever.
  const lever = cellCenter(layout.lever);
  overlay.circle(lever.x, lever.y + 6, 7).fill({ color: 0x4d5a6a });
  const leverTilt = echo.leverPulled ? 10 : -6;
  overlay.moveTo(lever.x, lever.y + 4).lineTo(lever.x + leverTilt, lever.y - 12)
    .stroke({ color: 0xf0975c, width: 4 });
  overlay.circle(lever.x + leverTilt, lever.y - 12, 5).fill({ color: 0xf0975c });

  // Gate.
  const gate = cellCenter(layout.gate);
  if (!gateIsOpen(echo)) {
    overlay.rect(gate.x - 15, gate.y - 14, 30, 26).fill({ color: 0x4d5a6a, alpha: 0.95 });
    for (let bar = -9; bar <= 9; bar += 6) {
      overlay.moveTo(gate.x + bar, gate.y - 14).lineTo(gate.x + bar, gate.y + 12)
        .stroke({ color: 0x232d38, width: 3 });
    }
  } else {
    overlay.rect(gate.x - 15, gate.y - 14, 30, 26).stroke({ color: 0x8d99a8, width: 2, alpha: 0.35 });
  }

  // Echo ghost.
  if (echo.echo) {
    const ghost = cellCenter(echo.echo);
    overlay.circle(ghost.x, ghost.y - 4, 11).fill({ color: 0x9be8ff, alpha: 0.28 });
    overlay.circle(ghost.x, ghost.y - 4, 11).stroke({ color: 0x9be8ff, width: 2, alpha: 0.9 });
    overlay.circle(ghost.x, ghost.y - 8, 3).fill({ color: 0x9be8ff, alpha: 0.9 });
    overlay.moveTo(ghost.x - 16, ghost.y + 10).lineTo(ghost.x + 16, ghost.y + 10)
      .stroke({ color: 0x9be8ff, width: 1.5, alpha: 0.5 });
  }
}

function trialComplete(): boolean {
  return samePosition(playerPosition(state), layout.goal);
}

function render(): void {
  const position = playerPosition(state);
  roomDescription.textContent = echo.echo
    ? `回声锚定在 (${echo.echo.x}, ${echo.echo.y}) · 扳杆 ${echo.leverPulled ? '已扳动' : '未扳动'} · 塌板 ${echo.collapsedKeys.length}`
    : `尚未锚定回声 · 扳杆 ${echo.leverPulled ? '已扳动' : '未扳动'} · 塌板 ${echo.collapsedKeys.length}`;
  roomStatus.textContent = trialComplete()
    ? 'ECHO TRIAL COMPLETE'
    : `POSITION ${position.x},${position.y} · SEED ${world.seed}`;
  statusText.textContent = feedback ?? (trialComplete()
    ? '你回到了门这边，目标就在眼前。回声消散了。'
    : isStranded(layout, echo, position)
      ? '桥塌了，回头路没了……没有回声可以返回。按 R 重来，或试试绕远路。'
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
  if (!canEnterCell(layout, echo, target)) {
    feedback = isCollapsed(echo, target)
      ? '那块木板已经塌了，下面是黑的。'
      : '石门紧闭。门那边透出目标的光。';
    render();
    return;
  }
  const before = playerPosition(state);
  const result = moveGeneratedPlayer(playground, state, direction);
  state = result.state;
  if (result.accepted) {
    const after = playerPosition(state);
    const nextEcho = collapseAfterMove(layout, echo, before, after);
    if (nextEcho !== echo) {
      feedback = '身后的木板咔嚓一声塌了下去。';
    } else {
      feedback = null;
    }
    echo = nextEcho;
  } else {
    feedback = '走不过去。';
  }
  render();
}

function toggleEcho(): void {
  if (echo.echo) {
    const result = recallEcho(echo);
    if (!result.ok) {
      return;
    }
    echo = result.state;
    const operation = applyScopedOperation(state, playground.scope, (context) => {
      const player = context.state.objects[GENERATED_PLAYER_ID];
      if (!player || player.kind !== 'main-character') {
        throw new Error('Echo prototype player is missing');
      }
      const nextPlayer: ObjectState = {
        ...player,
        position: { ...result.destination },
      };
      return {
        changes: [{ objectId: GENERATED_PLAYER_ID, state: nextPlayer }],
        events: [{ tag: 'moved', objectId: GENERATED_PLAYER_ID }],
      };
    });
    if (operation.accepted) {
      state = operation.state;
      feedback = '世界一闪——你回到了回声身边，它轻轻散开。';
    }
  } else {
    echo = placeEcho(echo, playerPosition(state));
    feedback = '回声留下了。它安静地站在你原来的位置。';
  }
  render();
}

function interact(): void {
  const position = playerPosition(state);
  if (samePosition(position, layout.lever) && !echo.leverPulled) {
    echo = pullLever(layout, echo, position);
    feedback = '扳杆沉重地倒下。远处传来石门开启的轰隆声。';
  } else if (samePosition(position, layout.lever)) {
    feedback = '扳杆已经倒下了。';
  } else {
    feedback = '这里没有可以互动的东西。';
  }
  render();
}

function resetRun(): void {
  state = playground.initialState;
  echo = createInitialEchoState();
  camera = currentCameraTarget();
  feedback = '试炼重置。';
  render();
}

function newSeed(): void {
  seed += 1;
  world = generateGeneratedWorld(seed);
  playground = createGeneratedPlayground(world);
  state = playground.initialState;
  layout = createEchoLayout(world.finalPath);
  echo = createInitialEchoState();
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
    overlay.label = 'EchoAnchorOverlay';
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
      if (key === 'q') {
        event.preventDefault();
        toggleEcho();
        return;
      }
      if (key === 'e' || key === ' ') {
        event.preventDefault();
        interact();
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
    root.textContent = 'Failed to create echo anchor prototype';
  }
})();

export {};

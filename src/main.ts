import './style.css';
import { genRoom } from '@/world/gen-room';
import { reachablePositions } from '@/world/analyze';
import {
  createGameState,
  reduceGame,
  type Direction,
  type GameState,
} from '@/gameplay/game';
import { createPixiHost } from '@/rendering/pixi-host';
import {
  createTopDownScene,
  type TopDownRoomView,
} from '@/rendering/top-down-scene';
import type { Room } from '@/world/room';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Missing #app');
}

const DEFAULT_SEED = 2026;

function readSeed(): number {
  const raw = new URLSearchParams(window.location.search).get('seed');
  const parsed = raw === null ? DEFAULT_SEED : Number(raw);

  return Number.isInteger(parsed) && Number.isFinite(parsed)
    ? parsed
    : DEFAULT_SEED;
}

function writeSeed(seed: number): void {
  const url = new URL(window.location.href);
  url.searchParams.set('seed', String(seed));
  window.history.replaceState(null, '', url);
}

const shell = document.createElement('main');
shell.className = 'adventure-shell';

const header = document.createElement('header');
header.className = 'game-header';
header.innerHTML = `
  <div class="brand-lockup">
    <span class="brand-mark">✦</span>
    <div>
      <p class="eyebrow">ROOM → MECHANIC → PLAY</p>
      <h1>2D Room Lab</h1>
    </div>
  </div>
  <span class="world-mode-label">PURE 2D</span>
`;

const stage = document.createElement('section');
stage.className = 'stage-shell';

const canvasRoot = document.createElement('div');
canvasRoot.className = 'canvas-root';

const sidePanel = document.createElement('aside');
sidePanel.className = 'side-panel';
sidePanel.innerHTML = `
  <div class="panel-section location-section">
    <p class="section-label">GENERATED ROOM</p>
    <h2 id="room-title">Seed ${readSeed()}</h2>
    <p id="room-description" class="room-description">
      A deterministic 40 × 40 room. Ground describes the place;
      gameplay decides where the player may enter.
    </p>
    <p id="room-status" class="room-status"></p>
  </div>
  <div class="panel-section legend-section">
    <p class="section-label">FIELD NOTES</p>
    <div class="legend-line"><span class="legend-dot start-dot"></span><span>player</span></div>
    <div class="legend-line"><span class="legend-dot goal-dot"></span><span>goal</span></div>
  </div>
`;

const controls = document.createElement('footer');
controls.className = 'controls-bar';
controls.innerHTML = `
  <span><kbd>W A S D</kbd> / <kbd>← ↑ ↓ →</kbd> move</span>
  <span><kbd>R</kbd> reset</span>
  <span><kbd>N</kbd> next seed</span>
`;

stage.append(canvasRoot, sidePanel);
shell.append(header, stage, controls);
root.replaceChildren(shell);

const roomTitle = sidePanel.querySelector<HTMLHeadingElement>('#room-title');
const roomStatus =
  sidePanel.querySelector<HTMLParagraphElement>('#room-status');

if (!roomTitle || !roomStatus) {
  throw new Error('Room UI failed to initialize');
}

let seed = readSeed();
let room: Room = genRoom(seed);
let state: GameState = createGameState(room);

const host = await createPixiHost(canvasRoot);
const renderer = createTopDownScene(host.scene);

function toView(
  currentRoom: Room,
  currentState: GameState,
): TopDownRoomView {
  return {
    width: currentRoom.width,
    height: currentRoom.height,
    cells: currentRoom.cells,
    player: currentState.player,
    goal: currentRoom.goal,
  };
}

function render(): void {
  renderer.render(toView(room, state));
  renderer.focus(state.player);
  roomTitle.textContent = `Seed ${seed}`;

  const reachable = reachablePositions(room).length;
  roomStatus.textContent = state.goalReached
    ? `GOAL REACHED · ${state.player.x},${state.player.y} · ${reachable} reachable cells`
    : `${state.player.x},${state.player.y} · ${reachable} reachable cells`;
}

function resetForSeed(nextSeed: number): void {
  seed = nextSeed;
  room = genRoom(seed);
  state = createGameState(room);
  writeSeed(seed);
  render();
}

const KEY_TO_DIRECTION: Readonly<Record<string, Direction>> = {
  w: 'up',
  arrowup: 'up',
  d: 'right',
  arrowright: 'right',
  s: 'down',
  arrowdown: 'down',
  a: 'left',
  arrowleft: 'left',
};

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  const direction = KEY_TO_DIRECTION[key];

  if (direction) {
    event.preventDefault();
    state = reduceGame(room, state, {
      type: 'move',
      direction,
    });
    render();
    return;
  }

  if (key === 'r') {
    state = reduceGame(room, state, { type: 'reset' });
    render();
    return;
  }

  if (key === 'n') {
    resetForSeed(seed + 1);
  }
});

render();

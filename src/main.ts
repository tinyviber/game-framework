import './style.css';
import { adventureCatalog } from '@/data/adventure/catalog';
import {
  adventureIsComplete,
  applyAdventureAction,
  createAdventureState,
  resolveAdventureExit,
  type AdventureDirection,
  type AdventureRoom,
  type AdventureState,
} from '@/world/adventure';
import { createFadeOverlay } from '@/rendering/fade';
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

const shell = document.createElement('main');
shell.className = 'adventure-shell';

const header = document.createElement('header');
header.className = 'game-header';
header.innerHTML = `
  <div class="brand-lockup">
    <span class="brand-mark">✦</span>
    <div>
      <p class="eyebrow">A 2.5D WIND ATLAS</p>
      <h1>风场织线 <span>· Windweave</span></h1>
    </div>
  </div>
  <div class="progress-block">
    <span id="progress-label">WIND MARKS 00 / 20</span>
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
    <p class="section-label">CURRENT THREAD</p>
    <h2 id="room-title">Moss Gate</h2>
    <p id="room-description" class="room-description"></p>
    <p id="room-status" class="room-status"></p>
  </div>
  <div class="panel-section map-section">
    <div class="section-row"><p class="section-label">ATLAS GRID</p><span class="grid-tag">4 × 5</span></div>
    <div id="minimap" class="minimap" aria-label="20 room atlas"></div>
  </div>
  <div class="panel-section legend-section">
    <p class="section-label">FIELD NOTES</p>
    <div class="legend-line"><span class="legend-dot node-dot"></span><span>wind node</span></div>
    <div class="legend-line"><span class="legend-dot exit-dot"></span><span>adjacent passage</span></div>
    <div class="legend-line"><span class="legend-dot mark-dot"></span><span>thread awakened</span></div>
  </div>
`;

const controls = document.createElement('footer');
controls.className = 'controls-bar';
controls.innerHTML = `
  <span><kbd>W A S D</kbd> / <kbd>← ↑ ↓ →</kbd> move</span>
  <span><kbd>E</kbd> resonate / speak</span>
  <span><kbd>R</kbd> reset room</span>
  <span><kbd>[ ]</kbd> zoom</span>
  <span id="hint-text" class="hint-text">Find a wind node. The atlas is yours to cross.</span>
`;

const dialogue = document.createElement('div');
dialogue.id = 'dialogue';
dialogue.className = 'dialogue-panel';
dialogue.hidden = true;
dialogue.setAttribute('role', 'status');

stage.append(canvasRoot, sidePanel);

const status = document.createElement('p');
status.id = 'game-status';

shell.append(header, stage, controls, dialogue, status);
root.replaceChildren(shell);

const title = header.querySelector<HTMLHeadingElement>('h1')!;
const progressLabel = header.querySelector<HTMLSpanElement>('#progress-label')!;
const progressFill = header.querySelector<HTMLElement>('#progress-fill')!;
const roomTitle = sidePanel.querySelector<HTMLHeadingElement>('#room-title')!;
const roomDescription = sidePanel.querySelector<HTMLParagraphElement>('#room-description')!;
const roomStatus = sidePanel.querySelector<HTMLParagraphElement>('#room-status')!;
const minimap = sidePanel.querySelector<HTMLDivElement>('#minimap')!;
const hintText = controls.querySelector<HTMLSpanElement>('#hint-text')!;

if (!title || !progressLabel || !progressFill || !roomTitle || !roomDescription || !roomStatus || !minimap || !hintText) {
  throw new Error('Adventure UI failed to initialize');
}

const roomById = (roomId: string): AdventureRoom => {
  const room = adventureCatalog.rooms[roomId];
  if (!room) {
    throw new Error(`Unknown adventure room ${roomId}`);
  }
  return room;
};

let currentRoom = roomById(adventureCatalog.startRoomId);
let state: AdventureState = createAdventureState(currentRoom);
let renderer: ReturnType<typeof createIsometricScene>;
let fade: ReturnType<typeof createFadeOverlay>;
let zoom = 0.9;
let camera = projectIsoCell(state.player.x, state.player.y);

const dialoguePages: string[] = [];
let dialoguePage = 0;

function setHint(message: string, duration = 2600): void {
  hintText.textContent = message;
  window.setTimeout(() => {
    if (hintText.textContent === message) {
      hintText.textContent = 'Find a wind node. The atlas is yours to cross.';
    }
  }, duration);
}

function showDialogue(pages: readonly string[]): void {
  dialoguePages.splice(0, dialoguePages.length, ...pages);
  dialoguePage = 0;
  dialogue.textContent = `${dialoguePages[0] ?? ''}  ·  [E] next`;
  dialogue.hidden = false;
}

function advanceDialogue(): void {
  dialoguePage += 1;
  if (dialoguePage >= dialoguePages.length) {
    dialogue.hidden = true;
    return;
  }
  dialogue.textContent = `${dialoguePages[dialoguePage] ?? ''}  ·  [E] next`;
}

function createRoomView(room: AdventureRoom): IsoRoomView {
  return {
    id: room.id,
    title: room.title,
    description: room.description,
    width: room.width,
    height: room.height,
    cells: room.cells,
    props: room.props,
    npcs: room.npcs,
    node: room.node,
    exits: room.exits.map((exit) => ({
      id: exit.id,
      direction: exit.direction,
      x: exit.at.x,
      y: exit.at.y,
    })),
    palette: room.palette,
  };
}

function buildView(): IsoSceneView {
  const cell = currentRoom.cells[state.player.y]?.[state.player.x];
  return {
    room: createRoomView(currentRoom),
    player: {
      x: state.player.x,
      y: state.player.y,
      elevation: cell?.elevation ?? 0,
    },
    windMarks: state.windMarks,
  };
}

function renderMinimap(): void {
  minimap.replaceChildren();
  for (const room of adventureCatalog.roomList) {
    const cell = document.createElement('span');
    cell.className = 'map-cell';
    cell.dataset.roomId = room.id;
    cell.title = `${room.id} · ${room.title}`;
    cell.textContent = room.id.slice(-2);
    minimap.append(cell);
  }
}

function render(): void {
  const count = Object.values(state.windMarks).filter(Boolean).length;
  const complete = adventureIsComplete(state, adventureCatalog);
  const roomIndex = adventureCatalog.roomList.findIndex((room) => room.id === currentRoom.id);
  const markIsLit = state.windMarks[currentRoom.id] === true;

  renderer.render(buildView());
  title.innerHTML = `风场织线 <span>· ${currentRoom.title}</span>`;
  roomTitle.textContent = currentRoom.title;
  roomDescription.textContent = currentRoom.description;
  roomStatus.textContent = `${currentRoom.id.toUpperCase()}  /  SECTOR ${String(roomIndex + 1).padStart(2, '0')}  ·  ${markIsLit ? 'THREAD AWAKENED' : 'THREAD DORMANT'}`;
  progressLabel.textContent = `WIND MARKS ${String(count).padStart(2, '0')} / 20`;
  progressFill.style.width = `${(count / adventureCatalog.roomList.length) * 100}%`;
  status.textContent = `${currentRoom.id} · position ${state.player.x},${state.player.y} · ${complete ? 'THE ATLAS IS BREATHING' : 'cross the adjacent rooms'}`;

  minimap.querySelectorAll<HTMLElement>('.map-cell').forEach((cell) => {
    const roomId = cell.dataset.roomId ?? '';
    cell.classList.toggle('active', roomId === currentRoom.id);
    cell.classList.toggle('marked', state.windMarks[roomId] === true);
  });

  if (complete) {
    setHint('All 20 wind marks are awake. The whole atlas is breathing.', 6000);
  }
}

function currentCameraTarget(): { x: number; y: number } {
  const cell = currentRoom.cells[state.player.y]?.[state.player.x];
  return projectIsoCell(state.player.x, state.player.y, cell?.elevation ?? 0);
}

function tryMove(direction: AdventureDirection): void {
  const result = applyAdventureAction(state, currentRoom, { kind: 'move', direction });
  state = result.state;
  render();

  if (!result.accepted) {
    setHint('The terrain holds. Find the brighter seam around it.', 1200);
    return;
  }

  const exit = resolveAdventureExit(state, currentRoom, adventureCatalog);
  if (exit.accepted && exit.roomId && exit.spawn) {
    pendingTransition = { roomId: exit.roomId, spawn: exit.spawn };
    fadePhase = 'closing';
  }
}

function tryInteract(): void {
  if (!dialogue.hidden) {
    advanceDialogue();
    return;
  }

  const result = applyAdventureAction(state, currentRoom, { kind: 'interact' });
  state = result.state;
  render();

  const event = result.events[0];
  if (event?.tag === 'activated') {
    setHint(`${currentRoom.node.label} · wind mark ${Object.values(state.windMarks).filter(Boolean).length} / 20`, 3600);
    return;
  }

  if (event?.tag === 'dialogue-progressed') {
    const npc = currentRoom.npcs.find(
      (candidate) => Math.abs(candidate.x - state.player.x) + Math.abs(candidate.y - state.player.y) === 1,
    );
    if (npc) {
      showDialogue([npc.name, npc.line]);
    }
    return;
  }

  setHint('Nothing resonates here yet. Stand beside a node or a traveler.', 1600);
}

function resetRoom(): void {
  state = applyAdventureAction(state, currentRoom, { kind: 'reset' }).state;
  camera = currentCameraTarget();
  render();
  setHint('Room reset. The wind marks you have lit remain yours.', 2200);
}

type FadePhase = 'idle' | 'closing' | 'opening';
let fadePhase: FadePhase = 'idle';
let pendingTransition: { roomId: string; spawn: { x: number; y: number } } | null = null;
const FADE_MS = 220;

function advanceFade(dtMs: number): void {
  if (fadePhase === 'closing') {
    fade.setAlpha(Math.min(1, fade.getAlpha() + dtMs / FADE_MS));
    if (fade.getAlpha() >= 1 && pendingTransition) {
      currentRoom = roomById(pendingTransition.roomId);
      state = createAdventureState(currentRoom, pendingTransition.spawn, state.windMarks);
      pendingTransition = null;
      camera = currentCameraTarget();
      render();
      fadePhase = 'opening';
    }
    return;
  }

  if (fadePhase === 'opening') {
    fade.setAlpha(Math.max(0, fade.getAlpha() - dtMs / FADE_MS));
    if (fade.getAlpha() <= 0) {
      fadePhase = 'idle';
    }
  }
}

function setZoom(nextZoom: number): void {
  zoom = Math.min(1.18, Math.max(0.72, nextZoom));
  renderer.setCamera(camera.x, camera.y, zoom);
}

void (async () => {
  try {
    const host = await createPixiHost(canvasRoot, {
      width: 960,
      height: 600,
      backgroundColor: currentRoom.palette.sky,
    });
    const textures: MarkTextureSet = await loadMarkTextures();
    renderer = createIsometricScene(host.scene, textures);
    fade = createFadeOverlay(host.ui);
    renderMinimap();
    render();

    host.app.ticker.add(() => {
      const target = currentCameraTarget();
      const amount = Math.min(1, host.app.ticker.deltaMS / 150);
      camera = {
        x: camera.x + (target.x - camera.x) * amount,
        y: camera.y + (target.y - camera.y) * amount,
      };
      renderer.setCamera(camera.x, camera.y, zoom);
      advanceFade(host.app.ticker.deltaMS);
    });

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (fadePhase !== 'idle') {
        return;
      }
      const key = event.key.toLowerCase();
      if (!dialogue.hidden) {
        if (key === 'e' || key === ' ') {
          event.preventDefault();
          advanceDialogue();
        }
        return;
      }
      if (key === 'e' || key === ' ') {
        event.preventDefault();
        tryInteract();
        return;
      }
      if (key === 'r') {
        event.preventDefault();
        resetRoom();
        return;
      }
      if (key === '[') {
        event.preventDefault();
        setZoom(zoom - 0.06);
        return;
      }
      if (key === ']') {
        event.preventDefault();
        setZoom(zoom + 0.06);
        return;
      }

      const direction: AdventureDirection | null =
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
    window.setTimeout(() => setHint('Move beside the heart-shaped node and press E to resonate.', 5000), 600);

    import.meta.hot?.dispose(() => {
      window.removeEventListener('keydown', handleKeyDown);
      host.destroy();
    });
  } catch (error) {
    console.error(error);
    root.textContent = 'Failed to create Windweave';
  }
})();

export {};

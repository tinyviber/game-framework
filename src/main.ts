import './style.css';
import room01Json from '@/data/rooms/room_01.json';
import room02Json from '@/data/rooms/room_02.json';
import room03Json from '@/data/rooms/room_03.json';
import hubJson from '@/data/rooms/hub.json';
import vaultJson from '@/data/rooms/vault.json';
import cellarJson from '@/data/rooms/cellar.json';
import dialogueJson from '@/data/dialogue.json';
import { parseTileRoom, type TileRoom } from '@/world/tilemap';
import {
  applyExternalFlag,
  applyTileOperation,
  createTileRoomState,
  extractCarriedState,
  type CarriedState,
  type TileEvent,
  type TileGameState,
} from '@/world/tile-world';
import {
  createDefaultFlagStore,
  getUserFlags,
  loadCarried,
  persistCarried,
  type FlagStore,
} from '@/world/flags';
import { createEventBus } from '@/world/event-bus';
import {
  resolveTileExit,
  type TileRoomCatalog,
} from '@/world/tile-transition';
import {
  tileCenterToPixels,
  updateCamera,
  type CameraState,
} from '@/world/camera';
import { createFadeOverlay } from '@/rendering/fade';
import { createPixiHost } from '@/rendering/pixi-host';
import {
  createTileSceneRenderer,
  TILE_SIZE,
  TILE_VIEWPORT,
  type TileSceneView,
} from '@/rendering/tile-scene';
import {
  loadTileTextures,
  setNearestFilter,
  type TileTextureSet,
} from '@/rendering/tile-textures';

declare global {
  interface Window {
    /**
     * Console debug command (Phase 3 DoD):
     *   setFlag('cellar-key', true) → opens lockedBy doors instantly.
     */
    setFlag(key: string, value: boolean): void;
    getFlags(): Readonly<Record<string, boolean>>;
  }
}

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Missing #app');
}

const status = document.createElement('p');
const canvasRoot = document.createElement('div');
const hint = document.createElement('p');
const dialogue = document.createElement('div');

status.id = 'game-status';
hint.id = 'game-hint';
dialogue.id = 'dialogue';
dialogue.hidden = true;
hint.textContent = 'WASD / 方向键 移动 · E 互动 · Z 对话';
root.replaceChildren(status, canvasRoot, hint, dialogue);

/** Room catalog: every JSON document under src/data/rooms. */
const rooms: TileRoomCatalog = {
  room_01: parseTileRoom(room01Json),
  room_02: parseTileRoom(room02Json),
  room_03: parseTileRoom(room03Json),
  hub: parseTileRoom(hubJson),
  vault: parseTileRoom(vaultJson),
  cellar: parseTileRoom(cellarJson),
};

const flagStore: FlagStore = createDefaultFlagStore();

let carried: CarriedState = loadCarried(flagStore);
let currentRoom: TileRoom = rooms['room_01']!;
let state: TileGameState = createTileRoomState(
  currentRoom,
  currentRoom.spawn,
  carried,
);
let camera: CameraState = { x: 0, y: 0 };

const bus = createEventBus<TileEvent>();

/**
 * ── Dialogue box (Phase 5 placeholder) ─────────────────────────
 * Pure DOM text box: Z opens (page 1), pages through, closes after
 * the last page. Input is ignored while it is open.
 */
const dialoguePages: readonly string[] =
  Array.isArray(dialogueJson.pages) && dialogueJson.pages.length > 0
    ? dialogueJson.pages.map((page: unknown) => String(page))
    : ['…'];

let dialoguePage = 0;

function dialogueVisible(): boolean {
  return !dialogue.hidden;
}

function showDialogue(): void {
  dialoguePage = 0;
  dialogue.textContent = dialoguePages[0] ?? '';
  dialogue.hidden = false;
}

function advanceDialogue(): void {
  dialoguePage += 1;

  if (dialoguePage >= dialoguePages.length) {
    dialogue.hidden = true;
    return;
  }

  dialogue.textContent = dialoguePages[dialoguePage] ?? '';
}

function describeEvents(events: readonly TileEvent[]): string {
  if (events.length === 0) {
    return '—';
  }

  return events
    .map((event) => {
      switch (event.tag) {
        case 'moved':
          return `moved (${event.x},${event.y})`;
        case 'pushed':
          return `pushed ${event.blockId}`;
        case 'blocked':
          return `blocked: ${event.reason}`;
        case 'door-opened':
          return `door ${event.doorId} opened`;
        case 'door-closed':
          return `door ${event.doorId} closed`;
        case 'plate-pressed':
          return `plate ${event.plateId} pressed`;
        case 'plate-released':
          return `plate ${event.plateId} released`;
        case 'lever-toggled':
          return `lever ${event.leverId} ${event.on ? 'on' : 'off'}`;
        case 'block-on-target':
          return `block ${event.blockId} on target!`;
        case 'chest-opened':
          return `chest ${event.chestId} → flag ${event.flag}`;
        case 'flag-set':
          return `flag ${event.key} = ${event.value}`;
        case 'interact-noop':
          return 'nothing to interact';
      }
    })
    .join(' · ');
}

function platePressed(id: string): boolean {
  const plate = currentRoom.pressurePlates.find(
    (entry) => entry.id === id,
  );

  if (!plate) {
    return false;
  }

  const onPlate =
    (state.player.x === plate.pos.x && state.player.y === plate.pos.y) ||
    Object.values(state.blocks).some(
      (block) =>
        block.x === plate.pos.x && block.y === plate.pos.y,
    );

  return onPlate;
}

function buildView(): TileSceneView {
  return {
    tiles: currentRoom.tiles,
    player: state.player,
    doors: currentRoom.doors.map((door) => ({
      id: door.id,
      x: door.pos.x,
      y: door.pos.y,
      open: state.doors[door.id]?.open ?? false,
    })),
    plates: currentRoom.pressurePlates.map((plate) => ({
      id: plate.id,
      x: plate.pos.x,
      y: plate.pos.y,
      pressed: platePressed(plate.id),
    })),
    levers: currentRoom.levers.map((lever) => ({
      id: lever.id,
      x: lever.pos.x,
      y: lever.pos.y,
      on: state.levers[lever.id]?.on ?? false,
    })),
    blocks: Object.entries(state.blocks).map(([id, block]) => ({
      id,
      x: block.x,
      y: block.y,
    })),
    chests: currentRoom.chests.map((chest) => ({
      id: chest.id,
      x: chest.pos.x,
      y: chest.pos.y,
      opened: state.chests[chest.id]?.opened ?? false,
    })),
  };
}

function snapCameraToPlayer(): void {
  camera = tileCenterToPixels(state.player, TILE_SIZE);
}

let renderer: ReturnType<typeof createTileSceneRenderer>;
let fade: ReturnType<typeof createFadeOverlay>;

function render(): void {
  renderer.render(buildView());
  status.textContent =
    `${currentRoom.id} · (${state.player.x},${state.player.y}) · ${describeEvents(state.lastEvents)}`;
}

function publishEvents(events: readonly TileEvent[]): void {
  for (const event of events) {
    bus.publish(event);
  }
}

function afterAccepted(events: readonly TileEvent[]): void {
  carried = extractCarriedState(state);
  persistCarried(flagStore, carried);
  publishEvents(events);
}

function setHint(text: string, ms = 2500): void {
  hint.textContent = text;
  window.setTimeout(() => {
    if (hint.textContent === text) {
      hint.textContent = 'WASD / 方向键 移动 · E 互动 · Z 对话';
    }
  }, ms);
}

function tryMove(direction: 'up' | 'down' | 'left' | 'right'): void {
  const result = applyTileOperation(state, currentRoom, {
    kind: 'move',
    direction,
  });

  state = result.state;
  render();

  if (!result.accepted) {
    if (
      result.events.some(
        (event) =>
          event.tag === 'blocked' &&
          event.reason === 'locked-door',
      )
    ) {
      setHint(
        "门锁住了……（占位提示：控制台 setFlag('flag名', true) 可开门）",
      );
    }
    return;
  }

  afterAccepted(result.events);

  if (result.events.some((event) => event.tag === 'block-on-target')) {
    setHint('方块到位！机关触发了。', 3000);
  }

  beginTransitionIfOnExit();
}

function tryInteract(): void {
  const result = applyTileOperation(state, currentRoom, {
    kind: 'interact',
  });

  state = result.state;
  render();

  if (result.accepted) {
    afterAccepted(result.events);
  }
}

/**
 * ── Room transitions: fade to black, swap room, fade back ──────
 * Player input is ignored while a transition runs.
 */
type FadePhase = 'idle' | 'closing' | 'opening';

const FADE_MS = 260;

let fadePhase: FadePhase = 'idle';
let pendingTransition: {
  roomId: string;
  spawn: { x: number; y: number };
} | null = null;

function beginTransitionIfOnExit(): void {
  if (fadePhase !== 'idle') {
    return;
  }

  const resolution = resolveTileExit(state, currentRoom, rooms);

  if (!resolution.accepted) {
    return;
  }

  pendingTransition = {
    roomId: resolution.roomId,
    spawn: resolution.spawn,
  };
  fadePhase = 'closing';
}

function advanceFade(dtMs: number): void {
  if (fadePhase === 'closing') {
    fade.setAlpha(Math.min(1, fade.getAlpha() + dtMs / FADE_MS));

    if (fade.getAlpha() >= 1 && pendingTransition) {
      const target = rooms[pendingTransition.roomId];

      if (target) {
        currentRoom = target;
        state = createTileRoomState(
          target,
          pendingTransition.spawn,
          carried,
        );
        snapCameraToPlayer();
        render();
      } else {
        setHint(
          `transition failed: unknown room ${pendingTransition.roomId}`,
        );
      }

      pendingTransition = null;
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

/**
 * ── EventBus subscribers (wiring only) ─────────────────────────
 */
bus.subscribe((event) => {
  if (event.tag === 'flag-set' && event.value) {
    status.textContent = `flag 已设置: ${event.key}`;
  }
});

void (async () => {
  try {
    const host = await createPixiHost(canvasRoot, {
      width: TILE_VIEWPORT.width,
      height: TILE_VIEWPORT.height,
      backgroundColor: 0x0b1120,
    });

    // Optional: if the Kenney sheet is present under public/assets,
    // sprites render; otherwise the flat-color fallback is used.
    const textures: TileTextureSet | null =
      await loadTileTextures('/assets/tiny-dungeon/tilemap_packed.png');

    setNearestFilter(textures);

    renderer = createTileSceneRenderer(host.scene, textures);
    fade = createFadeOverlay(host.ui);

    snapCameraToPlayer();
    render();
    showDialogue();

    host.app.ticker.add(() => {
      camera = updateCamera(
        camera,
        tileCenterToPixels(state.player, TILE_SIZE),
        {
          width: currentRoom.width * TILE_SIZE,
          height: currentRoom.height * TILE_SIZE,
        },
        TILE_VIEWPORT,
        0.18,
      );
      renderer.setCamera(camera.x, camera.y);
      advanceFade(host.app.ticker.deltaMS);
    });

    window.addEventListener('keydown', (event) => {
      if (fadePhase !== 'idle') {
        return;
      }

      if (dialogueVisible()) {
        if (event.key.toLowerCase() === 'z') {
          event.preventDefault();
          advanceDialogue();
        }
        return;
      }

      const key = event.key.toLowerCase();

      if (key === 'z') {
        event.preventDefault();
        showDialogue();
        return;
      }

      if (key === 'e' || key === ' ') {
        event.preventDefault();
        tryInteract();
        return;
      }

      const direction =
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
    });

    // ── Console debug commands (Phase 3 DoD) ────────────────────
    window.setFlag = (key, value): void => {
      flagStore.set(`flag:${key}`, value);

      if (state.flags[key] !== value) {
        state = applyExternalFlag(state, currentRoom, key, value);
        carried = extractCarriedState(state);
        persistCarried(flagStore, carried);
        publishEvents(state.lastEvents);
        render();
      }

      status.textContent = `setFlag('${key}', ${value}) → flag:${key}`;
    };

    window.getFlags = (): Readonly<Record<string, boolean>> =>
      getUserFlags(flagStore);

    status.textContent =
      '控制台调试: setFlag(\'cellar-key\', true) · getFlags()';

    import.meta.hot?.dispose(() => {
      host.destroy();
    });
  } catch (error) {
    console.error(error);
    root.textContent = 'Failed to create Pixi host';
  }
})();

export {};

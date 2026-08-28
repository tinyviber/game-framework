import './style.css';
import {
  ACTIVATOR_ID,
  applyChapter4Operation,
  initializeChapter4World,
  type Chapter4Operation,
} from '@/chapters/chapter-4/gate-yard';
import { createChapter6Renderer } from '@/chapters/chapter-6/pixi-view';
import { toChapter4WorldView } from '@/chapters/chapter-4/world-view';
import { createPixiHost } from '@/rendering/pixi-host';
import type { LocalWorldState } from '@/world/types';

/**
 * Raw player intent. DOM events map to PlayerAction; the dispatcher
 * translates PlayerAction into chapter-specific operations. Gameplay
 * code never sees DOM events and UI code never calls chapter rules
 * directly.
 */
type PlayerAction =
  | { readonly kind: 'move-right' }
  | { readonly kind: 'move-left' }
  | { readonly kind: 'activate-gate' }
  | { readonly kind: 'reset' };

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Missing #app');
}

const controls = document.createElement('div');
const status = document.createElement('p');
const moveRightButton = document.createElement('button');
const moveLeftButton = document.createElement('button');
const activateButton = document.createElement('button');
const resetButton = document.createElement('button');
const canvasRoot = document.createElement('div');

moveRightButton.textContent = 'Move right';
moveLeftButton.textContent = 'Move left';
activateButton.textContent = 'Activate gate';
resetButton.textContent = 'Reset';

controls.append(
  status,
  moveRightButton,
  moveLeftButton,
  activateButton,
  resetButton,
);
root.replaceChildren(controls, canvasRoot);

/** The only place that holds mutable browser-side game state. */
interface SessionController {
  worldState: LocalWorldState;
  dispatch(action: PlayerAction): void;
  render(): void;
}

void (async () => {
  try {
    const host = await createPixiHost(canvasRoot);
    const renderer = createChapter6Renderer(host.scene);

    const controller: SessionController = {
      worldState: initializeChapter4World({ spawnX: 0 }),

      dispatch(action): void {
        if (action.kind === 'reset') {
          this.worldState = initializeChapter4World({
            spawnX: 0,
          });
          this.render();
          return;
        }

        const operation = toChapter4Operation(action);

        if (!operation) {
          return;
        }

        const result = applyChapter4Operation(
          this.worldState,
          operation,
        );

        this.worldState = result.state;
        this.render();

        if (!result.accepted) {
          status.textContent =
            `operation rejected · ${result.reason.kind}`;
        }
      },

      render(): void {
        const view = toChapter4WorldView(this.worldState);

        renderer.render(view);

        status.textContent =
          `local world · ${this.worldState.roomId} · ${view.feedback.status}`;
      },
    };

    moveRightButton.addEventListener('click', () => {
      controller.dispatch({ kind: 'move-right' });
    });
    moveLeftButton.addEventListener('click', () => {
      controller.dispatch({ kind: 'move-left' });
    });
    activateButton.addEventListener('click', () => {
      controller.dispatch({ kind: 'activate-gate' });
    });
    resetButton.addEventListener('click', () => {
      controller.dispatch({ kind: 'reset' });
    });

    controller.render();

    import.meta.hot?.dispose(() => {
      host.destroy();
    });
  } catch (error) {
    console.error(error);
    root.textContent = 'Failed to create Pixi host';
  }
})();

function toChapter4Operation(
  action: PlayerAction,
): Chapter4Operation | null {
  switch (action.kind) {
    case 'move-right':
      return {
        kind: 'move-main-character',
        deltaX: 1,
      };
    case 'move-left':
      return {
        kind: 'move-main-character',
        deltaX: -1,
      };
    case 'activate-gate':
      return {
        kind: 'activate',
        targetId: ACTIVATOR_ID,
      };
    case 'reset':
      return null;
  }
}

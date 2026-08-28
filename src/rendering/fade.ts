import {
  Container,
  Graphics,
} from 'pixi.js';

export interface FadeOverlay {
  /** 0 = fully transparent, 1 = fully black. */
  setAlpha(alpha: number): void;
  getAlpha(): number;
  destroy(): void;
}

const FADE_SIZE = 4096;

/**
 * Full-screen black rectangle living on the UI layer, above the
 * world. Used for room-transition fade in/out.
 */
export function createFadeOverlay(
  ui: Container,
): FadeOverlay {
  const rect = new Graphics();

  rect.label = 'FadeOverlay';
  rect.rect(-FADE_SIZE / 2, -FADE_SIZE / 2, FADE_SIZE, FADE_SIZE);
  rect.fill({ color: 0x000000 });
  rect.alpha = 0;
  ui.addChild(rect);

  return {
    setAlpha(alpha: number): void {
      rect.alpha = Math.min(1, Math.max(0, alpha));
    },

    getAlpha(): number {
      return rect.alpha;
    },

    destroy(): void {
      rect.destroy();
    },
  };
}

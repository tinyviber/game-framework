/**
 * Single source of truth for the 2.5D cell-grid layout constants,
 * shared by view projections, the Pixi host config and the renderer.
 */
export const CELL_SIZE = 96;
export const ORIGIN_X = 80;
export const WORLD_Y = 220;

export const VIEWPORT = {
  width: 900,
  height: 440,
} as const;

export const BACKGROUND_COLOR = 0x111827;

export function cellToWorldX(cellX: number): number {
  return ORIGIN_X + cellX * CELL_SIZE;
}

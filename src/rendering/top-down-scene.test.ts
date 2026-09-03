import { describe, expect, it } from 'vitest';
import {
  projectTopDownCell,
  TOP_DOWN_TILE_SIZE,
} from './top-down-scene';

describe('top-down projection', () => {
  it('uses a direct orthogonal grid projection', () => {
    expect(projectTopDownCell(3, 5)).toEqual({
      x: 3 * TOP_DOWN_TILE_SIZE,
      y: 5 * TOP_DOWN_TILE_SIZE,
    });
  });
});

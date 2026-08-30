import { describe, expect, it } from 'vitest';
import {
  formatBlockedMovement,
  formatGeneratedInspection,
  isGeneratedDebugMode,
} from './generated-playground-ui';

describe('generated playground UI contract', () => {
  it('keeps blocked movement feedback exact and non-diagnostic', () => {
    expect(formatBlockedMovement()).toBe('MOVEMENT BLOCKED');
    expect(formatBlockedMovement()).not.toMatch(/route|barrier|path|height/i);
  });

  it('formats only factual local inspection data', () => {
    const text = formatGeneratedInspection({
      x: 3,
      y: 7,
      terrainType: 'dirt',
      regionId: 'region-west',
      biome: 'wetland',
      weather: 'rainy',
      lighting: 'dusk',
      elevation: 1,
      traversableDirections: ['up', 'right'],
    });
    expect(text).toContain('CELL 3,7');
    expect(text).toContain('TERRAIN dirt');
    expect(text).toContain('ELEVATION 1');
    expect(text).not.toMatch(/route|barrier|alternate|path length/i);
  });

  it('enables diagnostics only for the explicit debug query', () => {
    expect(isGeneratedDebugMode('')).toBe(false);
    expect(isGeneratedDebugMode('?debug=0')).toBe(false);
    expect(isGeneratedDebugMode('?debug=1')).toBe(true);
    expect(isGeneratedDebugMode('?seed=4&debug=1')).toBe(true);
  });
});

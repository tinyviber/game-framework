import { describe, expect, it } from 'vitest';
import {
  formatBlockedMovement,
  formatGeneratedInspection,
  formatGeneratedWorldDescription,
  isGeneratedDebugMode,
  parseGeneratedView,
} from './generated-playground-ui';

describe('generated playground UI contract', () => {
  it('turns world structure into a compact field note', () => {
    expect(formatGeneratedWorldDescription({
      width: 40,
      height: 40,
      biome: 'wetland',
      weather: 'rainy',
      lighting: 'dusk',
      topologyFamily: 'two-region',
      disruptionCellCount: 3,
    })).toBe(
      '40×40 wetland · rainy · dusk · Two regions meet at a pair of crossings · 3-cell elevation anomaly',
    );
  });

  it('keeps the field note useful for an experimental topology', () => {
    expect(formatGeneratedWorldDescription({
      width: 8,
      height: 6,
      biome: 'crystal',
      weather: 'clear',
      lighting: 'night',
      topologyFamily: 'experimental',
      disruptionCellCount: 0,
    })).toContain('A new path is waiting to be mapped');
  });

  it('parses only the explicit orthogonal view and keeps iso as the default', () => {
    expect(parseGeneratedView('')).toBe('iso');
    expect(parseGeneratedView('?seed=2026&view=iso')).toBe('iso');
    expect(parseGeneratedView('?seed=2026&view=ortho')).toBe('ortho');
    expect(parseGeneratedView('?view=ORTHO')).toBe('iso');
    expect(parseGeneratedView('?view=unknown')).toBe('iso');
  });

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
    }, false);
    expect(text).toBe(
      'CELL 3,7 · TERRAIN dirt · BIOME wetland · WEATHER rainy · LIGHTING dusk · ELEVATION 1',
    );
    expect(text).not.toMatch(/REGION|OPEN|route|barrier|alternate|path/i);
  });

  it('keeps graph diagnostics behind debug inspection mode', () => {
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
    }, true);
    expect(text).toContain('REGION region-west');
    expect(text).toContain('OPEN up, right');
    expect(text).toContain('CELL 3,7');
    expect(text).toContain('TERRAIN dirt');
    expect(text).toContain('BIOME wetland');
    expect(text).toContain('WEATHER rainy');
    expect(text).toContain('LIGHTING dusk');
    expect(text).toContain('ELEVATION 1');
  });

  it('enables diagnostics only for the explicit debug query', () => {
    expect(isGeneratedDebugMode('')).toBe(false);
    expect(isGeneratedDebugMode('?debug=0')).toBe(false);
    expect(isGeneratedDebugMode('?debug=1')).toBe(true);
    expect(isGeneratedDebugMode('?seed=4&debug=1')).toBe(true);
    expect(isGeneratedDebugMode('?debug=1&debug=0')).toBe(true);
    expect(isGeneratedDebugMode('?debug=true')).toBe(false);
    expect(isGeneratedDebugMode('#debug=1')).toBe(false);
  });
});

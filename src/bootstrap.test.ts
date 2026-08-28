import { describe, expect, it } from 'vitest';
import { bootstrapStatus } from './bootstrap';

describe('bootstrap', () => {
  it('exposes a pure bootstrap status', () => {
    expect(bootstrapStatus).toBe('bootstrap-ready');
  });
});
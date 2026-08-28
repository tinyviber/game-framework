import { describe, expect, it } from 'vitest';
import { defaultPixiHostConfig } from './pixi-host-config';

describe('Pixi host config', () => {
  it('uses the fixed game viewport', () => {
    expect(defaultPixiHostConfig).toEqual({
      width: 900,
      height: 440,
      backgroundColor: 0x111827,
    });
  });
});
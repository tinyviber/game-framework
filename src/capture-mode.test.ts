import { describe, expect, it } from 'vitest';
import { MAIN_WORLD } from '@/content/main-world';
import {
  findAuthoredCaptureRoom,
  parseAuthoredCaptureRequest,
} from './capture-mode';

describe('authored capture URL mode', () => {
  it('recognizes an authored ISO capture request and its room', () => {
    expect(parseAuthoredCaptureRequest(
      '?view=iso&capture=1&room=ruins-entrance',
    )).toEqual({
      enabled: true,
      roomId: 'ruins-entrance',
    });
  });

  it('does not enable capture for generated worlds or another view', () => {
    expect(parseAuthoredCaptureRequest(
      '?world=generated&view=iso&capture=1&room=ruins-entrance',
    ).enabled).toBe(false);
    expect(parseAuthoredCaptureRequest('?view=ortho&capture=1').enabled).toBe(false);
  });

  it('resolves known rooms without manufacturing an invalid room', () => {
    expect(findAuthoredCaptureRoom(MAIN_WORLD.rooms, 'ruins-entrance')?.id)
      .toBe('ruins-entrance');
    expect(findAuthoredCaptureRoom(MAIN_WORLD.rooms, 'not-a-room')).toBeUndefined();
  });
});

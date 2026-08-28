import { describe, expect, it } from 'vitest';
import {
  clampCameraToRoom,
  tileCenterToPixels,
  updateCamera,
} from './camera';

const VIEWPORT = { width: 480, height: 240 };
const LARGE_ROOM = { width: 960, height: 480 };
const SMALL_ROOM = { width: 240, height: 120 };

describe('clampCameraToRoom', () => {
  it('keeps the viewport inside the room bounds', () => {
    const clamped = clampCameraToRoom(
      { x: 10, y: 10 },
      LARGE_ROOM,
      VIEWPORT,
    );

    expect(clamped).toEqual({ x: 240, y: 120 });
  });

  it('clamps at the far edge of the room', () => {
    const clamped = clampCameraToRoom(
      { x: 5000, y: 5000 },
      LARGE_ROOM,
      VIEWPORT,
    );

    expect(clamped).toEqual({ x: 960 - 240, y: 480 - 120 });
  });

  it('centers rooms smaller than the viewport', () => {
    const clamped = clampCameraToRoom(
      { x: 0, y: 0 },
      SMALL_ROOM,
      VIEWPORT,
    );

    expect(clamped).toEqual({ x: 120, y: 60 });
  });
});

describe('updateCamera', () => {
  it('moves toward the target but never arrives in one step', () => {
    const start = { x: 240, y: 120 };

    const next = updateCamera(
      start,
      { x: 400, y: 120 },
      LARGE_ROOM,
      VIEWPORT,
      0.5,
    );

    expect(next.x).toBeGreaterThan(start.x);
    expect(next.x).toBeLessThan(400);
    expect(next.y).toBe(120);
  });

  it('converges on the target over repeated updates', () => {
    let camera = { x: 240, y: 120 };

    for (let i = 0; i < 200; i += 1) {
      camera = updateCamera(
        camera,
        { x: 700, y: 350 },
        LARGE_ROOM,
        VIEWPORT,
        0.2,
      );
    }

    expect(camera.x).toBeCloseTo(700, 5);
    expect(camera.y).toBeCloseTo(350, 5);
  });

  it('converges to the clamp, never past the room edge', () => {
    let camera = { x: 240, y: 120 };

    for (let i = 0; i < 300; i += 1) {
      camera = updateCamera(
        camera,
        { x: 5000, y: 5000 },
        LARGE_ROOM,
        VIEWPORT,
        0.2,
      );
    }

    expect(camera).toEqual({
      x: 960 - 240,
      y: 480 - 120,
    });
  });

  it('rejects an out-of-range smoothing factor', () => {
    expect(() =>
      updateCamera(
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        LARGE_ROOM,
        VIEWPORT,
        0,
      ),
    ).toThrow(/smoothing/);
  });
});

describe('tileCenterToPixels', () => {
  it('returns the pixel center of a tile', () => {
    expect(tileCenterToPixels({ x: 3, y: 2 }, 48)).toEqual({
      x: 168,
      y: 120,
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  clampCameraToRoom,
  tileCenterToPixels,
  updateCamera,
} from './camera';

const VIEWPORT = { width: 480, height: 240 };
const LARGE_ROOM = { width: 960, height: 480 };
const SMALL_ROOM = { width: 240, height: 120 };

const FRAME_60HZ = 1000 / 60;

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
  it('converges on the target over repeated updates', () => {
    let camera = { x: 240, y: 120 };

    for (let i = 0; i < 200; i += 1) {
      camera = updateCamera(
        camera,
        { x: 700, y: 350 },
        LARGE_ROOM,
        VIEWPORT,
        FRAME_60HZ,
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
        FRAME_60HZ,
      );
    }

    expect(camera).toEqual({
      x: 960 - 240,
      y: 480 - 120,
    });
  });

  it('is frame-rate independent: equal wall time converges equally', () => {
    // Review P2-7: a fixed lerp factor per ticker frame made the
    // follow speed depend on the display's refresh rate. The
    // exponential form must give the same position after the same
    // total elapsed time, whatever the step size.
    const start = { x: 240, y: 120 };
    const target = { x: 700, y: 350 };
    const totalMs = 1000;

    const run = (stepMs: number): { x: number; y: number } => {
      let camera = start;

      for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
        camera = updateCamera(
          camera,
          target,
          LARGE_ROOM,
          VIEWPORT,
          stepMs,
        );
      }

      return camera;
    };

    // Step sizes that divide 1000ms exactly, from one giant step
    // down to 200 tiny ones — 30/60/144 Hz equivalent.
    const at1Hz = run(1000);
    const at2Hz = run(500);
    const at4Hz = run(250);
    const at8Hz = run(125);
    const at20Hz = run(50);
    const at200Hz = run(5);

    expect(at1Hz.x).toBeCloseTo(at200Hz.x, 6);
    expect(at1Hz.y).toBeCloseTo(at200Hz.y, 6);
    expect(at2Hz.x).toBeCloseTo(at4Hz.x, 6);
    expect(at2Hz.y).toBeCloseTo(at4Hz.y, 6);
    expect(at8Hz.x).toBeCloseTo(at20Hz.x, 6);
    expect(at8Hz.y).toBeCloseTo(at20Hz.y, 6);
  });

  it('accepts a zero-length step without moving', () => {
    const camera = updateCamera(
      { x: 300, y: 200 },
      { x: 700, y: 350 },
      LARGE_ROOM,
      VIEWPORT,
      0,
    );

    expect(camera).toEqual({ x: 300, y: 200 });
  });

  it('rejects invalid time steps and speeds', () => {
    expect(() =>
      updateCamera(
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        LARGE_ROOM,
        VIEWPORT,
        -1,
      ),
    ).toThrow(/dtMs/);

    expect(() =>
      updateCamera(
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        LARGE_ROOM,
        VIEWPORT,
        Number.NaN,
      ),
    ).toThrow(/dtMs/);

    expect(() =>
      updateCamera(
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        LARGE_ROOM,
        VIEWPORT,
        FRAME_60HZ,
        0,
      ),
    ).toThrow(/speedPerSecond/);
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

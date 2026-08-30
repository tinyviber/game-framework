import type { Position } from './types';

export interface CameraState {
  readonly x: number;
  readonly y: number;
}

export interface CameraViewport {
  readonly width: number;
  readonly height: number;
}

export interface CameraRoomSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Clamps a desired camera position so the viewport stays inside the
 * room. If the room is smaller than the viewport on an axis, the
 * camera centers the room on that axis instead.
 */
export function clampCameraToRoom(
  desired: Position,
  roomSize: CameraRoomSize,
  viewport: CameraViewport,
): CameraState {
  const clampAxis = (
    desiredValue: number,
    roomSpan: number,
    viewSpan: number,
  ): number => {
    if (roomSpan <= viewSpan) {
      return roomSpan / 2;
    }

    const half = viewSpan / 2;

    return Math.min(
      Math.max(desiredValue, half),
      roomSpan - half,
    );
  };

  return {
    x: clampAxis(desired.x, roomSize.width, viewport.width),
    y: clampAxis(desired.y, roomSize.height, viewport.height),
  };
}

/**
 * Smooth camera follow with frame-rate-independent exponential
 * smoothing: over a time step of `dtMs` the camera covers a
 * fraction `1 - exp(-speed * dt)` of the remaining distance, so
 * 30, 60 and 144 Hz displays converge at the same rate. `speed`
 * is a responsiveness constant in 1/seconds (12 matches the old
 * fixed 0.18 lerp at 60 fps). The result is clamped to the room
 * bounds.
 */
export function updateCamera(
  current: CameraState,
  target: Position,
  roomSize: CameraRoomSize,
  viewport: CameraViewport,
  dtMs: number,
  speedPerSecond = 12,
): CameraState {
  if (!Number.isFinite(dtMs) || dtMs < 0) {
    throw new Error('dtMs must be a non-negative finite number');
  }

  if (!Number.isFinite(speedPerSecond) || speedPerSecond <= 0) {
    throw new Error('speedPerSecond must be a positive finite number');
  }

  const alpha = 1 - Math.exp(-speedPerSecond * (dtMs / 1000));
  const nextX = current.x + (target.x - current.x) * alpha;
  const nextY = current.y + (target.y - current.y) * alpha;

  return clampCameraToRoom(
    { x: nextX, y: nextY },
    roomSize,
    viewport,
  );
}

export function tileCenterToPixels(
  tile: Position,
  tileSize: number,
): Position {
  return {
    x: (tile.x + 0.5) * tileSize,
    y: (tile.y + 0.5) * tileSize,
  };
}

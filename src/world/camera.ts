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
 * Smooth camera follow: exponential lerp toward the target position,
 * then clamped to the room bounds. `smoothing` is in (0, 1]; 1 snaps
 * instantly, smaller values follow more slowly.
 */
export function updateCamera(
  current: CameraState,
  target: Position,
  roomSize: CameraRoomSize,
  viewport: CameraViewport,
  smoothing = 0.15,
): CameraState {
  if (
    !Number.isFinite(smoothing) ||
    smoothing <= 0 ||
    smoothing > 1
  ) {
    throw new Error('smoothing must be in (0, 1]');
  }

  const nextX = current.x + (target.x - current.x) * smoothing;
  const nextY = current.y + (target.y - current.y) * smoothing;

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

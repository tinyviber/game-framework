import type { Cell, Position } from './grid';

export interface Room {
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly cells: readonly (readonly Cell[])[];
  readonly spawn: Position;
  readonly goal: Position;
}

export interface RoomGenerationConfig {
  readonly width?: number;
  readonly height?: number;
}

export const DEFAULT_ROOM_SIZE = 40;

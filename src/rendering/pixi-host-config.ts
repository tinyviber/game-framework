import {
  BACKGROUND_COLOR,
  VIEWPORT,
} from './layout';

export interface PixiHostConfig {
  readonly width: number;
  readonly height: number;
  readonly backgroundColor: number;
}

export const defaultPixiHostConfig: PixiHostConfig = {
  width: VIEWPORT.width,
  height: VIEWPORT.height,
  backgroundColor: BACKGROUND_COLOR,
};

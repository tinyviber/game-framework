export type Chapter4Action = 'move' | 'interact';

export type Chapter4Status =
  | 'running'
  | 'complete'
  | 'failed';

export type Chapter4Failure = 'locked-gate' | 'boundary';

export interface Chapter4View {
  readonly helper: {
    readonly x: number;
  };

  readonly activator: {
    readonly x: number;
    readonly active: boolean;
  };

  readonly gate: {
    readonly x: number;
    readonly open: boolean;
    readonly blocked: boolean;
  };

  readonly exit: {
    readonly x: number;
    readonly reached: boolean;
  };

  readonly feedback: {
    readonly status: Chapter4Status;
    readonly action: Chapter4Action | null;
    readonly failureReason: Chapter4Failure | null;
  };
}

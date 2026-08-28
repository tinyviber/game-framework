import {
  completeClosure,
  type ClosureContract,
  type ClosureRejection,
  type PersistentEffect,
} from '@/world/closure';
import {
  createLocalCheckpoint,
  restoreLocalCheckpoint,
  type CheckpointRestoreRejection,
  type LocalCheckpoint,
} from '@/world/checkpoint';
import {
  type OperationRejection,
  type OperationResult,
} from '@/world/operation';
import {
  transitionThroughTopology,
  type RoomTopology,
  type TopologyTransitionResult,
} from '@/world/topology';
import {
  clonePlainData,
  deepFreeze,
  type LocalWorldState,
  type OperationEvent,
  type PersistentMetadata,
  type RoomId,
} from '@/world/types';
import type { RoomCatalog } from '@/world/transition';

export interface GameSession {
  readonly activeWorld: LocalWorldState;
  readonly catalog: RoomCatalog;
  readonly topology: RoomTopology;
  readonly checkpoint: LocalCheckpoint | null;
}

export function createGameSession(
  initialWorld: LocalWorldState,
  catalog: RoomCatalog,
  topology: RoomTopology,
): GameSession {
  return {
    // structuredClone drops frozen-ness, so re-establish the
    // framework-wide invariant: every active world is deep-frozen.
    activeWorld: deepFreeze(clonePlainData(initialWorld)),
    catalog,
    topology,
    checkpoint: null,
  };
}

export type SessionOperation = (
  state: LocalWorldState,
) => OperationResult;

export type SessionOperationResult =
  | {
      readonly accepted: true;
      readonly session: GameSession;
      readonly events: readonly OperationEvent[];
    }
  | {
      readonly accepted: false;
      readonly session: GameSession;
      readonly reason: OperationRejection;
    };

function rejectedOperation(
  session: GameSession,
): SessionOperationResult {
  // LocalWorldState is immutable by contract (all framework-produced
  // states are deep-frozen), so rejections hand back the current
  // state without defensive cloning.
  return {
    accepted: false,
    session,
    reason: { kind: 'operation-threw' },
  };
}

export function applySessionOperation(
  session: GameSession,
  operation: SessionOperation,
): SessionOperationResult {
  let result: OperationResult;

  try {
    result = operation(session.activeWorld);
  } catch {
    return rejectedOperation(session);
  }

  if (!result.accepted) {
    return {
      accepted: false,
      session: {
        ...session,
        activeWorld: result.state,
      },
      reason: result.reason,
    };
  }

  return {
    accepted: true,
    session: {
      ...session,
      activeWorld: result.state,
    },
    events: result.events,
  };
}

function applyPersistentEffect(
  state: LocalWorldState,
  effect: PersistentEffect,
): LocalWorldState {
  const persistentMetadata: PersistentMetadata = {
    ...state.persistentMetadata,
    ...clonePlainData(effect.changes),
  };

  return deepFreeze<LocalWorldState>({
    ...state,
    persistentMetadata,
  });
}

export type SessionClosureResult =
  | {
      readonly accepted: true;
      readonly session: GameSession;
      readonly effect: PersistentEffect;
    }
  | {
      readonly accepted: false;
      readonly session: GameSession;
      readonly reason: ClosureRejection;
    };

export function completeActiveClosure(
  session: GameSession,
  contract: ClosureContract,
): SessionClosureResult {
  const result = completeClosure(
    session.activeWorld,
    contract,
  );

  if (!result.accepted) {
    return {
      accepted: false,
      session,
      reason: result.reason,
    };
  }

  return {
    accepted: true,
    effect: result.effect,
    session: {
      ...session,
      activeWorld: applyPersistentEffect(
        session.activeWorld,
        result.effect,
      ),
      checkpoint: null,
    },
  };
}

export function saveCheckpoint(
  session: GameSession,
): GameSession {
  return {
    ...session,
    checkpoint: createLocalCheckpoint(
      session.activeWorld,
    ),
  };
}

export type SessionCheckpointRejection =
  | CheckpointRestoreRejection
  | 'no-checkpoint';

export type SessionCheckpointResult =
  | {
      readonly accepted: true;
      readonly session: GameSession;
    }
  | {
      readonly accepted: false;
      readonly session: GameSession;
      readonly reason: SessionCheckpointRejection;
    };

export function restoreCheckpoint(
  session: GameSession,
): SessionCheckpointResult {
  if (!session.checkpoint) {
    return {
      accepted: false,
      session,
      reason: 'no-checkpoint',
    };
  }

  const result = restoreLocalCheckpoint(
    session.activeWorld,
    session.checkpoint,
  );

  if (!result.accepted) {
    return {
      accepted: false,
      session: {
        ...session,
        activeWorld: result.state,
      },
      reason: result.reason,
    };
  }

  return {
    accepted: true,
    session: {
      ...session,
      activeWorld: result.state,
    },
  };
}

type TopologyTransitionFailure = Extract<
  TopologyTransitionResult,
  { readonly accepted: false }
>;

export type SessionTransitionResult =
  | {
      readonly accepted: true;
      readonly session: GameSession;
      readonly fromRoomId: RoomId;
      readonly toRoomId: RoomId;
    }
  | {
      readonly accepted: false;
      readonly session: GameSession;
      readonly reason: TopologyTransitionFailure['reason'];
    };

export function transitionSession(
  session: GameSession,
  targetRoomId: RoomId,
): SessionTransitionResult {
  const result = transitionThroughTopology(
    session.activeWorld,
    session.catalog,
    session.topology,
    targetRoomId,
  );

  if (!result.accepted) {
    return {
      accepted: false,
      session: {
        ...session,
        activeWorld: result.state,
      },
      reason: result.reason,
    };
  }

  return {
    accepted: true,
    session: {
      ...session,
      activeWorld: result.state,
      checkpoint: null,
    },
    fromRoomId: result.fromRoomId,
    toRoomId: result.toRoomId,
  };
}

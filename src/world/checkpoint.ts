import {
  clonePlainData,
  deepFreeze,
  isObjectState,
  type ClosureId,
  type LocalWorldState,
  type ObjectId,
  type ObjectState,
  type RoomEntryParameters,
  type RoomId,
} from './types';

export interface LocalCheckpoint {
  readonly roomId: RoomId;
  readonly closureId: ClosureId;
  readonly entry: RoomEntryParameters;
  readonly objects: Readonly<Record<ObjectId, ObjectState>>;
}

export function createLocalCheckpoint(
  state: LocalWorldState,
): LocalCheckpoint {
  return deepFreeze({
    roomId: state.roomId,
    closureId: state.closureId,
    entry: clonePlainData(state.entry),
    objects: clonePlainData(state.objects),
  });
}

export type CheckpointRestoreRejection =
  | 'room-mismatch'
  | 'closure-mismatch'
  | 'invalid-checkpoint';

export type CheckpointRestoreResult =
  | {
      readonly accepted: true;
      readonly state: LocalWorldState;
    }
  | {
      readonly accepted: false;
      readonly state: LocalWorldState;
      readonly reason: CheckpointRestoreRejection;
    };

function isObjectStateRecord(
  value: unknown,
): value is Readonly<Record<ObjectId, ObjectState>> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return false;
  }

  return Object.values(value).every(isObjectState);
}

function hasSameObjectIds(
  current: Readonly<Record<ObjectId, ObjectState>>,
  checkpoint: Readonly<Record<ObjectId, ObjectState>>,
): boolean {
  const currentIds = Object.keys(current);
  const checkpointIds = Object.keys(checkpoint);

  return (
    currentIds.length === checkpointIds.length &&
    currentIds.every((objectId) =>
      Object.hasOwn(checkpoint, objectId),
    )
  );
}

export function restoreLocalCheckpoint(
  current: LocalWorldState,
  checkpoint: LocalCheckpoint,
): CheckpointRestoreResult {
  if (current.roomId !== checkpoint.roomId) {
    return {
      accepted: false,
      state: current,
      reason: 'room-mismatch',
    };
  }

  if (current.closureId !== checkpoint.closureId) {
    return {
      accepted: false,
      state: current,
      reason: 'closure-mismatch',
    };
  }

  try {
    const safeCheckpoint = clonePlainData(checkpoint);

    if (
      !isObjectStateRecord(safeCheckpoint.objects) ||
      !hasSameObjectIds(current.objects, safeCheckpoint.objects)
    ) {
      return {
        accepted: false,
        state: current,
        reason: 'invalid-checkpoint',
      };
    }

    return {
      accepted: true,
      state: deepFreeze<LocalWorldState>({
        ...current,
        entry: safeCheckpoint.entry,
        objects: safeCheckpoint.objects,
        persistentMetadata: current.persistentMetadata,
        lastEvents: [],
      }),
    };
  } catch {
    return {
      accepted: false,
      state: current,
      reason: 'invalid-checkpoint',
    };
  }
}

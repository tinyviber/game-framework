import {
  type LocalWorldState,
  type RoomDefinition,
  type RoomEntryParameters,
  type RoomId,
} from './types';
import { tryInitializeLocalWorld } from './local-world';

export type RoomCatalog = Readonly<
  Record<RoomId, RoomDefinition | undefined>
>;

export type RoomTransitionResult =
  | {
      readonly accepted: true;
      readonly state: LocalWorldState;
      readonly fromRoomId: RoomId;
      readonly toRoomId: RoomId;
    }
  | {
      readonly accepted: false;
      readonly state: LocalWorldState;
      readonly reason:
        | 'unknown-room'
        | 'invalid-entry-parameters'
        | 'initialization-failed';
    };

export function transitionRoom(
  current: LocalWorldState,
  catalog: RoomCatalog,
  targetRoomId: RoomId,
  entry: RoomEntryParameters,
): RoomTransitionResult {
  const target = catalog[targetRoomId];

  if (!target || target.roomId !== targetRoomId) {
    return {
      accepted: false,
      state: current,
      reason: 'unknown-room',
    };
  }

  // Single validation point: entry checking and integrity verification
  // belong to tryInitializeLocalWorld, not to this layer.
  const initialization = tryInitializeLocalWorld(
    target,
    entry,
    current.persistentMetadata,
  );

  if (!initialization.ok) {
    return {
      accepted: false,
      state: current,
      reason: initialization.reason,
    };
  }

  return {
    accepted: true,
    state: initialization.state,
    fromRoomId: current.roomId,
    toRoomId: targetRoomId,
  };
}

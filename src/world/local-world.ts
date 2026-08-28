import {
  clonePlainData,
  deepFreeze,
  createRoomDefinition,
  isObjectState,
  type LocalWorldState,
  type PersistentMetadata,
  type RoomDefinition,
  type RoomEntryParameters,
} from './types';

export type WorldInitializationFailure =
  | 'invalid-entry-parameters'
  | 'initialization-failed';

export type WorldInitializationResult =
  | { readonly ok: true; readonly state: LocalWorldState }
  | { readonly ok: false; readonly reason: WorldInitializationFailure };

/**
 * The single authoritative entry-validation and integrity-check point
 * for room initialization. Higher layers (transitions) must delegate
 * here instead of calling `validateEntry` themselves.
 */
export function tryInitializeLocalWorld(
  definition: RoomDefinition,
  entry: RoomEntryParameters,
  persistentMetadata: PersistentMetadata,
): WorldInitializationResult {
  let safeDefinition: RoomDefinition;
  let safeEntry: RoomEntryParameters;
  let safePersistentMetadata: PersistentMetadata;

  try {
    safeDefinition = createRoomDefinition(definition);
    safeEntry = clonePlainData(entry);
    safePersistentMetadata = clonePlainData(persistentMetadata);
  } catch {
    return { ok: false, reason: 'initialization-failed' };
  }

  if (!safeDefinition.validateEntry(safeEntry)) {
    return { ok: false, reason: 'invalid-entry-parameters' };
  }

  try {
    const initialized = safeDefinition.initialize({
      entry: safeEntry,
      persistentMetadata: safePersistentMetadata,
    });

    if (
      initialized.roomId !== safeDefinition.roomId ||
      initialized.closureId !== safeDefinition.closureId
    ) {
      throw new Error('invalid identity');
    }

    for (const objectDefinition of safeDefinition.mutableObjects) {
      const objectState =
        initialized.objects[objectDefinition.id];

      if (!objectState) {
        throw new Error(`omitted object ${objectDefinition.id}`);
      }

      if (
        !isObjectState(objectState) ||
        objectState.kind !== objectDefinition.kind
      ) {
        throw new Error(`wrong kind for ${objectDefinition.id}`);
      }
    }

    return {
      ok: true,
      state: deepFreeze<LocalWorldState>(
        clonePlainData({
          ...initialized,
          entry: safeEntry,
          persistentMetadata: safePersistentMetadata,
        }),
      ),
    };
  } catch {
    return { ok: false, reason: 'initialization-failed' };
  }
}

export function initializeLocalWorld(
  definition: RoomDefinition,
  entry: RoomEntryParameters,
  persistentMetadata: PersistentMetadata,
): LocalWorldState {
  const result = tryInitializeLocalWorld(
    definition,
    entry,
    persistentMetadata,
  );

  if (result.ok) {
    return result.state;
  }

  throw new Error(
    `Room ${definition.roomId} initialization failed: ${result.reason}`,
  );
}

import {
  clonePlainData,
  deepFreeze,
  type ClosureId,
  type LocalWorldState,
  type ObjectId,
  type ObjectState,
  type OperationEvent,
  isObjectState,
} from './types';

export interface ClosureScope {
  readonly closureId: ClosureId;
  readonly allowedObjectIds: readonly ObjectId[];
}

export interface OperationContext {
  readonly state: LocalWorldState;
  readonly scope: ClosureScope;
}

export interface ObjectChange {
  readonly objectId: ObjectId;
  readonly state: ObjectState;
}

export interface OperationProposal {
  /**
   * Structured description of what happened (or explicitly did not
   * happen). Committed verbatim into `state.lastEvents`.
   */
  readonly events?: readonly OperationEvent[];
  readonly changes: readonly ObjectChange[];
}

export type WorldOperation = (
  context: OperationContext,
) => OperationProposal;

export type OperationRejection =
  | { readonly kind: 'closure-mismatch' }
  | { readonly kind: 'scope-violation'; readonly objectId: ObjectId }
  | { readonly kind: 'unknown-object'; readonly objectId: ObjectId }
  | { readonly kind: 'kind-mismatch'; readonly objectId: ObjectId }
  | { readonly kind: 'invalid-proposal' }
  | { readonly kind: 'operation-threw' };

export type OperationResult =
  | {
      readonly accepted: true;
      readonly state: LocalWorldState;
      readonly events: readonly OperationEvent[];
    }
  | {
      readonly accepted: false;
      readonly state: LocalWorldState;
      readonly reason: OperationRejection;
    };

export function applyScopedOperation(
  state: LocalWorldState,
  scope: ClosureScope,
  operation: WorldOperation,
): OperationResult {
  const scopeSnapshot: ClosureScope = Object.freeze({
    closureId: scope.closureId,
    allowedObjectIds: Object.freeze([
      ...scope.allowedObjectIds,
    ]),
  });

  if (state.closureId !== scopeSnapshot.closureId) {
    // Rejections never clone: LocalWorldState is treated as immutable
    // everywhere, and every state produced by the framework is frozen.
    return { accepted: false, state, reason: { kind: 'closure-mismatch' } };
  }

  let proposal: OperationProposal;

  try {
    const draft = clonePlainData(state);
    proposal = operation({ state: draft, scope: scopeSnapshot });
  } catch {
    return { accepted: false, state, reason: { kind: 'operation-threw' } };
  }

  if (!proposal || !Array.isArray(proposal.changes)) {
    return { accepted: false, state, reason: { kind: 'invalid-proposal' } };
  }

  const allowedObjectIds = new Set(scopeSnapshot.allowedObjectIds);
  const seenObjectIds = new Set<ObjectId>();

  for (const change of proposal.changes) {
    if (!change || !change.objectId || !change.state) {
      return { accepted: false, state, reason: { kind: 'invalid-proposal' } };
    }

    if (!isObjectState(change.state)) {
      return { accepted: false, state, reason: { kind: 'invalid-proposal' } };
    }

    if (!allowedObjectIds.has(change.objectId)) {
      return {
        accepted: false,
        state,
        reason: { kind: 'scope-violation', objectId: change.objectId },
      };
    }

    const previous = state.objects[change.objectId];

    if (!previous) {
      return {
        accepted: false,
        state,
        reason: { kind: 'unknown-object', objectId: change.objectId },
      };
    }

    if (seenObjectIds.has(change.objectId)) {
      return { accepted: false, state, reason: { kind: 'invalid-proposal' } };
    }

    if (previous.kind !== change.state.kind) {
      return {
        accepted: false,
        state,
        reason: { kind: 'kind-mismatch', objectId: change.objectId },
      };
    }

    seenObjectIds.add(change.objectId);
  }

  const events = proposal.events ?? [];

  if (!Array.isArray(events)) {
    return { accepted: false, state, reason: { kind: 'invalid-proposal' } };
  }

  try {
    // Structural sharing: only changed objects are copied; unchanged
    // object states are reused by reference (they are immutable).
    const nextObjects = { ...state.objects };

    for (const change of proposal.changes) {
      nextObjects[change.objectId] = clonePlainData(change.state);
    }

    const nextState = deepFreeze<LocalWorldState>({
      ...state,
      objects: nextObjects,
      lastEvents: events.map((event) => clonePlainData(event)),
    });

    return { accepted: true, state: nextState, events: nextState.lastEvents };
  } catch {
    return { accepted: false, state, reason: { kind: 'invalid-proposal' } };
  }
}

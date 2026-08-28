import {
  clonePlainData,
  type ClosureId,
  type LocalWorldState,
  type PersistentMetadata,
} from './types';

export interface PersistentEffect {
  readonly changes: PersistentMetadata;
}

export interface ClosureContract {
  readonly closureId: ClosureId;
  readonly canEnter: (state: LocalWorldState) => boolean;
  readonly canExit: (state: LocalWorldState) => boolean;
  readonly createPersistentEffect: (
    state: LocalWorldState,
  ) => PersistentEffect;
}

export type ClosureRejection =
  | 'closure-mismatch'
  | 'entry-precondition-failed'
  | 'exit-not-satisfied'
  | 'contract-threw';

export type ClosureEntryResult =
  | { readonly accepted: true }
  | {
      readonly accepted: false;
      readonly reason: ClosureRejection;
    };

export type ClosureCompletionResult =
  | {
      readonly accepted: true;
      readonly effect: PersistentEffect;
    }
  | {
      readonly accepted: false;
      readonly reason: ClosureRejection;
    };

export function validateClosureEntry(
  state: LocalWorldState,
  contract: ClosureContract,
): ClosureEntryResult {
  if (state.closureId !== contract.closureId) {
    return {
      accepted: false,
      reason: 'closure-mismatch',
    };
  }

  try {
    return contract.canEnter(clonePlainData(state))
      ? { accepted: true }
      : {
          accepted: false,
          reason: 'entry-precondition-failed',
        };
  } catch {
    return {
      accepted: false,
      reason: 'contract-threw',
    };
  }
}

export function completeClosure(
  state: LocalWorldState,
  contract: ClosureContract,
): ClosureCompletionResult {
  const entry = validateClosureEntry(state, contract);

  if (!entry.accepted) {
    return entry;
  }

  try {
    if (!contract.canExit(clonePlainData(state))) {
      return {
        accepted: false,
        reason: 'exit-not-satisfied',
      };
    }

    return {
      accepted: true,
      effect: clonePlainData(
        contract.createPersistentEffect(
          clonePlainData(state),
        ),
      ),
    };
  } catch {
    return {
      accepted: false,
      reason: 'contract-threw',
    };
  }
}

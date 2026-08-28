export type ObjectId = string & {
  readonly __objectId: unique symbol;
};

export type RoomId = string & {
  readonly __roomId: unique symbol;
};

export type ClosureId = string & {
  readonly __closureId: unique symbol;
};

export function createObjectId(value: string): ObjectId {
  if (value.length === 0) {
    throw new Error('ObjectId must not be empty');
  }

  return value as ObjectId;
}

export function createRoomId(value: string): RoomId {
  if (value.length === 0) {
    throw new Error('RoomId must not be empty');
  }

  return value as RoomId;
}

export function createClosureId(value: string): ClosureId {
  if (value.length === 0) {
    throw new Error('ClosureId must not be empty');
  }

  return value as ClosureId;
}

export interface Position {
  readonly x: number;
  readonly y: number;
}

export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type JsonRecord = Readonly<Record<string, JsonValue>>;

export type PersistentMetadata = JsonRecord;
export type RoomEntryParameters = JsonRecord;

export type StaticObjectKind = 'terrain' | 'building' | 'exit';

export type MutableObjectKind =
  | 'main-character'
  | 'npc'
  | 'mechanism'
  | 'door'
  | 'obstacle';

export interface StaticObjectDefinition {
  readonly id: ObjectId;
  readonly kind: StaticObjectKind;
  readonly position: Position;
  readonly tags: readonly string[];
}

export interface MutableObjectDefinition {
  readonly id: ObjectId;
  readonly kind: MutableObjectKind;
  readonly position: Position;
  readonly tags: readonly string[];
  readonly initialState: ObjectState;
}

export type ObjectDefinition =
  | StaticObjectDefinition
  | MutableObjectDefinition;

export type ObjectState =
  | {
      readonly kind: 'main-character';
      readonly position: Position;
      readonly facing: 'left' | 'right';
    }
  | {
      readonly kind: 'npc';
      readonly position: Position;
      readonly mood: string;
      readonly dialogueStage: number;
    }
  | {
      readonly kind: 'mechanism';
      readonly active: boolean;
    }
  | {
      readonly kind: 'door';
      readonly status: 'closed' | 'open';
    }
  | {
      readonly kind: 'obstacle';
      readonly status: 'blocking' | 'cleared';
    };

function isFiniteNumber(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value)
  );
}

function isPositionShape(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const position = value as Record<string, unknown>;

  return (
    isFiniteNumber(position.x) &&
    isFiniteNumber(position.y)
  );
}

type ObjectStateShapeValidator = (
  state: Record<string, unknown>,
) => boolean;

/**
 * One validator per ObjectState kind. The Record key type forces an
 * exhaustive compile-time check: adding a kind to the ObjectState union
 * without a validator here is a TypeScript error, which removes the
 * old silent `invalid-proposal` failure mode.
 */
const objectStateValidators: Record<
  ObjectState['kind'],
  ObjectStateShapeValidator
> = {
  'main-character': (state) =>
    isPositionShape(state.position) &&
    (state.facing === 'left' || state.facing === 'right'),
  npc: (state) =>
    isPositionShape(state.position) &&
    typeof state.mood === 'string' &&
    Number.isInteger(state.dialogueStage),
  mechanism: (state) => typeof state.active === 'boolean',
  door: (state) =>
    state.status === 'closed' || state.status === 'open',
  obstacle: (state) =>
    state.status === 'blocking' || state.status === 'cleared',
};

export function isObjectState(
  value: unknown,
): value is ObjectState {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return false;
  }

  const state = value as Record<string, unknown>;
  const validator =
    objectStateValidators[
      state.kind as ObjectState['kind']
    ];

  return (
    validator !== undefined &&
    validator(state)
  );
}

/**
 * Structured feedback describing what the last accepted operation did.
 * View projections switch on `tag` instead of sniffing string labels.
 */
export type OperationEvent =
  | { readonly tag: 'moved'; readonly objectId: ObjectId }
  | {
      readonly tag: 'move-blocked';
      readonly objectId: ObjectId;
      /** The blocking object, or omitted for room-boundary blocks. */
      readonly blockedBy?: ObjectId;
    }
  | {
      readonly tag: 'activated';
      readonly objectId: ObjectId;
      readonly targetId: ObjectId;
    }
  | {
      readonly tag: 'dialogue-progressed';
      readonly objectId: ObjectId;
      readonly targetId: ObjectId;
    }
  | { readonly tag: 'noop' };

export interface LocalWorldState {
  readonly roomId: RoomId;
  readonly closureId: ClosureId;
  readonly entry: RoomEntryParameters;
  readonly persistentMetadata: PersistentMetadata;
  readonly objects: Readonly<Record<ObjectId, ObjectState>>;
  readonly lastEvents: readonly OperationEvent[];
}

export interface RoomInitializationContext {
  readonly entry: RoomEntryParameters;
  readonly persistentMetadata: PersistentMetadata;
}

export interface RoomDefinition {
  readonly roomId: RoomId;
  readonly closureId: ClosureId;
  /** Optional playable-area bounds used to validate movement. */
  readonly bounds?: Bounds;
  readonly staticObjects: readonly StaticObjectDefinition[];
  readonly mutableObjects: readonly MutableObjectDefinition[];
  readonly validateEntry: (
    entry: RoomEntryParameters,
  ) => boolean;
  readonly initialize: (
    context: RoomInitializationContext,
  ) => LocalWorldState;
}

export function createRoomDefinition(
  definition: RoomDefinition,
): RoomDefinition {
  return deepFreeze({
    ...definition,
    staticObjects: clonePlainData(
      definition.staticObjects,
    ),
    mutableObjects: clonePlainData(
      definition.mutableObjects,
    ),
  });
}

export function clonePlainData<T>(value: T): T {
  return structuredClone(value);
}

export function deepFreeze<T>(value: T): T {
  if (
    value === null ||
    typeof value !== 'object' ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  Object.freeze(value);

  for (const key of Reflect.ownKeys(value)) {
    const child = (value as Record<PropertyKey, unknown>)[key];
    deepFreeze(child);
  }

  return value;
}

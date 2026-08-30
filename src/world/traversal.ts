import type { Position } from './types';

export type TraversalEdgeKind =
  | 'normal'
  | 'stairs'
  | 'ramp'
  | 'height-barrier';

export interface TraversalCell {
  readonly x: number;
  readonly y: number;
  readonly elevation: number;
  readonly walkable: boolean;
}

/**
 * Edges are directed on purpose. A connector is bidirectional only when
 * both directed records are present in the world definition.
 */
export interface GeneratedEdge {
  readonly from: Position;
  readonly to: Position;
  readonly kind: TraversalEdgeKind;
}

export interface PlayerCapabilities {
  /** Reserved for a later rule; jumping is not enabled in this slice. */
  readonly jump?: boolean;
  /** Reserved for a later rule; climbing is not enabled in this slice. */
  readonly climb?: boolean;
}

function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

export function isAdjacent(a: Position, b: Position): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

export function createTraversalEdge(
  from: Position,
  to: Position,
  kind: TraversalEdgeKind = 'normal',
): GeneratedEdge {
  return {
    from: { ...from },
    to: { ...to },
    kind,
  };
}

/** Resolves only the exact directed edge; no reverse inference is allowed. */
export function resolveEdge(
  edges: readonly GeneratedEdge[],
  from: Position,
  to: Position,
): GeneratedEdge | undefined {
  return edges.find(
    (edge) => samePosition(edge.from, from) && samePosition(edge.to, to),
  );
}

/**
 * The single height/traversal rule used by generated worlds and showcase
 * rooms. Callers that operate on an explicit graph must resolve an edge first
 * and reject when it is missing. The optional edge keeps this primitive useful
 * for callers that need to test a resolved edge in isolation.
 */
export function canTraverse(
  from: TraversalCell,
  to: TraversalCell,
  edge: GeneratedEdge | undefined,
  capabilities: PlayerCapabilities = {},
): boolean {
  void capabilities;

  if (!edge || !from.walkable || !to.walkable || !isAdjacent(from, to)) {
    return false;
  }

  if (
    (!samePosition(edge.from, from) || !samePosition(edge.to, to))
  ) {
    return false;
  }

  const kind = edge.kind;

  if (kind === 'height-barrier') {
    return false;
  }

  const heightDifference = Math.abs(from.elevation - to.elevation);

  if (heightDifference === 0) {
    return kind === 'normal' || kind === 'stairs' || kind === 'ramp';
  }

  return (
    heightDifference === 1 &&
    (kind === 'stairs' || kind === 'ramp')
  );
}

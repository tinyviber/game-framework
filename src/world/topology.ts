import {
  clonePlainData,
  deepFreeze,
  type LocalWorldState,
  type PersistentMetadata,
  type RoomEntryParameters,
  type RoomId,
} from './types';
import {
  transitionRoom,
  type RoomCatalog,
  type RoomTransitionResult,
} from './transition';

export interface RouteAvailabilityContext {
  readonly persistentMetadata: PersistentMetadata;
}

export interface RoomRoute {
  readonly fromRoomId: RoomId;
  readonly toRoomId: RoomId;
  readonly entry: RoomEntryParameters;
  readonly canTraverse?: (
    context: RouteAvailabilityContext,
  ) => boolean;
}

export interface RoomTopology {
  readonly routes: readonly RoomRoute[];
}

export interface ReachabilityProjection {
  readonly originRoomId: RoomId;
  readonly reachableRoomIds: readonly RoomId[];
  readonly availableRoutes: readonly RoomRoute[];
}

export function createRoomTopology(
  topology: RoomTopology,
): RoomTopology {
  return deepFreeze({
    ...topology,
    routes: topology.routes.map((route) => ({
      ...route,
      entry: clonePlainData(route.entry),
    })),
  });
}

function routeIsAvailable(
  route: RoomRoute,
  persistentMetadata: PersistentMetadata,
): boolean {
  if (!route.canTraverse) {
    return true;
  }

  try {
    return route.canTraverse({
      persistentMetadata: clonePlainData(
        persistentMetadata,
      ),
    });
  } catch {
    return false;
  }
}

export function projectReachability(
  current: LocalWorldState,
  catalog: RoomCatalog,
  topology: RoomTopology,
): ReachabilityProjection {
  if (!catalog[current.roomId]) {
    return {
      originRoomId: current.roomId,
      reachableRoomIds: [],
      availableRoutes: [],
    };
  }

  const reachableRoomIds: RoomId[] = [current.roomId];
  const availableRoutes: RoomRoute[] = [];
  const visited = new Set<RoomId>(reachableRoomIds);
  const pending: RoomId[] = [current.roomId];

  while (pending.length > 0) {
    const fromRoomId = pending.shift();

    if (!fromRoomId) {
      continue;
    }

    for (const route of topology.routes) {
      if (
        route.fromRoomId !== fromRoomId ||
        !catalog[route.toRoomId] ||
        !routeIsAvailable(
          route,
          current.persistentMetadata,
        )
      ) {
        continue;
      }

      availableRoutes.push(route);

      if (!visited.has(route.toRoomId)) {
        visited.add(route.toRoomId);
        reachableRoomIds.push(route.toRoomId);
        pending.push(route.toRoomId);
      }
    }
  }

  return {
    originRoomId: current.roomId,
    reachableRoomIds,
    availableRoutes,
  };
}

export type TopologyTransitionResult =
  | RoomTransitionResult
  | {
      readonly accepted: false;
      readonly state: LocalWorldState;
      readonly reason: 'route-not-reachable';
    };

export function transitionThroughTopology(
  current: LocalWorldState,
  catalog: RoomCatalog,
  topology: RoomTopology,
  targetRoomId: RoomId,
): TopologyTransitionResult {
  const projection = projectReachability(
    current,
    catalog,
    topology,
  );
  const route = projection.availableRoutes.find(
    (candidate) =>
      candidate.fromRoomId === current.roomId &&
      candidate.toRoomId === targetRoomId,
  );

  if (!route) {
    return {
      accepted: false,
      state: current,
      reason: 'route-not-reachable',
    };
  }

  return transitionRoom(
    current,
    catalog,
    targetRoomId,
    route.entry,
  );
}

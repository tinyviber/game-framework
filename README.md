# game-framework

A small, puzzle-first browser game framework in TypeScript. The runtime
keeps only the **Local World** (the room the player is currently in) as
immutable definitions plus deep-frozen mutable state; every world change
goes through an all-or-nothing operation before it is projected into a
view model and rendered with PixiJS.

- **Puzzle first, programming second, education third.**
- Only the active room holds mutable state; rooms rebuild on transition
  from definitions, entry parameters and persistent metadata.
- Feedback travels as typed events, never as string labels.
- Room JSON is a strict authoring boundary: broken maps fail at
  parse/boot/test time, not during play.

## Architecture at a glance

The currently playable game is **Windweave**, a 2.5D isometric exploration
atlas built from the selected Kenney previews in `textures_mark`:

```text
20-room authoring catalog (src/data/adventure/rooms.json)
  → createAdventureCatalog (src/world/adventure) # strict 4×5 / 62-edge graph
PlayerAction (src/main.ts)
  → applyAdventureAction                         # frozen state + typed events
  → resolveAdventureExit                         # paired boundary exits
  → IsoSceneView (src/rendering/isometric-scene)  # one-way presentation DTO
  → Pixi 2.5D dimetric scene
```

Move through the 4×5 atlas, stand beside a wind node and press `E` to awaken
its mark. NPCs also respond to `E`; `R` resets the current room without
undoing already awakened marks. The renderer uses the committed 64×64 PNG
previews as terrain props and characters, then adds elevation, shadows,
foot-point sorting and a foreground occlusion layer for the 3D reading.

The older tile runtime remains in the source tree for compatibility tests,
but it is not wired into the current playable entry point.

The original **chapter pipeline** still exists and its tests still run:

```text
PlayerAction (src/main.ts)
  → chapter operation (src/chapters/chapter-N)
  → applyScopedOperation (src/world/operation)   # scope + atomic commit
  → LocalWorldState (deep-frozen)
  → view projection (chapters/*/world-view)
  → Chapter6Renderer (chapters/chapter-6) → Pixi
```

The chapter pipeline is currently reference/test material for
closures/topology/checkpoints, not the running game. Windweave is the
current production entry point; the legacy tile runtime is retained only
for compatibility coverage.

See `docs/Current Design Synthesis and Reconstruction Plan.md` for the
full design constitution and per-chapter rebuild plan, and `AGENTS.md`
for the mechanically enforced dependency and invariant rules.

## Legacy tile runtime boundary

The legacy tile runtime still documents the framework's earlier state model:

```text
TileRoom                    → RoomDefinition / spatial definition
tile player action          → tile-specific WorldOperation
                            → applyScopedOperation
                            → LocalWorldState
                            → GameSession
                            → Closure / persistent effect / topology
                            → TileSceneView → Pixi
```

The adventure path is now the production wiring. The older tile runtime and
chapter pipeline remain as isolated framework/test material; the adventure
world uses the same frozen world primitives and `OperationEvent` union, and
does not introduce a global event bus or background room simulation.

## Getting started

```sh
npm install
npm run dev      # browser: the Windweave 20-room atlas
npm test         # vitest (node environment)
npm run build    # tsc + vite build
```

Single-suite verification, e.g.:

```sh
npm test -- src/world/hub-playthrough.test.ts
```

## Repository layout

```text
src/data/         adventure room catalog plus legacy room JSON/dialogue
src/world/        pure state primitives: types, local-world, operation,
                  closure, topology, transition, checkpoint, spatial,
                  and the legacy tile runtime (tilemap, tile-world,
                  tile-transition, flags, camera)
src/runtime/      game session orchestration
src/chapters/     level-specific rules and view projections, one folder
                  per chapter of the rebuild plan
src/rendering/    Pixi host, world scene layers, legacy tile renderer,
                  and the Windweave isometric renderer
src/main.ts       browser wiring: the only module connecting DOM,
                  world operations and the Pixi host
docs/             design plan and project analysis
```

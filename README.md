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

The currently playable game is a **seed-based 2.5D generated playground**
built from the selected Kenney previews in `textures_mark`:

```text
seed
  → generated-world (src/world/generated-world)  # deterministic 40×40 geometry
  → chapter-13 adapter                            # LocalWorld + scoped operation
  → IsoSceneView (src/rendering/isometric-scene)  # one-way presentation DTO
  → Pixi 2.5D dimetric scene
```

Run through a generated 40×40 field. The baseline route is deliberately
perturbed with a height barrier, so the visible goal requires noticing and
taking the longer loop. `E` inspects the terrain, `R` resets the run, `N`
generates the next seed, and `[ ]` changes zoom. Elevation is gameplay data:
same-height cells traverse normally, while height changes require an explicit
stairs/ramp edge. The renderer uses the committed 64×64 PNG previews as
terrain props and characters, then adds elevation, shadows, foot-point sorting
and a foreground occlusion layer for the 3D reading.

The 20-room **Windweave** catalog remains in `src/data/adventure` as a
showcase/renderer fixture. It is not the canonical generated-world source and
is not wired into the current playable entry point.

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
closures/topology/checkpoints. Chapter 13 is the generated-playground level
adapter and deliberately reuses `tryInitializeLocalWorld` and
`applyScopedOperation`; the legacy tile runtime is retained only for
compatibility coverage.

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

The generated-world path is now the production wiring. The older tile runtime,
chapter pipeline examples and 20-room adventure remain isolated
framework/showcase material; the generated world uses frozen definitions and
the existing Local World/scoped-operation primitives, and does not introduce a
global event bus or background room simulation.

## Getting started

```sh
npm install
npm run dev      # browser: the seed-based generated playground
npm test         # vitest (node environment)
npm run build    # tsc + vite build
```

Single-suite verification, e.g.:

```sh
npm test -- src/world/hub-playthrough.test.ts
```

## Repository layout

```text
src/data/         showcase adventure catalog plus legacy room JSON/dialogue
src/world/        pure state primitives: types, local-world, operation,
                  closure, topology, transition, checkpoint, spatial,
                  traversal, generated-world, and the legacy tile runtime
src/runtime/      game session orchestration
src/chapters/     level-specific rules and view projections, including the
                  generated playground adapter
src/rendering/    Pixi host, world scene layers, legacy tile renderer,
                  and the generated-world isometric renderer
src/main.ts       browser wiring: the only module connecting DOM,
                  world operations and the Pixi host
docs/             design plan and project analysis
```

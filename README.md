# game-framework

A small, puzzle-first browser game framework in TypeScript. The game keeps
only the **Local World** (the room the player is currently in) as
immutable definitions plus deep-frozen mutable state; every world change
goes through an all-or-nothing operation before it is projected into a
view model and rendered with PixiJS.

- **Puzzle first, programming second, education third.**
- Only the active room holds mutable state; rooms rebuild on transition
  from definitions, entry parameters and persistent metadata.
- Feedback travels as typed events, never as string labels.
- Movement follows explicit world definitions and traversal edges rather than
  hardcoded cell coordinates.

## Architecture at a glance

The default playable game is a small **authored connected world** shown with
the current Kenney rough visualization:

```text
authored semantic rooms (src/content/main-world)
  → gameplay/authored-world                     # active LocalWorld only
  → IsoSceneView (src/rendering)                 # one-way presentation DTO
  → Pixi orthogonal scene
```

The hidden semantic grid is authoritative for bounds, walkability, terrain,
elevation, obstacles, and traversal. Visual assets never define collision or
room transitions. A different visual mapping can replace Kenney without
changing authored movement data.

The generated playground remains available at `?world=generated` and is
built from the selected Kenney previews in `textures_mark`:

```text
seed
  → generated-world (src/world/generated-world)  # deterministic 40×40 geometry
  → gameplay/generated-playground                  # LocalWorld + scoped operation
  → IsoSceneView (src/rendering/isometric-scene)  # one-way presentation DTO
  → Pixi 2.5D dimetric scene
```

Run through a generated 40×40 field. Each seed chooses a macro topology,
then a route-local height disruption is applied to the generated terrain.
`E` inspects local terrain facts, `R` resets the run, `N` generates the next
seed, and `[ ]` changes zoom. Elevation is gameplay data: same-height cells
traverse normally, while height changes require an explicit stairs/ramp edge.
Append `?debug=1` when inspecting the generator rather than playing the
normal field study. The renderer uses the committed 64×64 PNG previews as
terrain props and characters, then adds elevation, shadows, foot-point sorting
and a foreground occlusion layer for the 3D reading.

The authored world contains Village Square, Elder House, East Road, and Ruins
Entrance. The product-specific adapters live in
`src/gameplay/authored-world.ts` and `src/gameplay/generated-playground.ts`;
both deliberately reuse the surviving local-world primitives without a
session manager, global event bus, or background room simulation.

See `docs/design/` for the durable product constitution and `AGENTS.md` for
the mechanically enforced dependency and invariant rules.

## Getting started

```sh
npm install
npm run dev      # browser: the authored connected world
npm test         # vitest (node environment)
npm run build    # tsc + vite build
```

Focused verification, e.g.:

```sh
npm test -- src/world/generated-world.test.ts
```

## Repository layout

```text
src/world/        semantic state/movement primitives, generated-world, and
                  authored-world validation/model
src/content/      data-oriented authored main-world rooms
src/gameplay/     current product-specific authored/generated adapters
src/rendering/    semantic-room presentation mapping, Pixi host, world scene
                  layers, and the isometric/orthogonal renderers
src/main.ts       browser wiring: the only module connecting DOM,
                  world operations and the Pixi host
docs/             canonical design notes and focused reclamation records
```

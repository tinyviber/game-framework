# game-framework

A small, puzzle-first browser game framework in TypeScript. The runtime
keeps only the **Local World** (the room the player is currently in) as
immutable definitions plus deep-frozen mutable state; every world change
goes through a scoped, atomic operation pipeline before it is projected
into a view model and rendered with PixiJS.

- **Puzzle first, programming second, education third.**
- Only the active room holds mutable state; rooms rebuild on transition
  from definitions, entry parameters and persistent metadata.
- Closures gate macro progression with `canEnter / canExit /
  createPersistentEffect` contracts ("Prove, don't check").
- Feedback travels as typed `OperationEvent`s, never as string labels.

## Architecture at a glance

```text
PlayerAction (src/main.ts)
  → chapter operation (src/chapters/chapter-N)
  → applyScopedOperation (src/world/operation)   # scope + atomic commit
  → LocalWorldState (deep-frozen)
  → view projection (chapters/*/world-view)
  → Chapter6Renderer (chapters/chapter-6) → Pixi
```

See `docs/Current Design Synthesis and Reconstruction Plan.md` for the
full design constitution and per-chapter rebuild plan, and
`AGENTS.md` for the mechanically enforced dependency and invariant rules.

## Getting started

```sh
npm install
npm run dev      # browser demo: Gate Yard (chapter 4 + 6)
npm test         # vitest (node environment)
npm run build    # tsc + vite build
```

Single-chapter verification, e.g.:

```sh
npm test -- src/chapters/chapter-3/operation.test.ts
```

## Repository layout

```text
src/world/        pure state primitives: types, local-world, operation,
                  closure, topology, transition, checkpoint, spatial
src/runtime/      game session orchestration
src/chapters/     level-specific rules and view projections, one folder
                  per chapter of the rebuild plan
src/rendering/    Pixi host, world scene layers, shared layout constants
docs/             design plan and project analysis
```

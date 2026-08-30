# AGENTS.md

Executable architecture rules for this repository. These supplement
`docs/Current Design Synthesis and Reconstruction Plan.md`; when the two
disagree, this file wins for mechanical rules and the design doc wins for
intent.

## Layout and dependency direction

```text
src/world/*        pure world primitives; no chapter, runtime, rendering or Pixi imports
src/runtime/*      session orchestration; may import src/world, never src/rendering or src/chapters/chapter-6
src/chapters/*     level-specific semantics; may import src/world (specific modules) and src/rendering/layout
src/rendering/*    presentation infrastructure; may import pixi.js only, never src/world or src/chapters
src/main.ts        browser wiring; the only module that connects DOM, world operations and the Pixi host
```

Enforced by `src/architecture.test.ts`:

- `src/world/**` must not import `pixi.js`, `@/chapters`, `@/runtime` or `@/rendering`.
- `src/rendering/**` must not import `@/world` or `@/chapters` (pixi.js is allowed there).
- Chapter files must not import the `@/world` barrel; import specific modules such as
  `@/world/types` or `@/world/local-world`.
- A chapter `chapter-N` must not import from `chapter-M` where `M > N`
  (no forward references to unfinished chapters).

## Invariants that must not be weakened

- All `LocalWorldState` produced by the framework is deep-frozen.
  Rejected operations return the input state by reference; never mutate a
  state in place and never reintroduce defensive-clone fallbacks that
  return mutable aliases.
- `applyScopedOperation` is all-or-nothing: one invalid change rejects the
  whole proposal.
- `lastEvents` is a typed `OperationEvent` union. Feedback must not
  regress to string labels or `startsWith` sniffing.
- Room initialization validates through `tryInitializeLocalWorld` only;
  transition layers must not call `validateEntry` themselves.
- Movement rules validate against room definitions, never hardcoded cell
  coordinates: object-based chapters use `createSpatialIndex` /
  `movementIsLegal`; tile rooms validate against their parsed tilemap
  (`isWallAt`) plus door/block/object definitions.
- The Pixi host owns the `WorldScene` lifecycle (`createWorldScene` in
  `createPixiHost`, destroyed by `handle.destroy()`). There is no global
  scene registry.
- Room JSON is the level-authoring boundary: `parseTileRoom` rejects
  unknown keys, duplicate ids, dangling door references, objects on
  walls and overlapping definitions, and the wiring layer validates the
  room graph with `validateTileRoomCatalog` at boot. A broken map must
  fail at build/test time, not produce a world that parses but cannot
  be played.
- Rendering is a pure consumer of view models; gameplay state must never
  be read back from `Container`/`Graphics` objects.

## Explicitly not wanted (from the design doc, keep it that way)

No ECS, no Phaser, no universal event bus, no global tick loop, no
universal directive AST, no React, no background simulation of inactive
rooms, no premature renderer reconciliation infrastructure. If a primitive
fits in 20–100 lines, build it instead of adopting a framework.

## Commands

```sh
npm test          # vitest, node environment, all chapters
npm run build     # tsc + vite build
npm run dev       # browser acceptance
```

Every change touching `src/world/**` must be followed by the full test and
build run, not only the owning chapter's test.

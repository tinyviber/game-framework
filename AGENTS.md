# AGENTS.md

Executable architecture and product-design instructions for this repository.

For mechanical architecture rules, this file wins.
For durable product intent, `docs/design/*` is canonical.
Older synthesis/recommendation documents under `docs/` may provide historical context but must not override accepted design principles or guardrails.

## Product constitution

This project is an exploratory top-down RPG puzzle framework.

Core product rules:

1. **World first, CS second.** Computational or mathematical concepts may inspire mechanics, but they must not become the visible organizing principle of the game.
2. **Prefer diegetic abstractions.** Put stable computational behavior into believable world objects, abilities, creatures, machines, materials, or environmental rules instead of naming textbook structures directly.
3. **Compose before proliferating.** Prefer a small set of reusable world verbs and properties that interact over many one-off puzzle tools.
4. **State must be learnable.** Important gameplay state and consequences should be observable enough for players to build and test mental models.
5. **Prefer persistent world systems over answer-shaped rooms.** A place should still make sense when the current puzzle is removed.
6. **Temporary black boxes are allowed.** Meaning and application may precede interface, implementation, and complexity.
7. **Human play judgment is final.** Agent scoring or conceptual cleverness is not evidence that a mechanic is fun.

## Design-document routing

Before **designing or changing gameplay semantics**—including mechanics, item/tool behavior, puzzles, progression, abilities, crafting/workbench behavior, or world interactions—read:

- `docs/design/vision.md`
- `docs/design/guardrails/gameplay-antipatterns.md`
- `docs/design/guardrails/mechanic-admission-gates.md`

Also read the relevant principle when applicable:

- world/puzzle structure → `docs/design/principles/world-first.md`
- computational behavior embodied as a world object/tool → `docs/design/principles/diegetic-abstractions.md`
- learning order / abstraction depth → `docs/design/principles/progressive-black-boxes.md`

Do **not** load these design documents for unrelated mechanical work such as narrow rendering bugs, dependency updates, test maintenance, or pure refactors with no gameplay-semantic change.

Design guardrails are product constraints, not brainstorming suggestions, but diagnostic rules are not universal prohibitions. Experiments may deliberately violate diagnostics to gather evidence. If an implementation appears to violate a hard gate:

1. identify the conflict;
2. do not silently redesign the product;
3. find a compliant implementation or surface the trade-off for human judgment.

Do not promote raw model brainstorms directly into canonical design docs. The intended flow is:

```text
raw brainstorm
→ human review
→ accepted principle / guardrail / decision
→ docs/design/*
```

## Layout and dependency direction

```text
src/world/*        pure world primitives; no presentation imports
src/gameplay/*     current product-specific gameplay adapters; may import src/world
src/rendering/*    presentation infrastructure; may import pixi.js only, never src/world
src/main.ts        browser wiring; the only module that connects DOM, world operations and the Pixi host
```

Enforced by `src/architecture.test.ts`:

- `src/world/**` must not import `pixi.js` or `@/rendering`.
- `src/rendering/**` must not import `@/world` (pixi.js is allowed there).
- `src/gameplay/**` owns concrete product behavior; it must not become a
  universal mechanic runtime, manager layer, or compatibility façade.

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
- Movement rules validate against world definitions, never hardcoded cell
  coordinates: object-based gameplay uses `createSpatialIndex` /
  `movementIsLegal`, while generated terrain uses explicit traversal edges.
- The Pixi host owns the `WorldScene` lifecycle (`createWorldScene` in
  `createPixiHost`, destroyed by `handle.destroy()`). There is no global
  scene registry.
- Rendering is a pure consumer of view models; gameplay state must never
  be read back from `Container`/`Graphics` objects.

## Explicitly not wanted

No ECS, no Phaser, no universal event bus, no global tick loop, no
universal directive AST, no React, no background simulation of inactive
rooms, no premature renderer reconciliation infrastructure. If a primitive
fits in 20–100 lines, build it instead of adopting a framework.

Do not create a universal mechanic runtime, puzzle DSL, or generalized gameplay
framework merely because multiple future mechanics might exist. Concrete
prototypes come first; extract shared architecture only after repeated
implementations demonstrate the same semantic contract.

## Commands

```sh
npm test          # vitest, node environment, all active tests
npm run build     # tsc + vite build
npm run dev       # browser acceptance
```

Every change touching `src/world/**` must be followed by the full test and
build run, not only a focused test.

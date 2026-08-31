# Design Documentation

This directory is the canonical home for durable product and gameplay design knowledge.

It deliberately separates four kinds of information that coding agents often conflate:

- **Vision** — the long-lived product direction and desired player experience.
- **Principles** — positive rules for how the game should be designed.
- **Guardrails** — recurring failure modes and admission checks for new mechanics.
- **System notes and decisions** — current implementation facts and accepted design decisions as they are added over time.

## What belongs here

Promote an idea into this directory only after human review. Raw model output, brainstorming transcripts, and speculative feature lists are not canonical design knowledge.

The intended flow is:

```text
raw brainstorm
    ↓
human review
    ↓
accepted principle / guardrail / decision
    ↓
docs/design/*
```

This keeps the repository from becoming an archive of contradictory model opinions.

## Current canonical documents

### Vision

- [vision.md](./vision.md)

### Principles

- [world-first.md](./principles/world-first.md)
- [diegetic-abstractions.md](./principles/diegetic-abstractions.md)
- [progressive-black-boxes.md](./principles/progressive-black-boxes.md)

### Guardrails

- [gameplay-antipatterns.md](./guardrails/gameplay-antipatterns.md)
- [mechanic-admission-gates.md](./guardrails/mechanic-admission-gates.md)

## How agents should use these documents

Do **not** load every design document for every task.

Before designing or changing gameplay semantics—mechanics, tools, abilities, puzzles, progression, crafting/workbench behavior, or world interactions—read the vision and relevant guardrails first.

For unrelated mechanical work such as build fixes, dependency updates, narrow rendering bugs, or pure refactors with no gameplay semantic change, the root `AGENTS.md` and local code invariants are sufficient.

Guardrails are product constraints, but not every diagnostic rule is an absolute prohibition. Experiments may deliberately violate a diagnostic rule to gather evidence. Promotion to production should require explicit reasoning when a hard gate is not satisfied.

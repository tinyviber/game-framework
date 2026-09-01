# Principle: World First

## Rule

Design the world and its stable behaviors before designing the answer to a puzzle.

The world should remain coherent when the current puzzle is removed.

## Preferred direction

```text
world grammar
→ situations
→ player goals
→ intuitive plans
→ disruptions
→ puzzles
```

Avoid:

```text
desired answer
→ answer-shaped room
→ one-off object
→ fictional explanation added afterward
```

## What counts as a world rule

Good world rules are reusable and predictable:

- water follows terrain;
- fire spreads through flammable materials and is stopped by water;
- heavy objects affect pressure, balance, or movement;
- a container has one stable rule for deciding what leaves it;
- an echo reproduces actions according to one understandable contract;
- cliffs constrain movement consistently;
- identical-looking objects have identical interaction semantics.

The player should be able to carry knowledge from one place to another.

## Puzzle test

When proposing a puzzle, ask:

1. What does the place do when no puzzle is present?
2. What would an inhabitant use this object or system for?
3. What obvious plan will a player form?
4. Which already-understandable world rule disrupts that plan?
5. Which already-understandable world rule enables a repair?

If the answer depends on a rule that exists only in that room, treat the design as suspicious.

## Computational inspiration

A CS or math concept may be a private design prompt.

It must not become a production requirement until the resulting world mechanic survives normal gameplay evaluation without relying on the concept name.

Use the concept list as an inspiration or audit tool, not as a syllabus that determines what content must exist.

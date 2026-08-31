# Principle: Diegetic Abstractions

## Rule

Prefer computational behavior embodied as a believable world object, ability, creature, machine, material, or environmental law.

The player should encounter the **contract** before the formal term.

## Example

Avoid naming an item `Priority Queue`.

A better world object might be a magical vessel that always returns one stored object according to a stable, visible property.

The player learns:

```text
put objects in
→ vessel applies a stable ordering rule
→ take the currently preferred object out
```

The implementation may use a priority queue, heap, scan, or something else. That implementation detail is not the player's initial concern.

## Requirements for a diegetic abstraction

A good abstraction should have:

- a reason to exist in the fiction beyond solving the player's current puzzle;
- a stable behavioral contract;
- visible or discoverable evidence for that contract;
- broad usefulness across situations;
- compatibility with other world systems.

Ask: **what would inhabitants use this for?**

If the only answer is "to embody a CS concept for the player", the object is probably not ready.

## Names and descriptions

Prefer world language over textbook terminology.

Internal code and design documents may name the hidden abstraction for clarity, but player-facing labels should describe the fiction or behavior.

Avoid explanatory tooltips that reveal the abstraction before the player has a reason to care.

## Consistency

Character flavor may be expressive or playful; mechanical rules should remain dependable when the mechanic depends on player inference.

For example, an echo companion may look impatient or animate unpredictably, but if its puzzle role is to simulate alternatives, the action-to-result contract should remain deterministic unless uncertainty itself is the explicit system being taught through play.

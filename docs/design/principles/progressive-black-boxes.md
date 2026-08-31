# Principle: Progressive Black Boxes

## Rule

Do not require the player to open every abstraction before they are allowed to use it.

Higher-level meaning can precede lower-level implementation.

## Learning order

A useful default sequence is:

```text
Meaning
→ Application
→ Interface
→ Implementation
→ Complexity
```

This is not a mandatory chapter order. It is permission to postpone detail until motivation exists.

## Why

Many useful systems contain layers that are independently understandable.

For example, a shortest-path workflow can be understood as:

- maintain tentative distances;
- repeatedly choose the most promising location;
- update neighboring locations;
- continue until the desired result is settled.

The mechanism that efficiently chooses the next location is a separate question.

The player can first understand the workflow while a reliable world object performs that selection as a black box.

Later, when scale or repetition makes efficiency matter, the game may create motivation to inspect how the black box works.

## Opening a black box

Only expose deeper implementation when at least one of these is true:

- the player has encountered a performance or scale problem;
- understanding the implementation unlocks new agency;
- the internal mechanism itself supports good gameplay;
- the player has accumulated enough experience that the formal abstraction names an existing mental model rather than replacing one.

## Warning

A black box must still have a learnable contract.

"Do not explain the implementation" does **not** mean "make behavior arbitrary".

The player should be able to predict what the abstraction does even if they do not yet know how it does it.

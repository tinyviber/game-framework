# Product Vision

## North star

Build an exploratory top-down RPG puzzle world that remains worthwhile as a game even if the player never learns the formal computer-science or mathematical names behind its systems.

The player should primarily learn **how the world behaves**:

- what objects do;
- how terrain and materials respond;
- what tools and abilities enable;
- how stable rules combine;
- how previous places become newly meaningful after gaining capabilities or knowledge.

Computational ideas may inspire mechanics or explain their implementation, but they must not become the visible curriculum structure of the game.

## World first, computation second

Prefer:

```text
believable world rule
→ player experimentation
→ useful mental model
→ reusable gameplay
→ optional formal abstraction later
```

over:

```text
CS concept to teach
→ themed object
→ custom puzzle
→ explanation
```

A mechanic may be inspired by a stack, queue, graph, shortest-path algorithm, counting process, or other abstraction. That inspiration does not justify the mechanic by itself.

## Desired player loop

A strong puzzle situation often follows:

```text
see a goal
→ form an intuitive plan
→ encounter a meaningful disruption
→ inspect the world
→ discover or reuse a stable rule
→ repair the plan
→ cause a visible world-state change
```

The game should reward prediction, experimentation, and authorship rather than answer recognition.

## Persistent exploration

The long-term direction is a connected or partially connected world, not a curriculum-shaped level list.

A useful framing is **open inside, sealed outside**:

- local spaces can support free exploration;
- the player may see places or states they cannot yet reach;
- barriers should follow world rules rather than arbitrary locks;
- new abilities, tools, or knowledge can recontextualize previously visited areas;
- the same systems should recur in deeper combinations.

Start and goal markers may exist for prototypes, but they should not define the topology or meaning of the whole world.

## Simple systems, rich composition

Prefer a small set of understandable world rules with broad interaction surfaces over many isolated puzzle gadgets.

A new mechanic is more valuable when it:

- behaves consistently across the world;
- interacts with existing systems;
- supports several qualitatively different situations;
- creates opportunities the designer did not enumerate explicitly;
- remains useful beyond the first reveal.

## Abstraction and learning order

The game may intentionally allow **temporary black boxes**.

A player can learn:

```text
Meaning
→ Application
→ Interface
→ Implementation
→ Complexity
```

rather than being forced to understand implementation details before using a higher-level tool.

For example, a world object may reliably choose an item according to a property before the player ever learns how such behavior could be implemented efficiently.

Using abstraction before opening it is legitimate gameplay and legitimate computer-science thinking.

## Human judgment remains final

Agents may generate mechanics, variants, prototypes, and critiques.

They must not treat model confidence, internal scoring, or conceptual cleverness as proof that something is fun.

The preferred loop is:

```text
AI divergence
→ concrete prototype
→ human play
→ human selection
→ production refinement
```

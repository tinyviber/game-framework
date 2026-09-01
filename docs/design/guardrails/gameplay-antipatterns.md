# Gameplay Antipatterns

These are recurring failure modes for this project.

They are not a checklist of forbidden aesthetics. They are warnings that should trigger explicit review when designing mechanics, puzzles, tools, progression, or world interactions.

Severity labels:

- **High** — likely to undermine the product direction if it becomes systemic.
- **Medium** — acceptable in small doses but dangerous when repeated.
- **Diagnostic** — evidence to investigate, not an automatic rejection.

## A. Concept-first failures

### F01 — Design by syllabus
**Severity: High**

**Failure:** A CS/math concept becomes the content generator, producing a "concept museum".

**Signals:**
- new areas are planned by asking which concept to teach;
- design documents map one concept to one region;
- a mechanic is defended primarily because a concept "needs coverage".

**Preferred response:** design a useful world behavior first; treat formal concepts as inspiration or later naming.

### F02 — Recognition replaces play
**Severity: Medium**

**Failure:** The reward is merely recognizing that a mechanic resembles a formal concept.

**Signals:**
- the main payoff is "oh, clever";
- the mechanic is interesting exactly once;
- removing the formal interpretation leaves little gameplay value.

**Preferred response:** reward player-caused world change, prediction, or new agency.

### F03 — Educational scent
**Severity: High**

**Failure:** The game visibly organizes itself around teaching.

**Signals:**
- NPC dialogue explains abstract rules rather than the world;
- rooms resemble diagrams or exercises;
- mechanics need instructional text to feel justified.

**Preferred response:** remove explanatory scaffolding and see whether the world behavior remains legible and useful.

### F04 — Concept treadmill
**Severity: High**

**Failure:** Each area introduces a new independent system and retires old ones.

**Signals:**
- progression depth mostly means learning more rules;
- old mechanics disappear for long stretches;
- later areas cannot be understood using earlier knowledge.

**Preferred response:** reuse, deepen, and combine existing systems faster than new systems are added.

### F05 — Complexity before motivation
**Severity: High**

**Failure:** The player receives a system before they have experienced the problem it solves.

**Signals:**
- early inventories contain unexplained tools;
- crafting/workbench complexity appears before a practical need;
- tutorials introduce capabilities before the player wants them.

**Preferred response:** let the player experience friction or desire first; introduce the mechanic as an answer.

## B. Puzzle architecture failures

### F06 — One-trick rooms
**Severity: Medium**

**Failure:** A room exists for one reveal and becomes dead content afterward.

**Preferred response:** build spaces where several systems remain active and the solved state can matter later.

### F07 — Answer-shaped rooms
**Severity: High**

**Failure:** Props, geometry, and fiction only exist to force one intended operation.

**Signal:** the place can only be described as "the room where you do X".

**Preferred response:** make a believable place first, then discover useful situations inside it.

### F08 — Text-dependent mechanics
**Severity: High**

**Failure:** Skipping instructions makes the rule effectively unknowable.

**Preferred response:** ensure the world contains enough observable evidence for a player to form and test a useful hypothesis.

There is no universal "20 second" requirement; slow discovery is allowed when evidence is fair.

### F09 — Puzzle-box logic
**Severity: High**

**Failure:** A puzzle uses rules that exist nowhere else.

**Signal:** players stop predicting and begin trying every combination.

**Preferred response:** puzzles should instantiate global world rules rather than local exceptions.

### F10 — Static puzzle artifacts
**Severity: Medium**

**Failure:** solved rooms stop participating in the world.

**Preferred response:** where useful, let solved states persist, create routes, change resources, or gain new meaning later.

### F11 — Unreadable irreversible failure
**Severity: High**

**Failure:** an irreversible action silently destroys progression or requires a reload without fair warning.

**Preferred response:** irreversible actions are allowed, but consequences must be readable and progression must retain a recovery path or intentional commitment structure.

## C. Inventory, tools, and abilities

### F12 — Tool per puzzle
**Severity: High**

**Failure:** each puzzle creates another single-purpose inventory item.

**Signals:**
- many items are used once;
- tool count grows faster than gameplay verbs;
- inventory usage becomes constant menu search.

**Preferred response:** prefer a small number of broad verbs/properties.

### F13 — Inventory as key closet
**Severity: High**

**Failure:** solving means trying item X on object Y until the matching key is found.

**Preferred response:** tools should express reusable actions or properties: move, weigh, bind, ignite, sort, redirect, duplicate, reveal, and similar capabilities.

### F14 — Non-composable abilities
**Severity: High**

**Failure:** an ability only interacts with its dedicated target class.

**Preferred response:** production mechanics should have meaningful interactions with multiple existing systems.

### F15 — Fun once
**Severity: Medium**

**Failure:** the second puzzle is the first puzzle with larger numbers.

**Preferred response:** seek parameters such as position, order, timing, material, quantity, topology, or competing goals that change decisions qualitatively.

### F16 — Forgotten verbs
**Severity: Medium**

**Failure:** abilities have a linear lifecycle: learn, use, retire.

**Preferred response:** later play should recombine earlier verbs in new contexts.

## D. World and exploration

### F17 — Fake open world
**Severity: High**

**Failure:** the map has branches but the legal progression order is effectively singular.

**Signals:**
- most side routes say "not yet";
- players quickly learn not to explore;
- start-to-goal structure determines the whole world.

**Preferred response:** use world knowledge and broadly useful abilities to create alternate orders, loops, meaningful dead ends, and recontextualized old spaces.

### F18 — Guided-tour exploration
**Severity: Medium**

**Failure:** the game always tells the player what matters next.

**Preferred response:** place unexplained but readable anomalies, optional goals, and delayed payoffs.

### F19 — Motivationless world
**Severity: High**

**Failure:** large areas are technically explorable but provide no reason to care.

**Preferred response:** discoveries should serve player-chosen goals through new actions, information, routes, resources, relationships, or world change.

### F20 — Pacing blindness
**Severity: Diagnostic**

**Failure:** challenge density is driven by content quantity rather than tension and recovery.

**Preferred response:** mix concentrated problem solving with movement, observation, discovery, and low-pressure interaction.

## E. Fiction and consistency

### F21 — Fiction collapse
**Severity: High**

**Failure:** the honest answer to "why is this thing here?" is "for the puzzle".

**Preferred response:** important systems should have an in-world use independent of the current player challenge.

### F22 — Visual-language betrayal
**Severity: High**

**Failure:** appearance implies one behavior while mechanics produce another.

**Preferred response:** visible affordances and gameplay semantics must agree.

### F23 — Consistency drift
**Severity: High**

**Failure:** identical-looking things gain local exceptions across regions.

**Preferred response:** treat gameplay rules as invariants worth documenting and testing, just like code invariants.

## F. Depth and long-term health

### F24 — No player authorship
**Severity: Medium**

**Failure:** every successful playthrough looks essentially identical.

**Preferred response:** include systems that allow useful experimentation, alternate solutions, self-created goals, or unexpected but coherent outcomes.

### F25 — Novelty tax
**Severity: High**

**Failure:** difficulty grows mostly by requiring the player to remember more unrelated systems.

**Preferred response:** deepen and recombine before adding.

### F26 — Smart-game trap
**Severity: High**

**Failure:** the game's identity becomes "look how cleverly we hid mathematics/computation".

**Preferred response:** the hidden structure must remain secondary to satisfying play and a believable world.

## How to use this document

When reviewing a new mechanic or progression proposal:

1. identify relevant failure modes;
2. cite concrete symptoms rather than labels alone;
3. distinguish hard product risks from acceptable prototype experiments;
4. do not reject novelty merely because it resembles a formal abstraction;
5. ask whether the mechanic would still deserve to exist if its CS/math interpretation were removed.

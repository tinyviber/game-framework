# Mechanic Admission Gates

Use these gates when deciding whether an experimental gameplay mechanic should become a production system.

They are intentionally stricter for **promotion** than for brainstorming or spikes.

## Classification first

Every mechanic under discussion should be one of:

- **Experiment** — cheap spike used to learn; may violate diagnostics deliberately.
- **Candidate** — promising mechanic under structured evaluation.
- **Production mechanic** — intended to become part of the persistent world grammar.

Do not demand production architecture from experiments.

## Hard gates

A production mechanic should pass all hard gates unless the human project owner explicitly accepts the trade-off.

### 1. Learnability

Can a player form a useful mental model through observation and reasonable experimentation without needing textbook explanation?

This does not require instant discovery. The requirement is fair evidence and a stable contract.

### 2. Fiction

Does the mechanic have a plausible role in the world beyond serving the current puzzle?

Useful prompt: **what would an inhabitant use this for?**

### 3. Composition

Can the mechanic interact meaningfully with at least two existing systems or world properties?

A meaningful interaction should create behavior neither side provides alone, not merely trigger a dedicated compatibility case.

### 4. Depth

Can we describe at least three qualitatively different gameplay situations using the same mechanic?

Increasing only the number of objects, path length, or target value does not count as qualitative difference.

### 5. State readability

Can the player observe the state that matters, predict consequences well enough to plan, and understand why an action succeeded or failed?

Not every state must be shown as a number. Physical or visual representation is preferred when appropriate.

## Diagnostic gates

Failure here does not automatically reject a mechanic, but should produce an explicit note.

### 6. Parameter depth

Does the system have meaningful parameters such as position, ordering, timing, material, quantity, direction, topology, or competing goals that change decisions rather than only difficulty?

### 7. Multiple approaches

Can reasonable players arrive at different valid plans in at least some situations?

A mechanic can still be useful if not every puzzle has multiple solutions.

### 8. Emergence

Can the system produce coherent states or uses the designer did not manually enumerate?

Fully enumerable behavior is not automatically bad, but low emergence reduces systemic value.

### 9. Scale

Does the mechanic remain understandable and tolerable when repeated or used with substantially more entities?

Scale should create motivation or new strategy rather than repetitive labor.

### 10. Reuse

Does the mechanic naturally return later in deeper combinations, or does it have an obvious retirement point?

### 11. Reverse explanation

After learning it, can a player naturally explain the mechanic in world language without needing the formal CS/math term?

### 12. Subtraction

If the mechanic vanished tomorrow, would the game world lose a useful behavior, or would only the hidden curriculum lose a topic?

The latter is a warning sign.

## Promotion rule

A candidate is normally ready for production when:

- all five hard gates pass;
- major relevant antipatterns have been reviewed;
- at least one concrete playable prototype has been human-tested;
- unresolved diagnostic failures are documented rather than hand-waved.

Do not use a numeric score as an automatic approval mechanism.

Human play judgment is the final gate.

## Review template

```markdown
# Mechanic review: <name>

Status: Experiment | Candidate | Production proposal

## Player-facing contract
...

## Hard gates
- Learnability: PASS / FAIL — evidence
- Fiction: PASS / FAIL — evidence
- Composition: PASS / FAIL — evidence
- Depth: PASS / FAIL — evidence
- State readability: PASS / FAIL — evidence

## Diagnostics
- Parameter depth:
- Multiple approaches:
- Emergence:
- Scale:
- Reuse:
- Reverse explanation:
- Subtraction:

## Relevant antipattern risks
- Fxx — ...

## Human evidence needed
...

## Recommendation
Prototype / Iterate / Promote / Reject / Explicit exception required
```

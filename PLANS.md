# Zenith Execution Plans

Use an execution plan for roadmap slices, cross-boundary changes, risky refactors, or work that will span several files or sessions. A plan is a living state artifact, not ceremonial prose.

Create plans under:

```text
docs/codex/plans/YYYY-MM-DD-short-slug.md
```

The plan must be understandable to a fresh Codex session with no access to earlier conversation context.

## Required structure

```markdown
# <Outcome-oriented title>

Status: proposed | active | blocked | complete
Roadmap phase: <phase or "not roadmap-specific">
Baseline commit: <git SHA>
Last updated: <date/time>

## Goal

Describe the observable outcome, not merely files to edit.

## Why this slice now

Explain the architectural ambiguity, failure, or roadmap dependency this resolves.

## Current behavior and evidence

- Trace the current execution/data path.
- Name relevant files, symbols, tests, and observed behavior.
- Separate facts from assumptions.

## Invariants

List behavior and boundaries that must remain true.

## Scope

### In scope

- ...

### Explicit non-goals

- ...

## Proposed design

Describe ownership, data flow, public contracts, failure handling, and why this is the smallest complete slice.

## Alternatives considered

Include at least the status quo and one plausible alternative. State why they were rejected or deferred.

## Acceptance matrix

| Concern | Evidence required | Command/test |
|---|---|---|
| Behavior | ... | ... |
| Boundary | ... | ... |
| Invalid input | ... | ... |
| Regression | ... | ... |

## Implementation sequence

Use independently verifiable steps. Each step should leave the repository coherent.

1. ...
2. ...

## Risks and recovery

Describe likely regressions, how they will be detected, and how the change can be reverted or narrowed.

## Progress log

- [ ] ...

## Decisions and discoveries

Record facts learned during implementation that changed the plan.

## Final result

Summarize the delivered behavior, validation evidence, unresolved risks, and intentionally deferred work.
```

## Planning rules

- Do not use the plan to smuggle in later roadmap phases.
- Update the plan when evidence changes the design; do not preserve a false plan for appearance.
- Keep implementation progress and architecture decisions distinct.
- A plan may conclude that no code change is warranted.
- Delete no user-authored plan history. Mark superseded decisions explicitly.

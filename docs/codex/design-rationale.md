# Design Rationale for the Zenith Codex Harness

Version: 0.1.1
Repository basis reviewed: `52f49e9207e6eb09e4f8b3f57d6d071c313acefa`
Review date: 2026-06-20

This harness is external to Zenith's application. It is a repository-level control system for Codex CLI and its subagents.

## The problem being solved

Zenith already has a credible current SvelteKit boundary and a detailed target roadmap. The main risk is therefore not lack of architectural ideas. It is that an agent can:

- read the end-state roadmap as permission for a big-bang rewrite;
- mix several migration phases into one patch;
- lose current product behavior while improving abstractions;
- put portable data and browser runtime handles into the same type;
- over-expand `workbench-commands.ts` or split it through a generic framework;
- run several writing agents in one tree and lose ownership of the final design;
- report completion after typechecking without testing invalid or restoration behavior.

The harness addresses these failure modes by controlling perception, work organization, state, and verification separately.

## Harness functions

### Persistent policy — `AGENTS.md`

The root instruction file contains only rules that should apply to most consequential Zenith changes:

- source-of-truth order;
- browser/server/shared ownership;
- phase discipline;
- paid-call and secret boundaries;
- single-writer protocol;
- completion evidence.

It does not restate the entire roadmap. Codex is told which document to read for the task at hand.

### Procedural state — `PLANS.md`

A large task can survive context compaction or a fresh session only if its goal, current evidence, decisions, scope, acceptance conditions, and progress are externalized. The plan is the durable state object for one change.

### Progressive procedure — repository skills

The detailed roadmap-slice workflow is stored as a skill rather than permanently occupying every prompt. It is invoked explicitly for architecture work and loads focused references for boundaries, verification, and Phase 1.

### Specialized perception — custom subagents

Each subagent has one narrow read-only responsibility:

- map current code;
- interpret the roadmap;
- design portable contracts;
- derive tests;
- challenge unnecessary complexity;
- audit final boundaries;
- review correctness and regressions.

These roles create several independent evidence channels without creating several competing patches.

### Integration — one parent writer

The parent thread reconciles evidence and performs all edits. This keeps one owner for the design, avoids concurrent working-tree collisions, and makes the final patch attributable.

### Verification — separate from construction

The harness does not organize everything around tests, but it treats verification as an independent function. The test strategist defines evidence before implementation, while fresh post-change reviewers examine the actual diff after implementation.

## Why Phase 1 was the first operating prompt

The roadmap identified the project snapshot/shared-contract boundary as the highest-value first phase. It removed ambiguity between runtime browser objects and portable project data while avoiding premature decisions about assets, jobs, databases, or hosting.

At the time, `workbench-commands.ts` was a useful pressure point because snapshot import/export shared a module with local media operations, paid operators, artifact mutation, and browser file IO. The harness narrowed the first change to extraction of the persistence boundary only; later Phase 2 slices handled paid operator execution and local render orchestration.

Current status: that original Phase 1 slice has landed, and later slices extracted paid operator execution, local render orchestration, and a partial Phase 3 in-memory depth job boundary. Future sessions should begin with the architecture audit prompt and the current roadmap recommendation rather than assuming Phase 1 is still next.

## Why there are no nested `AGENTS.md` files

Codex discovers `AGENTS.md` from the repository root down to the current working directory once per run. Most users will launch Codex from the Zenith root, so subtree files would not reliably influence a root-launched session and would duplicate policy.

Instead, specialized architecture guidance lives in skill references and is loaded when the roadmap skill runs. If the team later launches Codex routinely from subdirectories, targeted nested instruction files can be introduced with evidence that they improve behavior.

## What this harness intentionally does not do

- It does not choose a model for the user.
- It does not loosen the user's sandbox or approval settings.
- It does not call Codex recursively through scripts.
- It does not allow subagents to write concurrently.
- It does not implement automatic harness self-modification.
- It does not encode later roadmap designs as current requirements.
- It does not replace human product judgment or acceptance.

## How to improve the harness later

Use change receipts and plans as evidence. Update the harness only when a repeated failure is observed.

Examples:

- Codex repeatedly ignores a boundary: sharpen one persistent rule and add a boundary test.
- Plans become ceremonial: remove fields that do not change decisions.
- Contract reviews miss restoration bugs: improve the contract agent and Phase 1 reference.
- Review agents duplicate each other: split or remove a role.
- The parent fails to reconcile disagreements: require an explicit evidence table before editing.
- A rule becomes obsolete after a roadmap phase: revise or retire it rather than accumulating exceptions.

A future L4 improvement loop could analyze receipts, traces, test failures, and review findings to propose harness changes. Such changes should remain versioned, reviewed, and validated before future Codex runs inherit them.

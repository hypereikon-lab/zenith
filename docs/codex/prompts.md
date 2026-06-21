# Zenith Codex Prompts

These prompts are reusable operating patterns. The Phase 1 project snapshot prompt is preserved as a completed historical example; do not treat it as the current recommended slice. For a fresh session, start with the architecture audit prompt and then execute the single next slice named by the current roadmap.

## 1. Historical completed task: roadmap Phase 1

```text
Use $zenith-roadmap-slice.

Goal: implement only the “Recommended Next Implementation Slice” from `docs/ultimate-architecture-roadmap.md`: the Phase 1 project snapshot and shared-contract boundary. Keep visible UI behavior unchanged.

Before editing:
1. Record the current HEAD and working-tree state. Preserve all unrelated user changes.
2. Read `AGENTS.md`, `PLANS.md`, `README.md`, `docs/sveltekit-architecture.md`, the Phase 1 and recommended-slice sections of `docs/ultimate-architecture-roadmap.md`, and the current snapshot code/tests.
3. Create `docs/codex/plans/<date>-phase-1-project-snapshot.md` from `PLANS.md`.
4. Explicitly spawn these read-only agents in parallel, wait for all of them, and reconcile their results:
   - `zenith_repo_mapper`: trace the current snapshot save/import/restore path and all state involved;
   - `zenith_roadmap_architect`: define Phase 1 ownership and detect phase leakage;
   - `zenith_contract_designer`: propose the minimal JSON-safe Zod contract and runtime conversion boundary;
   - `zenith_test_strategist`: produce the acceptance matrix and exact no-paid-call tests;
   - `zenith_simplifier`: challenge unnecessary abstraction or scope.

Do not edit until their evidence is reconciled into the plan.

Implementation constraints:
- The parent thread is the sole writer.
- Add the shared project contract and a focused browser-safe project persistence module.
- Move only snapshot serialization/parsing/restoration responsibilities out of `src/app/workbench-commands.ts`; do not perform the wider Phase 2 command split.
- Parse and validate the whole imported snapshot before mutating live state.
- Keep portable data JSON-safe and runtime handles out of shared contracts.
- Preserve supported current snapshot behavior and UI entry points.
- Do not add a database, asset store, job system, generic migration framework, generic repository abstraction, or new dependency.
- Do not invoke Runway or Codex paid APIs.

Verification must cover at least:
- valid current snapshot;
- unsupported/invalid version;
- missing or malformed artifacts;
- JSON-safe cleanup of runtime media fields;
- restoration of prompts, projection/view state, motion configuration, selection, and QC state;
- invalid import leaves current live state unchanged.

Run targeted tests while iterating, then the relevant typecheck, lint, unit suite, and build.

After implementation, explicitly spawn `zenith_boundary_auditor` and `zenith_final_reviewer`, wait for both, fix material findings, rerun affected checks, update the plan, and produce a change receipt. Recommend but do not implement the next slice.
```

## 2. Choose the next roadmap slice

```text
Use $zenith-architecture-audit.

Audit the current repository at its actual HEAD. Do not edit code. Use parallel read-only subagents, reconcile their evidence, and recommend exactly one smallest high-value next slice. The recommendation must name the roadmap phase, current execution path, ownership ambiguity being resolved, explicit non-goals, acceptance evidence, and later work enabled. Prefer current correctness or boundary clarity over roadmap completion theater.
```

## 3. Execute an already chosen slice

```text
Use $zenith-roadmap-slice.

Outcome: <state the user-visible or architectural outcome>.
Roadmap phase: <phase>.
In scope: <bounded list>.
Explicit non-goals: <bounded list>.

Before editing, map the current behavior with read-only subagents, create a plan, and define an acceptance matrix. Keep the parent as sole writer. Implement the smallest complete vertical slice, run relevant verification, then obtain independent boundary and owner-level reviews of the actual diff.
```

## 4. Review a branch or completed diff

```text
Review the current branch against <base branch or commit>. Do not edit initially.

Explicitly spawn and wait for:
- `zenith_boundary_auditor` for browser/server/shared ownership and paid-effect risks;
- `zenith_final_reviewer` for correctness, regressions, scope, and missing tests;
- `zenith_test_strategist` for evidence gaps;
- `zenith_simplifier` for unnecessary architecture.

Reconcile their findings against the actual code and test output. Report only concrete findings with severity, path/symbol, failure mechanism, and proposed evidence. Separate blockers from optional improvements. If I then authorize fixes, keep the parent thread as sole writer and rerun the affected checks.
```

## 5. Standalone prompt when no harness files are installed

```text
You are improving the Zenith repository as an architecture-aware Codex lead. The current code and tests are factual truth; `docs/sveltekit-architecture.md` describes the present boundary; `docs/ultimate-architecture-roadmap.md` describes the target, migration order, deferred decisions, and non-goals.

Your job is to complete one bounded change without turning the roadmap into a big-bang rewrite.

Operating rules:
- Inspect git status and preserve unrelated changes.
- Keep WebGPU/WebCodecs/canvas/DOM/local media work browser-side.
- Keep secrets, filesystem access, Runway/Codex SDK calls, and paid effects server-side.
- Keep routes thin and shared contracts JSON-safe and side-effect free.
- Use Zod at external/persistence boundaries, not everywhere.
- Do not add a database, queue, worker, sidecar, generic workflow engine, collaboration system, or new dependency unless this exact slice requires it and the roadmap phase permits it.
- Never make paid Runway/Codex calls in automated tests.
- Preserve UI behavior for architecture-only work.

Before editing, explicitly spawn several read-only subagents in parallel:
1. an explorer to trace the current execution/data path and tests;
2. an architect to compare the change with roadmap phases and non-goals;
3. a test strategist to define success, failure, and regression evidence;
4. a simplifier to find a smaller complete design;
5. a contract specialist if portable data or API boundaries are involved.

Wait for all results. Reconcile disagreements with repository evidence. Write a durable plan containing goal, baseline commit, current behavior, invariants, scope, non-goals, design, alternatives, acceptance matrix, implementation steps, risks, and progress.

The main thread is the sole writer. Implement the smallest complete slice. Run targeted tests, then typecheck, lint, unit tests, build, and only relevant smoke tests. Afterward, spawn two fresh read-only reviewers: one for architectural boundaries and one for correctness/regressions. Fix material findings, rerun checks, and finish with a change receipt listing exact evidence and deferred work.

Task: <insert the bounded outcome here>.
```

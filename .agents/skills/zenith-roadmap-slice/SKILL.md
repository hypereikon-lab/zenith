---
name: zenith-roadmap-slice
description: Execute a bounded Zenith architecture or code-quality slice using roadmap-aware planning, parallel read-only analysis, single-writer implementation, and independent verification. Use for multi-file refactors, shared contracts, project persistence, command splitting, jobs, assets, API boundaries, or other roadmap work.
---

# Zenith Roadmap Slice

Use this procedure for consequential changes. The parent Codex thread owns integration and is the sole writer.

## 1. Establish the baseline

- Read `AGENTS.md`, `PLANS.md`, `README.md`, `docs/sveltekit-architecture.md`, and the relevant sections of `docs/ultimate-architecture-roadmap.md`.
- Record `git rev-parse HEAD` and `git status --short`.
- Preserve unrelated working-tree changes.
- Trace the current behavior before proposing a replacement.
- Run the smallest baseline check that can reveal an already-broken state. Do not modify the lockfile merely to make the environment convenient.

## 2. Define the slice

State:

- observable outcome;
- roadmap phase;
- current behavior;
- architectural invariants;
- in-scope work;
- explicit non-goals;
- evidence required for completion.

Create or update a plan in `docs/codex/plans/` using `PLANS.md`.

## 3. Parallelize perception, not writing

Explicitly spawn and wait for these read-only custom agents when relevant:

- `zenith_repo_mapper` — current execution/data path;
- `zenith_roadmap_architect` — phase, ownership, and deferred decisions;
- `zenith_test_strategist` — acceptance matrix and no-paid-call tests;
- `zenith_simplifier` — smallest complete design;
- `zenith_contract_designer` — additionally for contracts, snapshots, jobs, assets, or API data.

Give each agent the same outcome and scope, but its own narrow question. Reconcile disagreements with repository evidence. Do not treat majority agreement as proof.

## 4. Design before editing

Read the relevant skill references:

- `references/architecture-boundaries.md`;
- `references/verification-matrix.md`;
- `references/phase-1-project-contracts.md` when working on Phase 1.

The design must identify:

- one owner for each mutable state or side effect;
- portable data versus runtime handles;
- input validation and error behavior;
- compatibility behavior;
- a reversal or narrowing path;
- later-phase work that is intentionally not introduced.

Do not start implementation until the plan contains an acceptance matrix.

## 5. Implement as one writer

- The parent thread edits the working tree.
- Keep each step independently testable and the repository coherent.
- Preserve UI behavior for architecture-only slices.
- Avoid opportunistic cleanup outside the plan.
- Add no generic framework to solve one concrete boundary.
- Do not invoke paid Runway or Codex APIs.

## 6. Verify incrementally

- Run targeted tests after each coherent unit.
- Run the relevant typecheck, lint, unit, build, and smoke checks from `AGENTS.md` before completion.
- Verify failure cases, not only the happy path.
- Record exact commands and results in the plan.

## 7. Independent final review

After implementation, explicitly spawn and wait for:

- `zenith_boundary_auditor`;
- `zenith_final_reviewer`.

Give them the goal, plan path, and actual diff. Fix material findings, rerun affected checks, and record disagreements rather than silently dismissing them.

## 8. Produce a change receipt

Use `docs/codex/change-receipt-template.md` and report:

- delivered behavior;
- ownership/boundary improvement;
- files changed;
- tests and commands run;
- findings fixed or consciously rejected;
- remaining uncertainty;
- deliberately deferred roadmap work;
- recommended next slice, without implementing it.

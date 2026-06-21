# Current Architecture Documentation Refresh

Status: complete
Roadmap phase: documentation checkpoint across Phases 1-3; next-slice recommendation for Phase 3 hardening
Baseline commit: 52f49e9207e6eb09e4f8b3f57d6d071c313acefa
Last updated: 2026-06-20

## Goal

Refresh Zenith's current architecture and roadmap documentation so it reflects the actual repository state after the Phase 1 project snapshot boundary, Phase 2 command split, and Phase 3 depth job slices. Remove or clearly mark legacy documentation that now misleads future architecture work.

## Why this slice now

The code has moved past several roadmap objectives, but the current-facing docs still describe Phase 1 as the recommended next task and omit shared contracts, browser-owned project persistence, split operator modules, and first-class in-memory depth jobs. Leaving those docs unchanged would cause future agents to repeat completed work or over-rotate into the wrong phase.

## Current behavior and evidence

- Baseline: `git rev-parse HEAD` returned `52f49e9207e6eb09e4f8b3f57d6d071c313acefa`; `git status --short` was clean.
- Project snapshot contracts exist in `src/lib/shared/contracts/projects.ts` via `ProjectSnapshotV1Schema` and `parseProjectSnapshot`.
- Browser project persistence exists in `src/app/project-persistence.ts`; import parsing happens before live state mutation, and portable media is cleaned of runtime object URLs and handles.
- `src/app/workbench-commands.ts` is now a public command bridge for UI entry points. It delegates project persistence, paid operators, and local render operators to focused modules.
- Paid operator orchestration lives in `src/app/paid-operator-execution.ts`; local preview/export/capture orchestration lives in `src/app/local-render-operators.ts`.
- Job contracts exist in `src/lib/shared/contracts/jobs.ts` for `generate-start-depth` and `generate-end-depth` only.
- First-class in-memory depth jobs live under `src/lib/server/jobs`, with create, event-stream, and cancel routes under `src/routes/api/projects/[projectId]/jobs`, `src/routes/api/jobs/[jobId]/events`, and `src/routes/api/jobs/[jobId]`.
- The active workbench still calls the legacy browser API client for paid operators. The depth stream endpoint is now job-backed as a compatibility wrapper; inpaint, Seedance, and Codex prompt streams remain direct request/response streams.
- `docs/ultimate-architecture-roadmap.md`, `docs/sveltekit-architecture.md`, `README.md`, and Codex harness docs contain stale current-state claims.
- `docs/interface-rework-capability-spec.md` references pre-current tracked entry and workspace paths as confirmed current surfaces.

## Invariants

- Do not change runtime behavior or visible UI behavior.
- Keep WebGPU, WebCodecs, DOM, canvas, Blob/File, object URL, and local media work browser-owned.
- Keep secrets, paid upstream calls, filesystem access, and server trust boundaries in SvelteKit server modules.
- Keep shared contracts JSON-safe and side-effect free.
- Do not claim jobs are durable, persisted, worker-backed, or complete for every paid operator.
- Do not rewrite completed execution plans as if they are current-state docs.

## Scope

### In scope

- Update `README.md` to describe the active workflow and current module ownership more accurately.
- Update `docs/sveltekit-architecture.md` to document shared contracts, browser project persistence, split app-side operators, in-memory depth jobs, and compatibility streams.
- Update `docs/ultimate-architecture-roadmap.md` to mark Phase 1 and Phase 2 as landed, Phase 3 as partial for depth jobs, and replace the stale Phase 1 next-slice recommendation.
- Update current-facing Codex harness docs so they do not recommend Phase 1 as the default first task.
- Remove or mark legacy docs that describe obsolete current implementation surfaces.
- Keep the plan updated with exact verification and review evidence.

### Explicit non-goals

- No code changes.
- No database, durable project store, asset store, queue, worker, `/api/projects` CRUD, auth, rate limits, or production operations implementation.
- No generic command bus, repository abstraction, workflow engine, or broad UI rewrite.
- No Runway or Codex paid calls.
- No new dependency.
- No edits to historical `docs/codex/plans/*.md` receipts except this new plan.

## Proposed design

Make a documentation-only patch that separates current facts from roadmap future state:

- `README.md` remains the quick product and repo orientation.
- `docs/sveltekit-architecture.md` remains the current architecture source of truth.
- `docs/ultimate-architecture-roadmap.md` remains the migration map, with explicit progress notes for completed and partial phases.
- Codex harness docs become process guidance from the current repo state, with the old Phase 1 prompt preserved only as historical/completed example.
- Legacy implementation docs that assert obsolete file paths as current facts are removed or marked historical so they cannot compete with the current architecture doc.

This is the smallest complete slice because it fixes the decision surface without changing executable code.

## Alternatives considered

- Status quo: rejected because future agents would continue treating completed Phase 1 work as the next implementation slice.
- Runtime refactor: rejected because the user asked to reassess from current state and docs are the mismatch; code already contains the boundaries being documented.
- Rewrite every old plan and prompt: rejected because completed plans are historical evidence and `PLANS.md` says not to delete user-authored plan history.
- Archive every old design memo: rejected because some speculative memos still contain useful product context if clearly marked as non-current.

## Acceptance matrix

| Concern                       | Evidence required                                                                                                                                                       | Command/test                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Docs-only scope               | Diff contains only docs and this plan.                                                                                                                                  | Changed-file list                    |
| Current architecture accuracy | Current docs name `ProjectSnapshotV1`, `project-persistence.ts`, `paid-operator-execution.ts`, `local-render-operators.ts`, job contracts, server jobs, and job routes. | Current architecture search          |
| Roadmap status                | Phase 1 and Phase 2 are no longer described as future next work; Phase 3 is marked partial; Phase 4+ remain future.                                                     | Stale roadmap phrase search          |
| Legacy docs                   | Obsolete current-surface references are removed from current docs or clearly marked historical.                                                                         | Obsolete current-surface search      |
| Markdown formatting           | Changed docs pass targeted Prettier.                                                                                                                                    | Targeted Prettier check              |
| Runtime safety                | No paid-call or runtime behavior changed.                                                                                                                               | Diff inspection and docs-only status |

## Implementation sequence

1. Update current architecture docs and README.
2. Update roadmap progress and next-slice recommendation.
3. Update harness docs that still direct users to Phase 1 as the first/current task.
4. Remove or mark obsolete legacy implementation docs.
5. Run targeted doc verification.
6. Spawn independent boundary and final reviewers, fix material findings, and rerun affected checks.

## Risks and recovery

- Risk: overclaiming Phase 3 as complete. Recovery: explicitly say only start/end depth jobs are first-class in-memory jobs.
- Risk: deleting useful product history. Recovery: remove only docs whose current implementation facts are wrong, or mark speculative memos historical instead.
- Risk: formatting churn. Recovery: use targeted Prettier only on changed docs.
- Risk: stale plan evidence. Recovery: update this plan when implementation evidence changes.

## Progress log

- [x] Recorded baseline HEAD and clean working tree.
- [x] Read repository instructions, roadmap-slice references, README, architecture doc, roadmap sections, and current snapshot/job/operator code.
- [x] Spawned and reconciled read-only repo mapper, roadmap architect, test strategist, and simplifier agents.
- [x] Update current architecture and roadmap docs.
- [x] Update or remove legacy docs.
- [x] Run targeted verification.
- [x] Run independent post-change review.
- [x] Record final result.

## Decisions and discoveries

- The implementation mismatch is documentation-first. Runtime code already contains the Phase 1, Phase 2, and partial Phase 3 boundaries.
- The active workbench still uses legacy browser paid-stream client functions. Only the depth stream compatibility route is job-backed.
- `GET /api/jobs/:jobId` status reads are not implemented; `DELETE /api/jobs/:jobId` cancellation and `GET /api/jobs/:jobId/events` streaming are implemented.
- Historical plan files should remain untouched.
- `docs/interface-rework-capability-spec.md` contained obsolete current-code claims but also useful interface guidance. It was restored as a historical/speculative memo with stale implementation facts removed.
- Raw `GET /api/jobs/:jobId/events` stream closure only unsubscribes. Direct job cancellation is `DELETE /api/jobs/:jobId`; the depth compatibility stream remains the path that cancels on stream/request close.
- The RGBD Expansion Lab has a separate browser-owned paid/local-endpoint path under `src/ui`, `src/scene`, and `src/services`; it is not yet centralized behind `src/app/paid-operator-execution.ts` or first-class job routes.
- One roadmap reviewer suggested Phase 4A asset-contract work as the next implementation phase. The final roadmap recommendation stays narrower: Phase 3 `GET /api/jobs/:jobId` status reads, because the current job boundary already creates/events/cancels jobs but has no direct status read.

## Verification results

Passed:

```sh
git diff --check
npm exec -- prettier --check README-HARNESS.md README.md docs/codex/README.md docs/codex/design-rationale.md docs/codex/prompts.md docs/dino-bridge-flow-interface-second-pass.md docs/interface-rework-capability-spec.md docs/sveltekit-architecture.md docs/ultimate-architecture-roadmap.md docs/codex/plans/2026-06-20-current-architecture-doc-refresh.md
rg -n "Highest-value next phase|best next code change is Phase 1|There is no first-class API contract layer|workbench-commands.ts owns too many|still shaped as request/response streams" README.md README-HARNESS.md docs --glob '!docs/codex/plans/*'
rg -n "src/workspace|src/main\\.ts|src/capture|depth-motion-controller|session-repository|workspace-snapshot|version-controller" README.md README-HARNESS.md docs --glob '!docs/codex/plans/*'
rg -n "ProjectSnapshotV1|project-persistence|paid-operator-execution|local-render-operators|src/lib/server/jobs|generate-start-depth|generate-end-depth" README.md README-HARNESS.md docs --glob '!docs/codex/plans/*'
npm run lint
npm run typecheck
```

The two stale `rg` checks passed by returning no matches in current-facing docs. The architecture-accuracy `rg` check returned the expected current module references.

Not run:

- `npm test`, `npm run build`, and `npm run test:e2e` were not run because this slice changed only documentation and did not modify executable TypeScript, Svelte, routes, contracts, or tests.

## Review results

- `zenith_final_reviewer` found that deleting `docs/interface-rework-capability-spec.md` lost useful future interface guidance. Fixed by restoring it as a historical/speculative memo and removing obsolete current implementation facts.
- `zenith_final_reviewer` found that this plan was not updated and contained a brittle Markdown table with pipe-heavy commands. Fixed by marking progress complete, adding verification results, and simplifying the table.
- `zenith_boundary_auditor` found that raw job-event abort semantics were overstated. Fixed by documenting that raw event-stream closure only unsubscribes and `DELETE /api/jobs/:jobId` is the direct cancellation boundary.
- `zenith_boundary_auditor` found that docs understated the active RGBD paid orchestration path outside the artifact workbench command split. Fixed by documenting the RGBD lab as a separate browser-owned local-endpoint path.
- `zenith_boundary_auditor` found a Playwright test bullet that still described project persistence as future. Fixed by rewording it around existing project persistence flows.

## Final result

Complete. Current-facing docs now describe the actual Phase 1 project snapshot boundary, Phase 2 artifact workbench command split, and partial Phase 3 in-memory depth job boundary. The roadmap no longer recommends repeating Phase 1; it recommends the smallest current Phase 3 hardening slice, `GET /api/jobs/:jobId` status reads over the in-memory store. Legacy interface docs are either marked historical/speculative or rewritten to avoid stale implementation facts. No runtime code, UI behavior, paid-call behavior, dependencies, storage, queues, workers, assets, or build configuration changed.

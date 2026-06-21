# Phase 2 Paid Operator Execution Boundary

Status: complete
Roadmap phase: Phase 2: Command Split And Thin UI
Baseline commit: 51124275fd4610a74092a8c753cc4d9055b9a426
Last updated: 2026-06-20 19:17 -04

## Goal

Extract the paid Runway operator execution path from `src/app/workbench-commands.ts` into a focused browser/app-side module while preserving the existing command entry point, confirmation flow, local commands, project persistence behavior, and visible UI behavior.

## Why this slice now

Phase 1 established the project snapshot boundary. The next smallest high-value Phase 2 step is to separate confirmed paid operator payload creation and result application from the broad command bridge. Today `workbench-commands.ts` still owns local media commands, project save/load delegation, local render orchestration, paid Runway payloads, job progress state, and artifact result application. Moving only the paid execution block clarifies ownership without introducing jobs, assets, routes, or a command framework.

## Current behavior and evidence

- Baseline HEAD is `51124275fd4610a74092a8c753cc4d9055b9a426`.
- Working tree is intentionally dirty with completed Phase 1 project snapshot work:
  - `M src/app/workbench-commands.test.ts`
  - `M src/app/workbench-commands.ts`
  - `?? docs/codex/plans/2026-06-20-phase-1-project-snapshot.md`
  - `?? src/app/project-persistence.test.ts`
  - `?? src/app/project-persistence.ts`
  - `?? src/lib/shared/`
- Baseline targeted check on the dirty Phase 1 tree passed: `npm test -- src/app/workbench-commands.test.ts` passed with 9 tests.
- UI still starts operators through `executeOperator(item.operator.id)` in `src/ui/OperatorPanel.svelte`.
- `executeOperator` currently owns paid confirmation: unconfirmed paid operators set `workbench.pendingPaidAction` and return before jobs or Runway client calls.
- `PaidActionConfirm.svelte` reads `workbench.pendingPaidAction` and calls `confirmPendingPaidAction` or `cancelPendingPaidAction`.
- Confirm clears pending state and re-enters `executeOperator(..., { confirmed: true })`.
- `executeOperator` catches local and paid errors, records a workbench error, and calls `finishJob(operatorId, "Failed")`.
- The paid execution switch in `workbench-commands.ts` starts a UI job, builds payloads for `repair-start-state`, `generate-start-depth`, `reconstruct-end-state`, `generate-end-depth`, and `generate-video-take`, calls browser Runway endpoint helpers, wires progress through `updateJob`, and applies image/video outputs to artifacts.
- `mediaToDataUrl` is browser-only and reads artifact media, runtime handles, canvas, Blob/FileReader, and fetchable URLs.
- Existing tests cover the confirmation gate and local media/project commands, but not confirmed paid payload parity, progress updates, paid result application, no-output failure, or unsupported paid operator behavior.

## Invariants

- Keep Svelte UI behavior and public command entry points unchanged.
- Keep `executeOperator`, `confirmPendingPaidAction`, `cancelPendingPaidAction`, local command dispatch, project import/export delegation, and local render orchestration in `workbench-commands.ts`.
- Keep browser media materialization in browser/app code; do not move canvas, Blob, FileReader, fetchable media URLs, or artifact runtime handles into server/shared code.
- Keep routes and `src/lib/server` unchanged; server-owned secrets and upstream paid effects remain behind local SvelteKit endpoints.
- Do not make automated tests call real Runway or Codex APIs.
- Preserve current artifact mutation, result list, selected artifact/stage, job progress/completion, and error behavior.

## Scope

### In scope

- Add one focused browser/app-side module, `src/app/paid-operator-execution.ts`.
- Move only confirmed paid execution responsibilities from `workbench-commands.ts`:
  - `executePaidOperator`;
  - paid payload assembly;
  - paid Runway client imports;
  - paid result application helpers;
  - browser media-to-data-URL helper used by paid payloads.
- Update `workbench-commands.ts` to delegate confirmed paid execution to the new module.
- Add focused no-paid-call unit tests for paid payload parity, progress/job behavior, result application, no-output errors, unsupported paid operator input, and command confirmation delegation.

### Explicit non-goals

- No database, durable queue, job store, job contracts, job routes, event streams, cancellation API, idempotency, retry model, or worker process.
- No asset refs, asset store, stored Runway outputs, upload endpoint, or media persistence change.
- No server-side `src/lib/server/operators` module.
- No route or Svelte UI changes.
- No local render split; `createMotionDraft`, `createDisplacedEndpoint`, artifact downloads, motion config export, and project save/load delegation stay in `workbench-commands.ts`.
- No generic command bus, operator framework, workflow runner, repository abstraction, or dependency injection layer.
- No new dependency.

## Proposed design

`src/app/paid-operator-execution.ts` will export `executePaidOperator(operatorId: OperatorId): Promise<void>`. It remains a browser/app module because it reads runtime artifact media and calls browser-safe local endpoint clients from `src/runway/client.ts`.

The new module owns the paid switch, payload creation, progress callback wiring, and paid result application. It imports the same artifact store helpers currently used by the paid block: `getArtifact`, `getArtifactMediaHandle`, `startJob`, `updateJob`, `finishJob`, `updateArtifact`, `addArtifactResult`, `selectArtifact`, and `workbench`. It keeps explicit product-shaped cases rather than introducing a registry or framework.

`workbench-commands.ts` keeps confirmation and the public command API. Once confirmed, it calls `executePaidOperator(operatorId)` exactly where the local/paid branch already exists. Error handling remains in `executeOperator`, preserving current failure behavior for both local and paid operators.

The paid module will duplicate a private `blobToDataUrl` helper rather than creating a generic media utility in this slice. That avoids pulling local render helpers or project persistence into the paid boundary.

## Alternatives considered

- Status quo: leave paid execution embedded in `workbench-commands.ts`. Rejected because Phase 2 specifically calls out paid payload creation and command ownership ambiguity.
- Generic operator framework or command bus: rejected as unnecessary abstraction and roadmap leakage.
- Move paid operators to server services now: rejected because current browser flow still calls local endpoints through `src/runway/client.ts`; durable server-side job backing is Phase 3.
- Split local render operators at the same time: rejected because the requested smallest slice is paid execution only.
- Add shared schemas for internal paid operator payloads: rejected because Zod already protects the route boundary and this slice should not turn every internal runtime type into a schema.

## Acceptance matrix

| Concern | Evidence required | Command/test |
|---|---|---|
| Confirmation gate | Unconfirmed paid operator sets pending action, starts no job, and does not call the paid executor. | `npm test -- src/app/workbench-commands.test.ts` |
| Confirm/cancel | Confirm clears pending action and delegates to the paid module; cancel clears pending action and delegates nothing. | `npm test -- src/app/workbench-commands.test.ts` |
| Payload parity | All five paid operators call the same mocked Runway helper with the same payload shape as current code. | `npm test -- src/app/paid-operator-execution.test.ts` |
| Progress/jobs | Progress callback updates the busy job; success finishes the job as complete. | `npm test -- src/app/paid-operator-execution.test.ts` |
| Result application | Paid image/video outputs update the intended artifact, media, prompt, operator metadata, result list, selected artifact/stage, warnings, and job state. | `npm test -- src/app/paid-operator-execution.test.ts` |
| Failure behavior | Missing media, no-output results, and unsupported paid operator inputs fail without real paid calls; `executeOperator(..., { confirmed: true })` still records errors and finishes jobs failed. | `npm test -- src/app/paid-operator-execution.test.ts src/app/workbench-commands.test.ts` |
| Local commands unaffected | Save/load, projection controls, media preview, local imports, and local render code stay outside the paid module. | Existing workbench tests plus code review |
| Boundary | No route, server, shared contract, asset, job, database, queue, or dependency changes. Browser-only media stays in app code. | Code review, `npm run typecheck`, `npm run build` |
| Regression | Phase 1 project snapshot tests and adjacent operator registry tests still pass. | `npm test -- src/app/operator-registry.test.ts src/app/project-persistence.test.ts src/lib/shared/contracts/projects.test.ts` |
| Repository checks | TypeScript, lint, unit suite, and build pass. | `npm run typecheck`; `npm run lint`; `npm test`; `npm run build` |

## Implementation sequence

1. Add `src/app/paid-operator-execution.ts` by moving the paid switch and paid-only helpers from `workbench-commands.ts`.
2. Update `src/app/workbench-commands.ts` to import and delegate to `executePaidOperator`.
3. Add `src/app/paid-operator-execution.test.ts` with mocked Runway client helpers and data-URL fixtures.
4. Adjust `src/app/workbench-commands.test.ts` to mock the paid module and assert confirmation delegation plus local no-paid-executor behavior.
5. Run targeted tests during iteration.
6. Run final typecheck, lint, full unit suite, and build.
7. Spawn `zenith_boundary_auditor` and `zenith_final_reviewer`, fix material findings, rerun affected checks, and record the result.

## Risks and recovery

- Module extraction may accidentally change payload literals. Payload parity tests for all five paid operators should catch this.
- Error behavior can change if the paid module catches errors itself. It must not; `executeOperator` remains the public error wrapper.
- Duplicated `blobToDataUrl` is small but temporary. It avoids broad utility extraction now; a later media helper slice can consolidate if duplication grows.
- Current UI jobs remain keyed by `operatorId`; overlapping runs of the same paid operator are still a known limitation and are not solved here.
- Recovery path is small: move the paid module body back into `workbench-commands.ts` and remove the new paid tests.

## Progress log

- [x] Recorded baseline HEAD and dirty working-tree state.
- [x] Read `AGENTS.md`, `PLANS.md`, `README.md`, `docs/sveltekit-architecture.md`, Phase 2 roadmap sections, skill references, and current command/test code.
- [x] Ran baseline targeted check: `npm test -- src/app/workbench-commands.test.ts`.
- [x] Spawned and waited for read-only `zenith_repo_mapper`, `zenith_roadmap_architect`, `zenith_test_strategist`, and `zenith_simplifier`.
- [x] Reconciled agent evidence into this plan before code edits.
- [x] Add focused paid operator module.
- [x] Add/adjust tests.
- [x] Run targeted checks.
- [x] Run repository checks.
- [x] Run independent boundary/final review agents.
- [x] Fix material review findings and update final result.

## Decisions and discoveries

- All read-only agents converged on the same smallest slice: one app-side paid execution module, no jobs/routes/assets/local-render split.
- The paid module should remain browser/app code because it materializes browser artifact media and calls local endpoint clients.
- `workbench-commands.ts` should keep confirmation and public command entry points to preserve UI behavior.
- The main missing evidence is confirmed paid success/failure behavior, not the extraction itself.
- `workbench-commands.ts` no longer imports `requestRunwayDepthMap`, `requestRunwayInpaint`, or `requestRunwaySeedanceVideo`; those browser endpoint clients are only imported by `src/app/paid-operator-execution.ts` and mocked in its tests.
- The exported paid execution boundary rejects non-paid operator IDs before starting a job or calling client helpers.
- Verification completed before final review:
  - `npm test -- src/app/workbench-commands.test.ts`: passed, 9 tests.
  - `npm test -- src/app/workbench-commands.test.ts src/app/paid-operator-execution.test.ts`: passed, 19 tests.
  - `npm test -- src/app/operator-registry.test.ts src/app/project-persistence.test.ts src/lib/shared/contracts/projects.test.ts`: passed, 15 tests.
  - `npm run typecheck`: passed after adding an explicit null annotation in a test fixture.
  - `npm run lint`: passed.
  - `npm test`: passed, 54 files and 280 tests.
  - `npm run build`: passed; Vite reported chunk-size and plugin-timing warnings.
- Post-change `zenith_boundary_auditor` found no material boundary issues. It confirmed paid execution is isolated in `src/app/paid-operator-execution.ts`, confirmation/local commands remain in `workbench-commands.ts`, browser paid calls still go only to local endpoints, and tests mock Runway clients.
- Post-change `zenith_final_reviewer` found no material correctness or scope issues. It noted stale plan bookkeeping, which was fixed by marking the plan complete and replacing the pending final result.

## Final result

Implemented the Phase 2 paid operator execution boundary. `src/app/paid-operator-execution.ts` now owns confirmed paid Runway payload creation, browser media materialization for paid payloads, progress callback wiring, and paid image/video result application. `src/app/workbench-commands.ts` keeps the public command entry point, confirmation/cancel flow, local media/project commands, and error wrapper behavior.

No routes, server services, shared job contracts, databases, queues, workers, asset stores, generic command buses, local render split, new dependencies, UI changes, or paid test calls were introduced. Final verification passed and independent read-only review found no material issues.

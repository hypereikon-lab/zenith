# Add End Depth To In-Memory Jobs

Status: complete
Roadmap phase: Phase 3: First-Class In-Memory Jobs
Baseline commit: 51124275fd4610a74092a8c753cc4d9055b9a426
Last updated: 2026-06-20 21:45 -04

## Goal

Add exactly one more paid path to the first-class in-memory job boundary: `generate-end-depth`. The observable outcome is that `POST /api/projects/[projectId]/jobs` accepts both `generate-start-depth` and `generate-end-depth`, creates JSON-safe jobs with operator-specific artifact metadata, and streams/cancels events through the existing job endpoints without changing visible UI behavior.

## Why this slice now

The depth-map job boundary has direct route-level coverage and no material review findings. The next useful Phase 3 step is to remove the current hard-coding that every job is `start-state -> start-depth`. `generate-end-depth` is the smallest second paid path because it uses the same Runway depth-map server procedure as `generate-start-depth`; it expands the job contract and store metadata without touching the broader shared inpaint route.

The initially considered second path was `repair-start-state`. Read-only review found that `/api/runway/inpaint-stream` is shared by Start State repair, End State reconstruction, legacy inpaint UI, and RGBD reconstruction. Wrapping it now would risk labeling generic inpaint work as repair jobs or require a broader compatibility contract. This plan defers repair until the inpaint ownership boundary is clearer.

## Current behavior and evidence

- Current HEAD is `51124275fd4610a74092a8c753cc4d9055b9a426`.
- Working tree is already dirty with prior Phase 1, Phase 2, and Phase 3 roadmap slice changes; this slice preserves those changes.
- `src/lib/shared/contracts/jobs.ts` supports only `generate-start-depth`.
- `src/lib/server/jobs/in-memory-job-store.ts` hard-codes public jobs to `inputArtifactIds: ["start-state"]` and `outputArtifactIds: ["start-depth"]`.
- `src/lib/server/jobs/depth-map-job.ts` always creates `generate-start-depth` jobs and result records with `outputArtifactId: "start-depth"`.
- `src/routes/api/projects/[projectId]/jobs/+server.ts` delegates first-class job creation to the depth-map job service.
- Existing browser UI still calls `/api/runway/depth-map-stream` for both Start Depth and End Depth through `src/runway/client.ts`; this slice does not change browser entry points or UI job state.
- Baseline focused checks passed: `npm test -- src/routes/api/jobs/job-routes.test.ts src/lib/shared/contracts/jobs.test.ts src/lib/server/jobs/in-memory-job-store.test.ts src/lib/server/jobs/depth-map-job.test.ts src/app/paid-operator-execution.test.ts`, 5 files / 30 tests.
- Read-only agents completed:
  - `zenith_repo_mapper` traced the inpaint path and warned that repair-start-state shares `/api/runway/inpaint-stream` with unrelated inpaint callers.
  - `zenith_roadmap_architect` confirmed Phase 3 and the need for explicit operator artifact mapping, while warning against assets/storage/UI replacement.
  - `zenith_contract_designer` proposed operator-specific JSON-safe job metadata and result invariants.
  - `zenith_test_strategist` produced a broad no-paid-call matrix.
  - `zenith_simplifier` recommended `generate-end-depth` over repair-start-state as the smallest high-value second job path.

## Invariants

- Visible UI behavior and existing browser commands remain unchanged.
- `/api/runway/depth-map-stream` keeps its legacy NDJSON progress/complete/error shape.
- Paid Runway effects and secrets remain under `src/lib/server`.
- Shared contracts remain JSON-safe, strict, side-effect free, and free of browser/server runtime handles.
- Runtime job `AbortController`, listeners, promises, and subscribers remain server-only.
- Tests must not call Runway or Codex paid APIs and must not require secrets.
- `projectId` remains in-memory job metadata only, not durable project persistence.

## Scope

### In scope

- Add `generate-end-depth` as the second supported job operator.
- Add a small explicit operator-to-artifact mapping:
  - `generate-start-depth`: `start-state -> start-depth`.
  - `generate-end-depth`: `end-state -> end-depth`.
- Update shared job create/job/result schemas to validate operator-specific artifact metadata and result output artifact IDs.
- Update the in-memory job store to create public jobs from the operator mapping and reject mismatched completion results.
- Update the depth-map job service so first-class job creation dispatches start or end depth through the same injected Runway depth runner.
- Extend direct route and service tests with no-paid-call coverage for `generate-end-depth`.

### Explicit non-goals

- No `repair-start-state`, inpaint, reconstruction, Seedance, Codex, or UI job migration.
- No assets, `AssetRef`, asset store, object storage, signed URLs, or output persistence.
- No database, durable job store, migrations, queues, workers, retries, idempotency, auth, quotas, or `hooks.server.ts`.
- No generic workflow engine, repository abstraction, command bus, or provider-agnostic job framework.
- No new dependency and no Playwright coverage unless a browser behavior changes.
- No Runway or Codex paid calls.

## Proposed design

Keep one shared `JobV1` contract and add an explicit product-shaped operator metadata table in `src/lib/shared/contracts/jobs.ts`. The contract validates that public jobs and results match the operator's artifact mapping. The create request remains small and portable: `version`, `operatorId`, and a depth-map input object with `imageDataUrl`, `prompt`, optional `ratio`, and optional `outputCount: 1`.

Update `src/lib/server/jobs/in-memory-job-store.ts` to read artifact metadata from the shared operator mapping when creating jobs. This is not a generic workflow system; it is a literal two-operator map. Completion verifies that returned `JobResultV1.operatorId` and `outputArtifactId` match the job before appending a complete event.

Update `src/lib/server/jobs/depth-map-job.ts` so the first-class route can parse either depth operator and call the same `requestRunwayDepthMap` runner. The result conversion receives the operator ID and emits the correct `outputArtifactId`. The legacy `/api/runway/depth-map-stream` compatibility wrapper remains unchanged in visible shape and continues to hide job metadata.

## Alternatives considered

- `repair-start-state` as the second path: deferred because the inpaint stream is shared by several product flows and would require new classification to avoid phase leakage.
- Keep depth-only job hard-coding: rejected because it blocks any honest second job path.
- Generic job dispatcher/framework: rejected because two explicit depth operators need only a small metadata map.
- Convert browser UI to first-class jobs: deferred because current visible behavior should remain unchanged.

## Acceptance matrix

| Concern | Evidence required | Command/test |
|---|---|---|
| Shared contract | Start and end depth create/job/result records parse; unsupported operators and mismatched artifact/result IDs reject; runtime fields and object URLs remain rejected | `npm test -- src/lib/shared/contracts/jobs.test.ts` |
| Store lifecycle | End-depth jobs create with `end-state -> end-depth`; completion rejects mismatched result metadata; existing depth lifecycle still passes | `npm test -- src/lib/server/jobs/in-memory-job-store.test.ts` |
| Depth runner | First-class `generate-end-depth` calls injected fake depth runner once, records `outputArtifactId: "end-depth"`, and rejects invalid input before runner | `npm test -- src/lib/server/jobs/depth-map-job.test.ts` |
| Direct routes | `POST /api/projects/:projectId/jobs` accepts end depth; `GET events` replays terminal events; `DELETE` cancels running end-depth jobs; unsupported paid operators reject before runner | `npm test -- src/routes/api/jobs/job-routes.test.ts` |
| Compatibility | Existing `/api/runway/depth-map-stream` compatibility tests still pass and do not expose job metadata | `npm test -- src/lib/server/jobs/depth-map-job.test.ts src/runway/progress-stream.test.ts` |
| No paid calls | Tests use injected/mocked `requestRunwayDepthMap` and route network traps | targeted Vitest assertions |
| Boundary | Shared contracts stay runtime-free; server jobs stay server-only; routes stay thin | `npm run typecheck`; `npm run build`; import inspection |
| Regression | Existing paid operator/browser command tests remain unchanged | `npm test -- src/app/paid-operator-execution.test.ts src/app/workbench-commands.test.ts` |
| Repository health | Typecheck, lint, full unit suite, and build pass | `npm run typecheck`; `npm run lint`; `npm test`; `npm run build` |

## Implementation sequence

1. Extend the shared job contract and contract tests for operator-specific depth metadata.
2. Update the in-memory store and store tests for operator artifact mapping and completion-result checks.
3. Update depth-map job creation/result conversion and service tests for `generate-end-depth`.
4. Extend direct route tests for end-depth create/events/cancel and unsupported operators.
5. Run targeted tests, then typecheck, lint, full unit suite, and build.
6. Spawn independent boundary and final review agents; fix material findings and rerun affected checks.

## Risks and recovery

- Operator metadata could become too generic. Keep it as a literal map and resist abstract workflow APIs.
- Compatibility depth streams still cannot know whether the browser caller is Start Depth or End Depth. Because job metadata is hidden from the legacy stream, preserve current compatibility behavior and solve caller classification only when browser job UI is intentionally migrated.
- Contract tightening can break tests that assumed empty successful outputs. If that happens, keep the stricter invariant for job-complete results and update service tests to expect failed jobs for no-output runners.
- Reversal path: remove `generate-end-depth` from the shared job operator map, restore hard-coded store artifacts, and remove end-depth route/service tests.

## Progress log

- [x] Recorded baseline HEAD and dirty working tree.
- [x] Read required skill references, architecture docs, roadmap Phase 3 sections, current job code, routes, inpaint/depth execution paths, and tests.
- [x] Spawned and reconciled read-only `zenith_repo_mapper`, `zenith_roadmap_architect`, `zenith_contract_designer`, `zenith_test_strategist`, and `zenith_simplifier`.
- [x] Ran focused baseline tests.
- [x] Created this plan and acceptance matrix before implementation edits.
- [x] Extend shared job contract.
- [x] Update in-memory store and depth job service.
- [x] Extend focused tests.
- [x] Run targeted and repository checks.
- [x] Run independent final review agents and address material findings.

## Decisions and discoveries

- The user's broad “all phases” request is being executed as sequential small roadmap slices. Building all remaining phases in one patch would violate the repo's working agreement and mix incompatible storage, asset, job, and operations decisions.
- `generate-end-depth` is selected over `repair-start-state` for this slice because it expands the settled depth-map job boundary without touching generic inpaint routing.
- Added `generate-end-depth` to the shared job operator contract and added a JSON-safe operator artifact mapping.
- `JobV1` and `JobResultV1` now validate operator-specific artifact metadata. Successful job results require at least one portable output and reject mismatched `outputArtifactId`.
- `src/lib/server/jobs/in-memory-job-store.ts` now creates public job metadata from the shared operator mapping and fails jobs whose completion result belongs to another operator.
- `src/lib/server/jobs/depth-map-job.ts` now dispatches first-class depth jobs by `operatorId`, preserving the same injected Runway depth runner and result sanitization.
- Extended direct route tests so `POST /api/projects/[projectId]/jobs`, `GET /api/jobs/[jobId]/events`, and `DELETE /api/jobs/[jobId]` cover `generate-end-depth`.
- Targeted contract test passed: `npm test -- src/lib/shared/contracts/jobs.test.ts`, 1 file / 5 tests.
- Targeted store test passed: `npm test -- src/lib/server/jobs/in-memory-job-store.test.ts`, 1 file / 6 tests.
- Targeted depth service test passed: `npm test -- src/lib/server/jobs/depth-map-job.test.ts`, 1 file / 10 tests.
- Targeted route test passed: `npm test -- src/routes/api/jobs/job-routes.test.ts`, 1 file / 6 tests.
- Combined boundary/app regression set passed: `npm test -- src/lib/shared/contracts/jobs.test.ts src/lib/server/jobs/in-memory-job-store.test.ts src/lib/server/jobs/depth-map-job.test.ts src/routes/api/jobs/job-routes.test.ts src/runway/progress-stream.test.ts src/app/paid-operator-execution.test.ts src/app/workbench-commands.test.ts`, 7 files / 50 tests.
- Initial `npm run typecheck` failed on Zod tuple-union inference in internal refinement helper signatures. Fixed helper parameters to compare readonly unknown arrays while keeping public schemas strict.
- Rerun `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test` passed, 59 files / 316 tests.
- `npm run build` passed with existing Vite large client chunk and plugin timing warnings.
- `npm run test:e2e` passed, 4 Playwright smoke tests.
- `zenith_boundary_auditor` found no material findings. Residuals: request-abort compatibility streams close rather than emitting a consumable terminal error to a disconnected client, and legacy depth compatibility jobs remain internally labeled as `generate-start-depth` because the old endpoint has no operator context.
- `zenith_final_reviewer` found no material findings. Residuals: legacy depth compatibility metadata remains intentionally non-authoritative; route tests share the singleton store but assert only returned IDs; reviewer noted missing compatibility coverage for no-output success results.
- Added the no-output compatibility regression test. A successful fake runner with no portable outputs now produces a compatibility stream error and a failed in-memory job.
- Post-review targeted depth service test passed: `npm test -- src/lib/server/jobs/depth-map-job.test.ts`, 1 file / 11 tests.
- Post-review combined boundary/app regression set passed: `npm test -- src/lib/shared/contracts/jobs.test.ts src/lib/server/jobs/in-memory-job-store.test.ts src/lib/server/jobs/depth-map-job.test.ts src/routes/api/jobs/job-routes.test.ts src/runway/progress-stream.test.ts src/app/paid-operator-execution.test.ts src/app/workbench-commands.test.ts`, 7 files / 51 tests.
- Post-review `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` all passed. Full unit suite is 59 files / 317 tests. Playwright remains 4 smoke tests. Build retained existing Vite large client chunk warning.

## Final result

Complete. `generate-end-depth` is now a first-class in-memory job operator alongside `generate-start-depth`. Shared job contracts validate operator-specific artifact metadata and JSON-safe results. The in-memory job store derives public input/output artifact IDs from the shared map and fails mismatched completion results. The depth job service dispatches either depth operator through the existing server-only Runway depth runner, and direct route tests cover create, event replay, cancellation, unsupported operators, and no-paid-call behavior. Existing browser UI and legacy `/api/runway/depth-map-stream` behavior remain unchanged. Repair/inpaint, assets, durable storage, queues, workers, auth/quotas, and UI job replacement remain deliberately deferred.

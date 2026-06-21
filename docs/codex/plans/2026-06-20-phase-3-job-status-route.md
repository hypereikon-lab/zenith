# Phase 3 Job Status Route

Status: complete
Roadmap phase: Phase 3: First-Class In-Memory Jobs
Baseline commit: 52f49e9207e6eb09e4f8b3f57d6d071c313acefa
Last updated: 2026-06-20

## Goal

Add a read-only `GET /api/jobs/:jobId` status route over the existing in-memory job store so direct job clients can fetch the current `JobV1` snapshot without opening the event stream. Preserve existing create, event-stream, cancel, compatibility stream, and visible UI behavior.

## Why this slice now

The current Phase 3 depth job boundary can create jobs, stream raw events, and cancel jobs, but it cannot read current job state directly. This leaves direct clients with an avoidable ownership gap: job state is server-owned, but the only read path is event streaming. A thin status route completes that in-memory boundary without introducing durable storage, assets, workers, or UI polling.

## Current behavior and evidence

- Baseline HEAD: `52f49e9207e6eb09e4f8b3f57d6d071c313acefa`.
- Starting working tree is already dirty with the previous docs refresh and must be preserved. No `src/**` files were dirty before this slice.
- `src/routes/api/projects/[projectId]/jobs/+server.ts` creates depth jobs through `createProjectJobResponse`.
- `src/routes/api/jobs/[jobId]/events/+server.ts` streams raw `JobEventV1` records through `jobEventStreamResponse`.
- `src/routes/api/jobs/[jobId]/+server.ts` currently exports `DELETE` only and cancels jobs through `serverJobStore.cancelJob`.
- `src/lib/server/jobs/in-memory-job-store.ts` already exposes `getJob(jobId): JobV1 | null`; `publicJob` strips runtime state and parses the public `JobV1`.
- `src/lib/shared/contracts/jobs.ts` already defines the versioned JSON-safe `JobV1` contract.
- Baseline focused job tests passed:

```sh
npm test -- src/routes/api/jobs/job-routes.test.ts src/lib/server/jobs/in-memory-job-store.test.ts src/lib/server/jobs/depth-map-job.test.ts src/lib/shared/contracts/jobs.test.ts
```

Result: 4 files, 28 tests passed.

## Invariants

- Keep jobs process-memory only.
- Do not change event stream behavior or depth compatibility stream behavior.
- Do not change browser workbench behavior or move it to direct job polling.
- Keep shared contracts JSON-safe and side-effect free.
- Keep secrets and paid upstream calls server-only.
- Do not invoke paid Runway or Codex APIs in tests.
- Preserve unrelated dirty documentation changes.

## Scope

### In scope

- Add `GET` to `src/routes/api/jobs/[jobId]/+server.ts`.
- Return `200` with the current `JobV1` for known jobs.
- Return `404` with the existing `{ error: "Job <id> was not found." }` shape for unknown jobs.
- Extend `src/routes/api/jobs/job-routes.test.ts` with no-paid-call route coverage for found, missing, succeeded, failed, and cancelled job snapshots.
- Narrowly update current architecture/roadmap docs that currently say the status route is missing or recommended next.

### Explicit non-goals

- No new shared contract, `JobStatusResponseV1`, migration framework, or schema version.
- No durable persistence, database, queue, worker, retry system, idempotency, auth, quotas, request hooks, job list endpoint, or repository abstraction.
- No asset contracts/storage, signed URLs, object storage, uploads, or data-URI migration.
- No new paid operator paths and no RGBD/inpaint/Seedance/Codex job migration.
- No UI polling, browser client changes, or visible UI behavior changes.

## Proposed design

`src/routes/api/jobs/[jobId]/+server.ts` remains a thin route adapter. It will export:

- `GET`: `serverJobStore.getJob(params.jobId)` and JSON serialize the existing public `JobV1`, or return `404`.
- `DELETE`: existing cancellation behavior unchanged.

The in-memory store remains the owner of runtime state and public snapshot conversion. The status route does not inspect events, signals, controllers, promises, listeners, or Runway result conversion.

Documentation updates are limited to replacing "GET status is missing / next" with "GET status exists / next is Phase 4A asset contract work" where the prior docs refresh would otherwise become stale.

## Alternatives considered

- Add a new `JobStatusResponseV1`: rejected because `JobV1` already is the public status snapshot used by create and cancel.
- Add a job service/repository abstraction: rejected because `serverJobStore` already owns the in-memory state and this route is one read method.
- Return an event-summary view: rejected because event history remains owned by `/api/jobs/:jobId/events`.
- Leave docs untouched: rejected because the current docs would immediately misidentify the newly implemented route as missing and recommended next work.

## Acceptance matrix

| Concern              | Evidence required                                                                                                           | Command/test                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Known status read    | `GET /api/jobs/:jobId` returns `200` with `JobV1` for a queued/current job and no paid runner call.                         | `npm test -- src/routes/api/jobs/job-routes.test.ts`             |
| Missing status read  | Unknown job id returns `404` with the same error shape as events/cancel.                                                    | `npm test -- src/routes/api/jobs/job-routes.test.ts`             |
| Terminal states      | Succeeded, failed, and cancelled jobs return `JobV1` snapshots with result/error/progress/stage fields.                     | `npm test -- src/routes/api/jobs/job-routes.test.ts`             |
| Runtime safety       | Status JSON does not expose `controller`, `signal`, `events`, `listeners`, `promise`, object URLs, or debug runtime fields. | `npm test -- src/routes/api/jobs/job-routes.test.ts`             |
| Regression           | Existing create/events/cancel/store/depth compatibility contract tests still pass.                                          | focused job regression set                                       |
| Route/build boundary | SvelteKit route types and production bundle still pass.                                                                     | `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` |

## Implementation sequence

1. Add `GET` to the `[jobId]` route.
2. Extend route tests for current, missing, succeeded, failed, and cancelled status reads.
3. Run targeted route tests and focused job regression tests.
4. Update the current docs that mention the route as missing/recommended.
5. Run typecheck, lint, unit suite, and build.
6. Run independent boundary/final reviews and fix material findings.

## Risks and recovery

- Risk: returning runtime store fields. Detection: route tests assert serialized output excludes runtime-only names and object URLs.
- Risk: accidental paid calls in status tests. Detection: mocked `requestRunwayDepthMap` call count and failing global `fetch` stub.
- Risk: stale docs after code change. Detection: doc text review and final receipt.
- Recovery: revert the `GET` export and route tests; existing `DELETE`, create, events, and compatibility routes remain independent.

## Progress log

- [x] Recorded baseline HEAD and dirty working-tree state.
- [x] Read repository instructions, roadmap-slice references, README, architecture doc, roadmap section, job contracts, job store, routes, and route tests.
- [x] Spawned and reconciled read-only repo mapper, roadmap architect, contract designer, test strategist, and simplifier agents.
- [x] Ran baseline focused job regression tests.
- [x] Add status route and route tests.
- [x] Update current docs for the completed status route.
- [x] Run verification.
- [x] Run independent post-change review.
- [x] Record final result.

## Decisions and discoveries

- `JobV1` is sufficient for the status route; no new contract is needed.
- `serverJobStore.getJob` already returns a public JSON-safe snapshot and strips runtime handles.
- Direct event stream close only unsubscribes; status reads must not affect event stream or cancellation behavior.
- The active browser workbench remains on the depth compatibility stream.
- Added `GET /api/jobs/:jobId` beside the existing `DELETE` route; it returns the current `JobV1` or the established `404` error shape.
- Route tests cover queued/current, succeeded, failed, cancelled, and missing job status reads. Successful status JSON is checked for runtime-only field names and object URLs.
- Current docs were updated to say the status route exists and to recommend Phase 4A asset contracts next.
- Post-change review found that mutable status reads should opt out of caching. Fixed by adding `Cache-Control: no-store` on both `200` and `404` status responses and asserting it in route tests.
- Post-change review found that roadmap checkpoint wording over-attributed the new route to the baseline commit. Fixed by wording it as the current working tree based on that commit.

## Verification results

Passed:

```sh
npm test -- src/routes/api/jobs/job-routes.test.ts
npm test -- src/routes/api/jobs/job-routes.test.ts src/lib/server/jobs/in-memory-job-store.test.ts src/lib/server/jobs/depth-map-job.test.ts src/lib/shared/contracts/jobs.test.ts
npm exec -- prettier --check 'src/routes/api/jobs/[jobId]/+server.ts' src/routes/api/jobs/job-routes.test.ts docs/sveltekit-architecture.md docs/ultimate-architecture-roadmap.md docs/codex/plans/2026-06-20-phase-3-job-status-route.md
npm run typecheck
npm run lint
npm test
npm run build
```

Results:

- Focused route tests: 1 file, 8 tests passed.
- Focused job regression: 4 files, 30 tests passed.
- Full unit suite: 59 files, 319 tests passed.
- Production build passed. Vite reported an existing large client chunk warning and plugin timing warning; neither is caused by this route-only change.
- After post-review fixes, reran:
  - `npm test -- src/routes/api/jobs/job-routes.test.ts`
  - `npm test -- src/routes/api/jobs/job-routes.test.ts src/lib/server/jobs/in-memory-job-store.test.ts src/lib/server/jobs/depth-map-job.test.ts src/lib/shared/contracts/jobs.test.ts`
  - targeted Prettier check
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
  - `npm run build`

Not run:

- `npm run test:e2e`; this slice does not change UI, hydration, or browser user flows.

## Review results

- `zenith_final_reviewer` found one material issue: `GET /api/jobs/:jobId` should include no-cache/no-store semantics because job status is mutable. Fixed with `Cache-Control: no-store` and tests.
- `zenith_boundary_auditor` and `zenith_final_reviewer` both found the roadmap checkpoint wording could mislead by attributing the new route to the baseline commit. Fixed wording.
- No browser/server/shared boundary violations were found. Review confirmed the route is thin, `JobV1` exposure comes from `serverJobStore.getJob`, and runtime fields remain inside `RuntimeJob`.

## Final result

Complete. `GET /api/jobs/:jobId` now returns the current public in-memory `JobV1` snapshot with `Cache-Control: no-store`, or the established `404` error shape when the job is unknown. Route-level tests cover queued/current, succeeded, failed, cancelled, and missing status reads, no paid-call behavior, and runtime-field exclusion. Existing create, event-stream, cancel, depth compatibility, browser UI, shared contract, and store behavior remain unchanged. The roadmap now recommends Phase 4A contract-only asset reference work next.

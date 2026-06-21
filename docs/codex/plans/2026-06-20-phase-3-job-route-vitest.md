# Add Direct Job Route Vitest Coverage

Status: complete
Roadmap phase: Phase 3: First-Class In-Memory Jobs
Baseline commit: 51124275fd4610a74092a8c753cc4d9055b9a426
Last updated: 2026-06-20 21:03 -04

## Goal

Add direct route-level Vitest coverage for the new in-memory job endpoints so the settled depth-map job boundary is exercised through SvelteKit route handlers without changing visible UI behavior or expanding Phase 3 to another paid path.

## Why this slice now

The Phase 3 depth-map job slice added the first shared job contract, in-memory server job store, depth-map job runner, job event route, cancel route, and compatibility wrapper. Independent final review found no material issues but noted that the new route modules were mostly covered through service/helper tests. This follow-up closes that evidence gap before any second paid path is considered.

## Current behavior and evidence

- Current HEAD is `51124275fd4610a74092a8c753cc4d9055b9a426`.
- Working tree is already dirty with prior Phase 1, Phase 2, and Phase 3 roadmap slice changes; this slice preserves those changes.
- `src/routes/api/projects/[projectId]/jobs/+server.ts` delegates `POST` to `createProjectJobResponse(request, params.projectId)`.
- `src/routes/api/jobs/[jobId]/events/+server.ts` delegates `GET` to `jobEventStreamResponse(params.jobId, { signal: request.signal })` and returns JSON 404 when absent.
- `src/routes/api/jobs/[jobId]/+server.ts` delegates `DELETE` to `serverJobStore.cancelJob(params.jobId)` and returns JSON 404 when absent.
- Existing service tests cover shared contracts, store lifecycle, injected depth-map runner behavior, compatibility streams, errors, and cancellation.
- Baseline focused job check passed: `npm test -- src/lib/shared/contracts/jobs.test.ts src/lib/server/jobs/in-memory-job-store.test.ts src/lib/server/jobs/depth-map-job.test.ts`, 3 files / 17 tests.
- Read-only agents completed:
  - `zenith_repo_mapper` traced the route -> server job path and identified the valid `POST` route paid-call risk if `requestRunwayDepthMap` is not mocked before import.
  - `zenith_test_strategist` recommended one route test file using real handlers/store/event streaming while mocking only `$lib/server/runway/runway-jobs`.
  - `zenith_simplifier` warned against route factories, store reset hooks, new dependencies, Playwright, new endpoints, and expanding to another paid operator.

## Invariants

- Existing UI entry points and `/api/runway/depth-map-stream` compatibility behavior remain unchanged.
- Tests must not call Runway or Codex paid APIs and must not require secrets.
- Route files remain thin transport adapters.
- Shared contracts remain JSON-safe and side-effect free.
- Runtime handles, abort controllers, listeners, and paid execution stay server-only.
- No broader Phase 3 paid-path migration happens in this slice.

## Scope

### In scope

- Add direct Vitest coverage that imports and calls:
  - `POST /api/projects/[projectId]/jobs`.
  - `GET /api/jobs/[jobId]/events`.
  - `DELETE /api/jobs/[jobId]`.
- Mock only the Runway depth-map server call so valid route tests cannot make a paid/network call.
- Cover valid create and event replay, invalid create, unknown jobs, and cancellation through the public route handlers.

### Explicit non-goals

- No second paid operator path.
- No route refactor, route factory, generic controller, repository abstraction, store reset API, or new dependency.
- No database, durable store, asset store, worker, queue, retries, idempotency, auth, project CRUD, job list, or `GET /api/jobs/:jobId`.
- No UI change and no Playwright coverage unless a browser behavior changes.
- No Runway or Codex paid calls.

## Proposed design

Add one route-level test file under `src/routes/api/jobs/`. It will import the three route handlers directly, use `Request` objects and route `params` objects, and parse returned `Response` objects.

For a valid create path, mock `$lib/server/runway/runway-jobs` before route imports and stub `requestRunwayDepthMap` to emit progress and return a JSON-safe image result. This keeps the real route, contract, job store, and event stream code in play while preventing live paid calls. For cancellation, use a pending mocked runner that rejects when its injected abort signal fires, then call the `DELETE` route.

The singleton `serverJobStore` will not get a reset hook. Tests use unique project/job IDs returned by the route and make assertions on those IDs only.

## Alternatives considered

- Pure delegation mocks for all route modules: simpler, but weaker evidence because it would not exercise the real contract/store/event stream path.
- Add injectable route factories or a store reset method: rejected as unnecessary test-only architecture.
- Expand Phase 3 to another paid path in the same change: explicitly deferred until the depth-map job boundary has direct route evidence.

## Acceptance matrix

| Concern | Evidence required | Command/test |
|---|---|---|
| Valid route create | Direct `POST` returns `202`, project/operator/artifact IDs are preserved, mocked Runway runner is called once | `npm test -- src/routes/api/jobs/job-routes.test.ts` |
| Event replay | Direct `GET` returns NDJSON replay with queued, started, progress, complete for the created job | `npm test -- src/routes/api/jobs/job-routes.test.ts` |
| Invalid input | Invalid direct `POST` returns `400` and the mocked Runway runner is not called | `npm test -- src/routes/api/jobs/job-routes.test.ts` |
| Unknown job | Direct `GET` and `DELETE` unknown IDs return JSON `404` | `npm test -- src/routes/api/jobs/job-routes.test.ts` |
| Cancellation | Direct `DELETE` cancels a running job and aborts the runner signal | `npm test -- src/routes/api/jobs/job-routes.test.ts` |
| No paid calls | Only `$lib/server/runway/runway-jobs` is mocked for route tests; no Codex/Runway API calls are invoked | targeted route test plus mock assertions |
| Boundary regression | Existing job contract/store/runner tests still pass | `npm test -- src/lib/shared/contracts/jobs.test.ts src/lib/server/jobs/in-memory-job-store.test.ts src/lib/server/jobs/depth-map-job.test.ts src/routes/api/jobs/job-routes.test.ts` |
| Repository health | Typecheck, lint, full unit suite, and build pass | `npm run typecheck`; `npm run lint`; `npm test`; `npm run build` |

## Implementation sequence

1. Add route-level Vitest file with direct handler calls and a mocked Runway server boundary.
2. Run the new route test and fix issues within test-only scope.
3. Run the focused job regression set.
4. Run typecheck, lint, full unit suite, and build.
5. Spawn independent boundary and final review agents on the actual diff, fix material findings, and rerun affected checks.

## Risks and recovery

- Valid route tests can accidentally use real Runway if the mock is not installed before route import. The test file must mock `$lib/server/runway/runway-jobs` at module top level.
- Singleton job state can leak between tests. Tests use route-created job IDs and unique missing IDs rather than global counts.
- Event streams for non-terminal jobs do not close. Replay assertions should use completed or cancelled jobs before calling `response.text()`.
- Reversal path: remove the route test file and this plan; no runtime code changes should be needed.

## Progress log

- [x] Recorded baseline HEAD and dirty working tree.
- [x] Read required skill references, roadmap job sections, route modules, server job modules, and current tests.
- [x] Spawned and reconciled read-only `zenith_repo_mapper`, `zenith_test_strategist`, and `zenith_simplifier`.
- [x] Ran baseline focused job tests.
- [x] Created this plan and acceptance matrix before implementation edits.
- [x] Add direct route-level Vitest coverage.
- [x] Run targeted route and job regression tests.
- [x] Run typecheck, lint, full unit suite, and build.
- [x] Run independent final review agents and address material findings.

## Decisions and discoveries

- This is a test-only slice. Direct handler tests provide enough route evidence without changing route ownership or adding test-only production seams.
- The first-class job contract remains `generate-start-depth` only. Expanding to another paid path is the next possible Phase 3 slice, not part of this change.
- Added `src/routes/api/jobs/job-routes.test.ts` with direct handler calls for `POST /api/projects/[projectId]/jobs`, `GET /api/jobs/[jobId]/events`, and `DELETE /api/jobs/[jobId]`.
- The route tests mock only `$lib/server/runway/runway-jobs` and install a global `fetch` trap so a mistaken live network path fails locally.
- Targeted route test passed: `npm test -- src/routes/api/jobs/job-routes.test.ts`, 1 file / 4 tests.
- Focused job regression set passed: `npm test -- src/lib/shared/contracts/jobs.test.ts src/lib/server/jobs/in-memory-job-store.test.ts src/lib/server/jobs/depth-map-job.test.ts src/routes/api/jobs/job-routes.test.ts`, 4 files / 21 tests.
- Initial `npm run typecheck` failed because the route mock fixture lacked the required `RunwayOutput.url` field. Fixed the fixture while preserving the runtime-only `objectUrl` discard assertion.
- Rerun `npm test -- src/routes/api/jobs/job-routes.test.ts` passed, 1 file / 4 tests.
- Rerun `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test` passed, 59 files / 310 tests.
- `npm run build` passed with existing Vite large client chunk and plugin timing warnings.
- `zenith_boundary_auditor` found no material boundary findings. Residual future concern: if `DELETE /api/jobs/:jobId` gains auth, logging, idempotency, or cancellation policy, cancellation should move behind a server service instead of growing route logic.
- `zenith_final_reviewer` found no material findings. Residual test concern: the cancellation test could fail slowly if the mocked runner is never reached.
- Tightened the cancellation test by asserting `POST` status before waiting for the runner and adding a short timeout around the runner-signal wait.
- Post-review targeted route test passed: `npm test -- src/routes/api/jobs/job-routes.test.ts`, 1 file / 4 tests.
- Post-review focused job regression set passed: `npm test -- src/lib/shared/contracts/jobs.test.ts src/lib/server/jobs/in-memory-job-store.test.ts src/lib/server/jobs/depth-map-job.test.ts src/routes/api/jobs/job-routes.test.ts`, 4 files / 21 tests.
- Post-review `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` all passed. Full unit suite remained 59 files / 310 tests. Build retained the existing Vite large client chunk and plugin timing warnings.

## Final result

Complete. This test-only Phase 3 follow-up added direct route-level Vitest coverage for the new in-memory job endpoints without changing runtime behavior. The route tests call the real SvelteKit handlers for create, event replay, unknown job responses, and cancellation; they mock only the server Runway depth-map call and install a network trap to prevent paid/API access. No second paid path, durable storage, asset work, route refactor, or UI behavior change was introduced. Expanding Phase 3 to one more paid path remains deferred until this depth-map route evidence is accepted.

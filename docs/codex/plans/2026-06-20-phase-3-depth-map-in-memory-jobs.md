# Introduce Depth Map In-Memory Jobs

Status: complete
Roadmap phase: Phase 3: First-Class In-Memory Jobs
Baseline commit: 51124275fd4610a74092a8c753cc4d9055b9a426
Last updated: 2026-06-20 20:23 -04

## Goal

Introduce the smallest first-class server-owned in-memory job boundary for one paid path: Runway depth-map generation, with `generate-start-depth` as the first supported product operator. Preserve current visible UI behavior and keep `/api/runway/depth-map-stream` compatible with the existing NDJSON progress/complete/error stream shape.

## Why this slice now

Phase 1 separated portable project snapshots from browser runtime handles. Phase 2 separated project persistence, paid operator execution, and local render orchestration from the broad command bridge. The next roadmap ambiguity is that paid work still runs only as request streams, with no server job identity, event history, or cancelable runtime owner. This slice creates that boundary without durable storage, assets, workers, queues, or a broad paid-operator migration.

## Current behavior and evidence

- Current HEAD: `51124275fd4610a74092a8c753cc4d9055b9a426`.
- Working tree before this slice is already dirty with prior Phase 1/Phase 2 changes; those are preserved as this slice's baseline.
- Browser paid operators call `src/runway/client.ts`, which POSTs JSON to local `/api/runway/*-stream` endpoints and reads NDJSON with `readProgressStream`.
- `/api/runway/depth-map-stream` currently calls `streamPost(request, requestRunwayDepthMap, "Runway depth request failed")`.
- `streamPost` parses JSON then delegates to `streamProgressResponse`, which owns the response stream's `AbortController`, emits current progress/complete/error records, and aborts the runner on request/stream cancellation.
- `requestRunwayDepthMap` validates the payload, reads server-only Runway secrets, uploads one image, creates a text-to-image task, polls it, downloads outputs, and returns one image result.
- Existing baseline check before this slice: `npm test -- src/lib/server/runway/route-response.test.ts src/runway/progress-stream.test.ts src/app/paid-operator-execution.test.ts` passed, 3 files / 18 tests.
- Read-only agents completed:
  - `zenith_repo_mapper` traced the current browser -> route -> stream helper -> Runway service path and noted depth is the narrowest server paid path but the endpoint is also used by RGBD depth.
  - `zenith_roadmap_architect` confirmed Phase 3, recommended depth-map first, and warned against jobs/assets/storage leakage.
  - `zenith_contract_designer` recommended JSON-safe shared job/event contracts plus server-only runtime job state.
  - `zenith_test_strategist` recommended no-paid-call lifecycle and stream compatibility tests; it preferred inpaint for existing smoke coverage.
  - `zenith_simplifier` challenged project routes and generic abstractions; it preferred repair-start-state as a product-first alternative but also warned that the broad inpaint endpoint has many callers.

## Invariants

- Existing UI behavior and current browser command entry points remain unchanged.
- `/api/runway/depth-map-stream` remains usable by existing callers and preserves the current NDJSON event shape.
- Runway secrets and paid upstream calls stay server-only under `src/lib/server` or SvelteKit server routes.
- Browser media materialization, `Blob`/`FileReader`, canvas, WebGPU, WebCodecs, and artifact mutation remain browser-owned.
- Shared job contracts are JSON-safe and side-effect free; they must not import server modules, browser runtime objects, stores, secrets, or network clients.
- Tests must not call Runway or Codex paid APIs and must not require `.env.local`.
- In-memory jobs do not imply restart survival, multi-process safety, durable history, retries, quotas, auth, or assets.

## Scope

### In scope

- Add a minimal shared job/event contract for the first supported operator, `generate-start-depth`.
- Add a concrete server-only in-memory job store with runtime `AbortController`, append-only events, status transitions, subscribers, and bounded public conversion.
- Add a product-shaped depth-map job runner that delegates to the existing Runway depth service.
- Add minimal first-class job routes:
  - `POST /api/projects/[projectId]/jobs`, supporting only `generate-start-depth`.
  - `GET /api/jobs/[jobId]/events`, streaming in-memory job events.
  - A minimal cancel route if needed by the store lifecycle tests.
- Update `/api/runway/depth-map-stream` to use the depth-map job runner and emit the existing compatibility stream shape.
- Add no-paid-call tests for contracts, store lifecycle, depth stream compatibility, invalid input, error, and cancel/abort.

### Explicit non-goals

- No database, durable job store, migrations, durable project model, asset store, worker, queue, retry/idempotency system, or job scheduler.
- No `AssetRef`, object storage, upload API, signed URLs, or conversion of Runway outputs to stored assets.
- No broad conversion of all paid operators to jobs.
- No generic workflow engine, command bus, repository abstraction, or provider-agnostic job framework.
- No UI redesign, user-visible behavior change, or browser job-state replacement.
- No new dependency.
- No Runway or Codex paid calls in tests.

## Proposed design

Add `src/lib/shared/contracts/jobs.ts` as the portable contract owner. It defines versioned `CreateJobRequestV1`, `JobV1`, `JobEventV1`, `JobResultV1`, and `PublicJobErrorV1` shapes for the first supported operator. It uses Zod only at API/event boundaries and rejects runtime fields, object URLs, unsupported versions, unsupported operators, invalid progress, and malformed results.

Add `src/lib/server/jobs/in-memory-job-store.ts` as the concrete runtime owner. It stores runtime jobs in a `Map`, owns an `AbortController` per job, appends ordered public events, exposes public job/event snapshots, and supports subscription for NDJSON event streaming. Runtime fields never leave server code.

Add `src/lib/server/jobs/depth-map-job.ts` as the product-shaped runner for the first paid path. It validates `generate-start-depth` job requests, starts an in-memory job, invokes the existing `requestRunwayDepthMap` service, converts Runway progress into job events, converts the result into `JobResultV1`, and normalizes thrown errors into public job errors.

Keep route files thin. First-class job routes parse/validate at the boundary, call the depth-map job service, and return JSON or NDJSON. The existing `/api/runway/depth-map-stream` route becomes a compatibility wrapper over the job runner, mapping job events back to the existing progress/complete/error stream records.

Depth-map was chosen over repair-start-state because it is the narrower server paid service: one image input, one prompt, one image output. The tradeoff is that the existing depth stream endpoint is also used by End Depth and RGBD depth. This plan treats the first boundary as the Runway depth-map paid path, while the first first-class job request supports `generate-start-depth` only. No UI or generic depth callers are changed.

## Alternatives considered

- Keep status quo: rejected because paid server work would still have no server-owned job identity or event history.
- Use `repair-start-state` first: product-first, but the inpaint endpoint has broader callers and more payload complexity than depth.
- Use Seedance first: endpoint is currently unique to one app paid operator, but video payloads and long-running output behavior make it a heavier first job slice.
- Add project-backed durable jobs: rejected as Phase 5 work.
- Add a generic job interface or provider-agnostic workflow engine: rejected because one concrete in-memory runner is enough for this slice.

## Acceptance matrix

| Concern | Evidence required | Command/test |
|---|---|---|
| Shared contract | Valid create/job/event records parse; unsupported version/operator/status, bad progress, runtime fields, and object URLs reject | `npm test -- src/lib/shared/contracts/jobs.test.ts` |
| Store lifecycle | Create, start, progress, complete, error, cancel, event ordering, terminal-state guards, replay/subscription, unknown job behavior | `npm test -- src/lib/server/jobs/in-memory-job-store.test.ts` |
| Depth runner | Valid `generate-start-depth` starts one job and calls injected fake runner; invalid input fails before job/upstream; result/error normalize | `npm test -- src/lib/server/jobs/depth-map-job.test.ts` |
| Compatibility stream | `/api/runway/depth-map-stream` wrapper emits existing NDJSON progress/complete/error shape and aborts/cancels the job on stream/request cancellation | `npm test -- src/lib/server/jobs/depth-map-job.test.ts src/runway/progress-stream.test.ts` |
| First-class routes | Project job create supports only `generate-start-depth`; event stream replays events; cancel route cancels in-memory jobs if implemented | targeted route/service tests |
| No paid calls | Tests inject fake runners and network fetch is not used by server job modules | targeted tests plus `rg` inspection |
| Boundary | Shared contracts do not import server/browser modules; server jobs do not import browser app state; routes stay thin | `npm run typecheck`; `npm run build`; import inspection |
| Regression | Existing stream and paid app execution tests continue to pass | `npm test -- src/lib/server/runway/route-response.test.ts src/runway/progress-stream.test.ts src/app/paid-operator-execution.test.ts` |
| Repository health | Typecheck, lint, full unit suite, build pass | `npm run typecheck`; `npm run lint`; `npm test`; `npm run build` |

## Implementation sequence

1. Add the shared job contract and focused contract tests.
2. Add the server in-memory job store and lifecycle tests.
3. Add the depth-map job runner, event stream helpers, and no-paid-call tests.
4. Add thin job routes and update `/api/runway/depth-map-stream` to the compatibility wrapper.
5. Run targeted tests and adjust within scope.
6. Run typecheck, lint, full unit suite, and build.
7. Run independent boundary and final reviews; fix material findings and rerun affected checks.

## Risks and recovery

- Broad endpoint coupling: changing `/api/runway/depth-map-stream` affects artifact Start/End Depth and RGBD depth callers. The compatibility wrapper must preserve output shape exactly enough for existing browser readers.
- Event route overreach: first-class route support can imply server-owned projects. This slice uses `projectId` only as a caller-provided job label; it does not add project CRUD or durability.
- Terminal race conditions: cancelling an already-completed job must not append duplicate terminal events.
- Reversal path: restore the depth stream route to `streamPost(request, requestRunwayDepthMap, ...)`, remove job route files, and leave shared job contracts unused if the boundary proves too broad.

## Progress log

- [x] Recorded baseline HEAD and working-tree state.
- [x] Read required docs and relevant current code/tests.
- [x] Spawned and reconciled read-only `zenith_repo_mapper`, `zenith_roadmap_architect`, `zenith_contract_designer`, `zenith_test_strategist`, and `zenith_simplifier`.
- [x] Created this plan and acceptance matrix before implementation edits.
- [x] Add shared job contracts.
- [x] Add in-memory job store.
- [x] Add depth-map job runner and compatibility stream.
- [x] Add/update route files.
- [x] Run targeted checks.
- [x] Run typecheck, lint, full unit suite, and build.
- [x] Run independent final review agents.
- [x] Resolve material findings and update final result.

## Decisions and discoveries

- Depth-map was chosen because it is the narrowest server paid procedure. The existing depth endpoint has multiple callers, so tests must focus on stream compatibility rather than UI-only behavior.
- `POST /api/projects/[projectId]/jobs` will support only `generate-start-depth`; the `projectId` is not a durable project key in this slice.
- Existing browser `workbench.jobs` remains presentation state and is not replaced by server jobs.
- Added `src/lib/shared/contracts/jobs.ts` with JSON-safe V1 create/job/event/result/error contracts and tests.
- Added `src/lib/server/jobs/in-memory-job-store.ts` with ordered events, subscribers, terminal guards, and private runtime abort controllers.
- Added `src/lib/server/jobs/depth-map-job.ts` and `src/lib/server/jobs/job-event-stream.ts` to start depth jobs, convert Runway progress/results to job events, expose raw job events, and map compatibility stream events back to the existing NDJSON progress/complete/error shape.
- Added thin routes for `POST /api/projects/[projectId]/jobs`, `GET /api/jobs/[jobId]/events`, and `DELETE /api/jobs/[jobId]`.
- Updated `/api/runway/depth-map-stream` to use the depth-map job-backed compatibility wrapper.
- Targeted run `npm test -- src/lib/shared/contracts/jobs.test.ts src/lib/server/jobs/in-memory-job-store.test.ts src/lib/server/jobs/depth-map-job.test.ts src/lib/server/runway/route-response.test.ts src/runway/progress-stream.test.ts` initially failed on two issues: shared job contract parse errors mapped to HTTP 500, and response stream cancellation tried to enqueue after the stream closed. Fixed by giving `JobContractParseError` status 400 and unsubscribing/marking closed before cancellation emits job events. Rerun passed, 5 files / 25 tests.
- Adjacent run `npm test -- src/app/paid-operator-execution.test.ts src/app/workbench-commands.test.ts src/app/local-render-operators.test.ts src/app/project-persistence.test.ts src/lib/shared/contracts/projects.test.ts` passed, 5 files / 41 tests.
- `npm run typecheck` initially failed on TypeScript union typing in the internal event builder. Fixed by using a private `RuntimeJobEventInput` type while preserving Zod validation. Rerun passed.
- `npm run lint` passed.
- `npm test` passed, 58 files / 305 tests.
- `npm run build` passed with existing Vite large-client-chunk and plugin-timing warnings.
- `npm run test:e2e` passed, 4 Playwright smoke tests.
- Boundary/no-paid inspections returned no matches for secrets, Codex SDK, Runway HTTP helpers, or network fetch in `src/lib/shared`, `src/lib/server/jobs`, and the new job routes. Shared job contracts also have no server/browser runtime imports or runtime object types.
- `zenith_boundary_auditor` initially found two material issues: compatibility streams exposed `jobId`, letting legacy depth callers discover product-shaped Start Depth metadata, and request-signal abort lacked the close-before-cancel regression coverage. Fixed by removing `jobId` from compatibility NDJSON events and by making request-signal abort unsubscribe/mark closed before cancellation emits events, then close the controller. Added a request-signal abort regression test.
- After fixes, targeted Phase 3 tests passed, 5 files / 26 tests; `npm run typecheck`, `npm run lint`, `npm test` passed, 58 files / 306 tests; `npm run build` passed; `npm run test:e2e` passed, 4 tests.
- Boundary auditor follow-up reported no material findings and independently reran the targeted Phase 3 tests, 5 files / 26 tests.
- `zenith_final_reviewer` reported no material findings. It noted route behavior is mostly covered through service/helper tests rather than direct route-level tests; this remains an accepted residual risk for this smallest slice.

## Final result

Completed. The slice added JSON-safe shared job contracts, a server-only in-memory job store, a depth-map job runner, raw job event streaming, minimal first-class job create/event/cancel routes, and a job-backed compatibility wrapper for `/api/runway/depth-map-stream`. Existing browser UI behavior and NDJSON stream compatibility are preserved; the compatibility stream does not expose internal job IDs. Runtime abort controllers, subscribers, promises, and paid Runway execution remain server-only. No database, durable jobs, queue, worker, asset store, generic workflow engine, new dependency, or paid-test path was introduced.

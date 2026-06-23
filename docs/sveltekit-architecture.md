# SvelteKit Architecture

Zenith is now structured as a full SvelteKit application. SvelteKit owns page routing, API endpoints, server-only integrations, SSR, build output, and the production Node server. There is no separate Express-style sidecar server.

This document describes the architecture Zenith currently targets and maintains. For the more ambitious end-state roadmap covering durable projects, jobs, assets, and production operations, see `docs/ultimate-architecture-roadmap.md`.

## Target Architecture

The ideal shape for this project is:

- `src/routes`: SvelteKit route tree. `+page.svelte` renders the workbench UI, `+layout.svelte` owns app shell concerns, and `+server.ts` files expose API endpoints.
- `src/lib/shared`: side-effect-free, JSON-safe contracts importable from browser and server code. Current contracts cover portable project snapshots and first-class job records/events.
- `src/lib/server`: server-only modules. Anything in this folder is excluded from browser bundles by SvelteKit and is the right place for secrets, request validation, Runway API calls, Codex SDK calls, filesystem access, uploads, polling, streaming helpers, and in-memory job services.
- `src/runway/client.ts`: browser-safe API client. UI and pipeline code call local SvelteKit endpoints, never Runway directly.
- `src/app`: browser-side command bridge and focused application modules for project persistence, paid operator orchestration, local render operators, and view state.
- `src/artifacts`, `src/stages`, `src/ui`, `src/graphics`, `src/media`, `src/sketch`, `src/inpaint`: browser-side workbench state, rendering, media, and workflow modules.
- `svelte.config.js`: Node adapter configuration. `npm run build` produces the SvelteKit server bundle; `npm run start` runs it.

This is idiomatic SvelteKit because framework boundaries match the framework's ownership model: route files handle HTTP, server modules hold private effects, and browser modules stay browser-only.

## SvelteKit Terms

- Server-side rendering (SSR): SvelteKit renders the initial route HTML on the server, then the browser hydrates it into an interactive app. Zenith keeps SSR enabled by default and protects browser-only APIs such as WebGPU, WebCodecs, canvas, and DOM measurement inside client-side component logic.
- Hydration: the browser attaches event handlers and reactive state to the SSR HTML. The workbench becomes interactive after hydration.
- Endpoint route: a `+server.ts` file under `src/routes`. These files export HTTP handlers such as `GET` and `POST`.
- Server-only module: a module inside `src/lib/server`. SvelteKit prevents imports from this area into client bundles.
- NDJSON stream: newline-delimited JSON. The server sends one JSON object per line so the UI can show progress before the final result is ready.

## Request Flow

Most active paid UI flows still use local progress streams. Codex prompt-planning routes and browser client helpers also use the same stream primitive, but dedicated prompt-planning controls are not currently mounted as a first-class workbench UI flow:

1. A Svelte component calls `src/app/workbench-commands.ts`, which delegates to focused browser modules such as `src/app/paid-operator-execution.ts`.
2. The browser module calls a helper in `src/runway/client.ts`.
3. The helper sends JSON to a local endpoint such as `/api/runway/inpaint-stream`, `/api/runway/seedance-stream`, or `/api/codex/seedance-prompt-stream`.
4. The endpoint in `src/routes/api/.../+server.ts` uses `readJsonPayload` from `src/lib/server/runway/route-response.ts` to parse object-shaped JSON, reject malformed JSON with `400`, and enforce the `128 MB` body cap before service code runs.
5. The endpoint invokes a typed server procedure from the focused module it needs, such as `src/lib/server/runway/runway-jobs.ts`, `src/lib/server/runway/codex-planner.ts`, or `src/lib/server/runway/status.ts`.
6. The server procedure validates the payload with Zod, normalizes operational fields, reads private environment variables, performs Runway/Codex work, and writes progress events.
7. `streamProgressResponse` returns `application/x-ndjson` events to the browser.
8. `readProgressStream` in the browser consumes progress lines and resolves with the final `type: "complete"` result.

Depth generation now has a first-class in-memory job boundary underneath the compatibility stream:

1. The active workbench still calls `requestRunwayDepthMap`, preserving the visible Save/Load and operator UI behavior.
2. `/api/runway/depth-map-stream` delegates to `createDepthMapCompatibilityStreamResponse` in `src/lib/server/jobs/depth-map-job.ts`.
3. The compatibility handler validates the payload, creates an in-memory `generate-start-depth` job, starts the server-side Runway depth operation, and maps `JobEventV1` records back to the legacy progress stream shape.
4. Direct job clients can create start-depth or end-depth jobs with `POST /api/projects/:projectId/jobs`, read the current `JobV1` with `GET /api/jobs/:jobId`, stream raw `JobEventV1` records with `GET /api/jobs/:jobId/events`, and cancel jobs with `DELETE /api/jobs/:jobId`.

There is not yet a durable job store, queue, worker, or asset-backed job output model.

## Progress Event Contract

Streaming endpoints emit one JSON object per line:

```json
{"type":"progress","stage":"Uploading file","progress":0.18}
{"type":"complete","stage":"Complete","progress":1,"result":{"outputs":[]}}
{"type":"error","stage":"Failed","progress":1,"error":"Runway task failed.","status":502}
```

`progress` is normalized to `0..1`. Request parse failures return normal JSON HTTP errors before a stream starts. Failures after a stream starts are sent as `type: "error"` records inside the NDJSON stream. For legacy progress streams and the depth compatibility stream, request abort or response cancellation aborts the underlying operation so uploads, polling, downloads, and Codex prompt planning can stop promptly.

First-class job event streams emit the shared `JobEventV1` contract from `src/lib/shared/contracts/jobs.ts`. The current first-class job operators are `generate-start-depth` and `generate-end-depth`. Closing `GET /api/jobs/:jobId/events` only unsubscribes that stream; `DELETE /api/jobs/:jobId` is the cancellation boundary for direct job clients. The depth compatibility stream intentionally hides queued/started events and converts progress, complete, error, and cancelled job events back into the legacy stream contract expected by `src/runway/client.ts`.

## Shared Contract Layout

Shared contracts live under `src/lib/shared` and must remain JSON-safe, side-effect free, and importable from browser and server code:

- `src/lib/shared/contracts/projects.ts`: `ProjectSnapshotV1`, portable artifact records, prompt drafts, motion configuration, QC state, projection/view state, and Zod validation for project snapshot import/export.
- `src/lib/shared/contracts/jobs.ts`: `CreateJobRequestV1`, `JobV1`, `JobEventV1`, `JobResultV1`, and operator/artifact mappings for `generate-start-depth` and `generate-end-depth`.

Shared contracts must not import Svelte stores, DOM APIs, Blob/File/canvas objects, Node filesystem modules, private environment variables, server clients, or network code.

## Browser Workbench Ownership

The browser remains the owner of interactive state and runtime media handles:

- `src/artifacts/artifact-store.svelte.ts` owns the current in-browser workbench state, selected artifact/stage, artifact graph state, UI job indicators, QC state, and runtime media handles.
- `src/app/workbench-commands.ts` is the public command bridge used by Svelte components. It keeps existing UI entry points stable and delegates specialized work.
- `src/app/project-persistence.ts` creates, parses, downloads, and restores `ProjectSnapshotV1` values in the browser.
- `src/app/paid-operator-execution.ts` assembles browser-safe payloads for paid API endpoints and applies returned artifact results.
- `src/app/local-render-operators.ts` owns local WebGPU/WebCodecs preview, capture, and export orchestration.
- `src/app/rgbd-lab-commands.ts` owns RGBD lab paid-action request, confirm, and cancel routing while delegating execution to the existing browser RGBD scene commands.

The RGBD Expansion Lab remains a separate browser-owned path. `src/ui/RgbdExpansionLab.svelte` renders lab state and calls app/scene commands, `src/app/rgbd-lab-commands.ts` coordinates paid confirmation routing, `src/scene/rgbd-scene-commands.ts` applies RGBD state changes, and `src/services/gpt-image-reconstruction-service.ts` plus `src/services/gemini-depth-service.ts` call local Runway endpoint helpers. RGBD execution remains local-endpoint-only and browser-owned; it is not yet centralized behind the main `src/app/paid-operator-execution.ts` artifact operator path or first-class job routes.

Portable snapshots and job contracts do not store runtime handles. Browser media handles such as object URLs, Blob/File values, canvases, and preview objects stay in browser-owned state and are converted or cleared at persistence boundaries.

## Server Module Layout

The Runway/Codex server boundary is split by responsibility:

- `src/lib/server/runway/types.ts`: shared API, progress, task, and media types.
- `src/lib/server/runway/schemas.ts`: Zod schemas for browser-to-server request payloads.
- `src/lib/server/runway/config.ts`: private environment reads, model names, defaults, timeouts, and prompt-pack paths.
- `src/lib/server/runway/media.ts`: base64 data URL parsing, MIME checks, media size checks, and safe filenames.
- `src/lib/server/runway/http.ts`: Runway JSON requests, ephemeral uploads, task polling, output downloads, and progress estimation.
- `src/lib/server/runway/runway-jobs.ts`: inpaint, depth-map, Seedance video-to-video, and Seedance image-to-video orchestration.
- `src/lib/server/runway/codex-planner.ts`: Codex prompt planning, prompt-pack reads, temporary image files, output schema normalization.
- `src/lib/server/runway/route-response.ts`: request body parsing and NDJSON streaming responses.
- `src/lib/server/runway/errors.ts`: HTTP-like errors, abort propagation, and public error formatting.
- `src/lib/server/jobs/in-memory-job-store.ts`: process-local job records, event history, listeners, cancellation, and runtime-only abort controllers.
- `src/lib/server/jobs/depth-map-job.ts`: first-class depth job creation for start-depth and end-depth operators plus the legacy depth-stream compatibility wrapper.
- `src/lib/server/jobs/job-event-stream.ts`: raw job event NDJSON streams and compatibility conversion for depth progress streams.

This layout keeps each route explicit about the server capability it uses while making individual services easier to test and change.

## Project Snapshot Boundary

Save Project and Load Project are browser-owned persistence operations:

1. `src/app/project-persistence.ts` serializes the current artifact graph, selected artifact/stage, projection/view state, prompts, motion configuration, and QC checklist into `ProjectSnapshotV1`.
2. Runtime-only media fields are converted to portable data URLs when possible or removed when they are only transient object URLs.
3. `parseProjectSnapshot` validates the complete imported snapshot before `applyProjectSnapshot` mutates live workbench state.
4. Restore replaces artifacts, prompt drafts, motion configuration, QC items, viewer/projection state, and selected artifact/stage only after validation succeeds.
5. Old runtime object URLs are revoked after a successful restore.

There is no server-side project database, durable project API, asset store, or generic migration framework in the current architecture.

## In-Memory Job Boundary

First-class jobs currently exist only for depth-map generation:

- `POST /api/projects/:projectId/jobs` accepts `CreateJobRequestV1` for `generate-start-depth` and `generate-end-depth`, validates the request, creates an in-memory job, and returns `202` with `JobV1`.
- `GET /api/jobs/:jobId` returns the current in-memory `JobV1` snapshot, or `404` when the job is unknown or no longer present.
- `GET /api/jobs/:jobId/events` streams raw `JobEventV1` records.
- `DELETE /api/jobs/:jobId` cancels an in-memory job and returns the latest `JobV1`, or `404` when the job is unknown.
- `/api/runway/depth-map-stream` remains a compatibility endpoint for the active browser client and maps job events back to legacy progress records.

These jobs are process-memory only. They do not survive a server restart, do not run in a worker process, and do not provide durable event logs or asset-backed outputs yet.

## Zod Validation

Zod is used at the server boundary, not deep inside rendering code. The goal is to reject malformed browser payloads before paid upstream work starts.

Validation procedure:

1. `readJsonPayload` parses object-shaped JSON, rejects malformed/non-object JSON as invalid input, and enforces the `128 MB` body cap with a content-length preflight and streamed byte counting.
2. The selected service calls a route-specific Zod parser from `src/lib/server/runway/schemas.ts`.
3. Zod checks the structural contract: required data URLs, prompt shape, ratios, optional references, and Codex planning context.
4. Media parsers still perform byte-level checks: base64 requirement, MIME type, minimum file size, and Seedance video size limit.

This is intentionally two-layer validation. Zod handles "is the payload shaped correctly?" Media parsing handles "is this actually usable media?"

## Runway Data Procedure

Runway image and video procedures follow this lifecycle:

1. Read the API key from server-only environment variables: `RUNWAYML_API_SECRET` or `RUNWAY_SKILLS_API_SECRET`.
2. Accept browser payloads as `Record<string, unknown>`, then narrow individual fields before use.
3. Parse image/video data URLs, require base64 media, validate MIME type, and reject tiny uploads.
4. Request an ephemeral Runway upload placeholder.
5. Upload binary media through `FormData`.
6. Create a Runway task for inpaint, depth image generation, Seedance video-to-video, or Seedance image-to-video.
7. Poll `/v1/tasks/:id` with abort support and timeout controls.
8. Download result URLs into data URIs for browser-side artifact storage and preview.

This keeps secret-bearing HTTP calls on the server and gives the browser only local app results.

## Codex Prompt Procedure

Codex prompt planning is also server-only:

1. The endpoint receives source image, depth image, motion frames, and prompt-planning context.
2. Temporary local image files are written under `.codex/tmp`.
3. Prompt-pack Markdown is read from `docs/seedance_prompt_pack` or `docs/seedance_image_prompt_pack`.
4. Codex runs in a read-only sandbox with approval policy `never`, web search disabled, and network disabled.
5. The response is constrained by a JSON schema, parsed, narrowed, and normalized.
6. Temporary files are removed in a `finally` block.
7. The structured prompt, variants, diagnosis, negative terms, and warnings stream back to the browser.

## Error And Abort Semantics

- Invalid input uses `400`.
- Missing server secrets use `401`.
- Oversized JSON uses `413`.
- Upstream Runway failures keep their HTTP status when available.
- Long-running task timeouts use `504`.
- Client aborts and cancelled response streams propagate through `AbortSignal` and are represented internally as `499`.

## Environment Boundary

Private environment reads happen only in `src/lib/server/runway/config.ts` through SvelteKit's `$env/dynamic/private` module. Browser modules must not import server modules or read private environment variables. Public, browser-safe values would need a `PUBLIC_` prefix, but this project currently keeps Runway/Codex configuration private.

In development, Vite/SvelteKit loads `.env.local`. In production, the adapter-node server reads from the process environment, so deployment systems must inject `RUNWAYML_API_SECRET` and any optional Codex/Seedance variables before `npm run start`.

## Playwright QA

Playwright covers browser/server integration that unit tests do not:

- the SSR page returns a SvelteKit page response and hydrates enough for the workbench shell to be visible;
- `/api/runway/status` returns the expected local API contract;
- invalid Runway payloads and malformed JSON are rejected by local validation before upstream Runway work starts.

These tests live in `tests/e2e`. They use a dedicated local dev-server port so they do not accidentally reuse a stale manual dev server.

## When To Add `hooks.server.ts`

`hooks.server.ts` is SvelteKit's server-wide interception point. A `handle` hook wraps every request before it reaches a page, endpoint route, or static response.

Useful responsibilities for this project would be:

- assign a request ID and store it in `event.locals.requestId`;
- add consistent security headers, for example `X-Content-Type-Options`, `Referrer-Policy`, and selected cross-origin policies;
- log method, path, status, duration, and request ID once per request;
- normalize error telemetry without duplicating logging in every route;
- add shared authentication/session state later if projects become user-owned.

What should not go there:

- Runway job orchestration;
- Codex prompt planning;
- per-endpoint validation schemas;
- large business logic.

Those belong in route handlers and server service modules. A hook should stay thin and cross-cutting. I have not added it yet because the app does not currently need global auth, global tracing, or custom security headers to make the migration correct. Adding a hook later is straightforward when those requirements become concrete.

## When To Use Route `load`

SvelteKit `load` functions fetch data for pages and layouts before rendering. They are for page data, not background jobs.

There are two main forms:

- `+page.ts` or `+layout.ts`: can run in browser and during SSR, so it must stay browser-safe.
- `+page.server.ts` or `+layout.server.ts`: runs only on the server, can read private data, and serializes returned data into the page.

Good future uses in Zenith:

- load a saved project/session manifest before rendering the workbench;
- load a server-side list of recent artifacts or exports;
- load account, quota, or feature-flag state if authentication is added;
- expose non-secret deployment metadata for diagnostics.

Poor uses in Zenith:

- running a paid Runway generation from `load`;
- starting Codex prompt planning from `load`;
- reading browser-only WebGPU/canvas/IndexedDB state from `load`;
- serializing huge image/video data into SSR HTML.

The current app is a GPU/canvas-heavy workbench whose core state is browser-authored. For that reason, route `load` should be added only when there is real server-owned page data. The current Runway/Codex flows are correctly modeled as explicit API endpoints triggered by user actions.

## Verification

Use these checks after changes:

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

For a local smoke test, run `npm run dev` and request `/api/runway/status`. The response should show the configured API base, Runway API version, and whether the local environment has a Runway key.

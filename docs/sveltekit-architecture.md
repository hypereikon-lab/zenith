# SvelteKit Architecture

Zenith is now structured as a full SvelteKit application. SvelteKit owns page routing, API endpoints, server-only integrations, SSR, build output, and the production Node server. There is no separate Express-style sidecar server.

## Target Architecture

The ideal shape for this project is:

- `src/routes`: SvelteKit route tree. `+page.svelte` renders the workbench UI, `+layout.svelte` owns app shell concerns, and `+server.ts` files expose API endpoints.
- `src/lib/server`: server-only modules. Anything in this folder is excluded from browser bundles by SvelteKit and is the right place for secrets, request validation, Runway API calls, Codex SDK calls, filesystem access, uploads, polling, and streaming helpers.
- `src/runway/client.ts`: browser-safe API client. UI and pipeline code call local SvelteKit endpoints, never Runway directly.
- `src/app`, `src/lanes`, `src/ui`, `src/graphics`, `src/media`, `src/sketch`, `src/inpaint`: browser-side workbench, rendering, media, and workflow modules.
- `svelte.config.js`: Node adapter configuration. `npm run build` produces the SvelteKit server bundle; `npm run start` runs it.

This is idiomatic SvelteKit because framework boundaries match the framework's ownership model: route files handle HTTP, server modules hold private effects, and browser modules stay browser-only.

## SvelteKit Terms

- Server-side rendering (SSR): SvelteKit renders the initial route HTML on the server, then the browser hydrates it into an interactive app. Zenith keeps SSR enabled by default and protects browser-only APIs such as WebGPU, WebCodecs, canvas, and DOM measurement inside client-side component logic.
- Hydration: the browser attaches event handlers and reactive state to the SSR HTML. The workbench becomes interactive after hydration.
- Endpoint route: a `+server.ts` file under `src/routes`. These files export HTTP handlers such as `GET` and `POST`.
- Server-only module: a module inside `src/lib/server`. SvelteKit prevents imports from this area into client bundles.
- NDJSON stream: newline-delimited JSON. The server sends one JSON object per line so the UI can show progress before the final result is ready.

## Request Flow

The Runway and Codex flow is:

1. A Svelte component or workflow command calls a helper in `src/runway/client.ts`.
2. The helper sends JSON to a local endpoint such as `/api/runway/inpaint-stream`.
3. The endpoint in `src/routes/api/.../+server.ts` calls `streamPost` or `jsonPost` from `src/lib/server/route-utils.ts`.
4. `readJsonPayload` parses the request body and rejects bodies larger than `128 MB`.
5. The endpoint invokes a typed server procedure from the focused module it needs, such as `src/lib/server/runway/runway-jobs.ts`, `src/lib/server/runway/codex-planner.ts`, or `src/lib/server/runway/status.ts`.
6. The server procedure validates the payload with Zod, normalizes operational fields, reads private environment variables, performs Runway/Codex work, and writes progress events.
7. `streamProgressResponse` returns `application/x-ndjson` events to the browser.
8. `readProgressStream` in the browser consumes progress lines and resolves with the final `type: "complete"` result.

## Progress Event Contract

Streaming endpoints emit one JSON object per line:

```json
{"type":"progress","stage":"Uploading file","progress":0.18}
{"type":"complete","stage":"Complete","progress":1,"result":{"outputs":[]}}
{"type":"error","stage":"Failed","progress":1,"error":"Runway task failed.","status":502}
```

`progress` is normalized to `0..1`. Request parse failures return normal JSON HTTP errors before a stream starts. Job failures after a stream starts are sent as `type: "error"` records inside the NDJSON stream.

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

This layout keeps each route explicit about the server capability it uses while making individual services easier to test and change.

## Zod Validation

Zod is used at the server boundary, not deep inside rendering code. The goal is to reject malformed browser payloads before paid upstream work starts.

Validation procedure:

1. `readJsonPayload` parses JSON and enforces the `128 MB` body cap.
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
- Client aborts propagate through `AbortSignal` and are represented internally as `499`.

## Environment Boundary

Private environment reads happen only in `src/lib/server/runway/config.ts` through SvelteKit's `$env/dynamic/private` module. Browser modules must not import server modules or read private environment variables. Public, browser-safe values would need a `PUBLIC_` prefix, but this project currently keeps Runway/Codex configuration private.

In development, Vite/SvelteKit loads `.env.local`. In production, the adapter-node server reads from the process environment, so deployment systems must inject `RUNWAYML_API_SECRET` and any optional Codex/Seedance variables before `npm run start`.

## Playwright QA

Playwright covers browser/server integration that unit tests do not:

- the SSR page returns a SvelteKit page response and hydrates enough for the workbench shell to be visible;
- `/api/runway/status` returns the expected local API contract;
- invalid Runway payloads are rejected by local validation before upstream Runway work starts.

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

# Make Zenith Production Demonstrable

Status: complete
Roadmap phase: Phase 0 stabilization / adapter-node readiness
Baseline commit: 87ebf816fb798d6e88927863c218d819805e9668
Last updated: 2026-06-23

## Goal

Make Zenith demonstrable in a production-like local Node adapter flow: build the SvelteKit app, start `node build`, prove the server answers a neutral no-secret status endpoint, prove the existing Runway status contract is reachable without paid calls, and document the exact demo command and limitations.

## Why this slice now

Zenith already has adapter-node configured and dev-server Playwright smoke tests, but the repository did not have a deterministic proof that the built production server starts and serves safe routes. For interview and portfolio review, the app needs a repeatable production-mode smoke command without pretending it has durable storage, auth, queues, workers, or hosted operations.

## Current behavior and evidence

- `package.json` has `build: vite build` and `start: node build`.
- `svelte.config.js` uses `@sveltejs/adapter-node`.
- `tests/e2e/app.smoke.spec.ts` verifies the workbench shell, `/api/runway/status`, invalid paid-route payloads, and malformed JSON through `npm run dev`.
- `/api/runway/status` is Runway-specific and reports whether a Runway key is configured; it is not a neutral app health endpoint.
- There is no script that builds, starts `node build`, checks safe endpoints, and shuts the server down.

## Invariants

- Do not call paid Runway, Codex, or model APIs.
- Do not inspect, print, or depend on `.env.local` or secret process env values.
- Keep browser-only WebGPU/WebCodecs/canvas/media work in browser modules.
- Keep server-only effects under SvelteKit server routes or `src/lib/server`.
- Do not add database, durable queue, worker, auth, observability platform, deployment provider config, or generic health-check framework.
- Preserve current workbench behavior.

## Scope

### In scope

- Add `GET /api/status` as a neutral app/runtime status endpoint.
- Add a small server-owned status module with no env/secret/upstream reads.
- Add route tests for `/api/status`.
- Add a production smoke script that starts the built adapter-node server, probes `/api/status`, `/api/runway/status`, and `/`, then shuts down.
- Add package scripts and README/SvelteKit architecture docs for the production smoke command and explicit limitations.

### Explicit non-goals

- Durable project/job/asset storage.
- Request IDs, structured logging, security headers, auth, quotas, rate limits, or `hooks.server.ts`.
- Deployment platform choice, Docker, PM2, systemd, Fly/Render/Vercel configuration, or multi-process support.
- Moving inpaint, Seedance, Codex, or RGBD flows to first-class jobs.
- Browser-level production Playwright duplication.

## Proposed design

Use one explicit neutral status boundary:

- `src/lib/server/status.ts` returns a JSON-safe object with `ok`, `service`, `runtime`, `adapter`, and `timestamp`.
- `src/routes/api/status/+server.ts` stays thin and returns that object.
- `src/routes/api/status/status-route.test.ts` verifies the route shape and that it is independent from Runway configuration.

Use one explicit production smoke script:

- `scripts/smoke-adapter-node.mjs` requires an existing `build/index.js`.
- It picks a free localhost port, starts `node build` with `HOST=127.0.0.1`, `PORT=<free>`, and `NODE_ENV=production`.
- It deletes known Runway/Codex secret/config env vars from the child process env, then verifies `/api/status`, `/api/runway/status`, and `/`.
- It never requests generation routes and always kills the child in `finally`.

This is the smallest complete proof of adapter-node demonstrability without entering Phase 6 production operations.

## Alternatives considered

- Status quo: rejected because Playwright only proves the Vite dev server path.
- Add a second Playwright production config: deferred because a Node smoke is faster, less brittle, and sufficient for adapter-node proof.
- Add `hooks.server.ts` for request IDs/security headers/logging: deferred as Phase 6 production operations.
- Make `/api/status` check Runway/Codex/prompt-pack readiness: rejected because neutral health must not depend on secrets, upstream network, or paid integrations.

## Acceptance matrix

| Concern | Evidence required | Command/test |
|---|---|---|
| Neutral app status | `/api/status` returns JSON-safe app/runtime health without Runway secrets | `npm test -- src/routes/api/status/status-route.test.ts` |
| Adapter-node smoke | Built `node build` starts, serves `/api/status`, `/api/runway/status`, and `/` | `npm run smoke:prod` |
| No paid calls | Smoke script only requests safe status/page routes and strips known secret env vars from child env | code review and smoke output |
| Docs | README and architecture docs explain command and limitations | review diff |
| Regression | Typecheck, lint, unit, e2e, build pass | standard repo commands |

## Implementation sequence

1. Add status server module, route, and route test.
2. Add production smoke script and package scripts.
3. Update README and architecture docs.
4. Run targeted tests and `npm run smoke:prod`.
5. Run full verification.
6. Run read-only final boundary/review agents and reconcile findings.

## Risks and recovery

- Risk: smoke script leaves a server process running. Recovery: child process is killed in `finally`; script exits nonzero if shutdown fails.
- Risk: status endpoint becomes a generic observability platform. Recovery: keep response static and minimal; no registry or checks.
- Risk: smoke accidentally depends on secrets. Recovery: child env deletes known paid-service variables and asserts Runway configured is false.

## Progress log

- [x] Baseline status, docs, scripts, routes, and tests inspected.
- [x] Baseline typecheck and targeted route tests passed.
- [x] Read-only agents reviewed repo mapping, roadmap fit, test strategy, and scope.
- [x] Add status route and tests.
- [x] Add production smoke script and docs.
- [x] Run verification.
- [x] Complete final review.

## Decisions and discoveries

- The production-demonstrable gap is adapter-node proof, not app architecture or production operations.
- `/api/runway/status` remains useful, but it is integration-specific. `/api/status` should be neutral.
- Playwright remains dev-hydration coverage; a Node smoke is enough for adapter-node start/readiness.
- Final review found the smoke script inherited `RUNWAY_API_BASE` and `RUNWAY_API_VERSION` while asserting default Runway status values. Those vars are now removed from the runtime child env, and the exact repro `RUNWAY_API_VERSION=2099-01-01 npm run smoke:prod:built` passes.
- Final review also found README wording overclaimed that the full command does not read `.env.local`; docs now say the runtime child process removes known paid-service env vars, while the build step remains the normal SvelteKit build.

## Final result

Complete. Zenith now has a local production-demonstrable adapter-node path:

- `GET /api/status` returns neutral app/runtime status without secrets, upstream checks, storage checks, browser capability checks, or paid-service dependencies.
- `npm run smoke:prod` builds the app, starts `node build` on a local random port, probes `/api/status`, `/api/runway/status`, and `/`, then shuts down.
- `npm run smoke:prod:built` runs the same adapter-node smoke against an existing build.
- README and SvelteKit architecture docs describe the command and explicitly limit the claim to a local single-user adapter-node demo, not durable storage, queues, workers, auth, quotas, hosted observability, or multi-process production.

Verification:

- `npm test -- src/routes/api/status/status-route.test.ts`: passed.
- `npm run typecheck`: passed.
- `npm run smoke:prod`: passed.
- `RUNWAY_API_VERSION=2099-01-01 npm run smoke:prod:built`: passed after review fix.
- `npm run lint`: passed after ignoring generated Playwright output folders.
- `npm test`: passed, 47 files / 270 tests.
- `npm run test:e2e`: passed, 4 Playwright tests.

Deferred:

- Durable project, job, and asset storage.
- Queue, worker, auth, quotas, rate limits, request IDs, structured logging, and global security headers.
- Deployment platform choice.
- Moving additional paid flows to first-class jobs.

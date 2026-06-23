# Zenith Hiring Evaluation Guide

Zenith is a local, single-user SvelteKit production cockpit for fulldome media. It demonstrates how to separate a browser-heavy creative workstation from server-only paid API boundaries while keeping the current app runnable and testable without secrets.

This guide is the shortest path for a reviewer to evaluate the project honestly.

## What To Evaluate

- Product model: an artifact-first fulldome workflow from Plate Sketch to Start State, depth, local 2.5D motion, End State, Video Take, and QC/export.
- Frontend architecture: SvelteKit/Svelte 5 workbench UI with browser-owned media, canvas, WebGPU/WebCodecs, object URLs, and interactive state.
- Server boundary: SvelteKit API routes delegate to `src/lib/server` modules for validation, Runway/Codex integration, streaming, and in-memory jobs.
- Shared contracts: JSON-safe project snapshots, job records, event records, and artifact topology under `src/lib/shared/contracts`.
- Verification: unit tests, e2e smoke tests, and adapter-node production smoke avoid paid upstream generation calls.

## Fast No-Secrets Review

These commands do not require a Runway key and should not make paid generation calls:

```sh
npm install
npm run typecheck
npm run lint
npm test
npm run smoke:prod
```

`npm run smoke:prod` builds the adapter-node app, starts `node build` on a local random port, removes the Runway secret/config keys and Codex prompt-planning config keys listed in `scripts/smoke-adapter-node.mjs` from the child process, probes `/api/status`, `/api/runway/status`, and `/`, then shuts down.

For browser/server integration smoke:

```sh
npm run test:e2e
```

The Playwright smoke checks that the SvelteKit page serves, the Runway status contract responds, invalid Runway payloads are rejected before upstream work, and malformed JSON is handled at the API boundary.

## Running The Workbench Locally

```sh
npm install
npm run dev
```

Open the printed local URL, usually `http://127.0.0.1:5173/`.

Without a Runway key, reviewers can still inspect the UI, projection modes, artifact workflow, local state, default plate assets, contracts, tests, and smoke behavior. Paid generation buttons require a server-side `RUNWAYML_API_SECRET` in `.env.local`.

## Optional Paid Path

To exercise Runway-backed generation manually:

```sh
cp .env.example .env.local
# Fill RUNWAYML_API_SECRET in .env.local
npm run dev
```

Do not run paid flows as automated hiring verification. Outputs depend on upstream availability, account configuration, media inputs, and model behavior.

## Code Evidence Map

| Topic                                  | Files to inspect                                                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Main SvelteKit page and API routes     | `src/routes`                                                                                                                                 |
| Browser workbench commands             | `src/app/workbench-commands.ts`, `src/app/project-persistence.ts`, `src/app/paid-operator-execution.ts`, `src/app/local-render-operators.ts` |
| Artifact graph and runtime state       | `src/artifacts/artifact-store.svelte.ts`, `src/artifacts/artifact-types.ts`, `src/artifacts/artifact-graph-consistency.test.ts`              |
| Shared JSON-safe contracts             | `src/lib/shared/contracts/projects.ts`, `src/lib/shared/contracts/jobs.ts`, `src/lib/shared/contracts/artifact-topology.ts`                  |
| Server-only Runway/Codex boundary      | `src/lib/server/runway`, `src/routes/api/runway`, `src/routes/api/codex`                                                                     |
| In-memory job boundary                 | `src/lib/server/jobs`, `src/routes/api/jobs`, `src/routes/api/projects/[projectId]/jobs`                                                     |
| Local graphics/media engine            | `src/graphics`, `src/media`, `src/sketch`, `src/plates`, `src/geometry`                                                                      |
| Browser smoke and invalid-input checks | `tests/e2e/app.smoke.spec.ts`                                                                                                                |
| Adapter-node smoke                     | `scripts/smoke-adapter-node.mjs`                                                                                                             |
| Prompt planning packs                  | `docs/seedance_prompt_pack`, `docs/seedance_image_prompt_pack`                                                                               |
| Tracked visual inputs/experiments      | `public/default-plates`, `exports/cave-carrier-experiments`                                                                                  |

## What This Project Demonstrates

- SvelteKit boundaries: thin routes, server-only paid effects, shared JSON-safe contracts, browser-owned rendering/media.
- Practical production demo path: adapter-node build and smoke command without requiring secrets.
- Defensive API design: malformed JSON and invalid payloads fail before paid upstream work.
- Portable project state: save/load snapshots strip runtime handles and reject runtime-only object URLs.
- Local creative engine work: WebGPU/WebCodecs/canvas-heavy code remains in browser-owned modules.
- Roadmap discipline: durable storage, queues, workers, auth, and collaboration are documented as deferred decisions, not half-built abstractions.

## Explicit Non-Claims

Zenith is not currently a hosted multi-user SaaS platform. It does not yet include durable project storage, durable asset storage, resumable jobs after server restart, a worker process, a queue, auth, quotas, billing controls, hosted observability, or collaboration.

The current production claim is narrower and testable: Zenith can be built and run as a local adapter-node SvelteKit app, with server-only paid integration boundaries and safe no-paid-call smoke verification.

## Deeper Architecture Reading

- `docs/sveltekit-architecture.md`: current implementation boundaries.
- `docs/ultimate-architecture-roadmap.md`: long-term target and deferred production decisions.
- `README.md`: product workflow, setup, commands, and module map.

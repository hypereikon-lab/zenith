# Stabilize Current Architecture

Status: complete
Roadmap phase: Phase 0 stabilization, with Phase 3 boundary verification
Baseline commit: c052e71c11af5a4653540088311ebafe0ad216cb
Last updated: 2026-06-23

## Goal

Make the current SvelteKit architecture safer to carry forward without changing product behavior: prove Codex and Runway request validation stops invalid input before paid SDK/upstream work, keep compatibility-stream behavior explicit, and align docs with the current route and job boundary reality.

## Why this slice now

The codebase is already mid-stabilization: legacy shell files have been removed, browser command ownership has been narrowed, project snapshots and first-class depth jobs exist, and active paid flows still use compatibility streams. Before adding durable projects, assets, queues, auth, or broader job migration, the repo needs stronger evidence that current paid/API boundaries are safe and accurately documented.

## Current behavior and evidence

- `src/runway/client.ts` calls local SvelteKit endpoints for Runway and Codex work.
- `src/routes/api/.../+server.ts` files are thin and delegate to `streamPost` or focused job route helpers.
- `src/lib/server/runway/schemas.ts` owns Zod request validation for Runway and Codex stream payloads.
- `src/lib/server/runway/codex-planner.ts` validates Codex payloads before `new Codex()`, writes temporary images under `.codex/tmp`, starts Codex in a read-only/no-network sandbox, and removes temp files in `finally`.
- `src/lib/server/jobs/depth-map-job.ts` backs first-class start/end depth jobs while `/api/runway/depth-map-stream` remains a compatibility stream for the active browser client.
- `docs/ultimate-architecture-roadmap.md` still names an older checkpoint commit even though current HEAD is `c052e71c11af5a4653540088311ebafe0ad216cb`.

Assumption: this slice should improve production readiness through evidence and documentation, not by introducing durable storage, asset services, a generic workflow framework, or an artifact catalog extraction.

## Invariants

- Do not call paid Runway, Codex, or model APIs in tests.
- Do not inspect or print `.env.local` or process environment secrets.
- Keep browser-owned Blob/File/canvas/object URL and WebGPU/WebCodecs work out of shared/server contracts.
- Keep private effects, Codex SDK use, Runway clients, filesystem access, and private env reads server-only.
- Preserve current visible workbench behavior and compatibility streams.
- Do not add database, durable queue, worker, auth, asset store, or generic migration framework.

## Scope

### In scope

- Add focused no-paid-call unit coverage for Runway/Codex schema validation.
- Add focused Codex planner tests with a mocked `@openai/codex-sdk`, including sandbox options and invalid-payload short-circuiting.
- Update README and architecture docs where they imply mounted Codex UI flows or stale checkpoint data.
- Record artifact catalog extraction as a follow-up decision, not part of this slice.

### Explicit non-goals

- Durable projects, durable media assets, uploads, signed URLs, queues, workers, auth, observability, rate limits, or deployment platform changes.
- Migrating inpaint, Seedance, or Codex prompt planning to first-class jobs.
- Extracting a shared artifact catalog or changing artifact runtime ownership.
- Changing browser UI behavior or adding Codex prompt-planning controls.

## Proposed design

Keep the implementation at the lowest reliable boundary:

- Test `src/lib/server/runway/schemas.ts` directly for invalid and valid payloads. These tests prove malformed data is rejected with `400` before media parsing or upstream clients run.
- Test `src/lib/server/runway/codex-planner.ts` with a mocked Codex SDK. These tests prove invalid payloads reject before Codex is constructed, and valid payloads use the current read-only/no-network sandbox and structured output schema.
- Update docs to say Codex prompt-planning routes and browser client helpers exist, but the current workbench UI does not mount dedicated prompt-planning controls yet.

This is the smallest complete production-readiness slice because it strengthens the paid-effect boundary without changing runtime behavior or leaking into later roadmap phases.

## Alternatives considered

- Status quo: keep relying on existing job-route tests and manual review. Rejected because Codex validation/sandbox behavior was not covered by executable no-paid-call tests.
- Extract `src/lib/shared/contracts/artifacts.ts`: useful later, but deferred because this slice is about production safety, and a catalog extraction risks mixing ownership cleanup with paid-boundary hardening.
- Move all streams to first-class jobs now: deferred because the roadmap explicitly keeps compatibility streams until assets and durable jobs are ready.

## Acceptance matrix

| Concern | Evidence required | Command/test |
|---|---|---|
| Codex invalid input | Invalid prompt payload rejects with `400` before Codex SDK construction | `npm test -- src/lib/server/runway/codex-planner.test.ts` |
| Codex sandbox | Valid mocked prompt planning uses read-only sandbox, approval `never`, web/network disabled, and an output schema | `npm test -- src/lib/server/runway/codex-planner.test.ts` |
| Runway schema safety | Missing media, malformed ratios, invalid quality/model, and malformed Codex motion frames reject with `400` | `npm test -- src/lib/server/runway/schemas.test.ts` |
| Docs alignment | README and architecture docs match current compatibility/job/UI reality | review diff |
| Regression | Typecheck, lint, unit tests, build, and e2e smoke remain green | `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` |

## Implementation sequence

1. Add the plan and narrow the scope based on read-only subagent findings.
2. Add schema validation tests for server Runway/Codex payload boundaries.
3. Add Codex planner tests with a mocked SDK and deterministic local data URLs.
4. Update README and architecture roadmap/docs for current compatibility and checkpoint truth.
5. Run targeted tests, then repo-wide checks.
6. Run read-only final boundary/review subagents and reconcile material findings.

## Risks and recovery

- Tests could accidentally instantiate a real Codex client. Mitigation: `vi.mock("@openai/codex-sdk")`, invalid-payload tests assert constructor is not called, and tests stub global `fetch` against unexpected network.
- Codex planner tests create temp files under `.codex/tmp`. Mitigation: use current production cleanup path and assert no new `zenith-codex-*` temp dirs remain.
- Docs could overstate future architecture. Mitigation: describe current compatibility reality and explicitly defer asset/job/storage work.

## Progress log

- [x] Baseline status, docs, configs, and architecture were inspected.
- [x] Read-only subagents mapped repository paths, roadmap fit, test gaps, simplification pressure, and contract design options.
- [x] Scope narrowed to no-paid boundary tests and documentation alignment.
- [x] Add targeted tests.
- [x] Update docs.
- [x] Run verification. Targeted schema and Codex planner tests, typecheck, lint, full Vitest, build, and e2e smoke are passing.
- [x] Complete final read-only review.

## Decisions and discoveries

- Artifact catalog extraction is real technical debt, but not required for this production boundary hardening slice.
- Codex prompt-planning server/client helpers exist, but current UI integration is not a mounted first-class workbench flow.
- The active depth workflow still uses a compatibility stream over first-class in-memory jobs.
- Read-only review found no P0/P1/P2 boundary issues. It did identify documentation and test-claim precision issues, which were fixed before completion.
- Read-only subagent conclusions are preserved in the Codex thread, not in this repository. The durable repo-level decision is recorded here: defer artifact catalog extraction and focus this slice on paid-boundary evidence.

## Final result

Delivered a Phase 0 stabilization slice without changing product behavior:

- Added schema tests proving invalid Runway/Codex payloads reject with `400` before upstream work.
- Added Codex planner tests proving invalid prompt payloads reject before SDK construction, valid prompt planning uses the read-only/no-network sandbox, structured output schema is passed to `thread.run`, and successful runs do not leave new `zenith-codex-*` temp dirs.
- Updated README and architecture docs to distinguish available Codex server/client helpers from a not-yet-mounted first-class workbench UI flow.
- Updated the roadmap checkpoint commit to `c052e71c11af5a4653540088311ebafe0ad216cb`.

Verified with:

- `npm test -- src/lib/server/runway/schemas.test.ts`
- `npm test -- src/lib/server/runway/codex-planner.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`

Deferred deliberately:

- Artifact catalog extraction.
- Asset contracts/storage.
- Durable jobs, queue, workers, auth, observability, and deployment topology.
- Migrating inpaint, Seedance, or Codex streams to first-class jobs.

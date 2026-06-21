# Extract Local Render Operators

Status: complete
Roadmap phase: Phase 2: Command Split And Thin UI
Baseline commit: 51124275fd4610a74092a8c753cc4d9055b9a426
Last updated: 2026-06-20 19:46 -04

## Goal

Save the current UI behavior while moving browser-owned local render operator orchestration out of `src/app/workbench-commands.ts` into a focused app-side module. The public `executeOperator` command bridge remains the UI entry point.

## Why this slice now

Project persistence and paid operator execution are already separated in the dirty working tree. The remaining Phase 2 ambiguity is that `workbench-commands.ts` still owns local import/project commands, job state mutation, paid delegation, WebGPU/WebCodecs render orchestration, and media/config downloads. This slice completes the Phase 2 local render boundary without starting Phase 3 jobs or later asset/persistence work.

## Current behavior and evidence

- Current HEAD: `51124275fd4610a74092a8c753cc4d9055b9a426`.
- Working tree before this slice is already dirty with prior Phase 1 project persistence and Phase 2 paid-operator extraction changes; those are preserved as the baseline for this work.
- `README.md` describes local depth-aware motion preview/export as browser-local WebGPU/WebCodecs work before Seedance handoff.
- `docs/sveltekit-architecture.md` keeps browser rendering/media in browser modules and paid/secrets behind SvelteKit server routes/services.
- `docs/ultimate-architecture-roadmap.md` Phase 2 explicitly calls for splitting `workbench-commands.ts`, moving paid API payload creation and local render operator orchestration into focused modules, while deferring jobs/assets/storage.
- `src/ui/OperatorPanel.svelte` invokes operators through `executeOperator(...)`; this entry point must remain unchanged.
- `src/app/workbench-commands.ts` currently dispatches the requested local operator IDs:
  - `preview-motion-draft` -> `createMotionDraft`
  - `capture-displaced-endpoint` -> `createDisplacedEndpoint`
  - `export-motion-proxy`, `export-start-depth`, `export-end-depth` -> `downloadArtifactMedia`
  - `export-motion-config` -> `exportMotionConfig`
- `src/services/depth-motion-service.ts` owns browser runtime rendering helpers and checks for browser/WebGPU/WebCodecs capabilities.
- Baseline targeted check before this slice: `npm test -- src/app/workbench-commands.test.ts src/app/paid-operator-execution.test.ts` passed, 2 files / 19 tests.
- Read-only agents completed:
  - `zenith_repo_mapper` traced the six operator IDs, mutable state, runtime handles, hidden stale-artifact coupling, and browser APIs.
  - `zenith_roadmap_architect` confirmed this is Phase 2 and warned against server/shared/jobs/assets leakage.
  - `zenith_test_strategist` produced the acceptance matrix and no-paid-call test plan.
  - `zenith_simplifier` challenged moving unrelated commands and generic abstractions.

## Invariants

- Keep WebGPU, WebCodecs, canvas, DOM, object URLs, Blob/File handles, local media loading, and interactive rendering in browser-only modules.
- Keep secrets, paid upstream calls, Codex SDK use, filesystem, and server trust boundaries out of this slice.
- Preserve `executeOperator` and current Save/Load/paid/local UI entry points.
- Keep portable data JSON-safe and runtime handles out of shared contracts.
- Do not call Runway or Codex paid APIs in tests.
- Preserve current behavior where direct command calls can bypass UI availability checks; do not introduce new gating semantics here.
- Preserve current `capture-displaced-endpoint` implementation behavior: it is UI-gated on Motion Draft availability but reads Start State, Start Depth, and motion config at execution time.

## Scope

### In scope

- Add `src/app/local-render-operators.ts`.
- Move local render orchestration and adjacent media/config export helpers for:
  - `preview-motion-draft`
  - `capture-displaced-endpoint`
  - `export-motion-proxy`
  - `export-motion-config`
  - `export-start-depth`
  - `export-end-depth`
- Update `src/app/workbench-commands.ts` to delegate those six cases to the new module.
- Add focused no-paid-call unit tests with mocked local render services and downloads.
- Keep behavior and visible UI unchanged.

### Explicit non-goals

- No database, durable project store, asset store, job system, queue, worker, or `/api/projects`.
- No server routes, server-side local render, route-level operator API, or shared contract expansion.
- No generic command bus, repository abstraction, workflow engine, or broad local command split.
- No paid Runway/Codex API calls or paid-path behavior changes.
- No project persistence changes beyond tests if needed to prove runtime media remains snapshot-safe.
- No UI redesign, text changes, availability-rule changes, or behavior changes beyond moving ownership.
- No new dependency.

## Proposed design

Create `src/app/local-render-operators.ts` as the browser/app owner for local render operator execution. It exports one explicit dispatcher, `executeLocalRenderOperator(operatorId)`, for the six render/export operator IDs. The module owns:

- starting/updating/completing render jobs for motion draft and displaced endpoint;
- loading Start State and Start Depth artifact media into canvases;
- calling `renderDepthMotionProxy` and `renderDisplacedEndpoint`;
- applying local render results to artifact state and runtime media handles;
- exporting motion config JSON;
- downloading motion/depth artifact media.

`workbench-commands.ts` remains the public command bridge. It handles paid confirmation, delegates paid execution to `executePaidOperator`, delegates project save/load to `project-persistence`, retains local import/projection/QC/delivery commands, and catches public command errors.

This is intentionally product-shaped. It does not introduce an abstract runner or shared media repository. Duplicated browser-only `blobToDataUrl` helpers remain private to modules with different semantics.

## Alternatives considered

- Keep status quo: rejected because `workbench-commands.ts` would continue to own mixed command bridge, paid delegation, project persistence, and local render orchestration after Phase 2 started.
- Move only `preview-motion-draft` and `capture-displaced-endpoint`: smaller, but under-scopes the user's requested related media/export helpers and leaves render-owned motion/depth export helpers in the command bridge.
- Move all local commands: rejected as broader than Phase 2 local render ownership and likely to churn imports, projection controls, project persistence, and delivery manifest behavior without current value.
- Add a generic command runner: rejected because explicit operator modules are enough and the roadmap warns against generic workflow frameworks before the need is real.

## Acceptance matrix

| Concern | Evidence required | Command/test |
|---|---|---|
| Motion draft render | Mocked render starts job, consumes Start State/Start Depth canvases, applies Motion Draft video media/result/handle, selects artifact | `npm test -- src/app/local-render-operators.test.ts` |
| Displaced endpoint render | Mocked endpoint render applies image media/result/handle with canvas, selects artifact, preserves existing stale downstream behavior | `npm test -- src/app/local-render-operators.test.ts` |
| Media/config exports | Motion proxy/depth exports fetch current artifact media and call `downloadBlob`; config export downloads JSON from current motion config | `npm test -- src/app/local-render-operators.test.ts` |
| Error behavior | Missing/non-image media, failed downloads, and unsupported operator IDs fail before render/download side effects | `npm test -- src/app/local-render-operators.test.ts` |
| Command bridge | `executeOperator` delegates exactly the six local render/export IDs to the new module, paid/project paths remain delegated to their existing modules | `npm test -- src/app/workbench-commands.test.ts` |
| No paid calls | Local render tests do not import or call Runway/Codex clients; paid tests stay mocked | Targeted tests and import inspection |
| Boundary | New module stays in `src/app`; no `src/routes`, `src/lib/server`, or `src/lib/shared` imports of local render/browser render modules | `npm run typecheck`, `npm run build`, `rg` inspection |
| Regression | Adjacent paid/project/operator tests continue to pass | `npm test -- src/app/paid-operator-execution.test.ts src/app/project-persistence.test.ts src/app/operator-registry.test.ts` |
| Repository health | Typecheck, lint, full unit suite, production build pass | `npm run typecheck`; `npm run lint`; `npm test`; `npm run build` |

## Implementation sequence

1. Add `src/app/local-render-operators.ts` and move the six local render/export cases and helpers.
2. Update `src/app/workbench-commands.ts` to delegate those cases and remove local render-specific imports/helpers.
3. Add focused tests for the new module and update command-bridge tests.
4. Run targeted tests and adjust only within scope.
5. Run typecheck, lint, full unit suite, and build.
6. Spawn `zenith_boundary_auditor` and `zenith_final_reviewer`, reconcile material findings, rerun affected checks, and update this plan.

## Risks and recovery

- Runtime media handling could accidentally move blobs/canvases into portable state. Tests will assert artifact media remains JSON-shaped while handles own runtime objects.
- Public command catch/failure behavior could change if errors are caught inside the new module. The new module will throw and let `executeOperator` preserve existing public error handling.
- Export tests can overfit exact timestamps or strings. Tests should use fixed system time only for filename behavior and avoid brittle UI text checks beyond current product metadata.
- Reversal path: inline the new module's explicit switch/helpers back into `workbench-commands.ts` and remove the delegation import if the split proves too broad.

## Progress log

- [x] Recorded baseline HEAD and working-tree state.
- [x] Read required docs and relevant current code/tests.
- [x] Spawned and reconciled read-only `zenith_repo_mapper`, `zenith_roadmap_architect`, `zenith_test_strategist`, and `zenith_simplifier`.
- [x] Created this plan and acceptance matrix before implementation edits.
- [x] Add focused local render module.
- [x] Update command bridge.
- [x] Add/update targeted tests.
- [x] Run targeted checks.
- [x] Run typecheck, lint, full unit suite, and build.
- [x] Run independent final review agents.
- [x] Resolve material findings and update final result.

## Decisions and discoveries

- Reconciled agent disagreement by moving the six render/export operator cases, not only the two rendering functions and not all local commands.
- `downloadDeliveryManifest` remains in `workbench-commands.ts` because it is delivery/QC export behavior, not local render ownership.
- Existing duplicated `blobToDataUrl` helpers remain private; a generic media helper is deferred to avoid mixing paid, persistence, and local-render semantics.
- Added `src/app/local-render-operators.ts` as the owner for the six render/export IDs; `workbench-commands.ts` now only delegates those IDs.
- Targeted run `npm test -- src/app/local-render-operators.test.ts src/app/workbench-commands.test.ts` initially failed because the test reused one `Response` across multiple `blob()` reads; fixed by returning a fresh `Response` per mocked fetch. Rerun passed, 2 files / 19 tests.
- Adjacent regression run `npm test -- src/app/paid-operator-execution.test.ts src/app/project-persistence.test.ts src/app/operator-registry.test.ts src/lib/shared/contracts/projects.test.ts` passed, 4 files / 24 tests.
- `npm run typecheck` passed.
- `npm run lint` passed clean after removing one unused test import.
- `npm test` passed, 55 files / 289 tests.
- `npm run build` passed with existing Vite large-client-chunk and plugin-timing warnings.
- Boundary inspection `rg -n "local-render-operators|depth-motion-service" src/routes src/lib/server src/lib/shared` returned no matches.
- `zenith_boundary_auditor` reported no material findings. Non-blocking note: the SSR route still transitively imports browser app command modules through UI components, matching the pre-slice baseline where `workbench-commands.ts` directly imported the depth-motion service. Future work could lazy-load local render execution inside the command branch if SSR import minimization becomes a priority.
- `zenith_final_reviewer` reported no material findings.

## Final result

Completed. The slice added `src/app/local-render-operators.ts` as the focused browser/app owner for the six local render/export operator IDs and updated `src/app/workbench-commands.ts` to delegate those cases while retaining public command dispatch, paid confirmation, project persistence delegation, imports, projection controls, QC selection, and delivery manifest export. Focused tests cover mocked local render success, progress, artifact/result/handle application, config/media exports, missing media and failed fetch errors, unsupported operator IDs, and command-bridge delegation. Typecheck, lint, full unit suite, and build pass. No Phase 3 jobs, asset store, persistence route, server render path, generic command bus, new dependency, or paid API behavior was introduced.

# Svelte Outlet Product Commands Boundary

Status: complete
Roadmap phase: Phase 2: Command Split And Thin UI
Baseline commit: 52f49e9207e6eb09e4f8b3f57d6d071c313acefa
Last updated: 2026-06-21 00:25 America/Santiago

## Goal

Complete the next bounded step toward Zenith's "Svelte outlet + product commands + browser engine" architecture:

- keep SvelteKit routes as only the app entry and API boundaries;
- keep Svelte components focused on layout, controls, tabs, conditionals, canvas mounting, and visible state;
- move invariant-bearing UI mutations into product-shaped `src/app` commands;
- keep WebGPU, WebCodecs, canvas, object URLs, RGBD/math/media work in browser engine modules;
- preserve visible UI behavior and avoid paid API calls in tests.

## Why this slice now

The read-only architecture reconciliation found that the route/server/shared boundaries are already mostly correct. The remaining ambiguity is in the browser workflow layer: some Svelte components mutate workbench state directly even when those mutations have product invariants such as prompt refresh, projection summary updates, or paid confirmation routing.

The highest-confidence correctness issue is the projection guide split path:

- `PlateSketchEditor.svelte` uses `setDomeGuideSemanticSplit` and `setDomeGuideHorizonSplit`, which normalize values, refresh generated repair prompts when appropriate, and update the Plate Sketch summary.
- `SourceMapMediaViewer.svelte` directly assigns `workbench.domeGuideSemanticSplit` and `workbench.domeGuideHorizonSplit`, bypassing those invariants.

Fixing this first creates the right command boundary without introducing a generic workflow router or changing SvelteKit routes.

## Current behavior and evidence

- `src/routes/+page.svelte` renders `App`, and `src/App.svelte` renders `ArtifactWorkbench`; this is the correct single workbench outlet for the current product.
- API routes remain thin server-boundary adapters, for example job and Runway stream routes delegate to server services.
- `src/artifacts/artifact-store.svelte.ts` owns browser workbench state including `selectedStageId`, `selectedArtifactId`, `viewerMode`, `surfaceMode`, artifact graph, UI jobs, errors, runtime media handles, and pending paid action state.
- `src/app/workbench-commands.ts` is the public browser command bridge. It already owns project persistence entry points, paid confirmation dispatch, local render delegation, media import/promotion, and projection helper commands.
- `src/ui/ArtifactWorkbench.svelte` still mutates `workbench.viewerMode` inline and calls `selectSurfaceMode` directly. These are simple view-state changes today, but they should have an app-command facade so future invariants live outside UI.
- `src/ui/SourceMapMediaViewer.svelte` directly mutates projection guide split values. That is a concrete split-brain path.
- `src/ui/RgbdExpansionLab.svelte` owned RGBD paid-action request/confirm/cancel routing inline before this slice. That cleanup was small enough to include after the guide/view command seam was proven by targeted tests.
- Baseline check: `npm test -- src/app/workbench-commands.test.ts` passed with 11 tests.

## Invariants

- Visible UI behavior stays unchanged.
- Do not split workbench stages into SvelteKit routes.
- Do not add a command bus, workflow engine, state-machine dependency, generic repository layer, database, asset store, queue, worker, auth, or collaboration layer.
- Do not invoke Runway or Codex paid APIs.
- Browser-only media/rendering code remains out of `src/lib/server` and `src/lib/shared`.
- Shared contracts remain JSON-safe and runtime-handle free.
- Server routes remain thin and server-only effects stay under `src/lib/server`.

## Scope

### In scope

- Add product-shaped app commands for workbench view/surface selection and projection guide mutation where the mutation has invariants.
- Update UI components to call those commands instead of mutating invariant-bearing state directly.
- Add focused no-paid-call tests proving projection guide changes from the non-plate viewer path refresh generated prompts and preserve manually edited prompts.
- Add a tiny browser-only RGBD paid-action command bridge after the first command seam is complete and verified, without broadening into jobs or assets.
- Update this plan and final receipt with exact evidence.

### Explicit non-goals

- No SvelteKit nested routes for workflow stages.
- No broad component rewrite or UI redesign.
- No generic router, command bus, workflow engine, repository abstraction, or state-machine dependency.
- No durable project API, database, asset store, uploads, signed URLs, job queue, worker, hooks/auth/quota layer, or collaboration model.
- No expansion of first-class jobs beyond the existing depth boundary.
- No server-side movement of WebGPU, WebCodecs, canvas, RGBD proxy rendering, depth alignment, object URLs, Blob/File handles, or local media preview.

## Proposed design

Keep the active ownership model:

- `src/routes`: SvelteKit page/API routing only.
- `src/ui` and `src/stages`: render state, collect user intent, mount browser surfaces, call product commands.
- `src/artifacts`: browser workbench state and derived artifact/stage state.
- `src/app`: product command boundary for mutations with invariants.
- `src/scene`, `src/graphics`, `src/media`, `src/sketch`: browser engine/media logic.
- `src/lib/shared`: JSON-safe contracts.
- `src/lib/server`: server-only paid effects, secrets, validation, jobs.

For this slice, extend the existing explicit `workbench-commands.ts` facade rather than adding a new framework:

- expose `changeViewerMode(mode)` for `viewerMode`;
- expose `changeSurfaceMode(mode)` or equivalent for `surfaceMode`, delegating to the store function;
- route `SourceMapMediaViewer` guide edits through `setDomeGuideSemanticSplit` and `setDomeGuideHorizonSplit`;
- keep direct bindings for ordinary visible form fields when there is no extra invariant.

Add `src/app/rgbd-lab-commands.ts` only for RGBD paid request/confirm/cancel:

- UI requests a paid action by id;
- command module sets `rgbdLab.pendingPaidAction`;
- confirm clears the pending action and calls the existing `rgbd-scene-commands.ts` function;
- cancel clears the pending action;
- no migration to first-class jobs.

## Alternatives considered

- Status quo: rejected because one current UI path bypasses projection guide invariants.
- SvelteKit nested stage routes: rejected because the workbench is browser-authored GPU/media state and route `load` is not needed for current page data.
- Generic command bus/workflow engine: rejected because the repo already has product-shaped operator/stage concepts and the needed fix is a small explicit command seam.
- Start with Phase 4 asset contracts: deferred. Valuable roadmap work, but it does not resolve the UI mutation ownership issue raised here.
- Start with RGBD job migration: deferred. That leaks into broader Phase 3/4 job and asset questions.

## Acceptance matrix

| Concern                      | Evidence required                                                                                 | Command/test                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Projection guide invariants  | Non-plate guide changes call app commands and refresh generated repair prompts                    | `npm test -- src/app/workbench-commands.test.ts` passed                     |
| Manual prompt preservation   | Manually edited repair prompts remain unchanged when guide commands run                           | `npm test -- src/app/workbench-commands.test.ts` passed                     |
| UI ownership                 | Svelte components no longer directly mutate invariant-bearing projection guide state              | `rg` direct-write scan found remaining writes only in app/persistence/tests |
| View/surface command seam    | Workbench UI calls product commands for view/surface changes without visible behavior change      | `npm run typecheck`, `npm run build`, `npm run test:e2e` passed             |
| Projection command ownership | Projection selects do not two-way bind into `workbench.projectionProfile` before command handling | `rg` scan plus `npm test -- src/app/workbench-commands.test.ts` passed      |
| RGBD paid-action routing     | RGBD lab request/confirm/cancel lives in `src/app` and delegates to existing scene commands       | `npm test -- src/app/rgbd-lab-commands.test.ts` passed                      |
| No paid calls                | New tests mock/avoid paid execution and do not click confirm paths                                | Unit mocks plus existing Playwright smoke passed                            |
| Boundary safety              | No server/shared imports of browser runtime media modules                                         | `npm run typecheck`, `npm run build` passed                                 |
| Regression                   | Existing command, persistence, paid/local operator tests continue passing                         | `npm test` passed                                                           |

## Implementation sequence

1. Baseline current state and tests.
2. Add/adjust app commands for view/surface and projection guide mutations.
3. Update `ArtifactWorkbench.svelte` and `SourceMapMediaViewer.svelte` to call app commands where appropriate.
4. Add focused tests for command-routed guide updates and manually edited prompt preservation.
5. Re-run targeted tests and inspect direct mutation paths.
6. Decide whether RGBD paid-action command extraction is still in this slice or should be the next slice.
7. Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
8. Run independent boundary/final review agents and fix material findings.

## Risks and recovery

- Risk: moving guide mutation changes prompt refresh timing. Recovery: keep the existing command helpers and assert exact generated prompt behavior.
- Risk: moving simple view state into commands creates needless indirection. Recovery: keep commands thin and product-shaped; do not introduce new abstractions.
- Risk: RGBD cleanup grows into job/storage work. Recovery: defer RGBD jobs/assets and only move request/confirm/cancel routing if included.
- Risk: pre-existing dirty files obscure this slice. Recovery: isolate file changes in this plan and do not revert unrelated user work.

## Progress log

- [x] Recorded baseline commit.
- [x] Recorded pre-existing dirty tree.
- [x] Read roadmap-slice instructions and architecture/verification references.
- [x] Ran baseline `npm test -- src/app/workbench-commands.test.ts` successfully.
- [x] Reconciled read-only agent findings into final implementation scope.
- [x] Implemented command seam.
- [x] Ran targeted verification.
- [x] Ran repository verification.
- [x] Ran independent final review.

## Decisions and discoveries

- The correct architecture is "Svelte outlet + product commands + browser engine," not nested SvelteKit routes or a generic workflow framework.
- Direct Svelte conditionals for the current workbench shell are acceptable; invariant-bearing mutations are the problem.
- The first high-value fix should be projection guide mutation ownership because it has current behavioral consequences.
- RGBD paid-action request/confirm/cancel was small enough to include once the guide/view command seam was green; RGBD jobs/assets remain deferred.
- Boundary auditor found projection profile selects still had `bind:value={workbench.projectionProfile}` and could mutate state before `changeProjectionProfile` read the previous profile. Fixed all three select call sites and added a regression test for `zenith-180 -> cave-270` carrier horizon defaulting.
- Final reviewer found stale docs for the RGBD command seam. Updated `docs/sveltekit-architecture.md` and `docs/ultimate-architecture-roadmap.md` to reflect `src/app/rgbd-lab-commands.ts`.

## Verification log

- `npm test -- src/app/workbench-commands.test.ts`: passed before implementation, 11 tests.
- `npm test -- src/app/workbench-commands.test.ts src/app/rgbd-lab-commands.test.ts`: passed after implementation, 17 tests.
- After reviewer fixes, `npm test -- src/app/workbench-commands.test.ts src/app/rgbd-lab-commands.test.ts`: passed, 18 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 60 files and 326 tests after reviewer fixes.
- `npm run build`: passed; existing large chunk and plugin timing warnings remain.
- `npm run test:e2e`: passed, 4 Playwright smoke tests. Existing Node `NO_COLOR`/`FORCE_COLOR` warning remains.
- `git diff --check`: passed.

## Final result

Completed. The slice keeps SvelteKit routes unchanged, moves invariant-bearing projection/view/RGBD paid-action mutations behind product-shaped `src/app` command surfaces, preserves the browser-owned rendering/media engine boundary, updates architecture docs to match the new RGBD command seam, and leaves durable jobs/assets/storage explicitly deferred.

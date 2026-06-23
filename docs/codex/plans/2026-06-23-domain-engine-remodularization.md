# Source Map Preview Session Ownership

Status: complete
Roadmap phase: Phase 2 continuation: thin UI and browser engine ownership
Baseline commit: 95245109357ceeb12c5fddf069d75892c5bf6965
Last updated: 2026-06-23 11:40 America/Santiago

## Goal

Make the source-map media preview easier to reason about by moving image/video loading, WebGPU renderer session lifecycle, stale async render handling, video frame-loop cleanup, and render option construction out of `SourceMapMediaViewer.svelte` into a concrete browser-only owner while preserving the current projection preview UI and behavior.

## Why this slice now

The projection-preview shader and uniform ABI ownership has already landed in `src/graphics/projection-preview-shaders.ts` and `src/graphics/projection-preview-uniforms.ts`. Fresh audit evidence shows the next clearest ownership ambiguity is `SourceMapMediaViewer.svelte`: it is both a Svelte view/control surface and the owner of media runtime handles, renderer initialization, bitmap lifetime, video frame callbacks, serial cancellation, status text, and projection render payloads.

This is a Phase 2 UI-thinning/browser-engine stabilization slice. It does not introduce assets, durable jobs, queues, workers, storage, server routes, shared contracts, or a generic engine framework.

## Current behavior and evidence

- Baseline status: `git status --short --branch` reported `## main...origin/main` with no short-status entries.
- Baseline HEAD: `95245109357ceeb12c5fddf069d75892c5bf6965`.
- Baseline shader check passed: `npm test -- src/graphics/shaders.test.ts src/geometry/projection-shader-parity.test.ts`.
- Prior completed plans show:
  - `docs/codex/plans/2026-06-23-plate-gpu-compositor-ownership.md` split the plate compositor runtime, type, shader, and uniform responsibilities.
  - `docs/codex/plans/2026-06-23-domain-engine-stabilization.md` split projection-preview shader/uniform ownership and removed `roomShaderCode`.
- `src/ui/SourceMapMediaViewer.svelte` currently owns:
  - `HTMLCanvasElement`, `HTMLVideoElement`, `ImageBitmap`, and `SourceMapPreviewRenderer` handles;
  - `ensureRenderer`, `renderMedia`, `renderSerial`, `loadedSourceKey`, bitmap close/replace, and renderer cleanup;
  - video play/pause/seek clock state, `requestVideoFrameCallback` fallback, and loop cancellation;
  - projection render option construction from workbench/view state;
  - Svelte markup, camera drag/wheel intent, guide breakpoint UI, and controls.
- `src/graphics/source-map-preview-renderer.ts` owns WebGPU device/context/textures/pipelines and already consumes the shared projection-preview shader/uniform owner.
- `src/ui/PlateSketchEditor.svelte` has similar but broader session ownership plus artifact commit mutation. It is a follow-up candidate, but source-map preview is tighter and has less artifact mutation.
- `src/scene/rgbd-scene-commands.ts` mixes RGBD state mutation, canvas handles, API payloads, downloads, and local endpoint service calls. Multiple read-only reviews flagged this as a later command-ownership slice, not part of this patch.
- `src/ui/CameraPathEditor.svelte`, `src/scene/camera-gizmo.ts`, and `src/geometry/camera-rig.ts` are dense but currently have clearer pure math/canvas rendering separation and focused tests.

## Invariants

- Preserve current source-map media preview behavior for images and videos.
- Preserve projection camera drag, wheel, nudge, guide breakpoint, cave mask, view mode, and status text semantics.
- Preserve stale image render cancellation and close late `ImageBitmap` objects.
- Preserve cleanup of video frame callbacks, animation frames, image bitmaps, and WebGPU renderer resources.
- Keep WebGPU, canvas, DOM, `ImageBitmap`, `HTMLVideoElement`, object URL, `Blob/File`, and local media handling browser-only.
- Keep `src/lib/shared` JSON-safe and side-effect free.
- Keep secrets, paid upstream calls, filesystem effects, SDK clients, and server trust boundaries under `src/lib/server` or routes.
- Do not call paid Runway, Codex, OpenAI, Gemini, Runway, or model APIs.
- Do not add dependencies, `src/engine`, a renderer framework, workflow framework, database, queue, worker, sidecar server, auth, durable asset store, collaboration model, or deployment infrastructure.
- Preserve unrelated user changes and avoid unrelated cleanup.

## Scope

### In scope

- Add a concrete browser-only source-map preview session module.
- Move media image loading, bitmap lifecycle, render serial guarding, renderer creation/destruction, render option construction, video clock extraction, and video frame-loop scheduling into that owner.
- Keep `SourceMapMediaViewer.svelte` responsible for Svelte state, markup, controls, camera input intent, guide breakpoint UI, and binding DOM handles into the session.
- Add focused unit tests for pure/session-testable behavior where practical, especially render option construction and video frame-loop lifecycle with fakes.
- Run targeted graphics/boundary tests, typecheck, lint, unit tests, build, e2e, production smoke, diff check, and prettier on touched files.
- Commit and push the coherent verified slice.

### Explicit non-goals

- No shader math, WGSL, projection formula, guide semantics, or render-order changes.
- No `PlateSketchEditor.svelte` extraction in this commit unless the source-map session requires a shared helper that is already clearly duplicated.
- No RGBD command split in this commit.
- No camera path/editor command extraction in this commit.
- No WebGPU lifecycle framework or generic renderer/session base class.
- No shared contract, server route, job, asset, persistence, API, or deployment changes.
- No live paid API calls.

## Proposed design

Add `src/graphics/source-map-preview-session.ts` as a browser-owned runtime session module. It will own the imperative runtime lifecycle currently embedded in the Svelte component:

- lazy creation of `SourceMapPreviewRenderer` for a mounted canvas;
- render requests for image/video source inputs;
- stale render serial checks and late-bitmap closing;
- replacement/cleanup of the current `ImageBitmap`;
- video clock reads and frame-loop start/stop across `requestVideoFrameCallback` and `requestAnimationFrame`;
- `destroy()` cleanup for renderer, image bitmap, and pending video callbacks;
- status/image-size/video-clock results returned to the component rather than direct Svelte mutation.

Keep `SourceMapMediaViewer.svelte` as the owner of reactive UI state. It will call the session with explicit inputs derived from `workbench`, component props, view mode, camera, masks, and canvas size, then apply returned UI state. The component keeps camera drag/wheel intent and guide breakpoint controls because those are direct UI interactions.

The session stays in `src/graphics` because it is browser rendering/media runtime code, not a JSON-safe shared contract. It must not import `src/lib/server`, routes, secrets, or shared persistence contracts.

## Alternatives considered

- Status quo: avoids code motion, but leaves a large Svelte component as the owner of media runtime handles, rendering lifecycle, and UI controls.
- Extract `PlateSketchEditor` first: high value, but it also owns artifact mutation and plate drag semantics, making it a larger first step after the shader/uniform work.
- Split RGBD commands first: high value, but it should be its own command/effect-boundary slice with tests around paid-service mocks and manifest portability.
- Create a generic preview session or renderer framework: rejected because current evidence supports one concrete source-map media session, not a framework.
- Move helpers into `src/lib/shared`: rejected because the session owns browser runtime handles and typed media/WebGPU effects.

## Acceptance matrix

| Concern                   | Evidence required                                                                                                       | Command/test                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Source-map image behavior | Image render requests still load a bitmap, ignore stale late loads, close replaced/late bitmaps, and update status/size | Focused source-map preview session tests                                                                                                  |
| Source-map video behavior | Video readiness gates rendering, clock state is extracted, play/pause/unmount cancels frame callbacks                   | Focused source-map preview session tests                                                                                                  |
| Projection behavior       | Existing shader/uniform/parity tests remain green                                                                       | `npm test -- src/graphics/projection-preview-uniforms.test.ts src/graphics/shaders.test.ts src/geometry/projection-shader-parity.test.ts` |
| Browser boundary          | New session stays browser-owned and does not leak into shared/server/routes                                             | `npm test -- src/architecture/import-boundaries.test.ts`, `npm run typecheck`                                                             |
| UI behavior               | Svelte component still hydrates and handles controls after session extraction                                           | `npm run typecheck`, `npm run test:e2e`                                                                                                   |
| Regression                | Full test, lint, build, production smoke, diff, and formatting checks pass                                              | `npm run lint`, `npm test`, `npm run build`, `npm run smoke:prod:built`, `git diff --check`, prettier check                               |

## Implementation sequence

1. Extract `source-map-preview-session.ts` and focused tests for source render state and video frame-loop lifecycle.
2. Update `SourceMapMediaViewer.svelte` to use the session while preserving UI state and input handling.
3. Run targeted source-map/projection/boundary tests.
4. Run typecheck, lint, full unit tests, build, e2e, production smoke, diff check, and prettier check.
5. Spawn read-only final boundary and diff reviewers, fix material findings, rerun affected checks, and record outcomes.
6. Commit and push the verified slice.

## Risks and recovery

- Risk: media render ordering changes because reactive Svelte state updates now pass through a session result. Detection: focused tests plus typecheck/e2e. Recovery: narrow the session to only renderer/bitmap cleanup and return status to the component.
- Risk: video frame callbacks leak or duplicate. Detection: fake-loop tests and final review. Recovery: keep loop ownership in the component if the extraction is not clean.
- Risk: browser runtime types drift into shared/server code. Detection: import-boundary tests and final boundary audit. Recovery: keep the session under `src/graphics` and add no shared imports.
- Risk: editor behavior changes around projection profile camera reset or disabled view fallback. Detection: typecheck/e2e and focused review. Recovery: leave camera state ownership in the component.

Rollback is straightforward: revert the source-map session commit, restoring component-local lifecycle without changing data formats or external APIs.

## Progress log

- [x] Baseline status and HEAD recorded.
- [x] Required docs, skill references, package scripts, prior plans, and hotspot files inspected.
- [x] Baseline projection shader/parity tests passed.
- [x] Read-only repo mapping, roadmap review, test strategy, simplification, and boundary audit completed.
- [x] Source-map preview session extracted.
- [x] Targeted verification complete.
- [x] Full verification complete.
- [x] Final read-only review complete.
- [x] Commit and push complete.

## Decisions and discoveries

- Current HEAD already contains the projection-preview shader/uniform ownership split and removed `roomShaderCode`; repeating that work would be churn.
- Source-map preview is the smallest coherent next slice because it has self-contained media/render lifecycle logic and less artifact mutation than Plate Sketch.
- RGBD command ownership and portable manifest risks are real but deferred to a separate slice with paid-service mocks and manifest portability tests.
- Camera path/gizmo math is dense but already mostly separated into pure model, canvas renderer, and Svelte UI state.
- Prettier in this repo cannot infer a parser for `.svelte` files. `SourceMapMediaViewer.svelte` is covered by `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:e2e`; Prettier check was run on the touched Markdown and TypeScript files.
- Final reviewer found a stale `renderMedia(...)` call in `SourceMapMediaViewer.svelte` after extraction and a late async renderer creation leak in `source-map-preview-session.ts`. Both were fixed, and a late-renderer teardown regression test was added.
- The requested final boundary auditor could not complete because the account hit a usage limit. The parent session performed a direct final boundary review and the final reviewer completed successfully.

## Final result

Delivered:

- Added `src/graphics/source-map-preview-session.ts` as the browser-owned source-map media/projection session.
- Moved lazy renderer creation, image fetch/bitmap replacement, stale async render cancellation, video frame-loop scheduling/cancellation, video clock extraction, render option construction, and deterministic cleanup out of `SourceMapMediaViewer.svelte`.
- Kept `SourceMapMediaViewer.svelte` responsible for Svelte state, markup, media/video element binding, camera drag/wheel intent, controls, and guide breakpoint editing.
- Added `src/graphics/source-map-preview-session.test.ts` for stale bitmap cleanup, unsupported-media cleanup, requestVideoFrameCallback loop cancellation, and ready-video render/clock output.

Verification completed:

- `npm test -- src/graphics/shaders.test.ts src/geometry/projection-shader-parity.test.ts` passed at baseline.
- `npm test -- src/graphics/source-map-preview-session.test.ts src/graphics/projection-preview-uniforms.test.ts src/graphics/shaders.test.ts src/geometry/projection-shader-parity.test.ts src/architecture/import-boundaries.test.ts` passed with 5 files and 19 tests after reviewer fixes.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test` passed with 52 files and 285 tests.
- `npm run build` passed with existing Vite large-client-chunk and plugin-timing warnings.
- `npm run test:e2e` passed with 4 Playwright tests.
- `npm run smoke:prod:built` passed.
- `git diff --check` passed.
- `npx prettier --check docs/codex/plans/2026-06-23-domain-engine-remodularization.md src/graphics/source-map-preview-session.ts src/graphics/source-map-preview-session.test.ts` passed.

Deferred:

- `PlateSketchEditor.svelte` still owns plate image loading, editor state, projection overlay drawing, commit payload/result mutation, and renderer session scheduling. It should be a separate slice because artifact mutation makes it broader than the source-map session.
- RGBD scene command ownership and portable manifest risks remain real but are deferred to a separate paid-effect/canvas-runtime command split with direct tests and mocks.
- Camera path/editor command extraction remains deferred because the current pure camera/gizmo math and canvas renderer boundaries are already clearer than the source-map preview session was.

# Plate Sketch Editor Session Ownership

Status: complete
Roadmap phase: Phase 2 continuation: thin UI and browser engine ownership
Baseline commit: 4f9c2dbc432d0d2944cfa00c6896e453f732a865
Last updated: 2026-06-23 12:05 America/Santiago

## Goal

Make the remaining Plate Sketch editor runtime and commit path easier to reason about by moving browser-side source loading, default arrangement, render-session scheduling, render option construction, and artifact commit payload shaping out of `src/ui/PlateSketchEditor.svelte` into concrete product-shaped modules while preserving current editor behavior.

## Why this slice now

The current repository already contains the earlier projection-preview shader/uniform split and the source-map preview session extraction. Fresh baseline evidence shows the next largest justified domain-engine entanglement is `src/ui/PlateSketchEditor.svelte`: it is a 1500-line component that still owns WebGPU renderer lifetime, image bitmap/canvas downscaling, default arrangement rules, render option construction, projected-view scheduling, plate drag mutation, overlay drawing, and artifact graph commit payloads.

This is still current-browser-workbench stabilization. It does not introduce durable assets, server jobs, queues, workers, databases, auth, collaboration, deployment infrastructure, or a generic engine framework.

## Current behavior and evidence

- Baseline status: `git status --short --branch` reported `## main...origin/main` with no short-status entries.
- Baseline HEAD: `4f9c2dbc432d0d2944cfa00c6896e453f732a865`.
- Baseline projection shader/uniform/parity check passed: `npm test -- src/graphics/projection-preview-uniforms.test.ts src/graphics/shaders.test.ts src/geometry/projection-shader-parity.test.ts`.
- `src/graphics/projection-preview-shaders.ts` now owns `domeShaderCode`, `flatShaderCode`, and `caveShaderCode`; static search found no active `roomShaderCode`.
- `src/graphics/projection-preview-uniforms.ts` owns the 48-float/192-byte projection-preview uniform ABI and is imported by both `src/graphics/source-map-preview-renderer.ts` and `src/plates/plate-sketch-gpu-renderer.ts`.
- `src/graphics/source-map-preview-session.ts` already owns the source-map media preview image/video render lifecycle.
- `src/ui/PlateSketchEditor.svelte` currently owns:
  - `HTMLCanvasElement`, source plate canvases, and `PlateSketchGpuRenderer` handles;
  - default plate fetch/load/downscale logic;
  - default arrangement and active plate selection rules;
  - render session creation, requestAnimationFrame scheduling, render option construction, preview status strings, and renderer cleanup;
  - commit/download render payloads;
  - artifact result/media/config construction for `commit-plates`;
  - direct UI state, controls, pointer/camera/guide intent, overlay drawing, and plate drag mutation.
- `src/plates/plate-sketch-gpu-renderer.ts` is a browser-only WebGPU renderer that consumes the shared projection-preview shader/uniform owner and owns GPU resources.
- `src/plates/plate-drag-math.ts`, `src/plates/plate-placement.ts`, and `src/plates/plate-editor-projection-adapter.ts` already hold substantial pure math and projection adapter logic, so this slice should not rewrite their formulas for churn.

## Invariants

- Preserve current Plate Sketch UX, default references, default arrangement behavior, projected preview modes, guide behavior, overlay drawing, commit media, artifact summary/config shape, and PNG download behavior.
- Keep WebGPU, canvas, DOM, `Blob/File`, object URLs, image bitmaps, and local media handling in browser-owned modules.
- Keep `src/lib/shared` JSON-safe and side-effect free; do not move runtime handles there.
- Keep server secrets, paid upstream calls, filesystem effects, SDK clients, and server trust boundaries under `src/lib/server` or route handlers.
- Do not call paid Runway, Codex, OpenAI, Gemini, Runway, or model APIs.
- Do not add dependencies, `src/engine`, a generic renderer framework, workflow framework, database, durable queue, worker, sidecar server, auth, durable asset store, collaboration model, or deployment infrastructure.
- Preserve unrelated user changes and avoid unrelated cleanup.

## Scope

### In scope

- Add a concrete browser-only Plate Sketch source/session module under `src/plates`.
- Move plate image loading/downscaling and default reference loading helpers out of the Svelte component.
- Move default arrangement and serialized placement/warped-corner commit metadata helpers into testable plate-domain modules.
- Move WebGPU renderer creation, preview scheduling, render option construction, commit/download render-to-canvas calls, and deterministic cleanup into a Plate Sketch preview session.
- Move artifact commit payload/result construction into a focused browser app/domain helper that returns plain mutation payloads for the existing artifact store calls.
- Keep `PlateSketchEditor.svelte` responsible for reactive state, markup, controls, pointer/camera/guide intent, canvas mounting, overlay drawing, and applying artifact mutations through the existing store APIs.
- Add focused tests for arrangement/commit metadata and render-session lifecycle behavior where practical with fakes.
- Run targeted graphics/plate/boundary tests and the required repository checks.

### Explicit non-goals

- No shader math, WGSL, projection formula, plate drag math, guide semantic, overlay visual, or render-order changes.
- No rewrite of `src/plates/plate-sketch-gpu-renderer.ts` unless a small helper is needed for the session boundary.
- No RGBD command split in this commit.
- No camera path/editor extraction in this commit.
- No source-map media viewer changes except if type compatibility requires it.
- No shared contract, server route, job, asset, persistence, API, or deployment changes.
- No live paid API calls.

## Proposed design

Add product-shaped browser modules instead of a generic engine layer:

- `src/plates/plate-sketch-sources.ts` owns `PlateSketchImage`, `loadPlateSource`, `loadDefaultPlateSources`, and `loadPlateFiles`. It stays browser-only because it uses `Blob`, `File`, `createImageBitmap`, canvas, and `fetch` for local default references.
- `src/plates/plate-sketch-arrangement.ts` owns default placement selection, `autoArrangePlateSketch`, placement serialization, and warped-corner counting. It is pure TypeScript over plate-domain inputs and is directly testable.
- `src/plates/plate-sketch-commit.ts` owns the plain artifact update/result payload construction for a committed Plate Sketch. It does not mutate the store and does not render.
- `src/plates/plate-sketch-preview-session.ts` owns lazy `PlateSketchGpuRenderer` creation, requestAnimationFrame preview scheduling, render option construction from explicit inputs, commit/download canvas rendering, and `destroy()`. It stays browser-only and concrete to Plate Sketch.

`PlateSketchEditor.svelte` will keep Svelte state and direct pointer/overlay UI behavior. It will call the session with explicit input snapshots and then apply returned status strings or canvases. Store mutations stay in the component for now through existing artifact-store functions, but payload construction moves to the commit helper.

## Alternatives considered

- Status quo: avoids risk but leaves the largest remaining domain-heavy UI component as the owner of runtime rendering, source loading, and artifact payload construction.
- Extract all pointer/overlay drag handling now: high potential value, but it is more coupled to canvas hit testing and visual overlay behavior; the first safer slice is runtime/source/commit ownership.
- Create a generic GPU preview session: rejected because the evidence supports a concrete Plate Sketch session, not a cross-renderer framework.
- Move commit payload types to `src/lib/shared`: rejected because this is current browser artifact-store shape, not a versioned persistence/API contract.

## Acceptance matrix

| Concern                     | Evidence required                                                                                                                                      | Command/test                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Source loading              | Plate source helper downscales images and reports no-image selections without the component owning the logic                                           | Targeted plate-source/arrangement tests where browser fakes are practical; typecheck                                                      |
| Arrangement/commit metadata | Default placements, active index, serialized placement rounding, warped-corner counts, summaries, config/media/result payloads match existing behavior | `npm test -- src/plates/plate-sketch-arrangement.test.ts src/plates/plate-sketch-commit.test.ts`                                          |
| Preview behavior            | Preview session builds the same render options, schedules at most one frame, renders commit/download canvases, and destroys renderer on cleanup        | `npm test -- src/plates/plate-sketch-preview-session.test.ts`                                                                             |
| Projection behavior         | Existing shader/uniform/parity tests remain green                                                                                                      | `npm test -- src/graphics/projection-preview-uniforms.test.ts src/graphics/shaders.test.ts src/geometry/projection-shader-parity.test.ts` |
| Existing GPU renderer       | Plate compositor/depth renderer tests remain green                                                                                                     | `npm test -- src/sketch/depth-webgpu-renderer.test.ts src/plates/plate-gpu-compositor.test.ts`                                            |
| Browser boundary            | New modules stay browser-owned and do not leak browser runtime types into shared/server/routes                                                         | `npm test -- src/architecture/import-boundaries.test.ts`, `npm run typecheck`, `npm run build`                                            |
| UI regression               | Svelte component compiles, lints, hydrates in existing e2e smoke                                                                                       | `npm run typecheck`, `npm run lint`, `npm run test:e2e`                                                                                   |
| Production demo             | Built adapter smoke remains no-paid-call demonstrable                                                                                                  | `npm run build`, `npm run smoke:prod:built`                                                                                               |

## Implementation sequence

1. Wait for read-only repo mapping, roadmap, test, simplification, and boundary subagents; reconcile with repository evidence.
2. Extract pure arrangement/commit helpers and tests.
3. Extract browser-only plate source loading helpers.
4. Extract browser-only Plate Sketch preview session and tests with fake renderer/timer hooks.
5. Update `PlateSketchEditor.svelte` to use the new owners while preserving UI state, pointer behavior, overlay drawing, and artifact-store mutations.
6. Run targeted tests after each coherent step, then full checks.
7. Spawn read-only final boundary and diff reviewers, fix material findings, rerun affected checks, and record outcomes.
8. Commit and push the verified slice.

## Risks and recovery

- Risk: commit artifact payload shape drifts. Detection: focused commit helper tests and project/shared contract tests. Recovery: keep the helper as a pure copy of the old payload shape or inline it back into the component.
- Risk: preview scheduling changes status timing or renders stale options. Detection: preview-session fake tests, typecheck, e2e. Recovery: narrow the session to renderer lifecycle only.
- Risk: image loading extraction mishandles default reference fetches or selected files. Detection: typecheck and direct review; avoid adding complex fetch abstractions. Recovery: keep default fetch orchestration in the component and only extract source decoding.
- Risk: browser runtime types leak into shared/server code. Detection: import-boundary tests and final boundary audit.
- Risk: large Svelte edit causes accidental UI markup/style churn. Detection: diff review, typecheck, lint, e2e. Recovery: keep markup and CSS unchanged.

Rollback is straightforward: revert the Plate Sketch session commit because no external API, persisted snapshot, shader math, or data format is intended to change.

## Progress log

- [x] Baseline status and HEAD recorded.
- [x] Required docs, skill references, package scripts, prior plans, and hotspot files inspected.
- [x] Baseline projection shader/uniform/parity tests passed.
- [x] Read-only repo mapping, roadmap review, test strategy, simplification, and boundary audit completed.
- [x] Arrangement and commit helpers extracted and tested.
- [x] Source loading helper extracted.
- [x] Preview session extracted and tested.
- [x] `PlateSketchEditor.svelte` updated.
- [x] Targeted verification complete.
- [x] Full verification complete.
- [x] Final read-only review complete.
- [x] Commit and push complete.

## Decisions and discoveries

- Current HEAD already contains the projection-preview shader/uniform ownership split, `roomShaderCode` removal, and source-map preview session extraction.
- The next active implementation target is Plate Sketch ownership, not repeating prior shader/source-map work.
- Read-only reviewers agreed this remains Phase 2 browser-engine/UI-thinning work and warned against generic engine, asset, durable job, or RGBD expansion inside this slice.
- `PlateSketchEditor.svelte` still owns pointer hit testing, camera/guide intent, overlay drawing, and store mutation application. The extracted modules own source loading, default arrangement/serialization, preview scheduling/render options, handoff rendering, and commit payload construction.
- Repo mapping found one remaining small coupling after the Plate Sketch extraction: source-map preview and plate sketch preview independently assembled the same projection-preview uniform ABI. A second focused commit moved that option-to-uniform assembly into `src/graphics/projection-preview-render-uniforms.ts`.
- Verification passed before the first commit:
  - `npm test -- src/plates/plate-sketch-arrangement.test.ts src/plates/plate-sketch-commit.test.ts src/plates/plate-sketch-preview-session.test.ts src/graphics/projection-preview-uniforms.test.ts src/graphics/shaders.test.ts src/geometry/projection-shader-parity.test.ts src/sketch/depth-webgpu-renderer.test.ts src/plates/plate-gpu-compositor.test.ts src/architecture/import-boundaries.test.ts`
  - `npm run typecheck`
  - `npm run lint`
  - `git diff --check`
  - `npx prettier --check docs/codex/plans/2026-06-23-domain-engine-remodularization.md src/plates/plate-sketch-arrangement.ts src/plates/plate-sketch-arrangement.test.ts src/plates/plate-sketch-commit.ts src/plates/plate-sketch-commit.test.ts src/plates/plate-sketch-preview-session.ts src/plates/plate-sketch-preview-session.test.ts src/plates/plate-sketch-sources.ts`
- Verification passed before the second commit:
  - `npm test -- src/graphics/projection-preview-render-uniforms.test.ts src/graphics/projection-preview-uniforms.test.ts src/graphics/shaders.test.ts src/geometry/projection-shader-parity.test.ts src/plates/plate-sketch-preview-session.test.ts src/plates/plate-gpu-compositor.test.ts src/architecture/import-boundaries.test.ts`
  - `npm run typecheck`
  - `npm run lint`
- Final reviewer found a lifecycle bug where `renderHandoffCanvas` could call `renderToCanvas` on a renderer that resolved after session teardown. Commit `572d7a4` fixed this and added a regression test.
- Final boundary audit found no material boundary issues. It confirmed that browser runtime APIs remain under `src/plates`/`src/graphics`, no server/routes/shared files changed, and runtime media fields in `plate-sketch-commit.ts` are explicitly null in portable artifact media.
- Final full verification passed after reviewer fixes:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test` passed with 56 files and 297 tests.
  - `npm run build` passed with existing Vite large-client-chunk and plugin-timing warnings.
  - `npm run test:e2e` passed with 4 Playwright tests.
  - `npm run smoke:prod:built` passed.
  - `git diff --check`
  - `npx prettier --check docs/codex/plans/2026-06-23-domain-engine-remodularization.md src/plates/plate-sketch-arrangement.ts src/plates/plate-sketch-arrangement.test.ts src/plates/plate-sketch-commit.ts src/plates/plate-sketch-commit.test.ts src/plates/plate-sketch-preview-session.ts src/plates/plate-sketch-preview-session.test.ts src/plates/plate-sketch-sources.ts src/graphics/projection-preview-render-uniforms.ts src/graphics/projection-preview-render-uniforms.test.ts src/graphics/source-map-preview-renderer.ts src/plates/plate-sketch-gpu-renderer.ts`
- Commits pushed on `codex/plate-sketch-session-ownership`:
  - `80cd66e refactor: isolate plate sketch preview session`
  - `28829b9 refactor: centralize projection preview uniform assembly`
  - `572d7a4 fix: guard plate sketch handoff after teardown`

## Final result

Delivered:

- Added `src/plates/plate-sketch-sources.ts` as the browser-owned plate source loader/downscaler for default references and selected image files.
- Added `src/plates/plate-sketch-arrangement.ts` for default placement selection, active default index, placement serialization, and warped-corner counting.
- Added `src/plates/plate-sketch-commit.ts` for browser artifact-store payload construction without mutating the store or rendering.
- Added `src/plates/plate-sketch-preview-session.ts` for lazy `PlateSketchGpuRenderer` creation, preview frame scheduling, render option construction, handoff canvas rendering, and deterministic teardown.
- Updated `src/ui/PlateSketchEditor.svelte` to keep UI state, markup, controls, pointer/camera/guide intent, overlay drawing, and artifact-store mutation application while delegating source/session/commit ownership.
- Added `src/graphics/projection-preview-render-uniforms.ts` so source-map preview and plate sketch preview assemble the projection-preview uniform ABI through one owner.
- Added focused tests for arrangement/commit metadata, preview session lifecycle, late teardown handoff guarding, and projection render uniform assembly.

Deferred:

- Pointer hit testing, drag mutation, and overlay drawing remain in `PlateSketchEditor.svelte` because they are tightly coupled to direct canvas UI interaction and were not necessary for this verified ownership slice.
- RGBD scene command ownership and object URL manifest portability remain deferred to a separate browser-command/effect slice.
- Depth renderer explicit cleanup remains a potential separate narrow slice; it was not mixed into this Plate Sketch/projection-preview work.

---

# Prior Completed Slice: Source Map Preview Session Ownership

# Projection Preview Shader Ownership

Status: complete
Roadmap phase: Phase 2 continuation: browser engine/editor ownership stabilization
Baseline commit: 40842f6161cceaf07f45545e8aaae3151fcffed2
Last updated: 2026-06-23 02:42 America/Santiago

## Goal

Make projection preview shader and uniform ownership explicit while preserving the current Source Map preview and Plate Sketch projected preview behavior.

## Why this slice now

The current browser engine has a narrow duplicated boundary: `src/graphics/source-map-preview-renderer.ts` and `src/plates/plate-sketch-gpu-renderer.ts` both consume the same dome/CAVE projection shader ABI and independently pack the same 48-float uniform buffer. That duplication is small enough to fix safely and high-value enough to reduce shader/layout drift before larger editor or renderer work.

The broader roadmap's generic next phase mentions asset contracts, but this task is explicitly about domain-heavy browser engine/editor stabilization. Current code evidence makes projection preview shader/uniform ownership the smaller and more relevant slice. No storage, asset, job, worker, queue, database, or deployment choice is introduced here.

## Current behavior and evidence

- Baseline repo state: `git status --short --branch` reported `## main...origin/main`; `git rev-parse HEAD` reported `40842f6161cceaf07f45545e8aaae3151fcffed2`.
- Baseline targeted check passed: `npm test -- src/graphics/shaders.test.ts src/geometry/projection-shader-parity.test.ts src/sketch/depth-webgpu-renderer.test.ts src/plates/plate-gpu-compositor.test.ts` with 4 files and 20 tests passing.
- `src/graphics/shaders.ts` previously exported `domeShaderCode`, `flatShaderCode`, `caveShaderCode`, and `roomShaderCode`.
- `src/graphics/source-map-preview-renderer.ts` imports `flatShaderCode`, `domeShaderCode`, and `caveShaderCode`; it creates WebGPU pipelines and packs a 48-float uniform array in `writeUniforms`.
- `src/plates/plate-sketch-gpu-renderer.ts` imports `domeShaderCode` and `caveShaderCode`; it renders plate composition through `PlateGpuCompositor`, then packs the same 48-float uniform array in `writeProjectionUniforms`.
- The uniform ABI is `192` bytes and carries: MVP matrix, fisheye scale, rotation/exposure/guide flags, shell shade, source carrier split/horizon, source center/theta, source axes, cave mask mode, and camera position.
- `src/graphics/shaders.test.ts` asserts shader string invariants. `src/geometry/projection-shader-parity.test.ts` asserts CPU/WGSL-equivalent projection math. `src/architecture/import-boundaries.test.ts` guards browser/server/shared import boundaries.
- `roomShaderCode` appeared to be residue: static search found the export but no active import under `src` or tests.

## Invariants

- Preserve current UI-visible source-map, dome orbit, dome POV, and CAVE Room projection preview behavior.
- Preserve shader math, projection formulas, guide line semantics, CAVE carrier behavior, and render ordering.
- Keep WebGPU, canvas, DOM, image/video elements, textures, buffers, and source media handling in browser-owned modules.
- Keep `src/lib/shared` JSON-safe and side-effect free; do not move typed GPU buffers or shader/runtime contracts there.
- Keep server secrets, filesystem effects, SDK clients, and paid upstream calls under `src/lib/server` or SvelteKit server routes.
- Do not call paid Runway, Codex, OpenAI, Gemini, or model APIs.
- Do not add `src/engine`, a renderer framework, workflow framework, durable asset system, queue, worker, sidecar server, database, auth, collaboration model, or dependency.
- Preserve unrelated user changes and avoid unrelated cleanup.

## Scope

### In scope

- Extract active projection preview WGSL ownership from the broad shader module into a concrete browser-owned graphics module.
- Delete the broad `src/graphics/shaders.ts` module instead of keeping a compatibility facade.
- Add a projection-preview uniform ABI module with named float offsets, float count, byte size, and a single packer used by source-map preview and plate sketch preview.
- Add focused tests for the uniform ABI and packer.
- Update targeted renderers to use the shared projection-preview uniform owner.
- Remove the unused `roomShaderCode` residue after static import evidence confirms it is not active.

### Explicit non-goals

- No shader math rewrite.
- No WebGPU lifecycle or resource helper extraction beyond replacing duplicated uniform packing.
- No PlateSketchEditor or SourceMapMediaViewer session/controller extraction.
- No RGBD scene command, camera editor, depth renderer, project persistence, route, server, job, asset, or shared-contract work.
- No generic shader registry, renderer abstraction, command bus, or workflow system.
- No durable storage, queues, workers, sidecar process, database, auth, collaboration, or deployment infrastructure.

## Proposed design

Add `src/graphics/projection-preview-shaders.ts` as the owner of active projection preview WGSL: `domeShaderCode`, `flatShaderCode`, and `caveShaderCode`. Delete the old broad `src/graphics/shaders.ts` module rather than keeping a facade.

Add `src/graphics/projection-preview-uniforms.ts` as the owner of the runtime shader ABI. It exports:

- `PROJECTION_PREVIEW_UNIFORM_FLOATS = 48`;
- `PROJECTION_PREVIEW_UNIFORM_BYTES = 192`;
- named offsets for the ABI slots;
- a `ProjectionPreviewUniformInput` type containing plain render inputs and the already-computed MVP matrix/profile data;
- `buildProjectionPreviewUniformArray(input)` returning a `Float32Array`.

The packer stays in `src/graphics` because it returns a typed array for WebGPU upload and is not a portable project contract. Renderers remain responsible for WebGPU device, context, texture, pipeline, geometry, source media, and canvas lifecycles. They compute view/projection/profile data in their existing contexts, call the shared packer, then write the returned typed array to their own uniform buffer.

Compatibility behavior is explicit at the renderer API level: public renderer APIs do not change. Reversal is straightforward because the extracted shader and uniform modules can be collapsed back into a broad shader module without changing user-facing behavior.

## Alternatives considered

- Status quo: avoids code motion but leaves two independent renderers responsible for keeping the same GPU ABI in sync.
- Move the uniform ABI to `src/lib/shared`: rejected because the packed `Float32Array` is a runtime WebGPU upload shape, not JSON-safe project data.
- Extract a generic renderer or shader registry: rejected because current evidence shows one concrete duplicated ABI, not a need for a renderer framework.
- Thin `PlateSketchEditor.svelte` or `SourceMapMediaViewer.svelte` first: deferred because the shader/uniform owner is a smaller dependency boundary used by both UI paths.

## Acceptance matrix

| Concern                        | Evidence required                                                                       | Command/test                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Shader behavior                | Existing dome/flat/CAVE shader text invariants still pass through the real shader owner | `npm test -- src/graphics/shaders.test.ts`                                                           |
| Projection math                | CPU/WGSL-equivalent projection formulas remain unchanged                                | `npm test -- src/geometry/projection-shader-parity.test.ts`                                          |
| Uniform ABI                    | Packer exposes 48 floats, 192 bytes, named offsets, and expected slot values            | `npm test -- src/graphics/projection-preview-uniforms.test.ts`                                       |
| Renderer parity                | Source-map preview and plate sketch preview write the same ABI through one packer       | Typecheck plus uniform packer tests                                                                  |
| Browser/server/shared boundary | New modules stay browser-owned and do not leak into server/shared contracts             | `npm test -- src/architecture/import-boundaries.test.ts`                                             |
| Regression                     | Existing depth renderer and plate compositor tests remain green                         | `npm test -- src/sketch/depth-webgpu-renderer.test.ts src/plates/plate-gpu-compositor.test.ts`       |
| Repository health              | TypeScript, lint, full unit suite, build, diff whitespace, and formatting pass          | `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `git diff --check`, prettier check |

## Implementation sequence

1. Extract active projection preview shader source to a focused module and delete `src/graphics/shaders.ts`.
2. Add projection-preview uniform constants, named offsets, and packer tests.
3. Replace duplicated inline uniform packing in `source-map-preview-renderer.ts` and `plate-sketch-gpu-renderer.ts`.
4. Run targeted shader/parity/uniform/boundary tests.
5. Run typecheck, lint, full unit suite, build, diff check, and prettier check on touched files.
6. Run read-only final boundary and diff reviews, fix material findings, and record outcomes.
7. Commit the verified slice and push.

## Risks and recovery

- Risk: mechanical shader move changes WGSL contents. Detection: shader string tests and final diff review. Recovery: restore shader source from baseline.
- Risk: one renderer computes slightly different inputs and the shared packer hides an intended distinction. Detection: packer input names and tests for square plate and rectangular source-map fixtures. Recovery: keep separate input builders while retaining one ABI packer.
- Risk: `roomShaderCode` removal breaks an undocumented public import. Detection: typecheck, full test suite, and static import search. Recovery: restore the deleted module from the prior commit if needed.
- Risk: typed-array helper is mistaken for shared contract. Detection: import-boundary tests and final boundary audit. Recovery: keep module under `src/graphics` only.

## Progress log

- [x] Baseline status and HEAD recorded.
- [x] Required docs, skill references, plan template, package scripts, and hotspots inspected.
- [x] Read-only subagents completed repo mapping, roadmap review, test strategy, simplification, and boundary audit.
- [x] Baseline targeted shader/parity/depth/compositor tests passed.
- [x] Projection shader ownership split implemented.
- [x] Uniform ABI owner and tests implemented.
- [x] Targeted verification complete.
- [x] Full verification complete.
- [x] Final read-only review complete.
- [ ] Commit and push complete.

## Decisions and discoveries

- Current evidence supports priority 1 over editor/controller extraction: the same projection uniform ABI is duplicated in two active renderers.
- `roomShaderCode` was unused by static search and was removed after the user clarified not to keep facades.
- The uniform packer stays in `src/graphics` because it produces runtime typed-array data for WebGPU, not JSON-safe shared project data.
- `npm run test:e2e` is not required unless this slice changes hydration or visible UI behavior; `npm run smoke:prod:built` is only needed if the final change materially affects production-demo bundling beyond the standard build.
- Final read-only reviewers found no material code issue. Both identified this plan receipt as stale before the final update; the receipt was updated before commit.
- Reviewer residual risk: there is no visual WebGPU preview QA or renderer-private write-path test. The new ABI packer tests plus shader/parity/import-boundary tests cover the high-value failure mode for this slice.

## Final result

Delivered:

- `src/graphics/projection-preview-shaders.ts` now owns the active dome, flat, and CAVE projection-preview WGSL.
- `src/graphics/shaders.ts` was deleted; active shader imports point directly to `src/graphics/projection-preview-shaders.ts`.
- `src/graphics/projection-preview-uniforms.ts` now owns the projection-preview uniform ABI with named offsets, `48` floats, `192` bytes, and a single `buildProjectionPreviewUniformArray` packer.
- `src/graphics/source-map-preview-renderer.ts` and `src/plates/plate-sketch-gpu-renderer.ts` now use the same projection-preview ABI owner while retaining their own WebGPU, canvas, texture, pipeline, geometry, and media lifecycles.
- `src/graphics/projection-preview-uniforms.test.ts` covers the ABI length, byte size, key offsets, guide flags, optional boolean slots, CAVE mask slot, and camera position slots.

Verification:

- Baseline before edits: `npm test -- src/graphics/shaders.test.ts src/geometry/projection-shader-parity.test.ts src/sketch/depth-webgpu-renderer.test.ts src/plates/plate-gpu-compositor.test.ts` passed with 4 files and 20 tests.
- Targeted after edits: `npm test -- src/graphics/projection-preview-uniforms.test.ts src/graphics/shaders.test.ts src/geometry/projection-shader-parity.test.ts src/sketch/depth-webgpu-renderer.test.ts src/plates/plate-gpu-compositor.test.ts src/architecture/import-boundaries.test.ts` passed with 6 files and 25 tests.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test` passed with 51 files and 281 tests.
- `npm run build` passed with existing Vite large-chunk and plugin-timing warnings.
- `git diff --check` passed.
- `npx prettier --check docs/codex/plans/2026-06-23-domain-engine-stabilization.md src/graphics/projection-preview-shaders.ts src/graphics/projection-preview-uniforms.ts src/graphics/projection-preview-uniforms.test.ts src/graphics/shaders.test.ts src/graphics/source-map-preview-renderer.ts src/plates/plate-sketch-gpu-renderer.ts` passed.
- `npm run smoke:prod:built` passed against the built adapter-node app.
- `npm run test:e2e` was not run because this slice did not change hydration, visible UI controls, route behavior, or user-flow logic.

Deferred:

- `roomShaderCode` has been removed in this follow-up because the user clarified that no facade should remain.
- Add renderer-private square/rectangular write-path tests if future changes touch projection-preview renderer internals.
- Thin `PlateSketchEditor.svelte` or `SourceMapMediaViewer.svelte` only after this shader/uniform boundary lands cleanly.
- Do not continue into another slice in this patch; the next highest-value safe slice is a renderer-private uniform fixture test or the first editor session/controller extraction, depending on whether test coverage or UI thinning is more valuable next.

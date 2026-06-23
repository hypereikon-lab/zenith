# Plate GPU Compositor Ownership Split

Status: complete
Roadmap phase: current architecture stabilization
Baseline commit: 495f923105624a7c0e218b8d2f2f4563267c3ac1
Last updated: 2026-06-23 02:21 America/Santiago

## Goal

Make the plate GPU compositor easier to understand and test by separating browser-only public types, WGSL shader ownership, uniform packing, and the runtime compositor class while preserving current rendering behavior and public imports.

## Why this slice now

`src/plates/plate-gpu-compositor.ts` is one of the largest production TypeScript files and mixes four responsibilities in one place: GPU resource orchestration, portable-ish render option typing, WGSL source generation, and uniform data packing. The file is domain-heavy rather than conceptually wrong, but its current shape makes future WebGPU work harder to review and easier to regress.

This is the first engine-heavy cleanup slice because it has a narrow public surface and existing shader behavior tests.

## Current behavior and evidence

- `src/plates/plate-gpu-compositor.ts` exports `PlateGpuCompositor`, `PlateRenderOptions`, `plateCompositeShader`, and `plateGuideShader`.
- `src/plates/plate-sketch-gpu-renderer.ts` creates and calls `PlateGpuCompositor`.
- `src/ui/PlateSketchEditor.svelte` imports `PlateRenderOptions` as a type.
- `src/plates/plate-gpu-compositor.test.ts` verifies important WGSL behavior by inspecting exported shader strings.
- The compositor is browser-only because it owns `HTMLCanvasElement`, `OffscreenCanvas`, `ImageBitmap`, `GPUDevice`, `GPUTexture`, and `GPUCanvasContext` handles.

## Invariants

- Preserve current public imports from `src/plates/plate-gpu-compositor.ts`.
- Keep all WebGPU, canvas, and bitmap handles in browser-owned `src/plates` modules.
- Do not move browser runtime handles into `src/lib/shared`.
- Do not change shader math, guide colors, projection semantics, or render order.
- Do not add dependencies, storage, queues, workers, or deployment infrastructure.
- Do not call paid Runway, Codex, or model APIs.

## Scope

### In scope

- Extract compositor-related public types and constants into a focused browser-owned types module.
- Extract WGSL shader source and shader-only formatting helpers into a shader module.
- Extract uniform packing helpers into a pure TypeScript module that stays browser-owned.
- Keep `plate-gpu-compositor.ts` as the runtime class and compatibility facade.
- Run targeted compositor tests plus the relevant repository checks.

### Explicit non-goals

- Rewriting the WebGPU shader algorithms.
- Changing plate placement, source projection, or guide geometry semantics.
- Introducing a generic renderer framework or command bus.
- Splitting unrelated large files such as `src/graphics/shaders.ts` or `src/sketch/depth-webgpu-renderer.ts` in this commit.
- Adding durable asset storage, production deployment infrastructure, or observability.

## Proposed design

`plate-gpu-compositor.ts` remains the stable entry point for the rest of the app. Internally it imports:

- `plate-gpu-compositor-types.ts` for browser-owned option and cache types plus output/uniform constants.
- `plate-gpu-compositor-shaders.ts` for `plateCompositeShader` and `plateGuideShader`.
- `plate-gpu-compositor-uniforms.ts` for placement and guide uniform packing.

The split keeps domain modules close to the compositor and avoids pretending the GPU API surface is portable. Compatibility re-exports avoid unnecessary churn in active UI and test imports.

## Alternatives considered

- Status quo: avoids code motion but leaves shader generation, uniform packing, types, and runtime GPU orchestration coupled in one 700+ line file.
- Full renderer framework: could split every WebGPU resource into factories, but would add abstraction before there is a second compositor needing it.
- Split only shaders: lower risk, but leaves type ownership and uniform packing mixed with runtime WebGPU state.

## Acceptance matrix

| Concern               | Evidence required                                                            | Command/test                                             |
| --------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| Shader behavior       | Existing shader assertions still pass through the compatibility facade       | `npm test -- src/plates/plate-gpu-compositor.test.ts`    |
| Browser boundary      | New modules stay under `src/plates` and do not import server/private modules | `npm test -- src/architecture/import-boundaries.test.ts` |
| Type compatibility    | Existing renderer and UI type imports still compile                          | `npm run typecheck`                                      |
| Repository regression | Standard unit and lint checks pass                                           | `npm run lint`, `npm test`                               |
| Bundling              | SvelteKit build still succeeds after module split                            | `npm run build`                                          |

## Implementation sequence

1. Extract types/constants, shaders, and uniform helpers while preserving the `plate-gpu-compositor.ts` facade.
2. Run targeted compositor and boundary tests.
3. Run typecheck, lint, full unit tests, and build.
4. Run a read-only final diff review and record any deferred follow-up.
5. Commit and push the completed slice.

## Risks and recovery

- Risk: mechanical extraction changes shader string contents. Detection: existing shader tests and diff review.
- Risk: imports accidentally make a browser module appear shared. Detection: architecture boundary tests.
- Risk: type-only compatibility breaks downstream imports. Detection: typecheck.
- Recovery: revert the split commit or collapse the extracted modules back into the facade because no external behavior or data format is intended to change.

## Progress log

- [x] Baseline status and HEAD recorded.
- [x] Current compositor exports, call sites, and tests identified.
- [x] Implementation complete.
- [x] Verification complete.
- [x] Commit and push complete.

## Decisions and discoveries

- Keep `plate-gpu-compositor.ts` as the public compatibility entry point for this slice.
- Keep extracted modules inside `src/plates` because their contracts include browser/GPU runtime handles or shader/runtime rendering semantics.
- `package.json` exposes `npm test`, not `npm run test:unit`; the acceptance matrix was updated to use the actual script.
- A mechanical comparison against `HEAD` confirmed the shader block, runtime class block, and uniform block were moved unchanged apart from intended export/constant renames.

## Final result

Delivered:

- `src/plates/plate-gpu-compositor.ts` is now the runtime compositor class plus compatibility facade.
- `src/plates/plate-gpu-compositor-types.ts` owns compositor option/cache/render types and GPU uniform constants.
- `src/plates/plate-gpu-compositor-shaders.ts` owns WGSL source and shader formatting helpers.
- `src/plates/plate-gpu-compositor-uniforms.ts` owns placement and guide uniform packing.

Verification:

- `npm test -- src/plates/plate-gpu-compositor.test.ts`
- `npm test -- src/architecture/import-boundaries.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `npm run smoke:prod:built`
- `git diff --check`
- `npx prettier --check docs/codex/plans/2026-06-23-plate-gpu-compositor-ownership.md src/plates/plate-gpu-compositor.ts src/plates/plate-gpu-compositor-types.ts src/plates/plate-gpu-compositor-shaders.ts src/plates/plate-gpu-compositor-uniforms.ts`

Deferred:

- Splitting WebGPU pipeline construction into a separate factory remains a possible follow-up, but this slice avoided adding abstraction before a second compositor needs it.
- Adding GPU readback tests remains deferred because the current test suite does not provide a deterministic WebGPU test device.

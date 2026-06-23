# Domain Engine Stabilization

Use this reference when a slice touches Zenith's domain-heavy browser engine, projection preview, media preview, or large editor components. The goal is to make the current fulldome cockpit more idiomatic and maintainable without introducing a generic engine layer ahead of the roadmap.

## Baseline

Current post-stabilization checkpoint:

- `9eb8bd7 refactor: split plate gpu compositor ownership`
- `docs/codex/plans/2026-06-23-plate-gpu-compositor-ownership.md`

Start every new slice from the actual current HEAD and working tree. Treat the checkpoint above as context, not as authority over newer code.

## Current Hotspots

Audit these files before choosing the next engine/editor slice:

- `src/graphics/shaders.ts`
- `src/graphics/shaders.test.ts`
- `src/geometry/projection-shader-parity.test.ts`
- `src/plates/plate-sketch-gpu-renderer.ts`
- `src/graphics/source-map-preview-renderer.ts`
- `src/sketch/depth-webgpu-renderer.ts`
- `src/sketch/depth-webgpu-renderer.test.ts`
- `src/ui/PlateSketchEditor.svelte`
- `src/ui/SourceMapMediaViewer.svelte`
- `src/ui/CameraPathEditor.svelte`
- `src/scene/camera-gizmo.ts`
- `src/geometry/camera-rig.ts`
- `src/scene/rgbd-scene-commands.ts`

## Highest-Value Sequence

Prefer this order unless current repository evidence contradicts it:

1. Split projection preview shader source and uniform packing out of the broad shader module while preserving shader math.
2. Confirm whether `roomShaderCode` is active. Remove it only if all imports and behavior prove it is dead.
3. Extract tiny GPU lifecycle/resource helpers only where duplicated ownership is already visible.
4. Thin `PlateSketchEditor.svelte` by moving projection-preview session logic into a browser-only owner.
5. Thin `SourceMapMediaViewer.svelte` by moving media/projection runtime state into a browser-only owner.
6. Narrow `src/scene/rgbd-scene-commands.ts` if command construction, validation, and artifact mutation remain entangled.
7. Defer broad `camera-rig.ts` rewrites unless a concrete bug or extraction point appears. It is domain-heavy, cohesive, and already has focused tests.

## Ownership Rules

For each slice, explicitly name the owner of:

- shader strings;
- uniform ABI and packing;
- GPU/WebGPU/WebCodecs/canvas lifecycle;
- Blob/File/object URL/runtime media handles;
- Svelte state and user intent collection;
- artifact graph mutation;
- portable project data.

Keep browser runtime handles in browser-only modules. Do not move GPU, DOM, canvas, object URL, or media lifecycle work into `src/lib/shared`, server routes, or server services.

Shared contracts must remain JSON-safe and side-effect free. Server-only paid effects, secrets, filesystem access, Runway clients, and Codex SDK use must stay under `src/lib/server` or SvelteKit server routes.

## Design Constraints

- Preserve artifact-first workflow and current UI behavior for architecture-only work.
- Prefer product-shaped modules over umbrella names like `src/engine`.
- Do not add a renderer framework, workflow framework, repository layer, durable asset store, worker system, queue, sidecar server, or collaboration model.
- Do not change shader math, projection formulas, color behavior, or render ordering unless the slice explicitly targets that behavior and adds before/after evidence.
- Prefer compatibility facades when many imports depend on an old module name and the facade is cheap.
- When moving shader or uniform code, compare the moved source mechanically against HEAD and keep parity tests close to the contract.

## Slice Checklist

Before editing:

- map current imports and execution paths with `rg`;
- separate pure math from runtime GPU/DOM lifecycle;
- identify tests that already cover parity and failure behavior;
- write the acceptance matrix in the plan;
- state which browser-only boundary is being clarified;
- state what large tempting cleanup is intentionally deferred.

During implementation:

- move one ownership boundary at a time;
- keep route and server behavior unchanged unless explicitly scoped;
- keep components focused on rendering state and collecting user intent;
- keep any new module names concrete, for example projection shader source, projection preview renderer, or plate preview session.

After implementation:

- run targeted tests for the touched graphics/media/editor path;
- run boundary tests when imports move across `src/lib/shared`, browser-only modules, or server code;
- run typecheck, lint, unit tests, and build unless the change is documentation-only.

## Verification Matrix

Use the smallest relevant subset while iterating:

```bash
npm test -- src/graphics/shaders.test.ts src/geometry/projection-shader-parity.test.ts
npm test -- src/sketch/depth-webgpu-renderer.test.ts src/plates/plate-gpu-compositor.test.ts
npm test -- src/architecture/import-boundaries.test.ts
npm run typecheck
npm run lint
npm test
npm run build
```

For meaningful user-flow, hydration, or production-demo changes, additionally run:

```bash
npm run test:e2e
npm run smoke:prod:built
```

If `npm run smoke:prod:built` requires a fresh build, run `npm run build` first. Do not invoke paid Runway or Codex/model APIs as part of verification.

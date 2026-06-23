# Remove legacy shell and orphaned capability modules

Status: complete
Roadmap phase: Phase 2 cleanup / not roadmap-expanding
Baseline commit: c052e71c11af5a4653540088311ebafe0ad216cb
Last updated: 2026-06-23 00:20 -04

## Goal

Remove the inactive legacy lane/pipeline/controller layer and orphaned capability modules so the repository contains only the current SvelteKit artifact workbench path plus actively referenced domain code. Then audit the remaining partially legacy modules and record what should stay, what should be narrowed later, and what remains risky.

## Why this slice now

The current SvelteKit architecture is mostly clean, but previous audit work found inactive pre-workbench code beside the active UI. Keeping two UI/controller architectures makes ownership harder to reason about, makes import-boundary reviews noisy, and creates false signals about whether Zenith is built idiomatically on SvelteKit/Svelte 5.

## Current behavior and evidence

- Current mounted UI path is `src/routes/+page.svelte` -> `src/App.svelte` -> `src/ui/ArtifactWorkbench.svelte`.
- Active browser workbench ownership lives in `src/artifacts/artifact-store.svelte.ts`, `src/app/workbench-commands.ts`, `src/app/project-persistence.ts`, `src/app/paid-operator-execution.ts`, `src/app/local-render-operators.ts`, and RGBD-specific scene/app modules.
- Legacy lane/pipeline files are not mounted by the active route tree:
  - `src/ui/ArtifactBoard.svelte`
  - `src/ui/LaneNav.svelte`
  - `src/ui/ArtifactStatusStrip.svelte`
  - `src/ui/lane-model.ts`
  - `src/app/pipeline-state.svelte.ts`
  - `src/app/pipeline-commands.ts`
  - `src/ui/dom.ts`
  - `src/ui/dom-actions.ts`
- Legacy imperative controller files are not reached from the active route tree:
  - `src/graphics/renderer.ts`
  - `src/app/view-controller.ts`
  - `src/media/media-controller.ts`
  - `src/inpaint/inpaint-controller.ts`
  - `src/plates/plate-controller.ts`
- Parked/orphaned capability files are not wired into the active UI:
  - `src/export/cave-exporter.ts`
  - `src/fulldome/qc.ts`
  - `src/sketch/depth-motion-presets.ts`
  - `src/media/zip.ts`
- Baseline active workbench tests passed before editing:
  - `npm test -- src/app/workbench-commands.test.ts src/app/project-persistence.test.ts src/app/local-render-operators.test.ts src/app/paid-operator-execution.test.ts src/app/rgbd-lab-commands.test.ts`
  - Result: 5 files, 41 tests passed.

## Invariants

- Preserve the active artifact workbench UI and current visible workflow.
- Keep WebGPU/WebCodecs/canvas/DOM/object URLs in browser-only code.
- Keep secrets, filesystem, Codex SDK, Runway clients, and paid calls server-only.
- Keep SvelteKit routes thin and no-paid-call tests free of upstream effects.
- Do not add storage, queue, worker, auth, collaboration, or a generic workflow framework.
- Do not remove files solely because they are test-only if they are still active domain utilities needed by current code.

## Scope

### In scope

- Delete the confirmed inactive legacy lane/pipeline UI files and associated tests that only protect that retired layer.
- Delete the confirmed inactive imperative controller files and tests that only protect that retired layer.
- Delete parked/orphaned capability modules and tests.
- Update imports/types where active code still referred to legacy types only.
- Update documentation that still lists removed modules as current project structure.
- Run a dependency/reference sweep after deletion.
- Audit remaining mixed modules:
  - `src/app/app-state.ts`
  - `src/app/default-profile.ts`
  - any other module that still contains old-state helpers after removal.

### Explicit non-goals

- Do not redesign the active workbench state model.
- Do not move the active workbench to route `load`.
- Do not split large active Svelte canvas components in this slice.
- Do not migrate additional paid paths to first-class jobs.
- Do not introduce asset storage or durable persistence.
- Do not remove historical/speculative docs that are already marked as non-current unless they refer to deleted code as current behavior.

## Proposed design

Remove code from the retired architecture rather than adapting it. The current workbench already has the active Svelte/SvelteKit ownership model: Svelte components call focused app commands; app commands call local SvelteKit endpoints; server effects stay under `src/lib/server`.

Where active code imports only old types, replace those type imports with local or current-module types. Where a module exists only to support deleted controllers or parked features, delete its tests with the module.

The audit of mixed modules will not edit unless required for compilation. It will produce evidence-backed classification in this plan and final receipt.

## Alternatives considered

- Status quo: rejected because it keeps a misleading inactive architecture beside the real UI.
- Mark files deprecated only: rejected because the user explicitly requested removal and the files appear unmounted or orphaned.
- Broaden into a full engine refactor: rejected because it would mix behavioral refactoring into a deletion cleanup.

## Acceptance matrix

| Concern | Evidence required | Command/test |
|---|---|---|
| Active workbench behavior | Active command/persistence/operator tests still pass | `npm test -- src/app/workbench-commands.test.ts src/app/project-persistence.test.ts src/app/local-render-operators.test.ts src/app/paid-operator-execution.test.ts src/app/rgbd-lab-commands.test.ts` |
| Removed code references | No source/test imports or route reachability remain for deleted modules | `rg` sweeps over deleted file basenames and key symbols |
| Type/bundle boundary | TypeScript and SvelteKit build pass after deletion | `npm run typecheck`, `npm run build` |
| Lint | No stale imports or dead references caught by lint | `npm run lint` |
| Unit regression | Full Vitest suite passes without removed tests | `npm test` |
| Browser/API smoke | SvelteKit workbench shell and no-paid API smoke still pass | `npm run test:e2e` |
| Mixed-module audit | Remaining partially legacy modules classified with evidence | final receipt and plan final result |

## Implementation sequence

1. Delete legacy lane/pipeline UI and tests.
2. Delete legacy imperative controller stack and tests; replace active type imports as needed.
3. Delete parked/orphaned capability modules and tests.
4. Run reference sweeps and targeted tests; fix compile/lint fallout.
5. Run typecheck, lint, full unit tests, e2e smoke, and build.
6. Audit remaining mixed modules and update this plan.

## Risks and recovery

- Risk: a supposedly orphaned helper is dynamically used. Detection: typecheck/build/reference sweeps and tests. Recovery: restore the specific helper or move its active part into an explicit current module.
- Risk: deleting tests lowers coverage of active pure helpers. Detection: map removed tests to deleted modules. Recovery: keep or move tests if the helper remains.
- Risk: docs drift after file deletion. Detection: README/docs `rg` sweeps. Recovery: update current docs only.

## Progress log

- [x] Baseline active workbench tests passed.
- [x] Plan created.
- [x] Legacy lane/pipeline files removed.
- [x] Legacy imperative controller files removed.
- [x] Orphaned capability files removed.
- [x] Reference fallout fixed.
- [x] Verification completed.
- [x] Mixed-module audit completed.

## Decisions and discoveries

- The skill reference files `architecture-boundaries.md` and `verification-matrix.md` were read from the roadmap-slice skill directory.
- The repository has `PLANS.md` at the root rather than under `docs/codex/plans/`.
- `src/graphics/view-camera.ts` was also deleted because it was only reachable from the retired renderer/controller path and would become a stale type consumer after removing `src/app/types.ts`.
- `src/fulldome/profile.ts` was deleted with `src/fulldome/qc.ts`; after removing QC, profile had no production import and only its own retired test.
- `tsconfig.engine.json` explicitly listed deleted `src/ui/pointer-geometry.ts`; the file list now contains only active engine math modules.
- `docs/ultimate-architecture-roadmap.md` no longer names `src/fulldome` as a current module family.
- Historical/speculative product memos that mention future fulldome profile/QC or CAVE export concepts were left in place because they are already marked as non-current architecture sources.

## Verification

- `npm test -- src/app/workbench-commands.test.ts src/app/project-persistence.test.ts src/app/local-render-operators.test.ts src/app/paid-operator-execution.test.ts src/app/rgbd-lab-commands.test.ts`: passed, 5 files / 41 tests.
- `npm run lint`: passed.
- `npm test`: passed, 44 files / 261 tests.
- `npm run typecheck`: passed after removing the deleted pointer geometry file from `tsconfig.engine.json`.
- `npm run build`: passed. Vite still reports the existing large client chunk warning.
- `npm run test:e2e`: passed, 4 Playwright tests.
- `rg` sweep for deleted basenames and key symbols over `src`, `tests`, README, docs, and `tsconfig*.json`: no remaining matches outside this plan.
- `git diff --check`: passed.
- Independent read-only subagent review was not run because subagent tooling in this session is gated to explicit user requests. Final review used local diff inspection, reference sweeps, and the full verification set above.

## Mixed / partially legacy audit

### `src/app/app-state.ts` (superseded by follow-up)

Status at this slice: active, narrowed.

Evidence:
- Active imports remain in `src/artifacts/artifact-store.svelte.ts`, `src/app/workbench-commands.ts`, `src/app/workbench-commands.test.ts`, and `src/app/app-state.test.ts`.
- The module now only owns projection-specific inpaint prompt generation and replacement detection.
- Removed legacy globals: `VIEW_LABELS`, duplicated depth/Seedance prompt defaults, `createInitialState`, old `ZenithState`/`ViewMode` imports, and default camera/profile imports.

Rationale:
- This is no longer a global app-state module in practice. It is a prompt helper module with a stale filename. Renaming it would be clearer, but was deferred to avoid mixing a source move into the deletion slice.
- Follow-up `docs/codex/plans/2026-06-23-narrow-mixed-owners.md` moved this functionality to `src/inpaint/inpaint-prompts.ts` and deleted `src/app/app-state.ts`.

### `src/app/default-profile.ts` (superseded by follow-up)

Status at this slice: active, narrowed but still coupled to an overbroad JSON config.

Evidence:
- Active import is only `src/ui/PlateSketchEditor.svelte`.
- Remaining exports are `DEFAULT_ACTIVE_PLATE_INDEX`, `DEFAULT_PLATE_PLACEMENTS`, and `DEFAULT_PLATE_REFERENCES`.
- Removed old DOM control/default exports: `DEFAULT_VIEW_MODE`, `DEFAULT_CAMERA`, `DEFAULT_CONTROL_VALUES`, and `applyDefaultControlValues`.

Rationale:
- The TypeScript module is no longer mixed. The underlying `docs/default-depth-motion-config.json` still contains historical viewer/inpaint/depth/CAVE/Seedance default sections, but active code reads only `plateSketch`.
- A later cleanup should either move the active plate defaults to a smaller current config or split the JSON into active defaults plus archived profile capture.
- Follow-up `docs/codex/plans/2026-06-23-narrow-mixed-owners.md` moved this functionality to `src/plates/default-plate-profile.ts` and deleted `src/app/default-profile.ts`.

### `src/geometry/camera-rig.ts`

Status: active compatibility shim.

Evidence:
- `normalizeCameraRigPose` still accepts legacy Euler/radian camera fields through `legacyEulerOrientation`.
- Active tests cover migration from legacy yaw/pitch/distance camera values.

Rationale:
- Keep for project/import compatibility. This is not an inactive UI layer and does not import DOM, server code, or deleted controllers.

### `src/plates/plate-placement.ts`

Status: active compatibility shim.

Evidence:
- `normalizePlatePlacement` still accepts old `width`/`height` placement values as fallback scale inputs.
- The module is actively used by the current plate editor/projection stack and tested.

Rationale:
- Keep for imported project/default placement tolerance. It is small, pure, and inside the active plate-domain boundary.

### `src/lib/shared/contracts/projects.ts`

Status: active import compatibility.

Evidence:
- `ProjectArtifactMediaV1Schema` accepts legacy `blob: null`, `file: null`, and `canvas: null` fields, then transforms them away.
- Tests explicitly cover stripping legacy null runtime media fields and rejecting runtime object URLs.

Rationale:
- Keep. This is a JSON-safe boundary sanitizer aligned with the architecture invariant that portable snapshots must not store runtime handles.

### `src/runway/client.ts` and `/api/runway/depth-map-stream`

Status: active legacy stream compatibility.

Evidence:
- The browser client still calls local SvelteKit streaming endpoints.
- `docs/sveltekit-architecture.md` documents the depth stream as an active compatibility endpoint backed by first-class jobs.

Rationale:
- Keep until paid job UI migration deliberately replaces the browser-facing stream contract. This is not part of the removed inactive Svelte UI/controller layer.

### Historical docs

Status: intentionally retained.

Evidence:
- `docs/interface-rework-capability-spec.md` and `docs/dino-bridge-flow-interface-second-pass.md` explicitly say they are historical/speculative product memos, not current architecture sources of truth.

Rationale:
- They still mention future profile/QC or CAVE export concepts, but no longer count as current implementation facts under the repository source-of-truth order.

## Final result

Complete. Removed the inactive lane/pipeline UI, retired imperative controller layer, legacy-only helpers, parked/orphaned capability modules, and tests that only protected those retired paths. Current SvelteKit route ownership remains `src/routes/+page.svelte` -> `src/App.svelte` -> `src/ui/ArtifactWorkbench.svelte`, with browser workbench state and commands still in the current artifact-first path. Remaining legacy-tolerant code is confined to active prompt/default helpers, import sanitizers, and compatibility shims documented above.

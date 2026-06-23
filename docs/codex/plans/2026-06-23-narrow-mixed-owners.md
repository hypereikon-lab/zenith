# Narrow mixed module owners

Status: complete
Roadmap phase: Phase 2 cleanup / not roadmap-expanding
Baseline commit: c052e71c11af5a4653540088311ebafe0ad216cb
Last updated: 2026-06-23 00:28 -04

## Goal

Resolve the remaining mixed-module ambiguity after legacy deletion by moving active functionality out of misleading app-level filenames and documenting which remaining legacy-tolerant behavior is real compatibility rather than dead code.

## Why this slice now

The legacy UI/controller layer has been removed, but two active helpers still look like remnants:

- `src/app/app-state.ts` is no longer app state; it only owns inpaint prompt text and replacement detection.
- `src/app/default-profile.ts` is no longer a broad default profile; it only reads default plate sketch placements/references.

Leaving those names behind would keep a false signal that the deleted architecture still has partial state/profile modules.

## Current behavior and evidence

- Current global workbench state is implemented in `src/artifacts/artifact-store.svelte.ts`, not `src/app/app-state.ts`.
- Active prompt code is imported by `src/artifacts/artifact-store.svelte.ts`, `src/app/workbench-commands.ts`, and tests.
- Active plate defaults are imported only by `src/ui/PlateSketchEditor.svelte`.
- Project import compatibility remains in `src/lib/shared/contracts/projects.ts`, where runtime-only null fields are stripped at the JSON-safe boundary.
- Camera/plate migration compatibility remains in active pure domain modules:
  - `src/geometry/camera-rig.ts`
  - `src/plates/plate-placement.ts`
- Browser paid stream compatibility remains current architecture in `src/runway/client.ts` and is documented in `docs/sveltekit-architecture.md`.
- Baseline targeted tests passed:
  - `npm test -- src/app/app-state.test.ts src/app/workbench-commands.test.ts src/app/project-persistence.test.ts src/plates/plate-placement.test.ts src/plates/plate-editor-view.test.ts src/runway/progress-stream.test.ts src/lib/shared/contracts/projects.test.ts`
  - Result: 7 files, 48 tests passed.

## Invariants

- Preserve active artifact workbench behavior.
- Keep browser-only runtime media, canvas, object URLs, WebGPU, and WebCodecs in browser modules.
- Keep paid effects and secrets under SvelteKit server routes/server modules.
- Keep shared contracts JSON-safe and side-effect free.
- Do not remove import compatibility that protects current project snapshots or active migration paths.
- Do not introduce durable storage, workers, queues, auth, or a generic workflow engine.

## Scope

### In scope

- Move inpaint prompt helpers from `src/app/app-state.ts` to a domain-owned inpaint module.
- Move default plate profile helpers from `src/app/default-profile.ts` to a plate-owned module.
- Update imports, tests, and current docs to match the narrower ownership.
- Record which mixed items are implemented elsewhere, which are compatibility shims, and which are deferred.

### Explicit non-goals

- Do not change prompt text or plate placement values.
- Do not remove snapshot import compatibility.
- Do not replace the active paid stream client with first-class job UI.
- Do not split the large active Svelte components in this slice.
- Do not restructure `docs/default-depth-motion-config.json` beyond import ownership unless required for tests.

## Proposed design

- `src/inpaint/inpaint-prompts.ts` owns projection-specific inpaint prompt generation and generated-prompt replacement detection.
- `src/plates/default-plate-profile.ts` owns current default plate references and placement defaults.
- The old app-level files are deleted so no false global state/profile owner remains.
- Existing compatibility shims stay in their active domains and are covered by existing tests.

## Alternatives considered

- Leave names as-is: rejected because the user specifically asked to work through the mixed leftovers and the names imply removed ownership.
- Inline prompt/default values into the components: rejected because workbench commands and tests need the prompt helpers, and component-local defaults would increase coupling.
- Remove all compatibility shims now: rejected because they protect active import and snapshot behavior, not inactive UI.

## Acceptance matrix

| Concern | Evidence required | Command/test |
|---|---|---|
| Prompt behavior | Prompt helper tests still pass after module move | targeted Vitest for inpaint prompts and workbench commands |
| Plate default behavior | Plate editor import resolves and typecheck/build pass | `npm run typecheck`, `npm run build` |
| Compatibility retained | Snapshot/camera/plate/progress compatibility tests still pass | targeted Vitest set |
| No stale mixed names | No imports of old `app-state` or `default-profile` modules remain | `rg` sweep |
| Regression | Relevant repo checks pass | `npm run lint`, `npm test` |

## Implementation sequence

1. Add domain-owned prompt and plate-default modules.
2. Update imports and delete old app-level mixed files/tests.
3. Update README/current docs if they refer to defaults as app-owned.
4. Run targeted tests, stale-reference sweeps, typecheck, lint, full tests, build.
5. Record final audit and verification.

## Risks and recovery

- Risk: Svelte import path or moved test path breaks Vitest discovery. Detection: targeted tests and typecheck. Recovery: restore file names or adjust imports.
- Risk: moving modules hides active semantics under too narrow a domain. Detection: import map and docs review. Recovery: rename to a clearer browser app module.
- Risk: compatibility shims are mistaken for dead code. Detection: tests and current architecture docs. Recovery: keep them documented as compatibility.

## Progress log

- [x] Baseline targeted tests passed.
- [x] Prompt helper ownership narrowed.
- [x] Plate default ownership narrowed.
- [x] Stale references removed.
- [x] Verification completed.
- [x] Final audit recorded.

## Decisions and discoveries

- Subagent spawning is not available for this slice unless the user explicitly asks for subagents, despite the repository working agreement recommending read-only subagents for architectural slices.
- Old global workbench state is implemented elsewhere: `src/artifacts/artifact-store.svelte.ts` owns the current Svelte 5 `$state` workbench, artifact graph records, selected stage/artifact, projection/view state, prompt drafts, motion config, QC items, jobs, errors, and runtime media handles.
- Old DOM-control defaults were not an active feature after legacy UI deletion. Current visible defaults are owned directly by the active workbench state, focused components, and domain modules.
- Projection-specific inpaint prompt functionality was not implemented elsewhere; it was active but mislocated. It now lives in `src/inpaint/inpaint-prompts.ts`.
- Default plate placement/reference functionality was not implemented elsewhere; it was active but mislocated. It now lives in `src/plates/default-plate-profile.ts`.
- Snapshot import tolerance, camera pose migration, and plate placement width/height fallback are active compatibility shims rather than dead code.
- The browser paid-stream client remains active SvelteKit endpoint compatibility. Depth has first-class in-memory job functionality underneath the compatibility stream; inpaint, Seedance, and Codex prompt planning have not yet been migrated to first-class browser job UI.
- Current docs now describe `src/app` as command/persistence/operator/view-state ownership, while prompt/default ownership lives in `src/inpaint` and `src/plates`.

## Verification

- Baseline targeted tests before edits: `npm test -- src/app/app-state.test.ts src/app/workbench-commands.test.ts src/app/project-persistence.test.ts src/plates/plate-placement.test.ts src/plates/plate-editor-view.test.ts src/runway/progress-stream.test.ts src/lib/shared/contracts/projects.test.ts`: passed, 7 files / 48 tests.
- Targeted tests after edits: `npm test -- src/inpaint/inpaint-prompts.test.ts src/app/workbench-commands.test.ts src/app/project-persistence.test.ts src/plates/plate-placement.test.ts src/plates/plate-editor-view.test.ts src/runway/progress-stream.test.ts src/lib/shared/contracts/projects.test.ts`: passed, 7 files / 48 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 44 files / 261 tests.
- `npm run build`: passed. Vite still reports the existing large client chunk warning.
- `npm run test:e2e`: passed, 4 Playwright tests.
- `rg` sweep for stale old mixed names (`app-state`, `default-profile`, `DEFAULT_VIEW_MODE`, `DEFAULT_CAMERA`, `DEFAULT_CONTROL_VALUES`, `createInitialState`, `VIEW_LABELS`, `ZenithState`, `PipelineReadouts`) over `src`, `tests`, README, docs, and `tsconfig*.json`: no remaining matches outside plan files.
- `git diff --check`: passed.

## Final result

Complete. Active prompt and plate-default functionality no longer lives in mixed app-level files. `src/app/app-state.ts`, `src/app/app-state.test.ts`, and `src/app/default-profile.ts` were deleted. Inpaint prompt behavior moved to `src/inpaint/inpaint-prompts.ts` with its test beside it. Default plate profile behavior moved to `src/plates/default-plate-profile.ts`. Remaining legacy-tolerant behavior is classified as active compatibility and deliberately retained.

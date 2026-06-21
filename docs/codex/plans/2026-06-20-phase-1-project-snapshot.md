# Phase 1 Project Snapshot Boundary

Status: complete
Roadmap phase: Phase 1: Shared Contracts And Project Boundary
Baseline commit: 51124275fd4610a74092a8c753cc4d9055b9a426
Last updated: 2026-06-20 18:48 -04

## Goal

Implement only the recommended Phase 1 project snapshot slice: add a JSON-safe shared `ProjectSnapshotV1` contract, extract snapshot serialization/parsing/restoration from `src/app/workbench-commands.ts` into focused project persistence code, and keep the visible Save Project / Load Project workbench behavior unchanged.

## Why this slice now

`docs/ultimate-architecture-roadmap.md` names Phase 1 as the highest-value next phase because it clarifies the boundary between portable project data and browser runtime handles before jobs, assets, storage, or production operations are introduced. The current snapshot code is embedded in `src/app/workbench-commands.ts`, which also owns local media operations, paid Runway/Codex operator dispatch, artifact mutation, file download, and depth-motion orchestration.

## Current behavior and evidence

- Baseline HEAD is `51124275fd4610a74092a8c753cc4d9055b9a426`; `git status --short` was clean.
- Baseline targeted check: `npm test -- src/app/workbench-commands.test.ts` passed with 8 tests.
- Current UI entry points remain in `src/ui/ArtifactWorkbench.svelte`: Save Project calls `executeOperator("save-project")`; Load Project uses the JSON file input and calls `importProjectSnapshotFile(file)`.
- `src/app/operator-registry.ts` exposes `save-project` and `load-project` as local operators. `load-project` is metadata only today; actual import is through the file input.
- `src/app/workbench-commands.ts` currently defines an internal `ProjectSnapshot` type, parses imports with unchecked `JSON.parse(...) as ProjectSnapshot`, rejects only non-`version: 1` or missing top-level `artifacts`, then restores artifacts, prompts, motion config, QC, view/projection state, and selection.
- Current export serializes all `workbench.artifacts`, selection, projection profile, guide splits, viewer mode, prompts, motion config, and QC. It strips runtime media fields to `null` and attempts to embed data URLs from canvas/blob/object URL media when possible.
- Persisted artifact fields currently mirror `ArtifactRecord`: id/type/stage/label/summary/status/inputs/operatorId/projectionProfile/prompt/config/media/results/timestamps/warnings/qcNotes/stale.
- Runtime-only state not currently persisted: `compareMode`, `surfaceMode` except restore selects the artifact, `mediaPreview`, jobs, errors, pending paid action, drop state, File inputs, Svelte store internals, and service clients.
- Current restore assigns `selectedStageId`, then calls `selectArtifact(...)`; the final selected stage is therefore derived from the selected artifact's stage. This is current behavior to preserve, not a new contract decision.
- Current restore calls `setProjectionProfile(snapshot.projectionProfile)`, which overwrites every restored artifact's `projectionProfile` with the root projection profile. Preserve this Phase 1 behavior.

## Invariants

- Shared contracts under `src/lib/shared` must be JSON-safe, side-effect free, and importable from browser and server code.
- Browser-only handles and APIs, including Blob, File, canvas, object URLs, fetch-backed object URL materialization, and download behavior, stay outside shared contracts and server code.
- Server routes and `src/lib/server` are unchanged for this slice.
- Visible Save Project / Load Project UI behavior and labels remain unchanged.
- Parse and validate the whole imported snapshot before mutating live workbench state or clearing runtime media handles.
- Preserve current snapshot compatibility for data URLs and current null runtime media fields while removing runtime handles from the normalized portable data.
- Do not make paid Runway or Codex calls in tests.

## Scope

### In scope

- Add `src/lib/shared/contracts/projects.ts` with `ProjectSnapshotV1` Zod schema, inferred types, version constant, and a small parse/validation helper.
- Add a focused browser-safe project persistence module under `src/app` for snapshot creation, text parsing, runtime-to-portable media conversion, portable-to-runtime restoration, and atomic application to `workbench`.
- Change `src/app/workbench-commands.ts` only enough to delegate project import/export to the new persistence module while keeping existing command entry points.
- Add focused unit tests for the shared contract and browser persistence boundary.
- Require the complete current artifact slot map for V1 snapshots and reject malformed artifact records before mutation.

### Explicit non-goals

- No database, durable project store, asset store, asset refs, upload endpoint, job store, job events, worker process, repository abstraction, command bus, generic workflow engine, generic migration framework, auth, collaboration, or production operations hook.
- No Phase 2 command split beyond moving snapshot responsibilities.
- No new dependency.
- No Runway or Codex paid API invocation.
- No project routes under `src/routes/api/projects`.

## Proposed design

`src/lib/shared/contracts/projects.ts` owns portable project data only. It imports `zod`, defines literal unions for current artifact slots, stages, projection modes, viewer modes, statuses, portable media kinds, QC ids, and current depth-motion enum values, and defines a JSON-safe recursive config value schema. Its media schema exposes only `kind`, `url`, `name`, `mime`, and `alt` in the parsed output. Portable media kinds are limited to `none`, `image`, and `video`; browser canvas media materializes as image data during export. It accepts legacy/current `blob: null`, `file: null`, and `canvas: null` fields in imported JSON but strips them. It rejects runtime-only `blob:` media URLs and rejects image/video media without a portable URL.

The parse helper uses a small version dispatch: non-object, missing version, and unsupported version fail with deliberate messages; version 1 parses through the V1 schema. This keeps later migrations possible without introducing a migration framework.

`src/app/project-persistence.ts` owns browser runtime conversion. It builds `ProjectSnapshotV1` from `workbench`, using artifact media handles, Blob/File/canvas conversion, object URL fetch fallback, and `downloadBlob` only in app/browser code. It restores a validated snapshot by first building a full runtime artifact map with media handles set to null. Only after that succeeds does it clear artifact media handles and media preview runtime state, replace artifacts, restore prompts/config/QC/view/guide/projection state, select the artifact, and revoke replaced runtime object URLs. This removes the current partial-mutation risk.

`src/app/workbench-commands.ts` keeps `importProjectSnapshotFile(file)` and the save-project operator path, but delegates import/download to the persistence module. Other local and paid operator code remains in place.

## Alternatives considered

- Status quo: leave unchecked snapshot casts in `workbench-commands.ts`. Rejected because it does not create the Phase 1 shared-contract boundary and can clear handles or partially restore state before malformed data is discovered.
- Full command split: split all local, paid, render, import/export, and UI commands now. Rejected as Phase 2 scope leakage.
- Server project route or durable storage: rejected because the recommended slice is explicitly Phase 1, not a database and not a queue.
- Reuse `ArtifactRecord` as the shared contract type. Rejected because current runtime artifact media types include `Blob`, `File`, and `HTMLCanvasElement`, which would blur the JSON boundary.

## Acceptance matrix

| Concern | Evidence required | Command/test |
|---|---|---|
| Valid current snapshot | V1 schema accepts the current exported shape with all nine artifact slots, prompts, motion config, selected state, projection/view state, and QC. | `npm test -- src/lib/shared/contracts/projects.test.ts` |
| Unsupported/invalid version | Missing, malformed, or unsupported versions fail with deliberate errors. | `npm test -- src/lib/shared/contracts/projects.test.ts` |
| Missing or malformed artifacts | Missing required slots, unknown slots, artifact key/id mismatch, bad/runtime media kind, image/video media without URL, malformed results, and malformed QC/config fail before mutation. | `npm test -- src/lib/shared/contracts/projects.test.ts src/app/project-persistence.test.ts` |
| JSON-safe cleanup | Exported portable data has no `blob`, `file`, or `canvas` keys, materializes runtime canvas media as image data URLs, and revokes replaced object URLs only after a valid restore. | `npm test -- src/app/project-persistence.test.ts` |
| Restoration | Prompts, projection/view state, guide splits, motion configuration, selected artifact/stage behavior, artifact records/results, and QC state restore as supported today. | `npm test -- src/app/project-persistence.test.ts` |
| Atomic invalid import | Invalid JSON or invalid snapshot leaves live artifacts, handles, prompts, motion config, QC, projection/view state, and selection unchanged. | `npm test -- src/app/project-persistence.test.ts` |
| UI behavior unchanged | Existing Save Project / Load Project entry points still call the same command functions; no component behavior change is introduced. Save/load command paths delegate to persistence and do not call paid clients. | `npm test -- src/app/workbench-commands.test.ts`; code review; `npm run typecheck` |
| Boundary | Shared contract imports no app stores, DOM/browser handles, Node APIs, server modules, network clients, or paid SDKs. | Code review, `npm run typecheck`, `npm run build` |
| Regression | Adjacent workbench command behavior still passes. | `npm test -- src/app/workbench-commands.test.ts` |
| Repository checks | TypeScript, lint, unit suite, and build pass. | `npm run typecheck`; `npm run lint`; `npm test`; `npm run build` |

## Implementation sequence

1. Add the shared project snapshot V1 contract and contract tests.
2. Add the browser project persistence module and tests for serialization, parsing/restoration, and atomic failure.
3. Update `src/app/workbench-commands.ts` to delegate snapshot import/export only.
4. Run targeted tests after each coherent unit.
5. Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
6. Spawn `zenith_boundary_auditor` and `zenith_final_reviewer` with the plan and diff; fix material findings and rerun affected checks.

## Risks and recovery

- Stricter validation may reject historical hand-written or partial snapshots. This is intentional for malformed/missing artifacts because the roadmap explicitly asks to test missing artifacts; current generated snapshots remain accepted, including null legacy media runtime fields.
- Object URL export currently best-effort fetches browser object URLs. The portable contract rejects `blob:` URLs and requires portable URLs for image/video media, so an unmaterializable image/video object URL fails snapshot creation rather than persisting runtime-only or unreadable media.
- `selectedStageId` in the snapshot may disagree with `selectedArtifactId`; current restore ultimately selects the artifact and derives stage from it. Preserve current behavior and leave a stricter cross-field invariant to a later compatibility decision.
- Reversal path is small: remove the new contract/module/tests and put import/export helpers back in `workbench-commands.ts`.

## Progress log

- [x] Recorded baseline HEAD and clean working tree.
- [x] Read `AGENTS.md`, `PLANS.md`, `README.md`, `docs/sveltekit-architecture.md`, Phase 1/recommended roadmap sections, skill references, and current snapshot code/tests.
- [x] Ran baseline targeted test: `npm test -- src/app/workbench-commands.test.ts`.
- [x] Spawned and waited for read-only `zenith_repo_mapper`, `zenith_roadmap_architect`, `zenith_contract_designer`, `zenith_test_strategist`, and `zenith_simplifier`.
- [x] Reconciled agent evidence into this plan before code edits.
- [x] Add shared contract and tests.
- [x] Add browser persistence module and tests.
- [x] Delegate workbench command save/load.
- [x] Run targeted checks.
- [x] Run repository checks.
- [x] Run independent boundary/final review agents for the initial implementation.
- [x] Fix material initial review findings and update final result.
- [x] Reconciled fresh pre-final agent findings on portable media, direct restore validation, and object URL revocation.
- [x] Tightened media/restore implementation and reran targeted plus repository checks.
- [x] Run independent boundary/final review agents on the latest diff.
- [x] Close non-material review residuals with focused no-paid-call and media-preview-handle test coverage.

## Decisions and discoveries

- All five agents converged on the same minimal implementation: one shared project contract module, one browser persistence module, and a narrow delegation from `workbench-commands.ts`.
- The contract designer recommended rejecting `blob:` URLs in portable snapshots. This is accepted because object URLs are runtime-only and current export already tries to convert them to data URLs.
- The repo mapper noted current import can clear handles while still processing a malformed snapshot. The new implementation must validate and prepare the full restore before touching live state.
- The simplifier warned against moving all artifact/job types into shared contracts. This plan only adds `projects.ts`.
- Typecheck caught that the initial media transform inferred optional media fields as required. The contract now exports an explicit `ProjectArtifactMediaV1` type with optional `url`, `name`, `mime`, and `alt`.
- Boundary auditor found no material boundary issue and noted optional `undefined` fields in in-memory snapshots as low risk.
- Final reviewer found one material issue: the schema accepted valid-but-wrong artifact `stage` and `inputs`, allowing impossible artifact graph records. Fixed by adding current stage/input invariants to the shared V1 schema and tests.
- The optional `undefined` field note was also fixed by compacting serialized artifact/result objects before returning the in-memory snapshot.
- Fresh pre-final contract review found that portable media still admitted the runtime `canvas` kind, direct `restoreProjectSnapshot(...)` trusted a TypeScript type, successful restore did not revoke replaced runtime object URLs, and image/video media could be unreadable without a URL. These findings were accepted and fixed.
- Post-change `zenith_boundary_auditor` found no material boundary issues. It confirmed the shared contract imports only Zod, browser APIs stay in app persistence, full validation precedes mutation, runtime handles stay out of the contract, and no later-phase systems were introduced.
- Post-change `zenith_final_reviewer` found no material issues. It noted two residual test gaps: no dedicated Save Project command-path test and no explicit invalid-restore media preview handle assertion. Both were closed with focused tests.
- Final delta review after those test-only changes found no material boundary, correctness, or scope issues.
- Verification completed:
  - `npm test -- src/lib/shared/contracts/projects.test.ts`: passed, 5 tests.
  - `npm test -- src/lib/shared/contracts/projects.test.ts src/app/project-persistence.test.ts`: passed, 9 tests.
  - `npm test -- src/lib/shared/contracts/projects.test.ts src/app/project-persistence.test.ts src/app/workbench-commands.test.ts`: passed, 17 tests.
  - `npm run typecheck`: passed.
  - `npm run lint`: passed.
  - `npm test`: passed, 53 files and 265 tests.
  - `npm run build`: passed; Vite reported chunk-size and plugin-timing warnings.
- Verification after final-review fixes:
  - `npm test -- src/lib/shared/contracts/projects.test.ts src/app/project-persistence.test.ts src/app/workbench-commands.test.ts`: passed, 18 tests.
  - `npm run typecheck`: passed.
  - `npm run lint`: passed.
  - `npm test`: passed, 53 files and 266 tests.
  - `npm run build`: passed; Vite reported chunk-size warnings.
- Verification after portable media and restore-boundary tightening:
  - `npm test -- src/lib/shared/contracts/projects.test.ts src/app/project-persistence.test.ts src/app/workbench-commands.test.ts`: passed, 21 tests.
  - `npm run typecheck`: passed.
  - `npm run lint`: passed.
  - `npm test`: passed, 53 files and 269 tests.
  - `npm run build`: passed; Vite reported chunk-size and plugin-timing warnings.
- Final verification after closing non-material review residuals:
  - `npm test -- src/lib/shared/contracts/projects.test.ts src/app/project-persistence.test.ts src/app/workbench-commands.test.ts`: passed, 22 tests.
  - `npm run typecheck`: passed.
  - `npm run lint`: passed.
  - `npm test`: passed, 53 files and 270 tests.
  - `npm run build`: passed; Vite reported chunk-size and plugin-timing warnings.

## Final result

Implemented the Phase 1 project snapshot boundary. `src/lib/shared/contracts/projects.ts` now defines and validates `ProjectSnapshotV1` as JSON-safe portable data, including fixed artifact slot, stage, input, media, prompt, motion, selection, and QC shape. `src/app/project-persistence.ts` owns browser-side snapshot creation/import/restore, explicit runtime media cleanup/materialization, and atomic parse-before-mutation restore. `src/app/workbench-commands.ts` keeps the Save Project and Load Project entry points but delegates snapshot work to the focused persistence module.

No routes, server services, databases, asset stores, job systems, generic repositories, command buses, new dependencies, or paid calls were introduced. Final verification passed after addressing the independent final-review finding and closing the later non-material test residuals.

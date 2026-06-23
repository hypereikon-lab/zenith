# Production Architecture Migration

Status: active
Roadmap phase: Phase 2 hardening before Phase 4A asset contracts
Baseline commit: 0e53b16fa15944ab8caf9d823755f256c7b10430
Last updated: 2026-06-23 13:52:09 -04

## Goal

Move the current browser workbench toward production-grade ownership boundaries without changing visible product behavior. The first writable slice stabilizes artifact graph invalidation and browser runtime media ownership so later command, RGBD, renderer, UI, and asset-contract work has a real boundary to build on.

## Why this slice now

The current repository already has strong SvelteKit server/shared boundaries, portable project snapshots, and first-class in-memory depth jobs. The live architectural ambiguity is earlier than durable assets: artifact graph invalidation is direct-only, object URL ownership is spread across browser command paths, and media conversion is duplicated between persistence, paid execution, local render, and RGBD.

The roadmap currently recommends a contract-only `AssetRef` slice. The read-only reviewers disagreed on ordering. The resolved decision for this plan is to defer `AssetRef` until runtime media ownership is explicit enough that an asset reference has a real current owner and migration path.

## Current behavior and evidence

- Baseline status: `## codex/plate-sketch-session-ownership...origin/codex/plate-sketch-session-ownership`; working tree clean.
- Baseline HEAD: `0e53b16fa15944ab8caf9d823755f256c7b10430`.
- Baseline targeted check passed: `npm test -- src/architecture/import-boundaries.test.ts src/artifacts/artifact-graph-consistency.test.ts src/app/project-persistence.test.ts` ran 3 files / 12 tests.
- `src/artifacts/artifact-store.svelte.ts` owns the singleton browser workbench state, artifact records, runtime media handles, jobs, errors, and direct-only `markDownstreamStale`.
- `src/artifacts/artifact-types.ts` duplicates slot/stage unions that already exist in `src/lib/shared/contracts/artifact-topology.ts`, and `ArtifactMedia` still allows browser runtime handles directly.
- `src/app/workbench-commands.ts` creates object URLs for imports and media preview, mutates artifact records, adds results, gates paid actions, delegates local/paid operators, and exports manifests.
- `src/app/project-persistence.ts` privately converts runtime media to portable snapshot media and revokes old object URLs only after valid snapshot restore.
- `src/app/paid-operator-execution.ts` privately reads artifact media as data URLs with `FileReader`, canvas `toDataURL`, and `fetch`.
- `src/app/local-render-operators.ts` privately reads artifact media as canvases and applies WebGPU/WebCodecs output media/results.
- `src/scene/rgbd-scene-commands.ts` privately reads artifact canvases, creates RGBD object URLs, samples canvases, calls browser-safe local paid wrappers, mutates RGBD scene state, and exports a manifest.
- `src/graphics/source-map-preview-renderer.ts`, `src/plates/plate-gpu-compositor.ts`, `src/sketch/depth-webgpu-renderer.ts`, and `src/media/webcodecs-mp4.ts` keep browser runtime work browser-owned; renderer lifecycle cleanup remains a later concrete slice.
- `src/ui/PlateSketchEditor.svelte`, `src/ui/SourceMapMediaViewer.svelte`, and `src/ui/CameraPathEditor.svelte` still own substantial orchestration, but the first slice must create better artifact/media owners before thinning UI.
- `src/lib/shared/contracts/projects.ts` and `src/lib/shared/contracts/jobs.ts` reject runtime object URLs and keep shared contracts JSON-safe.
- `src/architecture/import-boundaries.test.ts` enforces current browser/server/shared boundaries.

## First-principles ownership map

- UI components render state, collect intent, and mount runtime surfaces.
- Browser product commands express concrete Zenith operations and delegate media, payload, result, and runtime details.
- Browser runtime media modules own `File`, `Blob`, `HTMLCanvasElement`, object URLs, image/video loading, data URL conversion, and cleanup.
- Artifact graph/store owns browser artifact state, readiness, transitive stale propagation, result selection, media-handle replacement, and downstream invalidation.
- Browser renderer/session modules own WebGPU/WebCodecs/canvas lifecycle with explicit setup/update/render/readback/destroy contracts.
- Pure domain modules own projection, camera, guide math, packing, shader ABI, alignment math, manifest shaping, and artifact topology without DOM/GPU/store/network effects.
- Snapshot/project/job/asset contracts remain JSON-safe and portable.
- `src/lib/shared` stays side-effect free and JSON-safe.
- `src/lib/server` and SvelteKit server routes own secrets, filesystem, SDK clients, paid upstream calls, server validation, polling, and streaming.
- RGBD remains browser-owned for now, but its internal scene state, runtime media, paid orchestration, pure alignment/fusion, artifact builders, and manifest shaping should be separated.

## Current entanglement flaws by boundary

- Artifact graph/store: stale propagation only checks direct dependents even though topology contains multi-hop dependencies.
- Runtime media: object URL creation and conversion are duplicated across workbench imports, project persistence, paid execution, local render, depth motion, and RGBD.
- Browser commands: `workbench-commands.ts` is a stable facade but still owns multiple workflows directly.
- Paid operator execution: paid orchestration also owns media resolution and artifact result application.
- RGBD: one command file mixes state mutation, runtime canvas/media, paid wrapper calls, alignment sampling, artifact builders, and manifest export.
- Renderer sessions: runtime placement is correct, but cleanup/readback contracts are uneven and should be audited in a separate verified slice.
- UI shells: large components still own session/drag/commit/projection details that should move only after concrete owners exist.

## Invariants

- Preserve current artifact-first workflow and visible UI behavior.
- Keep browser-only APIs out of `src/lib/shared`, `src/lib/server`, and route files.
- Keep secrets, filesystem, SDK clients, and paid upstream calls under `src/lib/server` or SvelteKit routes.
- Do not inspect `.env.local`, process secrets, or call paid/model APIs.
- Keep project snapshots version `1` and compatible with existing tests.
- Preserve atomic snapshot restore: invalid imports must not mutate live state or revoke live object URLs.
- Do not add database, queue, worker, auth, collaboration, asset store, sidecar server, generic command bus, generic workflow framework, or generic renderer framework.
- Do not add dependencies.

## Scope

### In scope

- Derive runtime `ArtifactSlotId` and `WorkflowStageId` from shared artifact topology where safe.
- Add small pure artifact dependency helpers for transitive dependents using the existing topology.
- Make artifact stale propagation explicitly transitive while preserving status rules for missing artifacts.
- Add browser-owned runtime media helpers for object URL detection/collection/revocation and Blob/canvas/data URL conversion.
- Centralize artifact media/handle/result replacement in the artifact store for normal replacement paths.
- Update workbench import/promotion paths, local render outputs, paid result application, and project persistence to use the new owners where behavior-neutral.
- Add focused tests for stale propagation, object URL cleanup, media replacement, snapshot preservation, and graph consistency.

### Explicit non-goals

- Do not add `AssetRef` in the first commit; defer it until runtime media ownership is clean and there is a real producer/consumer.
- Do not add durable asset storage, uploads, signed URLs, hashes, storage keys, database persistence, durable jobs, queues, workers, auth, or collaboration.
- Do not move RGBD into the main artifact/job path.
- Do not rewrite large Svelte editors before better owners exist.
- Do not rewrite renderer classes or shader math in the artifact/media slice.
- Do not change project snapshot shape or version.

## Proposed design

First commit: artifact graph and runtime media ownership.

- `src/artifacts/artifact-types.ts` imports topology-derived slot/stage types from `src/lib/shared/contracts/artifact-topology.ts` instead of duplicating unions.
- A new pure module under `src/artifacts` owns artifact dependency traversal. It exposes transitive dependent IDs in project topology order.
- `src/artifacts/artifact-store.svelte.ts` exposes product-shaped replacement helpers such as artifact media/result replacement and media preview replacement. These helpers collect old runtime object URLs, update artifact media/handles/results atomically, mark transitive downstream artifacts stale, then revoke only object URLs that are no longer referenced by the live workbench state.
- A browser-only runtime media module under `src/artifacts` or `src/app` owns `blobToDataUrl`, `readArtifactMediaAsDataUrl`, `toRuntimeMedia`, `toPortableMedia`, `collectRuntimeObjectUrls`, and `revokeRuntimeObjectUrls`. It is not imported by `src/lib/shared` or `src/lib/server`.
- `project-persistence.ts` keeps validation and snapshot ownership but delegates runtime-media conversion/revocation mechanics to the browser media owner.
- `workbench-commands.ts`, `paid-operator-execution.ts`, and `local-render-operators.ts` keep public APIs stable while delegating media/result plumbing.

Failure behavior:

- Replacements validate before creating object URLs when possible. If a command rejects invalid media, it must not revoke existing live media.
- Snapshot restore keeps current behavior: parse/validate first; collect old URLs only after a valid snapshot; revoke only after live state is replaced.
- Paid/local operator media reads reject before calling mocked or real local API clients when required media is missing/unreadable.

Reversal path:

- The first commit is isolated to artifact/media ownership and focused tests. If a helper proves too broad, callers can be narrowed back behind the same public command facade.

## Alternatives considered

- Status quo: rejected because direct-only stale propagation and scattered object URL ownership are live correctness/lifecycle risks.
- Contract-only `AssetRef`: roadmap-aligned but deferred because there is no current storage, upload, resolver, or job output consumer. Adding it now would be future vocabulary without ownership.
- Generic workflow/media framework: rejected as overbuilt and contrary to Zenith’s product-shaped module rule.

## Acceptance matrix

| Concern                        | Evidence required                                                                                                                                                      | Command/test                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Transitive stale propagation   | Updating `plate-sketch`, `start-depth`, or `end-state` marks all topology descendants stale while preserving missing artifacts.                                        | `npm test -- src/artifacts/artifact-store.test.ts src/artifacts/artifact-graph-consistency.test.ts` |
| Media replacement ownership    | Central replacement updates artifact media/handle/result, preserves selected result behavior, and revokes old unused object URLs exactly after successful replacement. | `npm test -- src/artifacts/artifact-store.test.ts src/app/workbench-commands.test.ts`               |
| Snapshot atomicity             | Invalid restore does not mutate live state, clear handles, or revoke object URLs; valid restore still revokes old URLs.                                                | `npm test -- src/app/project-persistence.test.ts`                                                   |
| Paid/local media safety        | Paid/local operators resolve data URL/canvas/blob/fetch media through the shared browser helper and reject missing media before external calls/rendering.              | `npm test -- src/app/paid-operator-execution.test.ts src/app/local-render-operators.test.ts`        |
| Shared/server/browser boundary | No runtime media helper leaks into shared/server/routes.                                                                                                               | `npm test -- src/architecture/import-boundaries.test.ts`                                            |
| Regression                     | Full unit suite, typecheck, lint, build remain green.                                                                                                                  | `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`                                    |
| Production demo                | Adapter-node smoke remains no-paid-call.                                                                                                                               | `npm run smoke:prod:built` after build                                                              |

## Implementation sequence

1. Add topology-derived runtime types and pure transitive dependency helper; test stale propagation.
2. Add browser runtime media helper and central artifact/media replacement helpers; test URL cleanup and snapshot preservation.
3. Update workbench import/promotion and local/paid result application to use replacement/media helpers; run targeted tests and commit.
4. If verification remains healthy, split `workbench-commands.ts` into product-shaped facade modules for media commands and projection/view commands; run targeted tests and commit.
5. If still healthy, extract paid operator media resolution/result application into browser-owned modules; run targeted tests and commit.
6. Defer RGBD, renderer lifecycle, and UI thinning to later commits unless the first slices are stable and the diff remains reviewable.

## Risks and recovery

- Risk: transitive stale propagation changes visible status for downstream artifacts. This is intended when topology implies dependency; tests must lock exact descendants.
- Risk: object URL revocation could revoke a URL still referenced in result history or preview. Replacement helpers must collect live references after mutation and revoke only unused old URLs.
- Risk: snapshot restore could revoke too early. Keep parse/validation before mutation and revoke after replacement only.
- Risk: moving media conversion into a helper could accidentally import browser APIs into shared/server. Import-boundary tests and build catch this.
- Recovery: revert the last coherent commit. Public command facades remain stable so rollback should be narrow.

## Progress log

- [x] Baseline HEAD and status recorded.
- [x] Required docs and skill references read.
- [x] Read-only repo mapper and roadmap architect spawned and reconciled.
- [x] Older unused agents closed to free capacity.
- [x] Test strategist, simplifier, contract designer, and boundary auditor spawned where capacity allowed.
- [x] Baseline targeted tests passed for import boundaries, artifact graph consistency, and project persistence.
- [x] Commit 1 implementation verified locally with targeted artifact/media, boundary, typecheck, lint, full unit, and build checks.
- [x] Commit 1: artifact graph/runtime media ownership.
- [x] Commit 2 implementation verified locally with command tests, import boundary, typecheck, lint, Prettier check, and diff check.
- [x] Commit 2: workbench command split.
- [x] Commit 3 implementation verified locally with paid/local/operator tests, import boundary, typecheck, lint, Prettier check, and diff check.
- [ ] Commit 3: paid and local operator result application cleanup.
- [ ] Final boundary and diff review.
- [ ] Push and sync.

## Decisions and discoveries

- Decision: defer `AssetRef` despite the roadmap’s old next recommendation because current runtime media ownership is a smaller prerequisite with direct evidence.
- Discovery: `workbench-commands.ts`, `paid-operator-execution.ts`, `local-render-operators.ts`, `project-persistence.ts`, and `rgbd-scene-commands.ts` all implement their own media conversion or object URL logic.
- Discovery: import-boundary tests are already strong and should be run after every ownership move.
- Discovery: renderer lifecycle and UI thinning are real concerns but should follow the artifact/media owner so extracted code has a stable destination.

## Final result

Pending.

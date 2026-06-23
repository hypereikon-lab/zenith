# Consolidate Artifact Topology Facts

Status: complete
Roadmap phase: current architecture stabilization
Baseline commit: e3f9a43d8bfb1b8aa399167b4dc4abfa20a46df3
Last updated: 2026-06-23 01:37 -04

## Goal

Make the artifact graph easier to maintain by using lightweight shared topology constants as the single source for artifact stage/input facts in runtime setup and tests.

## Why this slice now

The repo is production-demonstrable, but the same artifact stage/input topology is copied in runtime initialization and several tests. That creates avoidable drift risk without improving product behavior. Consolidating around already-exported shared constants is smaller and more reversible than adding a new asset contract, a registry abstraction, or a storage model.

## Current behavior and evidence

- `src/lib/shared/contracts/projects.ts` exported `PROJECT_ARTIFACT_STAGE_BY_ID` and `PROJECT_ARTIFACT_INPUTS_BY_ID`.
- `src/artifacts/artifact-store.svelte.ts` hard-codes the same stage/input topology in `createInitialArtifacts()`.
- `src/lib/shared/contracts/projects.test.ts`, `src/app/project-persistence.test.ts`, `src/app/paid-operator-execution.test.ts`, and `src/app/local-render-operators.test.ts` duplicate local `STAGE_BY_ARTIFACT` and `INPUTS_BY_ARTIFACT` maps.
- The duplicated maps currently match, but nothing directly asserts that runtime `WORKFLOW_STAGES`, initial artifacts, and shared project snapshot topology remain aligned.

## Invariants

- Preserve the artifact-first fulldome workflow and all visible UI behavior.
- Keep browser runtime media and handles in browser-owned modules.
- Keep shared contracts JSON-safe and side-effect free.
- Do not introduce storage, asset references, queues, repositories, command buses, or workflow frameworks.
- Do not make paid Runway/Codex/model calls.

## Scope

### In scope

- Replace duplicated test fixture topology maps with shared project-contract exports.
- Use shared stage/input maps when creating initial runtime artifacts.
- Add a focused artifact graph consistency test.
- Run targeted tests and normal TypeScript/lint/unit checks.

### Explicit non-goals

- No `AssetRef`/asset metadata contract yet.
- No changes to project snapshot JSON shape.
- No changes to operator execution behavior.
- No changes to paid API routes or job infrastructure.
- No UI component splitting.

## Proposed design

`src/lib/shared/contracts/artifact-topology.ts` owns portable artifact topology as stable JSON-safe constants. `src/lib/shared/contracts/projects.ts` re-exports those constants for compatibility with existing project snapshot callers, but browser runtime artifact initialization imports the lightweight topology module directly so it does not pull the Zod-backed project snapshot contract into the client bundle. Labels, summaries, media defaults, and runtime handles stay owned by `src/artifacts`. Tests consume the same exported maps instead of maintaining local copies.

Add a test under `src/artifacts` that checks:

- `WORKFLOW_STAGES.flatMap(stage.artifactIds)` exactly equals `PROJECT_ARTIFACT_SLOT_IDS`.
- Every workflow stage artifact belongs to the stage declared by `PROJECT_ARTIFACT_STAGE_BY_ID`.
- Every initial runtime artifact has the shared expected stage and inputs.
- Every operator references known slots/stages and uses the stage of its attachment/output.

This keeps product-shaped modules and avoids a generic registry abstraction.

## Alternatives considered

- Status quo: lowest churn, but keeps drift-prone duplicated graph facts.
- Add `AssetRef` contract: roadmap-aligned Phase 4A vocabulary, but not yet wired to current behavior and easier to overbuild under this request.
- Add broad import-boundary linting: valuable later, but less directly tied to the concrete duplicated topology risk.

## Acceptance matrix

| Concern | Evidence required | Command/test |
|---|---|---|
| Behavior | Existing project/operator/local/paid tests continue to pass | `npm test -- src/lib/shared/contracts/projects.test.ts src/app/project-persistence.test.ts src/app/paid-operator-execution.test.ts src/app/local-render-operators.test.ts src/app/operator-registry.test.ts src/app/workbench-commands.test.ts` |
| Boundary | Shared constants remain JSON-safe; runtime imports only data constants | `npm run typecheck` |
| Drift guardrail | Runtime stages, initial artifacts, and operators match shared topology | `npm test -- src/artifacts/artifact-graph-consistency.test.ts` |
| Regression | Repository unit suite remains green | `npm test` |

## Implementation sequence

1. Extract shared topology constants into a lightweight contract module and preserve `projects.ts` re-exports.
2. Import shared topology constants where fixture maps are duplicated.
3. Use shared topology constants in `createInitialArtifacts()`.
4. Add graph consistency tests.
5. Run targeted and repository checks.
6. Run independent read-only final review.

## Risks and recovery

The main risk is importing shared contract code into browser runtime incorrectly. The contract module is already side-effect free and exports JSON-safe constants, and typecheck/build will catch bundling or import errors. If the change proves too broad, it can be narrowed to test fixture consolidation only.

## Progress log

- [x] Read current repo state, architecture docs, roadmap, and relevant files.
- [x] Collected read-only agent recommendations and reconciled scope.
- [x] Consolidate topology usage.
- [x] Add graph consistency coverage.
- [x] Verify targeted and repo-wide checks.
- [x] Run independent read-only review.

## Decisions and discoveries

- Chose topology consolidation over `AssetRef` because it removes an active maintainability risk using existing contract exports without introducing new future-facing concepts.
- Extracted topology to `artifact-topology.ts` instead of importing `projects.ts` from browser runtime, avoiding a Zod-backed snapshot schema dependency in initial artifact setup.

## Final result

Implemented topology consolidation through `src/lib/shared/contracts/artifact-topology.ts`, `src/artifacts/artifact-store.svelte.ts`, and the project/local/paid fixture tests. `src/lib/shared/contracts/projects.ts` keeps re-exporting the topology constants for existing project snapshot callers. Added `src/artifacts/artifact-graph-consistency.test.ts` to verify runtime workflow stage ordering, initial runtime artifacts, and operator attachment/output topology against the shared topology contract.

Verification passed:

- `npm test -- src/artifacts/artifact-graph-consistency.test.ts src/lib/shared/contracts/projects.test.ts src/app/project-persistence.test.ts src/app/paid-operator-execution.test.ts src/app/local-render-operators.test.ts src/app/operator-registry.test.ts src/app/workbench-commands.test.ts` (7 files, 49 tests)
- `npm run typecheck`
- `npm run lint`
- `npm test` (48 files, 273 tests)
- `npm run build`

Playwright was not run because this slice did not change hydration or user workflows.

Independent read-only boundary and final reviews found no issues.

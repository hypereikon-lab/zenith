# Phase 1 — Project Contract and Snapshot Boundary

This reference narrows the roadmap's recommended next slice. Confirm all details against the current code before editing.

## Required outcome

- Add `src/lib/shared/contracts/projects.ts`.
- Define a versioned, JSON-safe `ProjectSnapshotV1` schema and inferred TypeScript type.
- Move project snapshot serialization, parsing, validation, and restoration support out of `src/app/workbench-commands.ts` into a focused browser-safe project-persistence module.
- Keep the visible workbench behavior unchanged.
- Add focused tests for the persistence boundary.

## Current pressure point

`src/app/workbench-commands.ts` currently combines snapshot import/export with local media operations, paid operators, artifact mutation, file IO, and other command responsibilities. Phase 1 should extract only the project persistence boundary. Do not perform the larger Phase 2 command split at the same time.

## Contract principles

- `version` is an explicit discriminator, currently `1`.
- Parsing untrusted imported JSON must return a clear success/failure result or throw a deliberate domain error; raw unchecked casts are not acceptable.
- Portable snapshot data must not contain runtime callbacks, Svelte store state, DOM objects, Canvas, File, Blob, or transient object URLs.
- Media cleanup belongs in an explicit runtime-to-portable conversion, not hidden in a broad JSON clone.
- Restoration must reconstruct runtime-only fields through focused adapters rather than pretending they were persisted.
- Preserve currently supported data URLs only as portable snapshot compatibility where current behavior requires them; do not introduce the future asset abstraction in Phase 1.
- Keep schema migration possible through a small version-dispatch point, but do not build a generic migration framework for one version.

## Acceptance cases

1. A snapshot produced by the current workbench validates and restores.
2. Unsupported or malformed versions fail with a useful error.
3. Missing or malformed artifacts fail rather than partially mutating the active project.
4. Runtime-only media fields are removed or normalized to JSON-safe representations.
5. Prompts, motion configuration, projection/view state, selection, and QC state restore exactly as supported today.
6. Parsing happens before mutating live stores, so an invalid import leaves current state unchanged.
7. UI behavior and download/import entry points remain unchanged.
8. No database, asset store, job model, or generic repository interface is introduced.

## Questions the implementation must answer from code

- Which artifact fields are required for every slot, and which are optional?
- Which media URLs are already persisted intentionally versus transient object URLs?
- Which existing artifact/runtime types can safely be reused, and which would leak runtime concerns into the shared contract?
- What current defaults are applied when historical optional fields are absent?
- Where should file reading/downloading remain versus pure parsing/serialization?
- What exact error surface does the UI currently expect?

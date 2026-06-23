# Add Production Boundary Guardrails

Status: complete
Roadmap phase: current architecture stabilization
Baseline commit: e7ac07d55c4f0355f5f03202d3d78797e10127e9
Last updated: 2026-06-23 02:07 -04

## Goal

Make Zenith harder to regress across its most important production-readiness boundaries: shared contracts stay portable, browser workbench code cannot import server-only effects, server/API code cannot import browser workbench modules, and the adapter-node smoke command remains no-paid-call.

## Why this slice now

Zenith now has a hiring evaluation guide and a production smoke command. The next useful step is to turn core architecture claims into executable guardrails without adding infrastructure. The most expensive regression for this codebase would be a secret/server import leaking into browser/shared code or a safe smoke command drifting into paid routes.

## Current behavior and evidence

- `docs/sveltekit-architecture.md` states that `src/lib/shared` must stay JSON-safe and that paid effects/secrets belong under `src/lib/server` or routes.
- Browser-owned modules under `src/app`, `src/artifacts`, `src/ui`, `src/stages`, `src/graphics`, `src/media`, `src/sketch`, `src/plates`, `src/inpaint`, `src/scene`, `src/services`, and `src/runway` currently call local SvelteKit endpoints rather than upstream APIs.
- API routes under `src/routes/api` currently import server services and route types, and route files are thin.
- `scripts/smoke-adapter-node.mjs` currently strips listed Runway/Codex prompt config environment keys from its child process and probes only `/api/status`, `/api/runway/status`, and `/`.
- `npm run lint` passes, but there is no executable import-boundary test covering `.svelte` files.

## Invariants

- Do not inspect or print secrets.
- Do not call paid Runway/Codex/model APIs.
- Do not add dependencies.
- Preserve UI and runtime behavior.
- Do not add storage, queues, workers, auth, observability, repository layers, or workflow frameworks.
- Do not ban intentional browser APIs from browser-owned modules.

## Scope

### In scope

- Add a bounded static Vitest import-boundary test using the TypeScript parser.
- Scan production `.ts` and `.svelte` files while excluding tests and generated output.
- Add a static contract test for `scripts/smoke-adapter-node.mjs`.
- Run targeted tests, full unit tests, typecheck, lint, Playwright smoke, and adapter-node smoke.

### Explicit non-goals

- No custom ESLint plugin or new graph dependency.
- No durable asset/job/project infrastructure.
- No changes to route behavior, paid API behavior, or Svelte components.
- No broad formatting or unrelated cleanup.
- No live paid API tests.

## Proposed design

Add `src/architecture/import-boundaries.test.ts` with three product-owned boundary checks:

- shared contract files under `src/lib/shared` may import only relative shared files and approved contract dependencies such as `zod`; they may not import Node, `$env`, server modules, browser runtime modules, Svelte components/stores, or paid SDKs;
- browser-owned roots may not import `$lib/server`, private `$env`, Node built-ins, `@openai/codex-sdk`, or resolved `src/lib/server` files;
- server services and API routes may not import browser-owned roots such as `src/app`, `src/ui`, `src/artifacts`, `src/media`, `src/graphics`, `src/scene`, `src/services`, or `src/runway`.

Add `src/architecture/smoke-adapter-node-contract.test.ts` that reads the smoke script and `package.json` without executing the script. It asserts the production smoke command remains wired to build plus `scripts/smoke-adapter-node.mjs`, the smoke child sanitizes the expected Runway/Codex prompt config keys, and the smoke script does not reference paid generation/job/Codex routes.

This uses existing dependencies only and avoids relying on regex alone for TypeScript imports. Svelte files are scanned by parsing their `<script>` blocks.

## Alternatives considered

- ESLint-only `no-restricted-imports`: smaller in config churn, but current lint setup does not parse `.svelte` component imports, leaving an important browser UI gap.
- New dependency such as dependency-cruiser: deferred because the current boundary is small enough to test without another tool.
- More smoke assertions: deferred because `smoke:prod` should stay a deployment proof, not duplicate API/e2e coverage.

## Acceptance matrix

| Concern                 | Evidence required                                                                                                   | Command/test                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Shared contract safety  | Shared production files cannot import server/browser/runtime/Node/secret modules                                    | `npm test -- src/architecture/import-boundaries.test.ts`                                  |
| Browser/server boundary | Browser roots cannot import server-only/private/Node/paid SDK modules; server/API roots cannot import browser roots | `npm test -- src/architecture/import-boundaries.test.ts`                                  |
| No-paid smoke safety    | Smoke script keeps safe env/key sanitization and probes only safe endpoints                                         | `npm test -- src/architecture/smoke-adapter-node-contract.test.ts`                        |
| Regression              | Existing unit/e2e/build/smoke checks still pass                                                                     | `npm run typecheck`; `npm run lint`; `npm test`; `npm run test:e2e`; `npm run smoke:prod` |

## Implementation sequence

1. Add architecture guardrail tests.
2. Run targeted tests and fix false positives without weakening boundaries.
3. Run full verification stack.
4. Run independent read-only review.
5. Commit, push, and confirm sync.

## Risks and recovery

The main risk is a noisy static rule. Keep the root lists explicit, exclude test files, and avoid banning intentional browser APIs from browser-owned modules. If a rule proves too broad, narrow it to the concrete boundary it is meant to protect instead of adding exceptions everywhere.

## Progress log

- [x] Read baseline repo state, docs, and current scripts.
- [x] Collected read-only agent recommendations.
- [x] Add guardrail tests.
- [x] Verify checks.
- [x] Run independent review.
- [x] Commit and push.

## Decisions and discoveries

- Chose static Vitest guardrails over ESLint-only because they can scan Svelte `<script>` imports with no new dependencies.
- Deferred smoke-script expansion beyond contract assertions because the live smoke command already proves adapter-node startup.
- Boundary review found that browser entrypoints were not scanned and the Node builtin list was manually incomplete. Fixed by adding `src/App.svelte`, `src/routes/+page.svelte`, `src/routes/+layout.svelte`, and `src/routes/+layout.ts` to the browser scan and by deriving Node builtins from `node:module`.

## Final result

Added `src/architecture/import-boundaries.test.ts` and `src/architecture/smoke-adapter-node-contract.test.ts`. No runtime code, dependencies, route behavior, or product UI changed.

Verification passed after the boundary-review fixes:

- `npm test -- src/architecture/import-boundaries.test.ts src/architecture/smoke-adapter-node-contract.test.ts` (2 files, 6 tests)
- `npm run typecheck`
- `npm run lint`
- `npm test` (50 files, 279 tests)
- `npm run test:e2e` (4 tests)
- `npm run smoke:prod`
- `npx prettier --check src/architecture/import-boundaries.test.ts src/architecture/smoke-adapter-node-contract.test.ts docs/codex/plans/2026-06-23-production-boundary-guardrails.md`

`npm run smoke:prod` also ran `npm run build`; the build succeeded with the existing large client chunk/plugin timing warnings.

Independent final review found no issues. Independent boundary review found two guardrail gaps, both fixed before completion: browser entrypoints are now included in the scan, and Node builtin detection now uses Node's `builtinModules` list.

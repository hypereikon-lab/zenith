# Package Zenith For Hiring Evaluation

Status: complete
Roadmap phase: not roadmap-specific
Baseline commit: 8d1c312269f8226bfa0aaaef001fd66e31f147bf
Last updated: 2026-06-23 01:52 -04

## Goal

Give a hiring reviewer a concise, safe path to understand, run, and evaluate Zenith without overclaiming production readiness or requiring paid API calls.

## Why this slice now

Zenith now has working architecture docs, verification coverage, and a production smoke command. The missing piece is reviewer packaging: README explains individual commands, but it does not provide an ordered evaluator path, explicit no-paid-call expectations, or a compact map from product claims to code evidence.

## Current behavior and evidence

- `README.md` explains the product workflow, local run command, production smoke, environment variables, and project structure.
- `npm run smoke:prod` builds the adapter-node app, starts `node build`, strips known Runway/Codex environment keys from the child process, probes `/api/status`, `/api/runway/status`, and `/`, then exits.
- `tests/e2e/app.smoke.spec.ts` verifies SvelteKit page serving, Runway status contract, invalid payload rejection before upstream work, and malformed JSON rejection.
- `docs/sveltekit-architecture.md` maps browser/server/shared boundaries and current production demonstrability.
- `docs/ultimate-architecture-roadmap.md` honestly names deferred storage, queues, workers, auth, durable jobs, and collaboration, but its implementation checkpoint references an older commit.

## Invariants

- Do not inspect or print secrets.
- Do not call paid Runway/Codex/model APIs.
- Do not add product infrastructure, storage, deployment config, auth, queues, workers, or observability.
- Do not imply Zenith is a hosted SaaS or durable multi-user production platform.
- Keep the hiring package factual and evidence-backed.

## Scope

### In scope

- Add a reviewer-facing `docs/hiring-evaluation.md`.
- Add a short README entry that points reviewers to the hiring guide and safe verification commands.
- Remove or soften the stale roadmap checkpoint SHA so reviewers do not see outdated baseline friction.
- Run formatting/doc checks and the safe verification stack.
- Commit and push the completed slice.

### Explicit non-goals

- No new runtime code.
- No new npm script unless existing commands are insufficient.
- No asset contract, asset store, project CRUD, durable job store, database, queue, worker, auth, rate limits, or hosted observability.
- No demo video generation or paid media-generation walkthrough.
- No broad marketing page.

## Proposed design

Add `docs/hiring-evaluation.md` as the first-pass reviewer map:

- what Zenith is;
- what works locally without secrets;
- exact safe commands to run;
- optional paid/API path that requires a Runway key;
- code evidence for SvelteKit boundaries, contracts, jobs, browser media, rendering, and smoke tests;
- explicit non-claims and deferred roadmap work.

Keep README operational and short by linking to the guide rather than duplicating all of it. Adjust the roadmap checkpoint wording from an exact stale SHA to a current-state phrasing.

## Alternatives considered

- Add a new `hiring:check` script: deferred because existing scripts already express the safe verification path and another wrapper would add command surface without changing evidence.
- Add a demo capture script or video: rejected because current capture script depends on local ignored state and external tooling, and would be brittle for reviewers.
- Implement Phase 4A asset contracts: rejected for this slice because it improves architecture, not hiring readability.

## Acceptance matrix

| Concern              | Evidence required                                                           | Command/test                                                                              |
| -------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Docs truthfulness    | Guide matches current scripts, tests, and architecture docs                 | Review diff; `npm run format:check`                                                       |
| No paid-call package | Guide clearly separates no-secret commands from optional key-required flows | Review diff; `npm run smoke:prod`                                                         |
| Regression           | Existing checks still pass after docs/package edits                         | `npm run typecheck`; `npm run lint`; `npm test`; `npm run test:e2e`; `npm run smoke:prod` |
| Reviewer clarity     | README exposes the hiring guide and safe verification path                  | Review diff                                                                               |

## Implementation sequence

1. Add `docs/hiring-evaluation.md`.
2. Add a short README hiring-review section and link.
3. Update stale roadmap checkpoint wording.
4. Verify docs formatting and safe checks.
5. Run independent read-only final review.
6. Commit, push, and confirm sync.

## Risks and recovery

Main risk is overclaiming. Recovery is to narrow wording to observable local behavior and point to the roadmap for deferred production capabilities. If verification is too slow or environment-limited, record exact missing evidence rather than replacing it with claims.

## Progress log

- [x] Read baseline repo state and required docs.
- [x] Collected read-only agent recommendations.
- [x] Add reviewer package docs.
- [x] Verify commands.
- [x] Run independent review.
- [x] Commit and push.

## Decisions and discoveries

- Chose a docs-only package because `smoke:prod`, e2e smoke, and architecture docs already provide the technical evidence.
- Avoided a new wrapper script because it would duplicate existing commands without adding safety.
- `npm run format:check -- <files>` still checks the whole repo because the package script includes `.`, and the repo has pre-existing Prettier drift outside this slice. Used `npx prettier --write` and `npx prettier --check` on the touched docs instead.

## Final result

Added `docs/hiring-evaluation.md`, a short README hiring review path, and current-state roadmap checkpoint wording. No runtime code, product infrastructure, or new script was added.

Verification passed:

- `npx prettier --check README.md docs/hiring-evaluation.md docs/ultimate-architecture-roadmap.md docs/codex/plans/2026-06-23-hiring-evaluation-package.md`
- `npm run typecheck`
- `npm run lint`
- `npm test` (48 files, 273 tests)
- `npm run test:e2e` (4 tests)
- `npm run smoke:prod`

`npm run smoke:prod` also runs `npm run build`; the build succeeded with the existing large client chunk/plugin timing warnings.

Independent boundary review found no issues. Independent final review found two low-severity documentation issues: the plan status/progress mismatch and overly broad smoke environment sanitization wording. Both were fixed before commit.

# Zenith Codex Working Agreement

## Mission

Improve Zenith through small, reversible, evidence-backed changes that preserve the working fulldome production cockpit while moving deliberately toward `docs/ultimate-architecture-roadmap.md`.

The goal is not to maximize code churn or complete the roadmap in one pass. The goal is to make the next architectural boundary clearer, safer, and easier to test without prematurely committing Zenith to storage, queue, deployment, or collaboration decisions.

## Sources of truth

Use these in this order:

1. The current code, tests, and observable behavior.
2. `docs/sveltekit-architecture.md` for the architecture that exists now.
3. `docs/ultimate-architecture-roadmap.md` for the intended target, migration order, deferred decisions, and non-goals.
4. `README.md` for the product workflow and supported commands.

If they disagree, do not silently choose one. Record the conflict in the plan or final receipt and preserve current behavior unless the task explicitly changes it.

## Architectural invariants

- Keep WebGPU, WebCodecs, canvas, DOM, object URLs, local media handling, and interactive rendering in browser-only modules.
- Keep secrets, filesystem access, paid upstream calls, Codex SDK use, Runway clients, and server trust boundaries under `src/lib/server` or SvelteKit server routes.
- Keep `src/routes` thin: parse, validate at the boundary, call a server service, and return a response or stream.
- Shared contracts under `src/lib/shared` must be JSON-safe, side-effect free, and importable from both browser and server code. They must not import DOM, browser runtime objects, Node APIs, secrets, stores, or network clients.
- Use Zod at external or persistence boundaries. Do not turn every internal runtime type into a schema.
- Preserve the artifact-first product model and current UI behavior unless the task explicitly changes them.
- Prefer explicit product-shaped modules and commands over a generic command bus, workflow framework, repository layer, or abstract service hierarchy.
- Do not add a database, durable queue, worker process, collaboration model, sidecar server, or generic workflow engine ahead of the roadmap phase that requires it.
- Do not make paid Runway or Codex calls in automated tests.
- Do not inspect, print, commit, or copy secrets from `.env.local` or the process environment.
- Do not add a production dependency unless the task cannot be completed cleanly with the existing stack. Explain any dependency before adding it.

## Work protocol

1. Inspect `git status`, the current HEAD, the relevant docs, implementation, and tests before editing. Preserve unrelated user changes; never reset or overwrite them.
2. State the requested outcome, current behavior, invariants, in-scope work, and explicit non-goals.
3. For architecture work, cross-boundary changes, or changes spanning roughly three or more files, create or update a plan under `docs/codex/plans/` using `PLANS.md`.
4. Explicitly use read-only subagents for independent repository mapping, roadmap review, test design, and simplification when the task benefits from them. Wait for their results and reconcile disagreements before editing.
5. The parent agent is the sole writer unless the user explicitly authorizes isolated worktrees and a merge protocol. Do not let several agents edit the same working tree.
6. Implement the smallest complete vertical slice. Keep behavior unchanged unless the task says otherwise. Avoid phase leakage into later roadmap work.
7. Verify incrementally: targeted tests first, then the relevant repository-wide checks.
8. Run an independent read-only review of the final diff for correctness, architectural boundaries, regression risk, and missing tests.
9. Finish with a change receipt: what changed, why, evidence, tests run, remaining risks, and deliberately deferred work.

## Verification commands

Use the smallest relevant set during iteration, then expand before completion:

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

Rules:

- Run targeted Vitest files while iterating when possible.
- Run `npm run typecheck`, `npm run lint`, and `npm test` for TypeScript or Svelte changes unless the environment makes a command unavailable.
- Run `npm run build` for routing, server/browser-boundary, adapter, or bundling changes.
- Run Playwright only for meaningful user-flow or hydration changes; avoid brittle UI scripting.
- Never substitute “the code looks right” for executable evidence.
- If a command cannot run, report the exact reason and what evidence remains missing.

## Completion standard

A change is complete only when:

- its behavior and boundary are understandable from code and names;
- the roadmap phase and non-goals remain respected;
- portable data is separated from browser runtime objects;
- paid effects and secrets remain server-only;
- tests cover the failure modes introduced by the boundary;
- no unrelated cleanup is mixed into the patch;
- the final report distinguishes verified facts from assumptions and deferred decisions.

# Zenith Codex Harness

This repository harness is designed for Codex CLI and Codex subagents. It does not modify Zenith's application runtime. It shapes how Codex perceives the repository, plans architecture work, delegates analysis, edits code, and verifies results.

## Components

| Artifact | Function |
|---|---|
| `AGENTS.md` | Persistent repository constitution and quality bar |
| `PLANS.md` | Durable state format for multi-file or long-running work |
| `.codex/config.toml` | Bounded subagent concurrency |
| `.codex/agents/*.toml` | Narrow read-only specialists |
| `.agents/skills/zenith-roadmap-slice` | Repeatable implementation procedure |
| `.agents/skills/zenith-architecture-audit` | Read-only discovery and prioritization procedure |
| `docs/codex/prompts.md` | Ready-to-paste operating prompts |
| `docs/codex/change-receipt-template.md` | Evidence-oriented completion record |

## Why this shape

- The root instructions preserve architectural invariants across tasks.
- Skills provide progressive disclosure: Codex loads the detailed process only when invoked.
- Specialized subagents parallelize perception and critique, not writes.
- The parent thread stays accountable for one coherent patch.
- Execution plans preserve goal, constraints, evidence, decisions, and progress across context compaction or a new session.
- Independent review remains separate from implementation.

## Install

Copy the contents of this bundle into the Zenith repository root. Review the files, then commit them as a standalone harness change before using them to modify application code.

Project-scoped `.codex/config.toml` and `.codex/agents/` are loaded only when Codex trusts the repository.

## Recommended first run

Start Codex from the repository root, then paste the Phase 1 prompt from `docs/codex/prompts.md`.

The prompt explicitly requests subagents because Codex does not spawn them implicitly.

## Minimal installation

If you want fewer files, the minimum useful set is:

```text
AGENTS.md
PLANS.md
.agents/skills/zenith-roadmap-slice/
docs/codex/prompts.md
```

The custom agents improve separation of concerns but are not required. Without them, ask Codex to spawn several built-in `explorer` agents with the same narrow roles.

## Maintenance

Change this harness only in response to repeated or consequential failure:

- recurring architecture drift → improve `AGENTS.md`;
- poor execution continuity → improve `PLANS.md`;
- weak specialist analysis → improve one custom agent;
- repeated process failure → improve the skill;
- missing evidence → improve the verification matrix.

Do not add instructions merely because they sound prudent. Keep the persistent layer short, test whether the agent actually uses it, and remove stale policy.

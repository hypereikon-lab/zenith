# Zenith Codex Harness Bundle

This bundle contains repository-level instructions and orchestration artifacts for improving Zenith with Codex CLI and subagents.

Copy every path in this bundle into the Zenith repository root. The bundle adds no application dependencies and changes no product code.

Start with:

1. `docs/codex/README.md`
2. `AGENTS.md`
3. the Phase 1 prompt in `docs/codex/prompts.md`

The design is intentionally conservative:

- persistent architectural policy in `AGENTS.md`;
- detailed process loaded only through skills;
- parallel read-only analysis;
- one accountable writer;
- explicit execution state through plans;
- independent verification after implementation.

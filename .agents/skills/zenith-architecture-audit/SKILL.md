---
name: zenith-architecture-audit
description: Perform a read-only, evidence-based audit of Zenith against its current SvelteKit architecture and ultimate roadmap, then identify the smallest high-value next slice. Use when deciding what to improve next or checking architecture drift.
---

# Zenith Architecture Audit

Do not edit code.

1. Read `AGENTS.md`, `README.md`, `docs/sveltekit-architecture.md`, and `docs/ultimate-architecture-roadmap.md`.
2. Record the current HEAD and working-tree state.
3. Explicitly spawn and wait for:
   - `zenith_repo_mapper` to map ownership and high-coupling paths;
   - `zenith_roadmap_architect` to locate phase alignment and phase leakage;
   - `zenith_test_strategist` to identify verification gaps;
   - `zenith_simplifier` to challenge unnecessary architecture.
4. Inspect the most relevant files directly and reconcile agent disagreements.
5. Produce findings grouped by:
   - current correctness or data-loss risk;
   - boundary and ownership ambiguity;
   - testability/observability gap;
   - longitudinal maintainability risk;
   - roadmap opportunity.
6. For each finding include repository evidence, likely consequence, confidence, and a bounded intervention.
7. Recommend exactly one next vertical slice and explain:
   - why it is higher value than alternatives;
   - what it deliberately excludes;
   - how success would be verified;
   - what later work it enables.

Do not rank findings by code size or roadmap glamour. Prefer a small boundary that removes ambiguity and enables future evidence.

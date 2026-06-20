# Zenith Architecture Boundaries

Use this as a compact operational interpretation of `docs/ultimate-architecture-roadmap.md`. The roadmap remains authoritative.

## Browser workstation

Owns interactive and hardware/browser-specific work:

- WebGPU and projection rendering;
- WebCodecs and local export;
- canvas, DOM, object URLs, Blob/File handles;
- local media loading and preview;
- per-open-project workbench state;
- UI presentation and user interaction.

Browser modules may call local SvelteKit endpoints. They must not contain secrets or upstream paid-service clients.

## Shared contracts

`src/lib/shared` owns portable data contracts only:

- JSON-safe types;
- Zod schemas at external or persistence boundaries;
- stable IDs and discriminated unions;
- versioned snapshot, API, job, event, and error shapes;
- pure conversion helpers only when they have no runtime side effects.

Shared modules must not import Svelte stores, DOM/browser handles, Node APIs, filesystem code, server clients, or paid-service SDKs.

## Routes

`src/routes` owns SvelteKit routing and transport adaptation:

- parse route params;
- validate boundary input through shared schemas/helpers;
- call a server service;
- return JSON, NDJSON, SSE, or file responses;
- propagate cancellation and normalized errors.

Routes should not own Runway/Codex orchestration, project mutation, or large domain decisions.

## Server services

`src/lib/server` owns:

- secrets and environment configuration;
- Runway and Codex SDK calls;
- filesystem or future database access;
- paid-effect orchestration;
- request/job/asset services;
- server-side validation and error normalization.

Server code must not import browser workbench state or browser-only media objects.

## Workbench/application domain

`src/app` currently owns much of the browser workbench. Move toward:

- explicit per-project state ownership;
- focused project persistence;
- focused operator commands;
- clear artifact mutation;
- thin Svelte components.

Do not replace explicit product commands with a generic workflow framework.

## Migration discipline

- Phase 1: contracts and project snapshot boundary.
- Phase 2: split commands and thin UI.
- Phase 3: first-class in-memory jobs.
- Phase 4: asset abstraction.
- Phase 5: durable persistence.
- Phase 6: production operations.
- Phase 7: collaboration only if needed.

Do not import concepts from a later phase merely because they exist in the end-state model.

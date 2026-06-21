# Zenith Interface Rework Capability Spec

Status: historical/speculative product memo, not a current architecture source of truth
Date: 2026-06-09
Current status updated: 2026-06-20

This memo preserves product and interface guidance from an earlier Svelte 5 reimplementation draft. It no longer describes the current tracked implementation. Use `docs/sveltekit-architecture.md` for current code ownership and `docs/ultimate-architecture-roadmap.md` for migration order.

The original draft mixed future-facing interface direction with obsolete current-code facts. This retained version keeps the future product guidance and removes stale claims about old entry files, workspace persistence paths, and controller modules.

## Thesis

Zenith is not a generic media editor. It is a fulldome artifact workbench: a place to move one dome image through spatial composition, repair, depth, 2.5D motion, video-model handoff, review, and export.

The interface should expose the pipeline as artifact lineage:

- what exists;
- where it came from;
- what can be done next;
- what projection assumptions and QC risks are attached to it;
- what can be exported, promoted, or compared.

## Instrument Brief

### Instrument name

Fulldome Lineage Bench.

### Primary research act

Move a domemaster artifact through spatial repair, depth, motion, and video generation while preserving projection assumptions and provenance.

### Central surface

An artifact lineage board.

This should not be a generic node graph. It is a staged board where each artifact has:

- source thumbnail or preview;
- provenance;
- readiness;
- QC status;
- available next transitions;
- attached prompt or recipe;
- export and promote actions.

### Interaction grammar

Objects:

- source;
- plate;
- placement;
- sketch;
- handoff;
- inpaint result;
- depth map;
- motion recipe;
- motion guide;
- endpoint;
- prompt plan;
- generated video;
- delivery export;
- project snapshot.

Gestures:

- load;
- select;
- promote;
- compare;
- inspect;
- edit recipe;
- render preview;
- generate;
- reconstruct;
- export;
- fork version;
- restore.

Feedback:

- live dome viewport;
- thumbnail;
- prompt freshness;
- QC badge;
- operation progress;
- stale-state warning;
- artifact provenance;
- export manifest/status.

## Screen States

### Empty

- Default procedural or imported source is visible.
- Board shows the source node and possible first actions.

### Plate Composition

- Plate tray is visible.
- Viewport direct manipulation is active.
- Selected placement inspector is open.
- Sketch node shows dirty or committed state.

### Inpaint Running

- Handoff node is locked.
- Progress is attached to the inpaint job or artifact.
- Previous source remains visible.

### Depth Ready

- Depth node is visible.
- Motion recipe is enabled.
- Depth prompt and metadata are inspectable.

### Motion Preview

- Viewport can switch to local GPU preview without losing source identity.
- Motion QC is visible.

### Endpoint Reconstruction

- Source, raw endpoint, handoff, and reconstructed endpoint can be compared.

### Prompt Planning

- Prompt variants are visible.
- Selected prompt is editable.
- Warnings are visible near QC and provenance.

### Generated Video

- Video shelf is visible.
- Promote and export actions are visible.
- Provenance is retained when media is promoted.

### Delivery

- Delivery exports are grouped with manifests and settings.

### Failure

- Error state belongs to the artifact or job that failed.
- Stale operation results must not silently mutate the current artifact.

## Target Layout

Primary viewport:

- large central/right dome viewport;
- mode strip for dome, flat, split, CAVE, and endpoint compare views.

Left rail:

- artifact lineage board;
- compact pipeline nodes instead of settings forms;
- source -> sketch -> inpaint -> depth -> motion -> endpoint -> video/export.

Right inspector:

- controls for only the selected artifact or recipe;
- one focused action group at a time;
- prompts visible where prompts matter.

Bottom strip:

- job queue;
- media transport when the current source is video;
- result shelf for the current selected lane.

Top bar:

- projection profile;
- project/snapshot state;
- Runway status;
- export/import project.

## Component Responsibilities

### App Shell

Owns layout only. No pipeline logic.

### Workbench State

Owns reactive artifact, selection, prompt, configuration, QC, and readiness state. It should not own DOM access or paid upstream calls.

### Dome Viewport

Owns canvas refs and renderer lifecycle. It receives state snapshots and command callbacks.

### Artifact Board

Shows lineage, readiness, stale flags, and available transitions.

### Inspector Panel

Switches by selected artifact type. It should not run API calls directly.

### Command And Service Modules

Own imperative actions with explicit inputs and outputs:

- load source;
- commit plate sketch;
- run inpaint;
- generate depth;
- render motion preview;
- export motion guide;
- capture endpoint;
- reconstruct endpoint;
- plan prompt;
- generate video;
- export delivery material;
- save or load project.

Each command should return or apply one of:

- a new artifact;
- an artifact patch;
- a job record;
- an exported blob;
- a portable project snapshot.

## Svelte Implementation Guidance

Use SvelteKit as the app framework, with SvelteKit server routes owning Runway/Codex integration.

State rules:

- Use reactive state for mutable artifact and workbench state.
- Use derived values for readiness, profile labels, artifact freshness, and capability availability.
- Use effects only for imperative boundaries such as renderer lifecycle, video frame loops, autosave scheduling, or browser event registration.
- Do not use effects to synchronize two pieces of app state when an action handler or derived value is clearer.
- Keep large binary, canvas, GPU, Blob/File, and object URL resources outside portable contracts.

Keep:

- projection math;
- fisheye/CAVE geometry;
- WebGPU/WebCodecs rendering and media helpers;
- local SvelteKit Runway/Codex routes;
- prompt packs;
- fulldome profile and QC logic;
- portable project snapshot concepts.

Adapt:

- domain controllers into command services with explicit inputs and outputs;
- renderer integration into imperative Svelte adapters;
- operation progress into first-class job or artifact state where appropriate.

Do not introduce this memo's interface ideas by bypassing the current roadmap boundaries. UI redesign does not justify moving browser media work to the server, adding storage early, or centralizing paid effects in browser code.

## Acceptance Tests For A Future Interface Rewrite

P0:

- app boots with a default or imported source;
- projection mode can switch between supported modes;
- viewport renders the source;
- source image upload works;
- plate sketch can be committed;
- inpaint prompt is visible and projection-specific;
- Save Project and Load Project still round trip supported portable state;
- missing Runway key state is handled without crashing.

P1:

- inpaint runs through the existing server endpoint;
- generated image can be promoted to Start State;
- depth generation works through the approved paid boundary for that phase;
- local depth-motion preview works;
- motion proxy/export works;
- motion config export contains fulldome profile and QC-relevant settings;
- endpoint capture and reconstruction artifacts are visible.

P2:

- Codex prompt planning works for motion-guide and state/image workflows;
- generated videos appear in a result shelf and can be promoted/exported;
- delivery exports show coverage or manifest state.

P3:

- keyboard and transport interactions remain intentional;
- debug/demo tooling is either retained deliberately or moved out of the production flow;
- desktop and mobile screenshots show no overlapping text, clipped controls, or incoherent layout shifts.

## Migration Plan

### Phase 0: Contract Freeze

- Preserve current architecture docs.
- Define artifact, command, and renderer adapter boundaries.
- Do not implement visual redesign yet.

### Phase 1: Shell And Viewport

- Introduce the layout shell.
- Render the current viewport through an adapter.
- Preserve server routes and paid-call boundaries.

### Phase 2: Source And Review Lanes

- Source upload.
- Projection selector.
- View mode strip.
- Media transport.
- Profile/QC/status bar.

### Phase 3: Plate And Inpaint Lanes

- Plate tray.
- Direct placement edit.
- Committed sketch artifact.
- Inpaint handoff preview.
- Runway image result shelf.

### Phase 4: Depth And Motion Lanes

- Depth artifact.
- Motion recipe inspector.
- Local WebGPU preview.
- MP4 export.
- Config/prompt export.
- Endpoint capture, handoff, and reconstruction.

### Phase 5: Prompt And Video Lanes

- Prompt workbench.
- Codex planning.
- Video generation.
- Video result shelf.

### Phase 6: Delivery And Persistence

- Project snapshot UI.
- Delivery export lane.
- Import/export full portable state.
- Future durable persistence only when the roadmap phase permits it.

## Explicit Non-Goals

- Do not redesign projection math.
- Do not replace the WebGPU/WebCodecs engine as part of an interface-only slice.
- Do not replace Runway/Codex server routes without a roadmap-backed boundary slice.
- Do not add DINO or dual-RGBD bridge work during a basic UI migration.
- Do not invent a generic node graph unless graph semantics become real.
- Do not hide prompts.
- Do not make the first screen a marketing page.
- Do not add database, queue, worker, asset store, auth, or collaboration features merely to support a UI memo.

## Open Questions

1. Should a future interface rewrite be a hard cut or run in parallel behind a route or feature flag?
2. Should prompt plans become first-class project artifacts?
3. Should capture/demo tooling survive in the production interface or move to a debug drawer?
4. Should CAVE room dimensions become editable profiles before or after interface migration?
5. Should RGBD expansion become a primary lane or remain a lab until its paid and job boundaries are clearer?

## Recommendation

Start with a parallel shell only if the current artifact workbench becomes harder to evolve than the rewrite risk. The first milestone should not be "all current controls ported." It should be:

1. artifact board exists;
2. viewport renders;
3. source/projection/review are functional;
4. state ownership is explicit;
5. operations are command services with explicit artifact outputs.

Only after that should plate, inpaint, depth, video, and export lanes be migrated one at a time.

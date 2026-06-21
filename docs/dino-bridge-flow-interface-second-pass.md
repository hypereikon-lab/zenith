# DINO Bridge and Interface Restructure: Second Pass

Date: 2026-06-09
Status: brutally honest design memo

Current status: historical/speculative product memo, not a current architecture source of truth. Some interface labels and implementation assumptions predate the current artifact workbench, shared-contract boundary, and in-memory depth job boundary. Use `docs/sveltekit-architecture.md` for current implementation facts and `docs/ultimate-architecture-roadmap.md` for migration order.

## Executive Take

The DINO idea is good, but only if it is treated as a correspondence and confidence layer, not as the engine.

Do not build "DINO mode" as another button in the current interface. The current interface is already overloaded. The right product shape is an endpoint bridge lane that compares two completed domemaster states, computes feature anchors, normalizes depth, renders a dual RGBD bridge, then outputs guide material for video generation.

If this becomes just another stack of sliders under "Ship", it will fail.

## What DINO Should Do

Use DINO/DINOv2/DINOv3-style dense visual features for:

- semantic correspondence between the first and final states
- anchor confidence
- mismatch detection
- depth normalization support
- occlusion/smear detection
- guide-frame confidence maps

Do not use it for:

- direct depth generation
- camera motion planning by itself
- final rendering by itself
- replacing the current 2.5D camera/depth engine
- solving repeated floral/ring correspondences globally without geometric constraints

The current 2.5D engine already knows the dome projection and the camera-like move. DINO does not. DINO should refine and constrain the bridge, not replace the geometry.

## Current Model Reality

DINOv2 remains a valid backbone class for this idea. It produces strong image and patch-level features without task-specific fine tuning. Meta's DINOv2 paper and repo frame it as a general visual feature backbone usable across classification and pixel-level tasks.

However, this is 2026. DINOv3 exists and Meta describes it as producing stronger dense features across diverse vision tasks. The interface should not hardcode "DINOv2" as the product concept. It should expose a generic dense feature backbone slot:

- default: DINOv2 if easiest to run locally
- preferred experimental backend: DINOv3 if access, license, runtime, and model weight size are practical
- fallback: no feature anchors, geometry-only bridge

Sources:

- DINOv2 paper: https://arxiv.org/abs/2304.07193
- DINOv2 official repo: https://github.com/facebookresearch/dinov2
- Meta DINOv2 announcement: https://ai.meta.com/blog/dino-v2-computer-vision-self-supervised-learning/
- DINOv3 Meta page: https://ai.meta.com/research/dinov3/
- DINOv3 publication page: https://ai.meta.com/research/publications/dinov3/
- DINOv3 official repo: https://github.com/facebookresearch/dinov3

## Proposed Algorithm: Feature-Anchored Dual RGBD Bridge

Inputs:

- first completed domemaster `I0`
- first depth map `D0`
- final reconstructed domemaster `I1`
- final depth map `D1`
- current fulldome profile
- current 2.5D motion recipe

Outputs:

- normalized depth pair
- feature anchor map
- confidence map
- forward RGBD render `I0 -> t`
- backward RGBD render `I1 -> 1-t`
- blended bridge frames
- guide MP4
- debug atlas exports

### 1. Normalize Projection Space

Do not run dense matching directly on raw fisheye pixels as the only representation.

Make feature atlases:

- cube faces or tangent-plane patches sampled from the domemaster
- optional low-res equirectangular feature atlas for broad matching
- dome mask retained
- cardinal directions and zenith/nadir orientation retained

Reason:

Raw fisheye space overweights the center and compresses the rim. DINO patch features on distorted fisheye pixels can learn the wrong proximity. Feature extraction should happen in projection-aware patches.

### 2. Normalize Depth Pair

Use Gemini or existing depth outputs, but do not trust their absolute scale.

Normalize `D0` and `D1` using:

- dome mask only
- sky/central-smooth regions as far priors when applicable
- foreground rim botanical content as near-ish priors when supported
- robust percentiles, not min/max
- DINO anchor pairs to align relative depth at matched semantic regions
- monotonic remap from `D1` into `D0`'s effective depth range

Export:

- `D0_norm`
- `D1_norm`
- depth confidence
- rejected/deweighted depth zones

Brutal truth:

Without this step, dual-endpoint motion will shimmer or collapse. Two pretty depth maps from Gemini are not enough. They need to agree as metric-ish fields.

### 3. Use Existing 2.5D Motion as a Prior

The current engine should produce:

- forward flow prior from `I0/D0`
- backward flow prior from `I1/D1`
- visibility/confidence from splat/gap fill
- endpoint footprint

Then DINO matching searches near that predicted footprint.

Do not do global nearest-neighbor matching across the whole dome. Floral domes have repeated petals, leaves, holographic rings, and circular symmetries. Global matching will confidently pair the wrong things.

### 4. Compute Feature Anchors

For each candidate anchor:

- sample DINO dense feature at source patch
- search within a local window around geometry-predicted endpoint
- require bidirectional/cycle consistency
- require angular distance bounds in spherical space
- require depth compatibility after normalization
- reject anchors on black outside mask
- downweight transparent/holographic overlays unless intentionally tracked

Anchor types:

- strong anchors: stable objects, leaves, stems, flower centers, distinct rings
- medium anchors: texture regions and cloud patterns
- weak anchors: sky gradients, glass blur, transparent overlays
- invalid anchors: outside mask, green handoff areas, reconstruction holes, debug marks

### 5. Render Dual RGBD Bridge

For frame `t`:

- render forward from `I0/D0_norm` to `t`
- render backward from `I1/D1_norm` to `1-t`
- use feature anchors to locally correct flow/placement
- blend by confidence:
  - early frames prefer forward render
  - late frames prefer backward render
  - occluded or low-confidence zones prefer the endpoint with stronger local support

The result is not expected to be final film output. It is high-value guide material:

- better Seedance video-to-video guide
- better first/last image context
- better debugging for depth/motion choices

### 6. Export Debug, Not Just Beauty

Required artifacts:

- bridge MP4
- feature anchor overlay
- depth normalization before/after
- flow prior overlay
- confidence heatmap
- occlusion/rejection mask
- endpoint comparison strip

If the user cannot see why the bridge worked or failed, the feature system will become another black box.

## Interface Restructure for DINO Bridge

The interface should add a new lane only after the Svelte rework foundation:

`Endpoint Bridge`

Its artifact order:

1. `First State`
2. `First Depth`
3. `Final State`
4. `Final Depth`
5. `Depth Pair Normalization`
6. `Feature Anchors`
7. `Dual RGBD Bridge`
8. `Seedance Handoff`

The central surface should be a comparison bench:

- left: first state
- right: final reconstructed state
- middle: bridge/feature/flow overlay
- bottom: timeline scrubber
- side inspector: selected artifact or selected anchor

Absolutely do not add this as:

- another hidden subsection under "Ship"
- a form full of DINO parameters
- a fake node graph
- a mode that silently changes depth or motion state

## Brutal Flow Critique

### Keep

- projection modes: zenith 180/230/270, nadir 180/270
- plate placement direct manipulation
- inpaint handoff/export
- GPT image reconstruction of final state as an experimental but useful artifact
- WebGPU 2.5D preview/export
- prompt packs and Codex planning
- Seedance workflows
- CAVE export
- workspace snapshots
- fulldome profile and QC

### Revise Hard

- "Create / Review / Ship" is too vague.
- "Ship" is a junk drawer.
- depth generation is hidden as a button before a huge motion settings grid.
- prompts are not consistently visible.
- final-state reconstruction prompt is still not first-class UI.
- result thumbnails are too small for decisions.
- current source vs temporary preview is too ambiguous.
- settings are mixed with artifacts.
- CAVE export is too important and too production-specific to sit beside generation experiments.
- demos/capture tools are mixed into production flow.

### Delete or Move

Move to developer/debug drawer:

- `Mock compose`
- `6s per view`
- `Before/after transition`
- probably `captureFrame` if `Square PNG` and recording remain

Delete from primary workflow:

- hidden Codex plan buttons. Either show prompt planning as a real prompt workbench, or remove the buttons entirely.
- "Use result" hidden button pattern. Promotion should be a visible action on every artifact card.
- long global readout blocks that repeat state already present in artifact cards.

Collapse by default:

- theater eye drop
- seat back
- shell shade
- floor opacity
- overlay opacity
- mesh quality
- guide noise
- gap fill
- output count if forced to 1

Expose prominently:

- projection profile
- source of truth
- active artifact
- generated prompt
- depth model/prompt
- motion QC
- endpoint freshness
- Runway key status
- export readiness

## New Flow Proposal

Replace the current tabs with:

1. `Source`
2. `Sketch`
3. `Repair`
4. `Depth`
5. `Motion`
6. `Bridge`
7. `Video`
8. `Deliver`

This sounds like more tabs, but it is less confusing because each tab maps to one artifact transition.

Better still: make these lanes in the artifact board, not page tabs.

### Source

Purpose:

- current source media
- projection profile
- source provenance
- upload/promote/restore

### Sketch

Purpose:

- plates
- placement
- committed sketch
- export handoff

### Repair

Purpose:

- inpaint handoff
- prompt
- Runway image result
- promote result

### Depth

Purpose:

- depth prompt
- generated depth map
- depth confidence and normalization later

### Motion

Purpose:

- 2.5D recipe
- GPU preview
- MP4 guide
- raw endpoint
- handoff PNG
- reconstruction

### Bridge

Purpose:

- first/final state pair
- final depth
- feature anchors
- dual RGBD bridge

This lane should initially be disabled/empty until the prerequisites exist.

### Video

Purpose:

- prompt workbench
- Seedance guide/state/image workflows
- result videos

### Deliver

Purpose:

- square PNG/MP4 capture
- CAVE ZIP
- workspace/package export
- production QC manifest

## Triage Table

| Idea                                 | Decision              | Why                                                                                                       |
| ------------------------------------ | --------------------- | --------------------------------------------------------------------------------------------------------- |
| Artifact lineage board               | Promote P0            | It matches the real system and fixes the current control-rail problem.                                    |
| Svelte 5 rewrite                     | Promote P0            | Current DOM/controller architecture is too tangled for the next research phase.                           |
| DINO feature anchors                 | Prototype P1/P2       | Valuable, but only after endpoint/depth artifacts are cleanly represented.                                |
| DINO as depth model                  | Defer / likely reject | Dedicated depth or Gemini depth plus normalization is more relevant; DINO features can support alignment. |
| Raw fisheye DINO matching            | Reject                | Projection distortion and repeated content will create false confidence.                                  |
| Spherical/cube/tangent feature atlas | Promote P1            | Necessary if dense features are going to be trustworthy.                                                  |
| Global feature matching              | Reject                | Repeated flowers/rings will break it. Use geometry-bounded search.                                        |
| Current 2.5D motion as prior         | Promote P0            | It knows dome projection and camera pose; DINO does not.                                                  |
| Endpoint Bridge lane                 | Promote P1            | Correct home for dual RGBD, feature anchors, confidence maps.                                             |
| Create/Review/Ship tabs              | Replace               | They are too vague and have caused the current junk-drawer layout.                                        |
| Hidden prompt planning               | Delete/restructure    | Prompt planning must be visible or it is not trustworthy.                                                 |
| Demo buttons in production flow      | Move to debug         | They pollute the real workflow.                                                                           |
| CAVE remap in Ship panel             | Move to Deliver       | It is delivery/export, not generation.                                                                    |
| Long motion settings grid            | Collapse/restructure  | It should be a recipe with preview/QC, not a spreadsheet of knobs.                                        |

## Minimal DINO Prototype Scope

Do not build the full bridge first.

Build this prototype:

1. Input: `I0`, `I1`, `D0`, `D1`, fulldome profile.
2. Generate low-res cube/tangent feature atlas for both images.
3. Compute sparse anchors with geometry-bounded search.
4. Show anchor overlay and confidence.
5. Export anchor JSON and debug PNG.

Acceptance:

- anchors avoid black outside mask
- anchors are stable under repeated petals/rings better than global nearest-neighbor
- each anchor has confidence, source point, target point, angular distance, depth compatibility
- user can visually reject/disable bad anchors

Only then build the dual RGBD bridge renderer.

## What This Means for the Svelte Rewrite

The Svelte rewrite should not include DINO implementation in Phase 1.

But it must reserve the correct artifact model:

```ts
type FeatureAnchorArtifact = {
  id: string;
  sourceStateId: string;
  targetStateId: string;
  backbone: "dinov2" | "dinov3" | "other";
  projectionSpace: "cube" | "tangent-atlas" | "equirect";
  anchors: FeatureAnchor[];
  confidenceMap?: CanvasRef;
  rejectedMask?: CanvasRef;
};

type BridgeArtifact = {
  id: string;
  firstStateId: string;
  finalStateId: string;
  firstDepthId: string;
  finalDepthId: string;
  anchorArtifactId?: string;
  guideVideo?: VideoRef;
  confidenceReport: BridgeConfidenceReport;
};
```

This is the key: design the interface so DINO is an artifact producer, not a magic hidden option.

## Final Recommendation

Sequence:

1. Finish Svelte artifact-board foundation.
2. Migrate source, projection, review.
3. Migrate repair/depth/motion as explicit artifacts.
4. Add endpoint comparison properly.
5. Add `Bridge` lane with depth pair normalization but no DINO.
6. Add DINO/DINOv3 feature anchors as a debug-first prototype.
7. Only after anchor overlays prove useful, build dual RGBD bridge export.

Brutal bottom line:

The current interface cannot safely absorb DINO. It will become a confusing power-user trap. The DINO idea should survive, but the current UI shell should not.

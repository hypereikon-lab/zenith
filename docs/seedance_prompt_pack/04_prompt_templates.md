# Prompt Assembly Grammar

Do not use fixed scene templates. Assemble prompts from functional clauses. Each clause has a job.

## Clause Order

1. `role_contract`: define what each reference controls.
2. `appearance_anchors`: state what Image1 must preserve.
3. `motion_transfer`: state what Video1 contributes.
4. `artifact_rejection`: name and reject guide failure modes.
5. `positive_reconstruction`: describe the desired physical state.
6. `secondary_motion`: add only scene-consistent local motion.
7. `geometry_locks`: preserve domemaster/frame constraints.
8. `priority_order`: resolve conflicts.

## Clause Patterns

### Role Contract

```text
Use the still image reference as the source of truth for appearance, composition, materials, lighting, color, and detail. Use the video reference only as a motion guide for timing, camera path, parallax direction, and broad rhythm.
```

### Appearance Anchors

```text
Preserve [identity], [layout anchors], [materials], [lighting/color], and [protected details].
```

### Motion Transfer

```text
Follow the guide's [duration], [camera path], [parallax direction], and [motion rhythm], while rebuilding the scene from the still image reference.
```

### Artifact Rejection

```text
Do not copy [failure modes] from the video reference. Treat those as guide artifacts, not style.
```

### Positive Reconstruction

```text
Reconstruct the motion as [object-stable / depth-separated / physically coherent] movement where [layer targets] remain spatially distinct and details stay locked to surfaces.
```

### Secondary Motion

```text
Add only natural motion already implied by the image: [material motion], [atmosphere/light motion], [small subject/environment response].
```

### Geometry Locks

```text
Preserve the square domemaster frame, circular fisheye projection, zenith/horizon orientation, and clean pitch-black exterior outside the projection circle when present.
```

### Priority Order

```text
Priority: still-image visual fidelity first, guide-video timing and parallax second, scene-consistent secondary motion third, artifact rejection always.
```

## Variant Deltas

Strict repair:

- lead with "the video reference is not the desired visual result"
- increase artifact rejection
- keep visual changes minimal

Conservative lock:

- lead with "keep the scene almost unchanged"
- reduce secondary motion
- avoid expansive camera wording

More volumetric:

- emphasize separated depth layers
- ask for stronger spatial reconstruction
- still preserve Image1 identity and layout

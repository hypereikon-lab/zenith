# Prompt Assembly Grammar

Assemble image-to-video prompts from clause functions. Do not use fixed scene templates.

## Clause Order

1. `source_contract`: Image1 controls appearance.
2. `stable_anchors`: preserve identity, layout, materials, lighting, geometry.
3. `motion_logic`: ambient, event, or material life.
4. `local_motion`: name three to five visible things that move.
5. `camera_permission`: one restrained camera/depth behavior.
6. `geometry_locks`: preserve dome/frame if present.
7. `negative_constraints`: prevent redesign and artifacts.
8. `priority_order`: resolve conflicts.

## Clause Patterns

### Source Contract

```text
Use the source image as the exact visual reference for scene identity, composition, materials, lighting, color, and detail.
```

### Stable Anchors

```text
Preserve [subject/layout], [material language], [lighting], [important silhouettes], and [geometry].
```

### Ambient Scene Motion

```text
Keep the scene almost unchanged while [atmosphere/light/material details] move gently within the existing composition.
```

### Scene Event

```text
Create one continuous shot where [one event] unfolds from visible scene content: [beat 1], [beat 2], [beat 3].
```

### Material Life

```text
Animate the visible materials in place: [material 1 + behavior], [material 2 + behavior], [material 3 + behavior].
```

### Camera Permission

```text
Use only [locked camera / slow push / slight pullback / lateral drift] to reveal depth; do not let camera motion dominate.
```

### Geometry Locks

```text
Preserve the square domemaster frame, circular fisheye projection, stable zenith/horizon orientation, and clean black exterior outside the projection circle when present.
```

### Negative Constraints

```text
No cuts, no new major objects, no scene redesign, no invented text, no rectangular crop, no border, no UI marks, no fast orbit or spin.
```

## Mode Deltas

Ambient scene motion:

- weakest global motion
- strongest fidelity lock
- motion comes from atmosphere, light, particles, and materials

Scene event:

- one clear event
- slow beats
- no unrelated new objects

Material life:

- no big story
- surfaces, reflections, particles, and tactile details animate locally
- camera almost locked

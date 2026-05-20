# Corpus Distillation: Language Mechanics

The corpus should not be copied for subjects, genres, or scene specifics. Its useful contribution is how strong prompts steer video models.

## Mechanics Found in Strong Prompts

### Ordered Situation

Strong prompts first establish what exists before asking for motion. They name subject, environment, material, light, and composition in an ordered way.

Function:

```text
Anchor the model before motion begins.
```

### Concrete Motion Verbs

Strong prompts use verbs tied to visible materials:

- light blooms, glints, flickers, travels
- particles drift, rise, gather, scatter
- water ripples, reflects, beads, flows
- cloth breathes, flutters, settles
- glass refracts, shimmers, catches highlights
- foliage sways, bends, rustles
- smoke curls, thins, reveals

Function:

```text
Make motion emerge from what is already visible.
```

### Single Continuity Frame

Strong prompts often lock continuity:

- one continuous shot
- no cuts
- no redesign
- preserve layout
- keep subject identity stable

Function:

```text
Prevent the model from solving motion by changing the scene.
```

### Camera Restraint

Camera verbs are useful but dangerous. Use one restrained camera behavior only when it supports image content:

- slow push
- slight pullback
- lateral drift
- tiny depth breathing
- almost locked camera

Function:

```text
Use camera motion as depth support, not as the main event.
```

### Style Compression

Style language works best after concrete scene and motion clauses. It should compress the observed image look, not import a new aesthetic.

Function:

```text
Preserve visual identity instead of decorating the prompt.
```

## Anti-Patterns

- generic cinematic adjectives without motion permissions
- unrelated story imported from examples
- fast orbit/spin/sweep as the only motion idea
- too many simultaneous events
- adding new major objects to create action
- style piles that contradict the image

# Style Rubric: Grounded Motion Language

This file is a language rubric, not a few-shot scene example.

## Good Image-to-Video Prompting

Good prompts:

- bind the source image as visual truth
- identify stable anchors before motion
- choose one motion logic
- use material-specific verbs
- limit camera permission
- forbid redesign and invented content
- preserve frame/dome geometry

## Weak Prompting

Weak prompts:

- rely on "cinematic" without motion content
- use fast orbit/spin/sweep as the whole idea
- add unrelated story or objects
- list too many simultaneous events
- ignore materials and atmosphere
- forget what must remain stable

## Useful Sentence Functions

Anchor:

```text
Use the source image as the exact visual reference for [identity], [layout], [materials], [lighting], and [detail].
```

Permission:

```text
Allow [visible element] to [specific verb] while [stable anchor] remains unchanged.
```

Continuity:

```text
Create one continuous shot with no cuts or scene redesign.
```

Camera restraint:

```text
Use only a restrained [camera behavior] to support depth; do not let camera motion dominate.
```

Geometry:

```text
Preserve [frame/projection/mask] exactly when present.
```

Priority:

```text
Priority: source image fidelity first, local scene motion second, camera motion third.
```

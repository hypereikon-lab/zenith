# Style Rubric: Direct Production Language

Use this as a style guide, not as a scene example.

## Good Prompt Language

Good Seedance steering is:

- explicit about reference roles
- concrete about visible anchors
- narrow about motion permissions
- positive about the desired physical result
- decisive about artifacts and conflict priority

## Bad Prompt Language

Avoid:

- long style piles unrelated to Image1
- generic cinematic language with no motion plan
- asking to preserve both references equally
- "make it immersive" without saying what moves
- "fix artifacts" without naming the artifact and replacement
- fast camera moves as a substitute for scene motion

## Sentence Shapes That Work

Role sentence:

```text
Use the still image reference for appearance and the video reference only for motion.
```

Anchor sentence:

```text
Preserve [visible subject], [layout], [materials], [lighting], and [geometry].
```

Motion sentence:

```text
Follow the guide's [camera path] and [parallax direction] over [duration].
```

Repair sentence:

```text
Do not copy [artifact]; reconstruct it as [positive physical target].
```

Priority sentence:

```text
When references conflict, still-image fidelity wins over video appearance, while video timing and parallax guide the motion.
```

The best prompts combine these sentence functions with image-specific nouns and material verbs.

# Method: Artifact Inversion

The 2.5D guide is useful because it contains motion. It is dangerous because it also contains visual failure. The compiler must turn observed or likely failure into explicit repair language.

## Pattern

For each failure:

1. Name the defect plainly.
2. Say it is an artifact of the guide, not a desired look.
3. State the positive replacement in spatial/material terms.

Template:

```text
Do not copy [defect] from the video reference. Treat it as a guide artifact. Reconstruct [positive target].
```

## Failure-to-Target Map

| Defect | Positive replacement |
|---|---|
| rubber-sheet warping | object-stable motion with forms retaining shape |
| texture swimming | details locked to their surfaces |
| foreground/background bleeding | separate foreground, midground, and background layers |
| black tearing gaps | continuous filled scene edges with clean black outside-circle mask |
| flat cutout sliding | physically coherent parallax and volumetric depth |
| transparency tearing | stable transparent edges and continuous refraction |
| smeared fine detail | crisp material fidelity from Image1 |
| warped distant sky/background | distant layers remain stable and spatially behind foreground |
| over-redesign | original layout, object count, and scene identity stay fixed |
| too little motion | follow the guide's broad timing/path more strongly while preserving appearance |

## Positive Target Vocabulary

Use terms that describe the desired physical state:

- object-stable
- depth-separated
- physically coherent
- detail locked to surfaces
- stable distant background
- clean transparent edges
- continuous material identity
- single continuous shot
- source-image fidelity

## Mode Selection

`strict_repair`: Use when guide artifacts are likely to contaminate the result. Emphasize that Video1 is not the visual target.

`conservative_lock`: Use when the model tends to redesign. Emphasize almost unchanged Image1 with minimal depth-aware motion.

`more_volumetric`: Use when the result stays too flat. Emphasize separate stable depth layers and physically coherent parallax.

The modes change steering emphasis. They must not change the scene identity.

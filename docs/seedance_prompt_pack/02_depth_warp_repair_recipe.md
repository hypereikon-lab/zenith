# Recipe: 2.5D depth-warp motion-plate repair

Use this recipe when the input video was created by separating layers, applying a depth map, warping the image, or brute-forcing parallax from a still image.

## Problem definition

The video is not a clean visual target. It is a rough motion plate. Common artifacts:

- rubber-sheet warping
- texture swimming
- depth-map smearing
- transparency tearing
- black gaps or holes from warped edges
- foreground/background bleeding
- flat cutout sliding
- object details stretching or melting
- sky or background attached to foreground objects
- fisheye/dome distortion amplified into a glass-marble look

## Desired repair

The final animation should look like the original image has been animated naturally in real space, while borrowing the video’s timing and movement.

The compiler should produce language like:

```text
The input video is not the desired visual result. It is only a rough motion guide.
Use Image1 to rebuild the final scene.
Use Video1 only for motion: timing, camera drift, parallax direction, and overall movement rhythm.
Do not copy the visual defects from Video1.
```

## Artifact-to-repair mapping

| Observed artifact | Prompt repair language |
|---|---|
| Rubber-sheet stretching | `No rubbery stretching. The scene should not bend like a flat printed sheet.` |
| Texture swimming | `Textures and fine details stay locked to their objects.` |
| Transparency tearing | `Transparent edges remain clean, continuous, and physically stable.` |
| Black gaps | `No black tearing gaps or exposed warped edges.` |
| Foreground/background bleeding | `Foreground, midground, and background remain separate stable depth layers.` |
| Flat cutout sliding | `No flat layer sliding. Use object-stable parallax and volumetric depth.` |
| Smeared detail | `Preserve crisp detail and material fidelity from Image1 throughout motion.` |
| Warped sky | `The sky remains a distant stable background and does not smear into foreground objects.` |
| Over-creative redesign | `Do not redesign the scene, add major objects, or change composition.` |
| Too little motion | `Follow Video1’s broad camera path, timing, and parallax direction more closely.` |

## Prompt modes

### Strict repair

Use when Seedance copies the bad video look.

Key phrase:

```text
The input video is not the desired visual result. It is only a rough motion guide.
```

### Conservative lock

Use when Seedance redesigns the image too much.

Key phrase:

```text
Keep the scene almost unchanged from Image1. Only add subtle depth-aware motion following Video1.
```

### More volumetric

Use when Seedance remains too flat.

Key phrase:

```text
Reconstruct the scene as a physically coherent volumetric environment with separate stable layers in depth.
```

### Timed repair

Use when the video has a clear duration and motion progression.

Key phrase:

```text
Create a single continuous [duration]-second shot with no cuts.
```

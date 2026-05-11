# Feedback repair rules

Use these rules after a failed output.

## Failure: output still copies warped/smeared video

Add this block near the top:

```text
The visual content of Video1 is corrupted and must not be reproduced. Only the motion timing and camera/parallax path should be transferred. Treat every smear, stretch, black gap, and warped detail in Video1 as an error to remove.
```

Use `strict_repair` mode.

## Failure: output changes the image too much

Add:

```text
Keep the scene almost unchanged from Image1. Preserve all major objects, their relative positions, composition, color palette, lighting, and material identity. Only add subtle motion and depth-aware parallax. Do not redesign the scene or add new major elements.
```

Use `conservative_lock` mode.

## Failure: output is too static / ignores the video motion

Add:

```text
Follow Video1's motion more closely for timing, camera drift, parallax direction, acceleration, and ending position. Keep the same broad movement rhythm while still rebuilding the visuals from Image1.
```

## Failure: transparent objects tear, smear, or morph

Add:

```text
Transparent objects must retain continuous geometry and clean refractive edges. Glass, bubbles, liquid, hair, lace, filigree, or thin structures must not tear, melt, smear, or merge with the background.
```

## Failure: fine details become mushy

Add:

```text
Preserve high-frequency detail from Image1 throughout the entire clip. Fine textures remain crisp and anchored to their objects. No over-smoothing, low-detail simplification, or blurry texture collapse.
```

## Failure: background moves like it is glued to foreground

Add:

```text
The background remains a distant stable layer. It should not warp with foreground objects, attach to them, or smear across them. Foreground, midground, and background must move with separate depth behavior.
```

## Failure: model makes it too cinematic / changes style

Add:

```text
Do not reinterpret the style. Keep Image1's exact visual language and rendering quality. Do not convert it into a different genre, medium, color grade, or art style.
```

## Failure: model needs stronger physical reconstruction

Add:

```text
Rebuild the scene as a physically coherent volumetric environment instead of editing the damaged plate. The final video should feel like a clean reshoot of Image1 in motion, not like a repair applied to Video1 pixels.
```

# Seedance prompt patterns distilled from the example corpus

The example prompt corpus works because the prompts are concrete, explicit, and role-separated. The most useful patterns are below.

## 1. Reference role assignment

Good pattern:

```text
Use Image1 as the source of truth for appearance, scene identity, materials, lighting, and composition.
Use Video1 only for timing, camera movement, parallax, motion rhythm, and broad movement paths.
```

Avoid:

```text
Preserve the video exactly and apply the image style.
```

The avoid version preserves the broken depth-warp artifacts.

## 2. Concrete scene description

Do not say only “make it realistic.” Say what realism means for this image:

```text
realistic translucent glass-like botanical structures, pale flowers, mossy rim, bright central sun, soft cloudy sky, crisp refraction, delicate material detail
```

The compiler should extract material-specific phrases from the image.

## 3. Explicit problem naming

For 2.5D motion plates, name the defects:

```text
Do not copy rubber-sheet warping, texture swimming, smeared transparent edges, foreground-background bleeding, black tearing gaps, flattened cutout motion, or stretched details.
```

This works better than generic “avoid artifacts.”

## 4. Object-stable repair language

Use this language to oppose texture swimming and depth-map smears:

```text
The objects should remain stable, crisp, detailed, and physically separated in depth.
Textures should stay locked to their objects.
The distant background should remain distant and stable.
```

## 5. Shot and timing structure

If the clip has a fixed duration, time-coded prompts are often strong:

```text
00:00-00:02: begin close to Image1, start the same slow drift as Video1.
00:02-00:04: continue the camera motion while preserving object-stable depth.
00:04-00:06: complete the motion path without smearing or visual collapse.
```

Use this when the motion has clear phases.

## 6. Static versus active elements

Call out what should remain stable and what should move:

```text
The sky remains a distant stable background. Foreground flowers, glass structures, bubbles, and liquid highlights move subtly with depth-aware parallax.
```

## 7. Priority order

When references conflict, add:

```text
Priority order: Image1 visual quality and scene identity first, Video1 timing and camera motion second, subtle natural animation third. Do not preserve visual defects from Video1.
```

This is one of the strongest patterns for this workflow.

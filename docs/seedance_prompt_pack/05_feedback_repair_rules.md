# Feedback Repair Rules

When a generated video fails, revise the prompt by changing the steering function, not by adding more decorative detail.

## If It Copies the Broken Guide

Problem: Seedance preserves warp, smears, gaps, or flattened 2.5D look.

Revision:

- make Video1 explicitly non-visual
- move artifact rejection earlier
- add positive object-stability targets
- choose `strict_repair`

## If It Redesigns the Scene

Problem: new objects, new layout, changed identity, changed style.

Revision:

- strengthen Image1 contract
- list protected anchors
- reduce secondary motion
- choose `conservative_lock`

## If It Is Too Static

Problem: no meaningful motion.

Revision:

- describe the guide motion more specifically
- add one clear motion path
- add two or three material/local motions
- avoid vague "animate naturally"

## If It Is Too Flat

Problem: weak depth or cardboard layers.

Revision:

- choose `more_volumetric`
- specify foreground/midground/background separation
- ask for object-stable parallax, not flat sliding

## If It Breaks Dome Geometry

Problem: rectangular crop, border, mask loss, changed fisheye.

Revision:

- move geometry locks near the end and priority order
- say black outside-circle region remains clean
- say no rectangular reframing, letterboxing, UI marks, or border

## If Prompt Gets Too Long

Cut in this order:

1. style adjectives not visible in Image1
2. redundant negative terms
3. extra secondary motion
4. time coding

Keep:

1. reference roles
2. appearance anchors
3. motion transfer
4. artifact inversion
5. priority order

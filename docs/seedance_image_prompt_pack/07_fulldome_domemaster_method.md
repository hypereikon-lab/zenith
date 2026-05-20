# Fulldome Domemaster Method

Use this method when Image1 is a square circular fisheye, dome, planetarium, or fulldome frame.

The prompt must preserve two things at once:

- projection identity: square frame, circular fisheye, zenith orientation, black exterior mask
- attention topology: where the useful visual information lives inside the circle

## Read The Dome

Before writing motion, classify the image:

- dense rim, sparse center: flowers, architecture, horizon, people, or world detail lives near the edge; center is sky or negative space
- active center: clouds, light, object, portal, star field, or aperture already gives the center something to do
- ring/path image: holograms, branches, circular marks, constellations, horizon lines, or cables create a visible path
- material dome: glass, water, particles, plants, smoke, interface light, or reflections are the main subjects

## Choose Motion By Topology

Dense rim, sparse center:

```text
Use a locked-off camera. Make the visible event travel around the rim, through existing rings, or across local materials. Do not push toward the empty center.
```

Active center:

```text
Let the center change visibly, then send that motion outward: clouds part, light blooms, particles appear, or a glow travels into the surrounding dome.
```

Ring/path image:

```text
Make the motion follow the visible path: a scan wave, pulse, particle current, shimmer, or light ripple moves through existing rings and radial marks.
```

Material dome:

```text
Keep the camera nearly fixed while glass refracts, petals flex, particles drift, highlights travel, and light pulses in place.
```

## Camera Policy

Good camera language:

```text
Use a locked-off camera with gentle depth breathing.
Use a rim-anchored micro drift that keeps the circular composition centered.
Keep the camera nearly fixed while the visible event moves through the dome.
Use a slight pullback if it preserves more of the circular rim.
```

Avoid:

```text
slow inward push toward the sky
push into the center to reveal depth
fast orbit
spin
rollercoaster move
camera-only animation
```

## Prompt Shape

Use this shape for most fulldome image-to-video prompts:

```text
Use Image1 as the visual base. In the circular fulldome [scene], [one visible event/path] moves through [existing rim/rings/materials]. [Three local details] [move with concrete verbs]. Use a locked-off camera or rim-anchored micro drift that keeps the circular composition centered. Preserve the square domemaster frame, circular fisheye projection, stable zenith orientation, original layout, and black exterior outside the projection circle. No cuts, no new major objects, no readable text, no rectangular crop, no style drift.
```

## Why Holographic Scan Works

The holographic scan prompt is strong because it gives Seedance a visible path to animate. It does not ask the camera to invent motion. The scan wave travels through rings already present in Image1, tiny particles follow the path, local glass and flowers shimmer only as support, and the camera stays locked.

That is the general recipe: motion should be anchored to a visible affordance, not to an abstract desire for depth.

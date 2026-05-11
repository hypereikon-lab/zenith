# Recipe: still image to living scene

This workflow is not about spinning the domemaster, orbiting fast, or making a generic camera move. It is about reading the image and proposing what could actually happen inside that scene.

## Step 1: Read the scene

Create a `SceneCard`:

- subject(s), environment, and implied mood
- foreground, midground, and background
- visible materials that can move or change
- atmosphere, lighting, particles, fluids, plants, cloth, glass, reflections, shadows, clouds, creatures, or mechanisms
- small story/event affordances already implied by the image
- geometry locks for domemaster images

## Step 2: Choose a content mode

### ambient_scene_motion

Use when the image is already strong and should remain mostly intact.

- no major story turn
- local details come alive slowly
- light, atmosphere, particles, reflections, water, foliage, or translucent materials move
- camera motion is almost locked, with only a tiny drift if useful

### scene_event

Use when the image implies that something could happen.

- one clear event unfolds over the shot
- examples: flowers open, bubbles rise, mist parts, a light source blooms, creatures glide through the dome, glass structures pulse, water ripples outward, clouds reveal a sun, particles gather around a subject
- the event must come from visible scene content
- no new major unrelated objects, no cuts, no redesign

### material_life

Use when the image is rich in surfaces and textures.

- focus on detailed material behavior rather than camera movement
- examples: refractive glass shimmer, dew sliding, leaves swaying, pollen drifting, reflections traveling across curved surfaces, liquid tendrils moving, cloth breathing, sparks fading, fog curling
- motion should be slow, tactile, and local
- camera stays restrained so details remain readable

## Step 3: Build the prompt

Write 4 to 6 compact paragraphs:

1. Scene identity and source fidelity.
2. The main scene event or local happening.
3. Detailed material/subject/environment motion.
4. Minimal camera/depth behavior.
5. Fulldome/domemaster locks if applicable.
6. Negative constraints and priority order.

## Dome-specific locks

When the image is square with circular fisheye/domemaster composition:

- preserve the square domemaster frame
- preserve the circular fisheye projection
- keep the zenith/horizon orientation stable
- keep the outside of the circular projection pure black
- do not add a rectangular border, crop, letterbox, or UI marks
- do not turn the dome into a conventional rectangular landscape shot

## Motion strength

Strong still-image motion prompt:

- one concrete thing happens
- three to five visible details move
- camera motion is restrained and supports the event
- material identity and scene layout remain stable

Weak still-image motion prompt:

- "animate this cinematically"
- only global camera orbit/spin
- no named materials or local details
- too many unrelated actions
- scene redesign disguised as motion

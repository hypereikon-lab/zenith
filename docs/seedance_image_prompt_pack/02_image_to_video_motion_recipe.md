# Method: Motion Affordance Extraction

Still-image prompts fail when motion is generic. They work when motion is derived from visible affordances.

## Step 1: Identify Stable Anchors

Stable anchors are the image facts that must not drift:

- main subject identity
- composition and camera view
- object count and relative placement
- material identity
- light direction and color palette
- important silhouettes
- text or graphic marks, if they must remain readable
- domemaster/fisheye/black exterior geometry

## Step 2: Identify Motion Affordances

Affordances are visible things that can move without becoming new content:

- atmosphere: fog, haze, dust, smoke, mist
- fluids: water, liquid, bubbles, rain, dew
- light: glow, reflections, shadows, rays, flicker
- organic matter: leaves, petals, flowers, hair, fabric, creatures
- surfaces: glass, metal, plastic, paper, cloth, stone
- environment: clouds, particles, drifting debris

## Step 3: Choose Motion Logic

`ambient_scene_motion`: almost no story. The image breathes through light, atmosphere, particles, and subtle material motion.

`scene_event`: one visible event unfolds from image content. The event must be small enough not to redesign the scene.

`material_life`: surfaces and details animate locally. Best for abstract, botanical, glossy, textured, or atmospheric images.

## Step 4: Compose Motion Permissions

Each prompt should include:

- one primary motion idea
- three to five local motion details
- one camera/depth behavior at most
- explicit locks for composition and identity
- negative constraints against redesign

## Step 5: Regulate Motion Strength

If image fidelity matters most, use ambient motion and almost locked camera.

If the image implies an event, use scene event with slow beats.

If the image is material-rich but subject-poor, use material life.

Do not use camera-only animation as a substitute for reading the image.

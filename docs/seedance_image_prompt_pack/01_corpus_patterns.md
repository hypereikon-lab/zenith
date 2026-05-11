# Distilled Seedance 2 patterns from curated prompts

The raw corpus shows that strong Seedance prompts usually do not rely on abstract style labels alone. They give the model an ordered visual situation, a concrete action or event, material motion, and explicit constraints. For Zenith image-to-video, camera verbs are secondary; they should support scene content, not replace it.

## Useful structures

### Single continuous take

Best for Zenith image-to-video. It preserves the source image while creating motion:

- "Create a single seamless shot without edits."
- "Begin close, then pull back gradually."
- "The camera slowly glides forward..."
- "Only the environment moves..."
- "Keep the subject/layout stable while the world breathes around it."

### Local event

Useful when the image implies that something could happen without redesigning the scene:

- flowers open, bubbles rise, particles gather, fog parts, light blooms, leaves sway, liquid ripples
- a visible subject reacts, unfolds, glows, pulses, drifts, or transforms subtly within its existing identity
- the event develops in one continuous shot and stays grounded in what is already visible

### Material animation

The corpus often gets better motion from concrete materials:

- dust swirls, clouds drift, rain streaks, neon reflects, ferns sway, cloth ripples
- glass shimmers, petals move, tiny particles glint, water ripples, smoke curls
- light shafts drift, shadows crawl, reflections slide across wet or glossy surfaces

### Camera verbs

Use at most one, and keep it restrained:

- slow push-in
- slow pullback
- lateral tracking drift

Avoid using global camera movement as the whole idea. Do not default to fast orbiting, spinning, sweeping, or camera-only animation.

### Continuity constraints

Strong prompts name what must not change:

- one uninterrupted shot
- no cuts
- no new major objects
- no layout redesign
- no unreadable or invented text
- preserve the central subject
- preserve physical paper/object stillness when needed

### Style line

Use style as a closing compression, after scene and motion:

- photoreal cinematic, subtle film grain, volumetric light
- premium abstract 3D motion-design render, soft bloom, glossy materials
- immersive fulldome domemaster, stable circular fisheye geometry

Avoid long style piles unless the image itself clearly supports that look.

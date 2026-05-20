# Fulldome Motion Thesis Catalog

Use this catalog to avoid vague ambient prompts. A fulldome prompt should usually pick one named thesis, then support it with two or three local motions.

## Event Theses

Holographic scan path:

```text
A soft cyan scan wave travels clockwise through existing circular rings and radial interface marks. Tiny particles follow the scan path, then fade.
```

Bioluminescent rim pulse:

```text
A turquoise-white pulse wakes along the flower rim, travels through vines and holographic rings, briefly brightens nearby petals, then fades back into the original lighting.
```

Particle current:

```text
Visible star motes, pollen, dew sparks, and cyan specks gather into curved currents around the dome, thread through the dense rim, then disperse.
```

Sky emergence:

```text
Use only when the center is visibly active. Clouds part, star particles appear, or a soft glow forms in the sky and travels outward into the surrounding dome.
```

Constellation reveal:

```text
Small existing stars and faint linework connect into subtle constellation-like traces, then dissolve back into scattered points. Keep it abstract, not readable UI text.
```

## Material Theses

Refractive dome caustics:

```text
Glassy dome highlights slide across petals, leaves, and cyan rings as if the curved transparent surface is catching moving light.
```

Botanical glass caustics:

```text
Transparent stems, dew bubbles, petals, and glass-like loops catch moving sky light. Caustic highlights slide over the visible flowers and droplets, then settle back into the original soft lighting.
```

Dew bubble current:

```text
Existing droplets and tiny transparent bubbles brighten, drift along stems and curved glass loops, gather briefly around flowers, then disperse without adding new droplets.
```

Botanical response:

```text
Existing petals flex, blossoms turn a few degrees, leaves sway, and tiny already-visible petals drift. No new flowers.
```

Interface shimmer:

```text
Fine holographic lines pulse in brightness, rotate only a few degrees, and send small glints through nearby particles. Keep marks abstract and unreadable.
```

Use interface shimmer carefully. In tests, it can trigger an unwanted cut or transition when it is the whole event. It is safer as a support layer for a rim pulse, scan path, or refractive caustic event.

Atmospheric breathing:

```text
Cloud light, mist, particles, and reflections slowly brighten and settle while the composition stays almost still.
```

Layered environmental motion:

```text
The distant sky/cloud layer drifts slowly behind the dome while particles, glass reflections, plants, water, and visible entities each move locally at different speeds. The camera stays locked so the layers, not the frame, create motion.
```

Counterflow dome layers:

```text
Background sky motion travels one direction while rim particles, flowers, branches, grass, water, or entities respond with separate local motion in another rhythm. Keep it subtle and continuous.
```

## Camera/Depth Theses

Locked depth breathing:

```text
Keep the camera locked while foreground rim details shift slightly more than the distant sky through subtle depth breathing.
```

Rim-anchored drift:

```text
Use a tiny drift following the circular rim while keeping the dome centered and the dense edge content visible.
```

Slight pullback:

```text
Use only when it preserves more of the circular rim and reinforces the domemaster frame.
```

## Combining Theses

Use one primary thesis and one support layer.

Good:

```text
Primary: holographic scan path. Support: particles and glass refractions.
```

Good:

```text
Primary: bioluminescent rim pulse. Support: petals flex and cyan rings shimmer.
```

Risky:

```text
Primary: scan, bloom, particle storm, sky portal, camera orbit, and parallax all at once.
```

## Support Layer Discipline

Do not make every prompt use the same support layer. Pick the support that actually clarifies the primary thesis.

For holographic scan path:

- support with particles following the scan
- support with ring brightness and glass glints
- avoid making flowers the main action

For bioluminescent rim pulse:

- support with petals briefly glowing and flexing
- support with dew sparks following vines or flower edges
- avoid turning it into a generic interface animation

For refractive dome caustics:

- support with sliding highlights on glass, leaves, and petals
- support with small brightness changes in cyan rings
- avoid event language that implies a new object or portal

For botanical glass caustics:

- support with transparent stems, dew bubbles, petals, and sky light
- use glass/refraction language instead of holographic/interface language
- avoid cyan rings unless the image clearly contains them

For dew bubble current:

- support with droplets brightening, drifting along stems, gathering, and dispersing
- keep bubbles attached to visible paths or local currents
- avoid adding new water bodies or new droplets

For particle current:

- support with motes gathering, threading, loosening, and dispersing
- support with very small leaf/petal response
- avoid making the camera the current

For constellation reveal:

- support with existing stars and faint linework connecting temporarily
- support with a dissolve back into scattered points
- avoid readable text, labels, symbols, or UI diagrams

For interface shimmer:

- use as support for a physical light event rather than the whole event
- keep the same unbroken frame from first frame to last frame
- avoid language that sounds like a screen, UI sequence, title card, or transition

For sky emergence:

- support with clouds parting or light forming in the center
- support with that light traveling outward to the rim
- avoid an inward camera push as the event

For orbital parallax or depth breathing:

- support with differential layer motion: rim details shift slightly more than sky
- support with glass and particles revealing depth
- avoid spin, orbit, or zoom

For layered environmental motion:

- name the background layer first and make it slow
- name only visible material layers from Image1
- give each layer a different verb, direction, speed, or amplitude
- keep the camera locked so the result is not a global pan or warp
- avoid saying all materials move at once without separating layers

## Event Shape

A strong prompt has a start, path, and settle:

```text
starts at [visible anchor], travels through [visible path/material], then fades/settles back into [original scene state].
```

This is usually stronger than a list of simultaneous verbs.

## Intensity Ladder

Use these words to control how much happens:

- subtle: flex, shimmer, drift, breathe, pulse softly
- medium: gathers, travels, brightens, ripples, spreads
- strong: wakes, sweeps, opens, cascades, surges

For delicate fulldome images, prefer subtle or medium. Use strong only for one clear event path, not for every material at once.

## Layer Verb Bank

Use different verbs for different layers:

- sky/clouds: drift, part, brighten, darken, breathe, roll slowly
- stars/particles/pollen: gather, thread, scatter, twinkle, drift, disperse
- glass/reflections/interface: slide, shimmer, refract, pulse, catch highlights
- branches/leaves/grass: sway, bend, tremble, rustle, settle
- flowers/petals: flex, open slightly, turn a few degrees, flutter, settle
- water: ripple, bead, shimmer, reflect, flow, lap
- entities: breathe, blink, turn slightly, shift weight, gesture subtly

Use only visible materials. Do not list water, grass, or entities if the source image does not contain them.

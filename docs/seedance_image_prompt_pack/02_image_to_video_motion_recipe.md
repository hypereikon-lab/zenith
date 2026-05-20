# Method: Thread Motion From The Image

Build the prompt as a motion thread, not a checklist.

## Step 1: Identify Context

Choose the context before choosing motion:

- new still-to-video shot
- continuation of a prior clip
- edit-only transform
- style conversion
- readable text or UI preservation
- motion-reference transfer

Most Zenith still-image prompts are new single shots. Do not add continuation, dialogue, audio, or readable text language unless the request carries that context.

## Step 2: Name The Frame

Use one concrete sentence for the visible image:

```text
[Subject/scene] in [place/framing], with [materials/light/atmosphere].
```

## Step 3: Pick One Motion Spine

Choose one:

- ambient: the scene breathes through particles, light, water, foliage, cloth, smoke, or reflections
- event: one small visible event unfolds
- material: surfaces and details animate in place
- emergence: native image materials form a temporary visible phenomenon, then dissolve

The spine should be easy to see in the image.

For fulldome domemaster images, choose the spine from the dome topology:

- rim event: light, particles, foliage, people, architecture, or horizon detail moves around the circular edge
- radial event: motion travels from one visible ring, ray, branch, or interface mark to another
- center event: sky, cloud, light, or particles visibly change in the center, then affect the surrounding dome
- material event: glass, petals, holographic marks, water, or atmosphere animate in place while the camera stays mostly fixed
- source-derived emergence: petals, pollen, dew, glass, mist, clouds, or particles coalesce into a temporary halo, bloom, aperture, branching tendril, or light current that remains native to the source image

## Step 4: Add Local Verbs

Use three to five material verbs. Examples:

- light: glows, flickers, blooms, travels
- particles: drift, rise, scatter, gather
- water: ripples, beads, reflects, flows
- foliage: sways, bends, rustles
- cloth/hair: lifts, flutters, settles
- glass/metal: shimmers, refracts, catches highlights
- smoke/fog: curls, thins, reveals

## Step 5: Add Camera Only If Useful

Use one camera behavior:

- locked-off
- rim-anchored micro drift
- local depth breathing
- slight pullback
- lateral drift that keeps the main subject in view
- gentle handheld

Avoid camera-only animation unless the image has no good local motion affordances.

For domemaster images with sparse central sky, do not use a slow push toward the center. The center is often negative space; pushing into it removes the rim content that makes the image work. Use a locked camera, rim-anchored drift, or an actual visible center event that sends light, particles, or cloud motion outward.

## Step 6: Lock The Image

Use short locks:

```text
Keep [identity/layout] unchanged.
Preserve [style/materials/lighting].
No cuts, no unrelated major objects, no text, no redesign.
```

## Length Discipline

Target 70-140 words. If a phrase repeats the same control, cut it. If a negative does not address a likely failure, cut it.

Allow 120-180 words only when the prompt has real contextual burden: continuation, edit preservation, readable text, style conversion, or motion-reference transfer.

# Runtime Prompt Recipe: Seedance Image-to-Video

Use this file as the primary runtime guide. Other files are supporting references.

Goal: write one compact Seedance prompt that turns Image1 into a plausible video without redesigning the image.

## Inputs

- `Image1`: the visual base.
- `currentPrompt`: optional user or prior prompt context.
- `requestedMode`: `auto`, `ambient_scene_motion`, `scene_event`, or `material_life`.
- app context: duration, ratio, projection, source metadata.

## Decision Ladder

1. Identify task context from `currentPrompt`.
   - default: new still-image-to-video shot
   - special contexts: continuation, edit-only transform, style conversion, readable text, dialogue/audio, motion-reference transfer
2. Extract protected anchors from Image1.
   - subject identity
   - composition and framing
   - materials and lighting
   - style family
   - domemaster/fisheye geometry if present
   - for domemaster images, note where the useful content lives: rim, center, horizon band, rings, or radial paths
   - for layered motion, inventory visible material layers: sky/background, atmosphere/particles, glass/interface, plants/branches/grass, water, entities
3. Choose one motion thesis.
   - ambient: atmosphere, light, particles, water, reflections, foliage, cloth, or smoke moves
   - event: one visible event unfolds
   - material: surfaces and details animate in place
   - for fulldome botanical/interface images, prefer a visible path event around the rim, through rings, through particles, or across existing materials
   - for fulldome images, choose a concrete thesis from the motion catalog instead of writing only general ambience
4. Choose one camera behavior.
   - locked-off, rim-anchored drift, local depth breathing, slight pullback, lateral drift, gentle handheld
   - use slow push-in only when the center contains a visible event or new visible motion that can hold attention
   - avoid pushing toward empty central sky; it moves the detailed rim out of the shot's attention
   - omit camera motion if local motion is enough
5. Write the final prompt as production direction, not analysis.

## Final Prompt Structure

Prefer four to six sentences.

```text
1. Source and scene: Use Image1 as the visual base. [Concrete visible scene anchor].
2. Motion thesis: [One primary action or ambient/material motion].
3. Local details: [Two to four visible materials/details moving with specific verbs].
4. Camera: [One restrained camera/depth behavior, only if useful].
5. Locks: Keep [identity/layout/style/geometry] unchanged. No [relevant failures].
6. Style tail: [Short visual register, only if not already obvious].
```

Target 70-140 words for normal still-image animation.

Allow 120-180 words only for real contextual burden: continuation, edit preservation, readable text, style conversion, dialogue/audio, or motion-reference transfer.

## Mode Mapping

`ambient_scene_motion`:

- strongest image fidelity
- almost no story
- motion from light, atmosphere, particles, reflections, fluid, cloth, foliage, smoke
- camera locked or very slow

`scene_event`:

- one visible event with two or three beats
- event must emerge from existing image content
- no new major objects

`material_life`:

- surfaces, textures, reflections, glass, metal, plants, paper, particles, and light animate locally
- useful for abstract, product, botanical, glossy, or atmospheric images

`auto`:

- choose ambient if the image is delicate or already composed
- choose event if the image strongly implies an action
- choose material if the image is texture-rich and subject-light
- for domemaster images, choose a motion thesis before choosing camera motion
- if the center is mostly sky or negative space, keep camera locked and animate rim/path/material details instead

## Fulldome Domemaster Bias

Read the image as a dome topology, not a flat postcard.

- Center: often sky, aperture, zenith, or negative space.
- Rim: often where flowers, architecture, horizon detail, people, or dense world information lives.
- Rings and radial marks: useful motion paths because they already explain circular movement.
- Black exterior: protected mask, not empty area to fill.

When the center is sparse, do not make the camera move toward it. Make the event travel around the dome, from ring to ring, along vines, through particles, around the horizon, or outward from an actual visible sky event.

Good fulldome camera language:

```text
Use a locked-off camera with gentle depth breathing.
Use a rim-anchored micro drift that keeps the circular composition centered.
Keep the camera nearly fixed while the scan path moves through the dome.
```

Risky fulldome camera language:

```text
Use a slow inward push into the sky.
Push toward the center to reveal depth.
Orbit through the dome.
```

Only use a center-directed move when the prompt also creates visible center content, such as clouds parting, light emerging outward, particles forming, or a sky aperture opening.

## Fulldome Motion Thesis Requirement

If Image1 is a fulldome/domemaster image, name a specific motion thesis before writing the prompt:

- holographic scan path
- bioluminescent rim pulse
- particle current
- refractive dome caustics
- botanical response
- interface shimmer
- sky emergence
- constellation reveal
- locked depth breathing
- rim-anchored drift

Do not ship a prompt whose only motion is `gentle ambience`, `cinematic drift`, `subtle parallax`, or `slow push`. Those can support the thesis, but they are not the thesis.

Keep the thesis differentiated. Do not reuse the same generic support motions for every thesis. A scan prompt should foreground scan path and ring brightness; a particle prompt should foreground gather/thread/disperse; a refractive prompt should foreground sliding highlights; a botanical prompt should foreground petal/leaf response. Use a start-path-settle shape when possible.

Empirical result note: bioluminescent rim pulse and refractive caustics worked well for the botanical fulldome test image. Standalone interface shimmer produced an unwanted cut, so treat interface shimmer as a support layer unless the prompt strongly specifies one unbroken locked shot with the same composition from first frame to last frame.

## Layered Motion Requirement

When the user wants the background and materials to move independently, write layered choreography instead of saying `everything moves`.

Use this order:

1. Background layer: sky, clouds, stars, fog, horizon light, or distant environment moves slowly behind the subject.
2. Mid layer: particles, glass, interface marks, reflections, mist, or water glints move at a different speed or direction.
3. Foreground/material layer: branches, flowers, grass, leaves, cloth, water surface, or visible entities perform small local motion.
4. Camera: locked or nearly locked, so the layer motion is not confused with a camera push.

Only name materials that are visible in Image1. For visible entities, use small idle motion such as breathing, turning slightly, blinking, or shifting weight; do not invent new actions. Use `different speeds`, `independent layers`, `behind`, `in front`, and `local motion` to prevent a single global warp.

## Context Overrides

Continuation:

```text
Continue the previous [shot/beat] as [new action]. Keep [character/place/style] consistent throughout.
```

Edit-only:

```text
Keep [unchanged regions] exactly the same. Only change [target]: [specific edit].
```

Style conversion:

```text
Use Image1 for identity and composition. Render it in [target style]. Avoid [wrong style], no style drift.
```

Readable text:

```text
Keep [poster/screen/sign] as a physical object. Make only the specified lettering crisp and readable. No extra text or subtitles.
```

Dialogue/audio:

```text
Use [specific sound/dialogue] only if requested. Otherwise do not add dialogue, subtitles, or audio direction.
```

## Quality Bar

The final prompt should pass these checks:

- It names what is visible.
- It names what moves.
- Motion comes from image affordances.
- Camera motion is not the whole idea.
- In domemaster images, the camera does not push useful rim content into empty sky.
- Locks are short and relevant.
- It does not import corpus subjects, dialogue, text, or style families.
- It is shorter than the analysis that produced it.

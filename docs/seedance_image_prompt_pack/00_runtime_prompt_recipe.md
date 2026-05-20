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
3. Choose one motion thesis.
   - ambient: atmosphere, light, particles, water, reflections, foliage, cloth, or smoke moves
   - event: one visible event unfolds
   - material: surfaces and details animate in place
4. Choose one camera behavior.
   - locked-off, slow push-in, slight pullback, lateral drift, gentle handheld
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
- Locks are short and relevant.
- It does not import corpus subjects, dialogue, text, or style families.
- It is shorter than the analysis that produced it.

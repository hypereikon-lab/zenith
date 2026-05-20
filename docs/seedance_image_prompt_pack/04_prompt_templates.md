# Prompt Grammar

Use grammar patterns, not templates to fill blindly.

## Single-Shot Grammar

```text
Use Image1 as the visual base. [Scene anchor]. [Motion spine] while [local material motions]. [Camera behavior]. Keep [identity/layout/style] unchanged. No [likely failure]. [Compact style tail].
```

## Continuation Grammar

```text
Continue the previous [shot/beat] with [new action]. Keep [character/place/style/composition] consistent throughout as [motion spine] continues. The camera [behavior]. No redesign, no style drift.
```

Use only when the task explicitly extends a prior clip.

## Edit-Only Grammar

```text
Keep [unchanged regions] exactly the same. Only change [edit target]: [specific change]. Preserve [layout/materials/lighting/camera angle]. No extra objects, no style drift.
```

Use when the user's language is `edit`, `replace`, `remove`, `change only`, or `preserve the rest`.

## Style-Conversion Grammar

```text
Use Image1 for identity, composition, and motion. Render it in [target style] with [target material/lighting]. Keep [identity/layout] consistent. Avoid [wrong style], no style drift.
```

Use when the user asks for anime, clay, voxel, photoreal, 3D render, or another explicit style family.

## Motion-Reference Grammar

```text
Use Image1 for exact design and appearance. Use the motion reference only for timing, camera movement, speed, rotation, and framing. Follow the motion closely while keeping [identity/materials/layout] stable.
```

Use only when a motion reference exists.

## Text/Legibility Grammar

```text
Keep [poster/screen/sign/text] as a physical object in the scene. Make the lettering crisp and readable only where specified. No invented extra text or subtitles.
```

Use only when readable text is actually required.

## Ambient Grammar

```text
Use Image1 as the visual base. Keep the scene almost unchanged as [atmosphere/light/material] gently [verb], [verb], and [verb]. Use a [camera behavior] only to reveal depth. Preserve [geometry/style]. No cuts, no redesign, no new objects.
```

## Event Grammar

```text
Use Image1 as the visual base. [Visible subject/event] begins to [action], then [second beat] while [local details] [verb]. The camera [behavior]. Keep [identity/layout] consistent. No cuts, no new major objects, no style drift.
```

## Material Grammar

```text
Use Image1 as the visual base. Animate the visible materials in place: [material] [verb], [material] [verb], [light/particles] [verb]. Keep the composition and subject identity fixed. [Style tail].
```

## Domemaster Lock

Use only when present:

```text
Preserve the square domemaster frame, circular fisheye projection, stable zenith orientation, and black exterior outside the projection circle.
```

## Compact Negative Bank

Choose only relevant negatives:

```text
No cuts.
No redesign.
No new major objects.
No readable text or UI marks.
No rectangular crop.
No style drift.
Avoid fast orbit or spin.
No subtitles.
No extra dialogue.
```

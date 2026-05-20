# Feedback Repair Rules

Repair by changing the language thread.

## Too Static

Add a clearer motion spine and three local verbs. Do not add unrelated story.

## Too Camera-Only

Reduce the camera clause. Add material or atmosphere motion.

## Unwanted Cut Or Transition

If a result inserts a cut, second shot, or sudden viewpoint switch, move continuity language earlier and demote abstract motion.

Replace abstract primary events like:

```text
Fine holographic rings pulse and send glints through particles.
```

With a physical continuous event:

```text
In one unbroken locked shot, a soft light pulse starts at the flower rim, travels through existing rings, and fades back into the same frame.
```

Then add:

```text
Keep the same composition from first frame to last frame. No cuts, no scene transition, no viewpoint change.
```

If interface shimmer caused the cut, use it only as a support layer under rim pulse, scan path, or refractive caustics.

## Empty-Center Push

If a domemaster result slowly pushes toward empty sky and loses the rim content, remove the center-directed camera phrase.

Replace:

```text
Use a slow inward push to reveal depth.
```

With:

```text
Use a locked-off camera with gentle depth breathing while the visible event travels around the dome.
```

Then add one explicit path:

- scan wave travels through existing circular rings
- particles gather along the flower rim
- light ripples around the horizon band
- clouds part in the center and send visible light outward

## Scene Redesign

Move locks earlier:

```text
Use Image1 as the visual base. Keep [identity/layout/style] unchanged.
```

Cut big new events.

## Style Drift

Use a short negative:

```text
No style drift. Avoid [wrong style].
```

Then name the correct style in a compact tail.

## Geometry Breaks

Add only the needed lock:

```text
Preserve the square domemaster frame and circular fisheye projection.
```

## Prompt Too Long

Cut in this order:

1. repeated source-truth sentences
2. extra negatives
3. adjective piles
4. second camera move
5. secondary events

## Wrong Context

If the model imports context from the corpus, remove that language directly:

- invented dialogue: add `No dialogue or subtitles.`
- invented text: add `No readable text or UI marks.`
- unwanted style conversion: add `No style drift.`
- accidental edit behavior: replace `change` verbs with animation verbs
- accidental continuation: remove `continue`, `same previous`, and prior-clip language

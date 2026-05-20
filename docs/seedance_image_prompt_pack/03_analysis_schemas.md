# Analysis Notes

Use these only while planning. Do not expose schema language in the final prompt.

## Read Image1 As

```json
{
  "frame": "what is visible",
  "protected_identity": ["subject", "layout", "style", "materials"],
  "motion_affordances": ["visible things that can move"],
  "camera_affordance": "locked / push-in / pullback / drift / handheld",
  "risk": ["what Seedance may invent or change"]
}
```

## Convert Analysis To Prompt

```text
frame -> motion spine -> local verbs -> camera -> locks -> style tail
```

## Mode Meanings

`ambient_scene_motion`: subtle local movement, strongest fidelity.

`scene_event`: one visible event, stronger action.

`material_life`: surfaces, reflections, particles, and textures animate locally.

Keep the final prompt in natural production language.

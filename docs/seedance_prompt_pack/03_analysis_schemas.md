# Analysis Ontology

Use these schemas as thinking scaffolds. The final prompt should not expose the schemas directly.

## SceneCard

```json
{
  "identity": "what the image is, without inventing story",
  "composition": {
    "frame": "square domemaster / portrait / landscape / unknown",
    "camera_view": "fisheye upward / frontal / macro / etc.",
    "layout_anchors": ["stable high-salience layout facts"]
  },
  "subjects": [
    {
      "name": "visible subject",
      "appearance": "shape/material/color identity",
      "must_preserve": ["identity", "position", "scale", "material"]
    }
  ],
  "spatial_layers": {
    "foreground": [],
    "midground": [],
    "background": []
  },
  "material_language": ["specific visible materials"],
  "lighting_color": "specific light and color behavior",
  "style_quality": "rendering mode only if observable",
  "geometry_locks": ["fisheye circle", "black exterior", "zenith orientation"],
  "motion_affordances": ["things already visible that can plausibly move"]
}
```

## MotionPlateCard

```json
{
  "duration_seconds": 6,
  "camera_path": "push / pull / lateral drift / orbit / almost locked",
  "parallax_direction": "how layers appear to separate or slide",
  "motion_rhythm": "slow / pulsing / sweeping / accelerating / settling",
  "motion_intensity": "low / medium / high",
  "transferable_motion": ["duration", "timing", "camera path", "parallax direction"],
  "failure_modes": ["warping", "swimming", "gaps", "bleeding"],
  "artifact_severity": "low / medium / high"
}
```

## PromptPlan

```json
{
  "reference_contract": "how Image1 and Video1 are used",
  "appearance_anchors": ["what must remain stable"],
  "motion_transfer": ["what to borrow from Video1"],
  "repair_targets": ["positive replacements for guide artifacts"],
  "secondary_motion": ["scene-consistent additions"],
  "geometry_locks": ["projection/frame constraints"],
  "priority_order": ["appearance", "motion", "repair"],
  "mode": "strict_repair | conservative_lock | more_volumetric"
}
```

## Extraction Rules

- Prefer observable nouns over genre assumptions.
- Prefer material verbs over generic animation verbs.
- Do not infer story unless the image clearly implies it.
- Do not make the guide video a source of style.
- Keep only details that steer preservation, motion, or repair.

# Analysis Ontology

Use these schemas to organize what the compiler sees. The final prompt should be natural language, not schema prose.

## SceneCard

```json
{
  "identity": "what the image is",
  "subject": "main subject or no clear subject",
  "environment": "where it appears to be",
  "composition": "layout, camera view, framing",
  "foreground": ["closest visible anchors"],
  "midground": ["middle-layer anchors"],
  "background": ["distant anchors"],
  "materials": ["visible material types"],
  "lighting": "light source, color, contrast, atmosphere",
  "style_quality": "observed rendering or photographic style",
  "geometry_locks": ["domemaster", "fisheye", "black exterior", "none"],
  "must_preserve": ["identity", "layout", "materials", "silhouettes"]
}
```

## MotionAffordanceMap

```json
{
  "primary_motion_candidate": "one thing that can happen",
  "local_motions": [
    {
      "element": "visible element",
      "verb": "specific motion verb",
      "strength": "subtle / medium / strong"
    }
  ],
  "camera_permission": "locked / slow push / slight pullback / lateral drift",
  "depth_behavior": "how foreground and background separate",
  "redesign_risks": ["what the model might invent or break"]
}
```

## PromptPlan

```json
{
  "mode": "ambient_scene_motion | scene_event | material_life",
  "source_contract": "Image1 is visual truth",
  "stable_anchors": [],
  "motion_permissions": [],
  "camera_permission": "",
  "geometry_locks": [],
  "negative_constraints": [],
  "priority_order": []
}
```

## Extraction Rules

- Do not invent story to justify motion.
- Do not use nouns absent from the image unless they name general materials or atmosphere.
- Convert visible materials into verbs.
- Convert likely failure modes into constraints.
- Prefer fewer, stronger motion permissions over many unrelated actions.

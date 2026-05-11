# Analysis schemas

## SceneCard

```json
{
  "subject": "main visual subject or absence of subject",
  "environment": "where the scene is",
  "foreground": "closest visible objects/materials",
  "midground": "middle spatial layer",
  "background": "distant layer",
  "materials": ["glass", "petals", "clouds"],
  "atmosphere": "haze, rain, particles, light shafts, reflections",
  "projection": "flat, square domemaster, circular fisheye, unknown",
  "mustPreserve": ["composition", "subject identity", "black outside circle"]
}
```

## MotionPlan

```json
{
  "mode": "ambient_scene_motion | scene_event | material_life",
  "durationFeel": "short 5-6 second continuous motion",
  "camera": "one clear camera path",
  "subjectMotion": "what visible subjects do",
  "environmentMotion": "wind, water, clouds, dust, light, reflections",
  "depthBehavior": "foreground parallax vs stable distant layer",
  "locks": ["one continuous shot", "no cuts", "no new major objects"]
}
```

## Compiler output

```json
{
  "diagnosis": "2-5 sentences",
  "sceneCardSummary": "compact scene card",
  "selectedMode": "ambient_scene_motion",
  "seedancePrompt": "paste-ready prompt",
  "promptStrategy": "one sentence",
  "variants": {
    "ambientSceneMotion": "paste-ready prompt",
    "sceneEvent": "paste-ready prompt",
    "materialLife": "paste-ready prompt"
  },
  "negativeTerms": ["new objects", "rectangular crop"],
  "warnings": []
}
```

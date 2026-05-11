# Analysis schemas for the app

Use these compact schemas before prompt compilation. The analyzer can be a vision LLM, a video model, or a simple frame-sampling pipeline plus LLM.

## SceneCard schema

```json
{
  "scene_identity": "one sentence summary of the original image",
  "composition": {
    "framing": "circular fulldome / portrait / landscape / close-up / etc.",
    "camera_view": "upward fisheye / side view / frontal / macro / etc.",
    "important_layout": ["central sun", "dark rim", "foreground flowers"]
  },
  "subjects": [
    {
      "name": "flower / character / product / structure",
      "appearance": "visual description",
      "must_preserve": ["shape", "position", "color", "material"]
    }
  ],
  "spatial_layers": {
    "background": ["sky", "clouds"],
    "midground": ["glass filigree", "bubbles"],
    "foreground": ["flowers", "mossy rim"]
  },
  "materials": ["translucent glass", "pale petals", "moss", "liquid refraction"],
  "lighting_color": "bright central sun, soft sky light, cool highlights",
  "style_quality": "high-detail realistic render / stylized 3D / anime / pixel / etc.",
  "protected_features": ["exact circular framing", "central sun", "material realism"],
  "natural_motion_candidates": ["subtle swaying", "bubble drift", "refractive shimmer"]
}
```

## MotionPlateCard schema

```json
{
  "duration_seconds": 6,
  "motion_summary": "slow drifting fisheye parallax from a 2.5D depth-warped still",
  "camera_motion": ["slow drift", "slight push", "subtle rotation"],
  "parallax_direction": "foreground appears to slide across distant sky / center expands / etc.",
  "dominant_transform": ["depth warp", "scale", "rotation", "translate", "lens-like distortion"],
  "motion_intensity": "low / medium / high",
  "desired_motion_to_transfer": ["duration", "timing", "camera drift", "parallax direction", "broad movement rhythm"],
  "observed_artifacts": ["rubber-sheet warping", "texture swimming", "foreground-background bleeding"],
  "artifact_severity": "low / medium / high",
  "reject_visual_as_reference": true
}
```

## PromptRequest schema

```json
{
  "image_ref": "Image1",
  "video_ref": "Video1",
  "user_goal": "Use the motion but recover the original image realism",
  "mode": "strict_repair",
  "scene_card": {},
  "motion_plate_card": {},
  "duration_seconds": 6,
  "output_variants": ["strict_repair", "conservative_lock", "more_volumetric"]
}
```

## Analyzer prompt for Image1

```text
Analyze Image1 for a Seedance prompt. Return a compact SceneCard JSON. Focus on scene identity, composition, subject list, spatial layers, materials, lighting, rendering style, protected features, and natural motion candidates. Do not invent story. Describe only what should be preserved in the final generated video.
```

## Analyzer prompt for Video1

```text
Analyze Video1 as a 2.5D/depth-warp motion plate derived from Image1. Return a compact MotionPlateCard JSON. Focus on duration, camera movement, parallax direction, broad motion rhythm, what motion should be transferred, and visible artifacts to reject. Treat the video's visual defects as artifacts, not as style.
```

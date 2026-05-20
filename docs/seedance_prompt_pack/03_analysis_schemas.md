# Analysis Notes

Use this internally. The final prompt should not expose schema language.

```json
{
  "image_anchor": "identity, layout, materials, lighting, geometry",
  "motion_guide": "duration, camera path, parallax direction, rhythm",
  "likely_artifacts": ["warp", "swim", "bleed", "black gaps", "flat cutout"],
  "positive_repair": "stable depth-separated motion",
  "mode": "strict_repair | conservative_lock | more_volumetric"
}
```

Compile to:

```text
reference bind -> intended shot -> motion transfer -> artifact rejection -> positive repair -> geometry lock -> style tail
```

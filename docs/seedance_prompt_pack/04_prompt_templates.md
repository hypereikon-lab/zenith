# Prompt Grammar

Use these as grammar patterns, not rigid templates.

## Base Grammar

```text
Use the still image reference as the visual base for [identity/materials/light/layout]. Use the video reference only as a motion guide for [camera path/parallax/timing]. [Shot description] with [local motion]. Do not copy [guide artifacts]. Rebuild the motion as [positive repair]. Keep [geometry/identity] unchanged. [Style tail].
```

## Motion-Reference Transfer

Use when the guide motion is good and only appearance needs protection:

```text
Use the still image reference for exact appearance, materials, lighting, color, and layout. Use the video reference only for timing, camera movement, speed, parallax direction, and framing. Follow the motion closely while keeping [identity/materials/geometry] stable.
```

## Approximate Motion Borrowing

Use when the guide has useful rhythm but visible artifacts:

```text
Use the still image reference as the visual base. Borrow the video reference's broad camera path, parallax direction, and rhythm, but do not copy its visual defects. Rebuild the motion as stable depth-separated movement with [local scene motion].
```

## Strict Repair

```text
Use the still image reference as the visual base. The video reference is only a motion guide, not the desired visual result. Follow its timing, camera path, and parallax, but do not copy rubber-sheet warping, texture swimming, smeared edges, or black gaps. Rebuild the shot as stable depth-separated motion with crisp materials and clean layer separation. Preserve [geometry] and [style].
```

## Conservative Lock

```text
Use the still image reference as the visual base and keep the scene almost unchanged. Borrow only the video's slow camera path, parallax direction, and rhythm. Add subtle local motion in [visible materials]. No redesign, no new objects, no style drift. Preserve [geometry].
```

## More Volumetric

```text
Use the still image reference for appearance and the video reference for motion only. Follow the guide's camera path while rebuilding the scene with stronger depth separation: [foreground] moves against [midground/background], textures stay locked, and edges remain crisp. Preserve [geometry/style].
```

## Negative Bank

Choose only relevant negatives:

```text
No rubber-sheet warping.
No texture swimming.
No black tearing gaps.
No flat cutout motion.
No scene redesign.
No rectangular crop.
No style drift.
No subtitles.
No extra dialogue.
```

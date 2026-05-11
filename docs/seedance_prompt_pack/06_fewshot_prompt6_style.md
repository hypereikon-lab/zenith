# Few-shot style: strict image-first repair prompt

This is a generic few-shot example of the successful Prompt 6 style. Use it to teach the compiler tone and structure, not as a fixed scene prompt.

```text
The input video is not the desired visual result. It is only a rough motion guide.

Use Image1 to rebuild the final scene. Image1 defines the real appearance: [describe the original image with concrete subject, composition, materials, lighting, and rendering quality].

Use Video1 only for motion: timing, camera drift, parallax direction, and overall movement rhythm.

Do not copy the visual defects from Video1. The video contains obvious 2.5D depth-warp damage: rubbery stretching, texture swimming, transparency tearing, black gaps, smeared details, warped background, flattened cutout motion, and foreground-background bleeding. These are artifacts to remove, not style to preserve.

Make the final animation look like Image1 moving naturally in real space. Keep objects stable, crisp, detailed, and physically separated in depth. Transparent elements should retain their shape. Fine details should stay anchored. The background should remain a distant stable layer. Motion should be gentle, realistic, elegant, and continuous.

No warped still-image look. No flat parallax plate. No smear. No morphing. No scene redesign. No loss of Image1 detail.
```

## Why the tone works

- It is blunt about the video not being the target.
- It gives the image total authority over appearance.
- It gives the video authority only over motion.
- It names the artifacts specifically.
- It converts a negative instruction into a positive target: object-stable, physically separated depth.
- It avoids unrelated style references that could distract the model.

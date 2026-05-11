# Prompt templates

## Template A: strict repair prompt

Use this when the 2.5D video artifacts are likely to contaminate the output.

```text
The input video is not the desired visual result. It is only a rough motion guide.

Use {image_ref} to rebuild the final scene. {image_ref} defines the real appearance: {scene_identity}. Preserve {protected_features}. Maintain {style_quality}, with {materials}, {lighting_color}, and the original composition: {composition_summary}.

Use {video_ref} only for motion: {desired_motion_to_transfer}. Follow its {motion_summary}, but do not copy its visual quality, pixels, flattened look, or artifacts.

Do not copy the visual defects from {video_ref}. The video contains 2.5D depth-warp damage: {observed_artifacts}. These are artifacts to remove, not style to preserve.

Make the final animation look like {image_ref} moving naturally in real space. Keep objects stable, crisp, detailed, and physically separated in depth. {object_stability_sentences}

Motion should be {motion_character}. Add only natural animation that fits the scene: {natural_motion_candidates}.

No warped still-image look. No flat parallax plate. No smear. No morphing. No scene redesign. No loss of {image_ref} detail.

Priority order: preserve {image_ref}'s scene identity, composition, material quality, and visual fidelity first; transfer {video_ref}'s timing, camera motion, parallax direction, and broad motion rhythm second; add subtle natural animation third; reject all 2.5D artifacts from {video_ref}.
```

## Template B: compact app prompt

```text
Use {image_ref} as the source of truth for the final appearance, scene identity, materials, lighting, and composition. Use {video_ref} only as a rough motion plate for duration, timing, camera drift, parallax direction, and broad movement rhythm.

Recreate {scene_identity} with {style_quality}: {composition_summary}, {materials}, {lighting_color}, and protected details: {protected_features}.

The final animation should follow the motion of {video_ref} but look like {image_ref} moving naturally in real space. Keep foreground, midground, and background as separate stable depth layers. Textures stay locked to objects. Transparent edges remain clean. The background remains stable and distant.

Do not preserve the 2.5D depth-warp defects visible in {video_ref}: {observed_artifacts}. No rubber-sheet warping, texture swimming, black gaps, foreground-background bleeding, flat cutout sliding, smearing, morphing, or loss of detail.

Priority: {image_ref} visual fidelity first, {video_ref} motion second.
```

## Template C: timed 6-second repair

```text
Use {image_ref} as the visual source of truth. Use {video_ref} only as the motion reference.

Create a single continuous {duration_seconds}-second shot with no cuts.

00:00-00:02: Begin very close to {image_ref}. Preserve {composition_summary}. Start the same broad drift and parallax direction seen in {video_ref}, but keep all details crisp and realistic.

00:02-00:04: Continue following {video_ref}'s camera movement and depth rhythm. Reconstruct the motion as real object-stable parallax instead of a 2.5D warp. The scene layers remain physically separate: {spatial_layers_summary}. Add subtle natural movement: {natural_motion_candidates}.

00:04-00:06: Complete the motion path from {video_ref} while preserving {image_ref}'s visual quality. Do not let the scene smear, stretch, collapse, or lose material detail.

Do not copy the damaged look of {video_ref}. Remove {observed_artifacts}. Priority order: {image_ref} realism and scene identity first, {video_ref} timing and camera motion second, subtle natural animation third.
```

## Object-stability sentence builder

Generate 2-4 sentences based on scene layers:

```text
The distant background should remain distant and stable.
The main foreground objects should retain their shape and material identity during motion.
Transparent structures should keep clean edges and stable refraction.
Fine details should stay locked to their surfaces instead of swimming or smearing.
```

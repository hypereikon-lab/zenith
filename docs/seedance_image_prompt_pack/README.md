# Seedance 2 Prompt Pack: Still-image to moving domemaster

This prompt pack is for creating a Seedance 2 image-to-video prompt directly from a still or inpainted Zenith image.

It is different from `docs/seedance_prompt_pack`, which repairs a depth-warped MP4 motion plate. In this workflow there is no video guide. Codex must read the source image, infer what can move, and write a prompt that invites motion without redesigning the scene.

## Runtime flow

1. Analyze the source image as a `SceneCard`.
2. Infer a `MotionPlan`: camera path, subject motion, environmental motion, material motion, and dome-geometry locks.
3. Compile one paste-ready prompt plus variants.
4. Send the source image as `promptImage` and the compiled prompt as `promptText` to Seedance 2 image-to-video.

## Core principle

The still image is the visual source of truth. Motion should emerge from the scene's existing spatial cues, materials, atmosphere, and implied depth. The prompt must not ask Seedance to invent a different scene.

## Recommended runtime files

- `00_seedance_image_prompt_compiler_system.md`
- `01_corpus_patterns.md`
- `02_image_to_video_motion_recipe.md`
- `03_analysis_schemas.md`
- `04_prompt_templates.md`
- optionally `05_feedback_repair_rules.md`

`06_fewshot_seedance2_style.md` is useful as few-shot style material when the generated prompt is too flat.

## Raw corpus

The curated raw prompt corpus is kept as reference material, not loaded into every request. Runtime should use the distilled files above.

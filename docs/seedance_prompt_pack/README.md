# Seedance 2 Prompt Pack: Image-first / 2.5D motion-plate repair

This prompt pack is designed for an app that receives:

- an original still image, usually high-quality and visually correct
- a derived 2.5D/depth-warp motion video made from that image
- an instruction to generate a Seedance-style prompt that transfers the motion while recovering the image quality

The key principle is:

> The image is the visual source of truth. The video is only a motion plate.

Do not feed a huge prompt corpus into every generation call. Use the corpus offline to distill prompting patterns, then run the app with a small prompt compiler, a task-specific recipe, and a compact scene/motion analysis.

## Recommended runtime flow

1. Sample video frames, usually first / middle / last plus 3 to 6 intermediate frames.
2. Analyze the original image into a `SceneCard`.
3. Analyze the video into a `MotionPlateCard`.
4. Compile the Seedance prompt using `04_prompt_templates.md`.
5. Optionally produce 2 or 3 variants: strict repair, conservative lock, more-volumetric.
6. Use user feedback to revise with `05_feedback_repair_rules.md`.

## Why this works

The derived video often contains 2.5D artifacts: rubber-sheet stretching, texture swimming, foreground/background bleeding, transparency tearing, black gaps, and smeared detail. If the prompt says “preserve the video,” the model preserves the broken pixels. The winning strategy is to explicitly state that the video is a damaged motion plate and that its visual defects are artifacts to remove.

## Recommended files to load at runtime

For this specific workflow, load these at runtime:

- `00_seedance_prompt_compiler_system.md`
- `02_depth_warp_repair_recipe.md`
- `03_analysis_schemas.md`
- `04_prompt_templates.md`
- optionally `05_feedback_repair_rules.md`

Use `01_reference_roles_and_patterns.md` and `06_fewshot_prompt6_style.md` as development references or few-shot material, not necessarily every request.

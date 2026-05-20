# Seedance 2 Image Prompt Method

This pack distills the working prompt corpus into language mechanics for Seedance 2 image-to-video.

Runtime should start with `00_runtime_prompt_recipe.md`. That is the task-facing generation recipe. The corpus analysis file is evidence and calibration, not the main instruction surface.

The raw examples are evidence, not templates. Their value is in how they thread language:

1. bind the source or references
2. open with a visible situation
3. move the scene with concrete verbs
4. add one camera behavior or coverage pattern
5. lock consistency with short `keep`, `preserve`, `no`, or `avoid` clauses
6. close with a compact style register

The runtime prompt should usually be short. The corpus median is about 96 words and the strongest prompts often sit between 60 and 140 words. Longer prompts work when they are shot sequences, not when they repeat rules.

For Zenith, the source image is the visual base. The compiler should infer motion from visible affordances, then write a compact production prompt that sounds like direction, not explanation.

For fulldome and domemaster images, `07_fulldome_domemaster_method.md` is the domain-specific layer. It tells the compiler to reason about center/rim topology before writing camera language, so empty central sky is not treated as the default target for slow pushes or zooms.

`08_fulldome_motion_thesis_catalog.md` is the action vocabulary. Use it to choose a concrete motion thesis before writing the prompt, especially when previous outputs felt too ambient or uneventful.

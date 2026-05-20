# Seedance 2 Image-to-Video Prompt Methodology

This pack is for still-image-to-video prompts. It is not a prompt-example library. It distills the corpus into reusable steering methods.

The compiler receives one source image and must infer plausible motion from what is already visible. The prompt should not import story, genre, props, or actions from unrelated corpus examples.

## Core Contract

`Image1` is the only visual authority. Motion must emerge from its existing subjects, materials, atmosphere, lighting, spatial layers, and geometry.

There is no motion plate. Therefore the prompt must provide a motion plan, but the plan must stay subordinate to Image1.

## Method

1. Read the image into anchors: identity, layout, subject, materials, light, spatial layers, and geometry locks.
2. Identify motion affordances: things visible in the image that can move without redesigning it.
3. Choose one motion logic: ambient scene motion, scene event, or material life.
4. Compose a continuous-shot prompt with source fidelity, motion plan, local details, camera restraint, geometry locks, and negative constraints.
5. Keep style language derived from the image, not from the corpus.

## Language Principle

Strong image-to-video prompts steer through verbs and permissions:

- what may animate
- what must remain stable
- how the camera may move
- what kind of continuity is required
- what the model must not invent

The raw corpus is useful only as evidence of language mechanics: ordered situation, concrete action, material motion, continuity constraints, and restrained camera verbs.

## Runtime Files

The server loads the Markdown files in this folder as prompt compiler context. Keep them procedural and abstract. The raw prompt corpus in `references/prompts_only.md` is offline reference material, not runtime instruction style.

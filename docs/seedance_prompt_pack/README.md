# Seedance 2 Prompt Methodology: Image Truth, Motion Plate

This pack is not a scene prompt library. It is a compact methodology for compiling prompts when Zenith has:

- one high-quality still image
- one derived 2.5D/depth-warp MP4 guide
- motion/projection settings from the app

The goal is to steer Seedance by assigning clean semantic roles to the inputs, not by copying example prompt specifics.

## Core Contract

`Image1` is the visual truth. It owns scene identity, composition, object identity, material language, lighting, color, style, and fidelity.

`Video1` is motion evidence. It owns duration, timing, camera path, parallax direction, broad rhythm, and spatial choreography.

The prompt compiler must keep those contracts separate. When references conflict, the image wins for appearance and the video wins only for motion.

## Method

1. Read Image1 into stable anchors: subject, layout, spatial layers, materials, lighting, protected details, and geometry locks.
2. Read Video1 into motion evidence: duration, direction, camera path, parallax behavior, rhythm, and visible failure modes.
3. Convert failure modes into steering language: name the defect, say it is not the target, and state the positive replacement.
4. Compose the prompt as a control document: role contract, appearance anchors, motion transfer, reconstruction target, constraints, priority order.
5. Produce variants by changing the strength of motion and repair, not by changing the scene.

## Language Principle

Strong prompts are not long lists of adjectives. They are contracts:

- what each reference means
- what must be preserved
- what may move
- what defects must not propagate
- what priority resolves conflicts

Use concise, scene-grounded nouns and verbs. Avoid importing style or story from the corpus unless the image itself supports it.

## Runtime Files

The server loads the Markdown files in this folder as runtime context for Codex. These files should stay abstract and procedural. The raw corpus belongs offline; only distilled steering rules should appear here.

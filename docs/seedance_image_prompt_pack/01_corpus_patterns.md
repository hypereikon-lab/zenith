# Corpus Language Analysis

Source: `references/prompts_only.md`, 391 fenced prompt examples.

Observed shape:

- word count: p25 64, median 96, p75 142, p90 186
- sentence count: p25 4, median 5, p75 9
- camera language appears in most examples
- style/look language appears in most examples, usually after scene and motion
- reference binding appears often, especially as `Use image 1 for...`
- consistency language is compact: `keep`, `preserve`, `same`, `consistent`
- negatives are surgical: `no music`, `avoid cartoon look`, `no cuts`, `no style drift`
- contextual prompts are longer: continuation, edit, style, text, audio, and motion-reference prompts usually need extra binding language

## What The Language Does

Working prompts do not mainly persuade. They assign attention.

They usually thread five kinds of language:

1. scene anchor: what is visible now
2. action spine: what changes over time
3. camera/coverage: how the viewer sees it
4. locks: what cannot drift
5. style register: what visual family the result belongs to

The examples are often declarative rather than over-instructive:

```text
A race car powers through neon Tokyo streets at night, drifting hard on wet pavement while tires scream and smoke pours from the wheels.
```

This works because subject, place, action, material response, and sensory tone are bound in one sentence.

## Context Changes The Grammar

The corpus does not use one universal prompt shape. It switches grammar depending on what kind of task the prompt is doing.

Approximate corpus buckets:

```text
reference binding: 252 prompts, median 114 words
continuation: 107 prompts, median 139 words
edit/transform: 23 prompts, median 120 words
multi-shot labels: 34 prompts, median 125 words
timecoded prompts: 17 prompts, median 144 words
coverage-list prompts: 89 prompts, median 108 words
audio/dialogue: 144 prompts, median 114 words
readable text: 62 prompts, median 120 words
style conversion: 61 prompts, median 131 words
motion-reference transfer: 9 prompts, median 142 words
```

The lesson is not that prompts should be long. It is that extra context costs words. Add those words only when the task context needs them.

### New Single Shot

Use scene-first declarative grammar:

```text
A [subject] [does action] in [setting] while [materials/atmosphere] [move]. The camera [one behavior]. [style tail].
```

### Continuation

The corpus uses `continue`, `same`, `remains`, `throughout`, and `consistent` to keep identity across clips:

```text
Continue the [previous beat] as [new action]. Keep [character/place/style] consistent throughout.
```

Use this only when the current prompt or workflow is extending a prior result.

### Edit Or Transform

Edit prompts narrow the permission before describing the change:

```text
Keep [unchanged region] exactly the same. Only change [target]. Remove/replace/transform [edit target] while preserving [layout/material/light].
```

This is different from animation prompting. It protects the rest of the frame before allowing the edit.

### Multi-Reference Binding

The corpus often assigns each reference a job:

```text
Use image 1 for [subject], image 2 for [environment/material], image 3 for [pose/storyboard/style].
```

For Zenith single-image generation, do not simulate extra references. For 2.5D or motion-reference workflows, use role-specific binding.

### Motion Reference Transfer

Motion-reference prompts are stricter than normal image-to-video prompts:

```text
Use [image/reference] for exact design. Use the video only for timing, camera movement, rotation, speed, and framing.
```

They usually add `do not change the movement` or `follow precisely` when motion fidelity matters.

### Text And Legibility

Readable-text prompts spend words on physicality and stillness:

```text
The poster/screen/text is a physical object. Keep the lettering crisp and readable. No subtitles.
```

Only request readable text if the user actually needs it. Otherwise prohibit invented text.

### Audio And Dialogue

Audio/dialogue prompts use compact sensory direction:

```text
Use impacts and breathing only, no music.
The character says [short line] in [delivery].
```

For Zenith visual prompts, avoid audio/dialogue unless the user requested it.

### Style Conversion

Style conversion prompts lock both target and anti-target:

```text
Use [target style]. Keep [identity] consistent. Avoid [wrong style] and no style drift.
```

This is more precise than adding many style adjectives.

## High-Value Clause Forms

Scene-first:

```text
A [subject] [strong verb] through [place/material condition] while [secondary visible motion].
```

Opening reveal:

```text
Open on [obscured or still condition]. As [material/event changes], [subject or scene] is revealed.
```

Reference binding:

```text
Use Image1 for [identity/style/layout]. Keep [protected traits] consistent.
```

Continuity lock:

```text
One continuous shot with [camera behavior]. No cuts, no redesign.
```

Style tail:

```text
[style family], [lighting], [render/film texture], [mood].
```

## What To Steal From The Corpus

Steal:

- active verbs
- time connectors
- camera nouns
- short consistency locks
- style compression
- reference-role phrasing
- context cues: `continue`, `only change`, `use image 1 for`, `no style drift`, `no subtitles`

Do not steal:

- scene subjects
- long coverage lists
- repeated style piles
- unrelated story
- negative clauses that do not address the current image
- audio, dialogue, readable text, or style conversion when the user did not ask for them

## Seedance Biases Suggested By The Corpus

Seedance appears steerable through cinematic grammar: shot size, camera path, action beat, material response, and style register.

It also appears to honor concise constraint language. `Keep the same character`, `no style drift`, and `avoid cartoon look` are more useful than long explanations of why drift is bad.

For Zenith, this means the compiler should produce a short, image-grounded prompt with one motion spine and a few local motion details. It should not generate a full ontology unless the user asks for one.

The compiler should also preserve contextual intent. If the user is continuing, continue. If the user is editing, constrain the edit. If the user is animating a still, do not import dialogue, title cards, subtitles, or coverage lists from unrelated examples.

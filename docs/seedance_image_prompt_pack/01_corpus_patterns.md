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

Do not steal:

- scene subjects
- long coverage lists
- repeated style piles
- unrelated story
- negative clauses that do not address the current image

## Seedance Biases Suggested By The Corpus

Seedance appears steerable through cinematic grammar: shot size, camera path, action beat, material response, and style register.

It also appears to honor concise constraint language. `Keep the same character`, `no style drift`, and `avoid cartoon look` are more useful than long explanations of why drift is bad.

For Zenith, this means the compiler should produce a short, image-grounded prompt with one motion spine and a few local motion details. It should not generate a full ontology unless the user asks for one.

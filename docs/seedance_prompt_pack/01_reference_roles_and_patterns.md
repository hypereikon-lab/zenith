# Reference Role Grammar

Use narrow reference verbs.

## Image1 Verbs

`use`, `preserve`, `keep`, `rebuild from`, `match`

Example:

```text
Use the still image reference as the visual base for scene identity, composition, materials, lighting, color, and detail.
```

## Video1 Verbs

`follow`, `borrow`, `transfer`, `match`, `use only as a motion guide`

Example:

```text
Use the video reference only for timing, camera path, parallax direction, and broad motion rhythm.
```

For stricter motion transfer, use corpus-style motion-reference language:

```text
Follow the video reference for timing, camera movement, speed, rotation, and framing while keeping Image1's appearance.
```

Use `match` or `follow precisely` only when the guide motion is actually good. Use `borrow` when the guide is only approximate or artifact-heavy.

## Conflict Sentence

```text
If the references conflict, keep Image1's appearance and use Video1 only for motion.
```

## Avoid

```text
Preserve the video exactly.
Blend both references equally.
Use the video style.
Make it like both.
```

These phrases invite the model to copy guide artifacts.

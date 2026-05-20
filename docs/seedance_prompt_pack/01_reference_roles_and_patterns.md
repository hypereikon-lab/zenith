# Reference Role Contracts

Prompting multi-reference video models is mostly reference governance. If roles are vague, the model blends inputs incorrectly. The compiler must state roles with narrow verbs.

## Image1 Contract

Use Image1 for:

- scene identity
- object identity and count
- composition and layout
- materials and texture fidelity
- lighting and color palette
- style/rendering quality
- dome or frame geometry
- protected details and silhouettes

Good language:

```text
Use the still image reference as the source of truth for appearance, composition, materials, lighting, color, and detail.
```

Avoid language that implies only superficial style transfer:

```text
Use the image style.
```

## Video1 Contract

Use Video1 for:

- duration and timing
- broad camera path
- parallax direction
- motion rhythm
- rough spatial choreography
- start/end movement relationship

Good language:

```text
Use the video reference only as a motion guide for timing, camera drift, parallax direction, and broad movement rhythm.
```

Avoid language that makes the damaged guide the visual target:

```text
Preserve the video exactly.
```

## Conflict Language

Use explicit conflict resolution. Video appearance loses to Image1. Image1 stillness loses only where Video1 provides motion.

Canonical priority sentence:

```text
Priority: preserve the still image reference for visual fidelity first; follow the video reference for motion timing and parallax second; reject visual artifacts from the guide.
```

## Reference Verbs

Use precise verbs:

- Image1: preserve, rebuild, maintain, keep, anchor, protect
- Video1: follow, borrow, transfer, use as guide, match rhythm, approximate path
- Artifacts: reject, remove, do not copy, replace with, reconstruct as

Avoid ambiguous verbs:

- blend
- remix
- stylize from
- preserve everything
- make like both

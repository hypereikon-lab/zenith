# Runtime Prompt Recipe: Image Plus 2.5D Motion Guide

Use this file as the primary runtime guide. Other files are supporting references.

Goal: write one compact Seedance prompt that uses Image1 for appearance and Video1 for motion without copying 2.5D guide artifacts.

## Inputs

- `Image1`: visual base and source of truth.
- `Video1`: MP4 motion guide generated from Image1.
- `currentPrompt`: optional user or prior prompt context.
- `requestedMode`: `auto`, `strict_repair`, `conservative_lock`, or `more_volumetric`.
- motion/projection settings and sampled guide-frame notes.

## Decision Ladder

1. Bind roles.
   - Image1 controls identity, composition, materials, lighting, color, style, and geometry.
   - Video1 controls timing, camera path, parallax direction, speed, framing, and broad rhythm.
2. Judge guide quality.
   - clean/useful guide: follow motion closely
   - artifact-heavy guide: borrow only broad timing, camera path, and parallax
3. Extract likely artifacts.
   - rubber-sheet warping
   - texture swimming
   - smeared edges
   - black tearing gaps
   - foreground/background bleeding
   - flat cutout sliding
4. State the positive replacement.
   - stable depth-separated motion
   - textures locked to surfaces
   - crisp material boundaries
   - clean layer separation
   - complete reconstructed image
5. Preserve domemaster/fisheye geometry when present.

## Final Prompt Structure

Prefer five to seven sentences.

```text
1. Role bind: Use the still image reference as the visual base for [identity/materials/light/layout].
2. Motion bind: Use the video reference only for [timing/camera path/parallax/speed/framing].
3. Shot target: [Describe the intended shot using concrete scene language].
4. Transfer: Follow or borrow [specific guide motion].
5. Repair: Do not copy [relevant artifacts]. Rebuild as [positive replacement].
6. Locks: Keep [identity/style/geometry] unchanged. No [relevant failures].
7. Style tail: [Short visual register, only if useful].
```

Target 90-160 words.

Allow more only when the guide has true timed beats or the user is continuing/editing a prior result.

## Mode Mapping

`strict_repair`:

- use when guide artifacts are likely to contaminate output
- say the video is only a motion guide, not the desired visual result
- name visible artifacts and the positive replacement

`conservative_lock`:

- use when Seedance tends to redesign the image
- keep Image1 almost unchanged
- borrow slow motion and subtle parallax only

`more_volumetric`:

- use when output is too flat
- emphasize foreground, midground, and background separation
- keep textures locked to objects while parallax increases

`auto`:

- choose strict repair for damaged guides
- choose conservative lock for fragile images or strong identity constraints
- choose more volumetric when the result needs stronger depth

## Motion Fidelity Wording

Use `follow closely` only when the guide motion is good.

Use `borrow broad timing, camera path, and parallax` when the guide is artifact-heavy.

Never write `preserve the video exactly`.

## Quality Bar

The final prompt should pass these checks:

- Image1 is clearly appearance authority.
- Video1 is clearly motion authority only.
- The shot target is concrete.
- Only relevant artifacts are named.
- Artifact rejection is paired with positive reconstruction.
- Domemaster/fisheye geometry is protected when present.
- It does not import corpus subjects, dialogue, subtitles, or unrelated style.

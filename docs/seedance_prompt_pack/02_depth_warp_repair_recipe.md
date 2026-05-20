# Method: Repair By Naming The Difference

The 2.5D guide is useful motion evidence, not visual truth.

Repair language should be short:

```text
Do not copy rubber-sheet warping, texture swimming, smeared edges, black tearing gaps, or flat cutout motion.
```

Then state the replacement:

```text
Rebuild the motion as stable depth-separated objects with textures locked to their surfaces.
```

## Common Failure To Replacement

- rubber-sheet warp -> stable object depth
- texture swimming -> texture locked to surfaces
- foreground/background bleeding -> clean layer separation
- black gaps -> complete reconstructed image
- flat cutout slide -> coherent parallax
- smeared transparent edges -> crisp material boundaries

## Modes

`strict_repair`: lead with guide artifacts as not the target.

`conservative_lock`: keep Image1 almost unchanged, small motion only.

`more_volumetric`: emphasize depth layers and coherent parallax.

Use mode names only in JSON, not in the final prompt.

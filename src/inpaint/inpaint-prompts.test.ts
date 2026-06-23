import { describe, expect, it } from "vitest";
import { inpaintPromptForProjection, shouldReplaceWithProjectionInpaintPrompt } from "./inpaint-prompts.js";

describe("projection inpaint prompts", () => {
  it("keeps nadir inpaint prompts aligned with floor-centered source language", () => {
    expect(inpaintPromptForProjection("nadir-180")).toContain("bottom-facing equidistant 180 fisheye");
    expect(inpaintPromptForProjection("nadir-180")).toContain("inner disk is floor/ground");
    expect(inpaintPromptForProjection("cave-270")).toContain("square projection-source map");
    expect(inpaintPromptForProjection("cave-270")).toContain("warped source texture for an immersive projection surface");
    expect(inpaintPromptForProjection("cave-270")).toContain("center region represents floor-source content");
    expect(inpaintPromptForProjection("cave-270")).toContain("currently occupies 33% of the source-map radius");
    expect(inpaintPromptForProjection("cave-270", 0.5)).toContain("currently occupies 50% of the source-map radius");
    expect(inpaintPromptForProjection("cave-270", 0.5, 0.62)).toContain("eye-level/horizon breakpoint at 62%");
    expect(inpaintPromptForProjection("cave-270")).toContain("moving outward from the center means moving from floor surface into vertical perimeter surfaces");
    expect(inpaintPromptForProjection("cave-270")).toContain("outer square boundary represents the upper edge");
    expect(inpaintPromptForProjection("cave-270")).toContain("angular direction around the center corresponds to direction around the square perimeter");
    expect(inpaintPromptForProjection("cave-270")).toContain("neon green center = missing floor image data");
    expect(inpaintPromptForProjection("cave-270")).toContain("cyan/blue outer regions = missing perimeter/vertical surface image data");
    expect(inpaintPromptForProjection("cave-270")).toContain("black square seam = removable floor-to-wall transition guide");
    expect(inpaintPromptForProjection("cave-270")).toContain("black rings = removable height/distance guides");
    expect(inpaintPromptForProjection("cave-270")).toContain("black rays = removable direction guides");
    expect(inpaintPromptForProjection("cave-270", 0.5)).toContain("floor-to-wall split is 50% from the center");
    expect(inpaintPromptForProjection("cave-270")).toContain("Keep all real artwork pixels");
    expect(inpaintPromptForProjection("cave-270")).toContain("floor-to-wall transition must become invisible finished image content");
    expect(inpaintPromptForProjection("cave-270")).toContain("one clean opaque square warped projection-source texture");
    expect(inpaintPromptForProjection("cave-270")).not.toMatch(/coordinate semantics|vanishing-point perspective.*sky opening|visualization of the room/i);
    expect(inpaintPromptForProjection("nadir-180")).not.toMatch(/fulldome|domemaster|zenith at the center/i);
    expect(inpaintPromptForProjection("cave-270")).not.toMatch(/fulldome|domemaster|zenith at the center/i);
    expect(inpaintPromptForProjection("cave-270")).not.toMatch(/CAVE|visual continuity reference|lower world/i);
  });

  it("describes colored guide fill and projection overlays as removable construction marks", () => {
    for (const mode of ["zenith-180", "zenith-230", "nadir-180"] as const) {
      expect(inpaintPromptForProjection(mode)).toContain("@plate_sketch");
      expect(inpaintPromptForProjection(mode)).not.toContain("@PlateSketch");
      expect(inpaintPromptForProjection(mode)).toMatch(/colored guide fill inside the projection circle/i);
      expect(inpaintPromptForProjection(mode)).toMatch(/black rings, spokes, horizon, and source-circle marks are construction guides/i);
      expect(inpaintPromptForProjection(mode)).toMatch(/black area outside the circular projection black/i);
      expect(inpaintPromptForProjection(mode)).toContain("aqua/green guide fill marks missing horizon");
    }
    expect(inpaintPromptForProjection("zenith-180")).toContain("cyan/blue guide fill marks missing sky");
    expect(inpaintPromptForProjection("zenith-180")).not.toContain("neon green guide fill marks missing floor");
    expect(inpaintPromptForProjection("zenith-230")).toContain("cyan/blue guide fill marks missing sky");
    expect(inpaintPromptForProjection("zenith-230")).toContain("neon green guide fill marks missing floor");
    expect(inpaintPromptForProjection("nadir-180")).toContain("cyan/blue guide fill marks missing sky");
    expect(inpaintPromptForProjection("nadir-180")).toContain("neon green guide fill marks missing floor");
    expect(inpaintPromptForProjection("zenith-180")).toContain("outer field is horizon");
    expect(inpaintPromptForProjection("zenith-230")).toContain("outer below-horizon annulus is lower-world");
    expect(inpaintPromptForProjection("nadir-180")).toContain("outer field is horizon-level wall");
    expect(inpaintPromptForProjection("zenith-180")).toContain("33% from the center");
    expect(inpaintPromptForProjection("zenith-180", 0.5)).toContain("50% from the center");
    expect(inpaintPromptForProjection("cave-270")).toContain("@plate_sketch");
    expect(inpaintPromptForProjection("cave-270")).toMatch(/Replace every scaffold region/i);
    expect(inpaintPromptForProjection("cave-270")).toMatch(/no green, no cyan\/blue, no black guide lines/i);
    expect(inpaintPromptForProjection("cave-270")).not.toMatch(/black area outside the circular projection black/i);
  });

  it("describes zenith 230 as a 25-degree below-horizon extension", () => {
    expect(inpaintPromptForProjection("zenith-230")).toContain("equidistant 230 fulldome map");
    expect(inpaintPromptForProjection("zenith-230")).toContain("physical horizon direction remapped");
    expect(inpaintPromptForProjection("zenith-230", 1 / 3, 0.7)).toContain("second guide boundary at 70%");
    expect(inpaintPromptForProjection("zenith-230")).toContain("25 degrees below the horizon");
  });

  it("replaces only known obsolete generated prompt scaffolds", () => {
    expect(
      shouldReplaceWithProjectionInpaintPrompt(
        "Use @PlateSketch as a visual continuity reference for a square nadir-centered equidistant 270 fisheye map intended for CAVE floor and wall extraction.",
      ),
    ).toBe(true);
    expect(
      shouldReplaceWithProjectionInpaintPrompt(
        "Use @PlateSketch as an exact square domemaster guide. It is an equidistant 270 fulldome map with the nadir at the center, the horizon at two-thirds of the projection radius.",
      ),
    ).toBe(true);
    expect(
      shouldReplaceWithProjectionInpaintPrompt(
        "Use @PlateSketch as an exact square domemaster guide. It is an equidistant 180 fulldome map with the zenith at the center and the horizon at the outer circle.",
      ),
    ).toBe(true);
    expect(
      shouldReplaceWithProjectionInpaintPrompt(
        "Use @plate_sketch as the exact square domemaster composition handoff for inpaint. It is the source of truth for plate placement, scale, orientation, fisheye geometry, projection center, rim continuity, and the black exterior outside the projection circle.",
      ),
    ).toBe(true);
    expect(
      shouldReplaceWithProjectionInpaintPrompt(
        "Use @plate_sketch as an exact square CAVE 270 source-map guide. It is a flat projection source map, not a perspective room render. Preserve the existing plate content, orientation, scale, and source-map geometry.",
      ),
    ).toBe(true);
    expect(
      shouldReplaceWithProjectionInpaintPrompt(
        "Use @plate_sketch as a square CAVE 270 continuity-carrier map for inpainting, not as a camera photograph or room render. Keep the exact source-map layout. Visual harness: the center is the floor center.",
      ),
    ).toBe(true);
    expect(shouldReplaceWithProjectionInpaintPrompt("Keep this custom inpaint prompt for my own CAVE experiment.")).toBe(
      false,
    );
  });
});

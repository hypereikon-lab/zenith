import { describe, expect, it } from "vitest";
import { inpaintPromptForProjection, shouldReplaceWithProjectionInpaintPrompt } from "./app-state.js";

describe("projection inpaint prompts", () => {
  it("keeps nadir inpaint prompts aligned with floor-centered source language", () => {
    expect(inpaintPromptForProjection("nadir-180")).toContain("bottom-facing equidistant 180 fisheye");
    expect(inpaintPromptForProjection("nadir-180")).toContain("center disk means floor or ground continuation");
    expect(inpaintPromptForProjection("nadir-270")).toContain("bottom-facing equidistant 270 fisheye");
    expect(inpaintPromptForProjection("nadir-270")).toContain("horizon sits at two-thirds");
    expect(inpaintPromptForProjection("nadir-270")).toContain("outer annulus beyond that horizon");
    expect(inpaintPromptForProjection("nadir-270")).toContain("never make the center a sky opening");
    expect(inpaintPromptForProjection("nadir-180")).not.toMatch(/fulldome|domemaster|zenith at the center/i);
    expect(inpaintPromptForProjection("nadir-270")).not.toMatch(/fulldome|domemaster|zenith at the center/i);
    expect(inpaintPromptForProjection("nadir-270")).not.toMatch(/CAVE|visual continuity reference|lower world/i);
  });

  it("describes green guide fill and projection overlays as removable construction marks", () => {
    for (const mode of ["zenith-180", "zenith-270", "nadir-180", "nadir-270"] as const) {
      expect(inpaintPromptForProjection(mode)).toMatch(/green areas inside the projection circle/i);
      expect(inpaintPromptForProjection(mode)).toMatch(/rings and spokes are construction guides/i);
      expect(inpaintPromptForProjection(mode)).toMatch(/black area outside the circular projection black/i);
    }
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
    expect(shouldReplaceWithProjectionInpaintPrompt("Keep this custom inpaint prompt for my own CAVE experiment.")).toBe(
      false,
    );
  });
});

import { describe, expect, test } from "vitest";
import { preparePlatePlacement } from "../plates/plate-placement.js";
import { dot } from "../projection.js";
import { projectPlateScreenControls } from "./plate-screen-controls.js";

describe("projected plate screen controls", () => {
  test("keeps fallback resize and rotate handles visible when true projected corners are hidden", () => {
    const placement = preparePlatePlacement(
      {
        azimuth: 0,
        radius: 0.45,
        scale: 0.7,
        spin: 0,
        opacity: 1,
      },
      { aspect: 1 },
    );

    const controls = projectPlateScreenControls(
      placement,
      { minU: 0, minV: 0, maxU: 1, maxV: 1 },
      {
        projectSourceDirection: (direction) =>
          dot(direction, placement.center) > 0.9999 ? { x: 50, y: 50 } : null,
        sourceDirectionAt: () => placement.center,
        rect: { x: 0, y: 0, width: 100, height: 100 },
      },
    );

    expect(controls).not.toBeNull();
    expect(controls?.scaleHandles).toHaveLength(4);
    expect(controls?.scaleHandles.map((handle) => handle.corner)).toEqual(["nw", "ne", "se", "sw"]);
    expect(controls?.rotateHandle).not.toBeNull();
    expect(controls?.rotateAnchor).not.toBeNull();
  });
});

import { describe, expect, test } from "vitest";
import { caveFaceDirection } from "../geometry/cave-projection.js";
import { sourceDirectionFromPhysicalDirection } from "../geometry/source-transform.js";
import { caveSourceDirectionForFaceSample } from "./cave-exporter.js";
import type { Vec3 } from "../projection.js";

describe("CAVE exporter source rays", () => {
  test("uses raw eye-relative CAVE rays when no source transform is requested", () => {
    const sample = { u: 0.25, v: 0.75 };

    expectVectorClose(caveSourceDirectionForFaceSample("right", sample), caveFaceDirection("right", sample));
  });

  test("applies the same source orientation transform as the CAVE preview shader", () => {
    const sample = { u: 0.7, v: 0.2 };
    const transform = {
      sourceRotationRadians: Math.PI * 0.22,
      domeTiltRadians: -Math.PI * 0.14,
      mirror: true,
    };
    const physical = caveFaceDirection("front", sample);

    expectVectorClose(
      caveSourceDirectionForFaceSample("front", sample, undefined, transform),
      sourceDirectionFromPhysicalDirection(physical, transform),
    );
  });
});

function expectVectorClose(actual: Vec3, expected: Vec3): void {
  for (let index = 0; index < 3; index += 1) {
    expect(actual[index]).toBeCloseTo(expected[index], 6);
  }
}

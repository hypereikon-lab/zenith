import { describe, expect, test } from "vitest";
import { DEFAULT_CAVE_ROOM, caveContinuityDirectionFromSurfacePoint, caveFacePoint } from "../geometry/cave-projection.js";
import { sourceDirectionFromPhysicalDirection } from "../geometry/source-transform.js";
import { caveSourceDirectionForFaceSample } from "./cave-exporter.js";
import type { Vec3 } from "../projection.js";

describe("CAVE exporter source rays", () => {
  test("uses room-continuity wall rays when no source transform is requested", () => {
    const sample = { u: 0.25, v: 0.75 };

    expectVectorClose(caveSourceDirectionForFaceSample("right", sample), continuityDirection("right", sample));
  });

  test("applies the same source orientation transform as the CAVE preview shader", () => {
    const sample = { u: 0.7, v: 0.2 };
    const transform = {
      sourceRotationRadians: Math.PI * 0.22,
      domeTiltRadians: -Math.PI * 0.14,
      mirror: true,
    };
    const physical = continuityDirection("front", sample);

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

function continuityDirection(face: Parameters<typeof caveFacePoint>[0], sample: Parameters<typeof caveFacePoint>[1]): Vec3 {
  const point = caveFacePoint(face, sample, DEFAULT_CAVE_ROOM);
  return caveContinuityDirectionFromSurfacePoint(
    [
      point[0] - (DEFAULT_CAVE_ROOM.eyeX || 0),
      point[1] - DEFAULT_CAVE_ROOM.eyeHeight,
      point[2] - (DEFAULT_CAVE_ROOM.eyeZ || 0),
    ],
    DEFAULT_CAVE_ROOM,
  );
}

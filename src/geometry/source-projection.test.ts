import { describe, expect, test } from "vitest";
import {
  normalizeSourceProjectionMode,
  SOURCE_PROJECTION_MODES,
  sourceProjectionContainsDirection,
  sourceProjectionGeometryRange,
  sourceProjectionHorizonRadius,
  sourceProjectionLabel,
  sourceProjectionProfileForMode,
} from "./source-projection.js";
import { directionToFisheyeUv, fisheyeUvToDirection } from "./fisheye-projection.js";
import type { SourceProjectionMode } from "./source-projection.js";
import type { Vec3 } from "../projection.js";

describe("source projection modes", () => {
  test("round-trips representative directions for every source projection mode", () => {
    const samples: Record<SourceProjectionMode, Vec3[]> = {
      "zenith-180": [
        [0, 1, 0],
        [0, 0, 1],
        [1, 0, 0],
        normalize([0.35, 0.72, -0.6]),
      ],
      "zenith-270": [
        [0, 1, 0],
        [0, 0, 1],
        [1, 0, 0],
        normalize([0.22, -0.58, 0.78]),
      ],
      "nadir-180": [
        [0, -1, 0],
        [0, 0, 1],
        [1, 0, 0],
        normalize([-0.42, -0.76, 0.5]),
      ],
      "nadir-270": [
        [0, -1, 0],
        [0, 0, 1],
        [1, 0, 0],
        normalize([-0.22, 0.58, 0.78]),
      ],
    };

    for (const mode of SOURCE_PROJECTION_MODES) {
      const profile = sourceProjectionProfileForMode(mode, 1024, 1024);
      for (const direction of samples[mode]) {
        const uv = directionToFisheyeUv(direction, profile);
        expect(uv).not.toBeNull();
        const roundTrip = fisheyeUvToDirection(uv!.u, uv!.v, profile);
        expectVectorClose(roundTrip, direction);
      }
    }
  });

  test("places the horizon at the expected radius for 180 and 270 modes", () => {
    for (const mode of SOURCE_PROJECTION_MODES) {
      const profile = sourceProjectionProfileForMode(mode, 1024, 1024);
      const uv = directionToFisheyeUv([0, 0, 1], profile);
      expect(uv).not.toBeNull();
      const radius = Math.hypot((uv!.u - 0.5) / profile.fisheyeScaleX, (uv!.v - 0.5) / profile.fisheyeScaleY);
      expect(radius).toBeCloseTo(mode.endsWith("270") ? 2 / 3 : 1, 8);
      expect(sourceProjectionHorizonRadius(mode)).toBeCloseTo(mode.endsWith("270") ? 2 / 3 : 1, 8);
    }
  });

  test("rejects directions outside each source cone", () => {
    const outside: Record<SourceProjectionMode, Vec3> = {
      "zenith-180": [0, -1, 0],
      "zenith-270": [0, -1, 0],
      "nadir-180": [0, 1, 0],
      "nadir-270": [0, 1, 0],
    };

    for (const mode of SOURCE_PROJECTION_MODES) {
      expect(sourceProjectionContainsDirection(outside[mode], mode)).toBe(false);
    }
  });

  test("supports zenith 270 as a first-class projection mode", () => {
    expect(normalizeSourceProjectionMode("zenith-270")).toBe("zenith-270");
    expect(sourceProjectionLabel("zenith-270")).toBe("Zenith 270");
    expect(sourceProjectionHorizonRadius("zenith-270")).toBeCloseTo(2 / 3, 8);

    const range = sourceProjectionGeometryRange("zenith-270");
    expect(range.thetaStart).toBeCloseTo(0, 8);
    expect(range.thetaEnd).toBeCloseTo((Math.PI * 3) / 4, 8);
  });

  test("maps zenith 270 horizon and below-horizon band into the source circle", () => {
    const profile = sourceProjectionProfileForMode("zenith-270", 1024, 1024);
    const horizon = directionToFisheyeUv([0, 0, 1], profile);
    const belowHorizon = directionToFisheyeUv([0, -Math.SQRT1_2, Math.SQRT1_2], profile);

    expect(horizon?.u).toBeCloseTo(0.5, 8);
    expect(horizon?.v).toBeCloseTo(1 / 6, 8);
    expect(belowHorizon?.u).toBeCloseTo(0.5, 8);
    expect(belowHorizon?.v).toBeCloseTo(0, 8);
    expect(directionToFisheyeUv([0, -1, 0], profile)).toBeNull();
  });
});

function normalize(vector: Vec3): Vec3 {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function expectVectorClose(actual: Vec3 | null, expected: Vec3): void {
  expect(actual).not.toBeNull();
  const value = actual as Vec3;
  for (let index = 0; index < 3; index += 1) {
    expect(value[index]).toBeCloseTo(expected[index], 6);
  }
}

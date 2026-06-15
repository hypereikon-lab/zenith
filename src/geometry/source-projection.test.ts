import { describe, expect, test } from "vitest";
import {
  normalizeSourceProjectionMode,
  SOURCE_PROJECTION_MODES,
  sourceProjectionBeyondHorizonDegrees,
  sourceProjectionContainsDirection,
  sourceProjectionFieldOfViewDegrees,
  sourceProjectionGeometryRange,
  sourceProjectionHorizonRadius,
  sourceProjectionLabel,
  sourceProjectionProfileForMode,
  sourceProjectionShaderTheta,
  sourceProjectionSummary,
  sourceCarrierRadiusToPhysicalRadius,
  sourceDirectionToMapPoint,
  sourceDirectionToUv,
  sourceMapPointToDirection,
  sourceMapPointToUv,
  sourcePhysicalRadiusToCarrierRadius,
  sourceUvToMapPoint,
  sourceUvToDirection,
} from "./source-projection.js";
import { DEFAULT_CAVE_CONTINUITY_FLOOR_BAND } from "./cave-continuity-carrier.js";
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
      "zenith-230": [
        [0, 1, 0],
        [0, 0, 1],
        [1, 0, 0],
        normalize([0.16, -0.34, 0.93]),
      ],
      "nadir-180": [
        [0, -1, 0],
        [0, 0, 1],
        [1, 0, 0],
        normalize([-0.42, -0.76, 0.5]),
      ],
      "cave-270": [
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

  test("places the horizon at the expected radius for every mode", () => {
    const expectedHorizonRadius: Record<SourceProjectionMode, number> = {
      "zenith-180": 1,
      "zenith-230": 18 / 23,
      "nadir-180": 1,
      "cave-270": DEFAULT_CAVE_CONTINUITY_FLOOR_BAND,
    };

    for (const mode of SOURCE_PROJECTION_MODES) {
      if (mode === "cave-270") {
        expect(sourceProjectionHorizonRadius(mode)).toBeCloseTo(expectedHorizonRadius[mode], 8);
        continue;
      }
      const profile = sourceProjectionProfileForMode(mode, 1024, 1024);
      const uv = directionToFisheyeUv([0, 0, 1], profile);
      expect(uv).not.toBeNull();
      const radius = Math.hypot((uv!.u - 0.5) / profile.fisheyeScaleX, (uv!.v - 0.5) / profile.fisheyeScaleY);
      expect(radius).toBeCloseTo(expectedHorizonRadius[mode], 8);
      expect(sourceProjectionHorizonRadius(mode)).toBeCloseTo(expectedHorizonRadius[mode], 8);
    }
  });

  test("threads the live CAVE floor split through source UV conversion", () => {
    const floorEdgeDirection: Vec3 = normalize([0, -1, 1]);
    const defaultUv = sourceDirectionToUv(floorEdgeDirection, "cave-270");
    const wideFloorUv = sourceDirectionToUv(floorEdgeDirection, "cave-270", 2, 2, 1, 0.5);

    expect(defaultUv).not.toBeNull();
    expect(wideFloorUv).not.toBeNull();
    expect(defaultUv!.v).toBeCloseTo(0.5 - DEFAULT_CAVE_CONTINUITY_FLOOR_BAND * 0.5, 8);
    expect(wideFloorUv!.v).toBeCloseTo(0.25, 8);
    expectVectorClose(sourceUvToDirection(wideFloorUv!.u, wideFloorUv!.v, "cave-270", 2, 2, 1, 0.5), floorEdgeDirection);
  });

  test("treats CAVE source-map points as square carrier coordinates", () => {
    const cornerUv = sourceMapPointToUv({ radius: 1, azimuth: 45 }, "cave-270");
    expect(cornerUv.u).toBeCloseTo(1, 8);
    expect(cornerUv.v).toBeCloseTo(0, 8);

    const cornerPoint = sourceUvToMapPoint(cornerUv.u, cornerUv.v, "cave-270");
    expect(cornerPoint).not.toBeNull();
    expect(cornerPoint!.radius).toBeCloseTo(1, 8);
    expect(cornerPoint!.azimuth).toBeCloseTo(45, 8);

    const floorEdge = sourceMapPointToDirection({ radius: 0.5, azimuth: 0 }, "cave-270", 2, 2, 1, 0.5);
    expect(floorEdge).not.toBeNull();
    const roundTripPoint = sourceDirectionToMapPoint(floorEdge!, "cave-270", 2, 2, 1, 0.5);
    expect(roundTripPoint).not.toBeNull();
    expect(roundTripPoint!.radius).toBeCloseTo(0.5, 8);
    expect(roundTripPoint!.azimuth).toBeCloseTo(0, 8);
  });

  test("remaps dome source-map carrier radius through the inner guide split", () => {
    const split = 1 / 3;
    const zenithMidSky: Vec3 = normalize([0, Math.SQRT1_2, Math.SQRT1_2]);
    const zenithMidUv = sourceDirectionToUv(zenithMidSky, "zenith-180", 2, 2, 1, split);

    expect(zenithMidUv).not.toBeNull();
    expect(zenithMidUv!.u).toBeCloseTo(0.5, 8);
    expect(zenithMidUv!.v).toBeCloseTo(0.5 - split * 0.5, 8);
    expectVectorClose(sourceUvToDirection(zenithMidUv!.u, zenithMidUv!.v, "zenith-180", 2, 2, 1, split), zenithMidSky);

    const carrierMid = sourcePhysicalRadiusToCarrierRadius(0.5, "zenith-180", split);
    const physicalMid = sourceCarrierRadiusToPhysicalRadius(split, "zenith-180", split);
    expect(carrierMid).toBeCloseTo(split, 8);
    expect(physicalMid).toBeCloseTo(0.5, 8);
  });

  test("keeps the zenith 230 physical horizon as a second carrier boundary", () => {
    const split = 1 / 3;
    const carrierHorizon = 0.68;
    const horizon = sourceProjectionHorizonRadius("zenith-230");
    const midSkyPhysical = horizon * 0.5;
    const horizonDirection: Vec3 = [0, 0, 1];
    const horizonUv = sourceDirectionToUv(horizonDirection, "zenith-230", 2, 2, 1, split, carrierHorizon);

    expect(sourcePhysicalRadiusToCarrierRadius(midSkyPhysical, "zenith-230", split, carrierHorizon)).toBeCloseTo(split, 8);
    expect(sourcePhysicalRadiusToCarrierRadius(horizon, "zenith-230", split, carrierHorizon)).toBeCloseTo(carrierHorizon, 8);
    expect(horizonUv).not.toBeNull();
    expect(horizonUv!.v).toBeCloseTo(0.5 - carrierHorizon * 0.5, 8);
    expectVectorClose(
      sourceUvToDirection(horizonUv!.u, horizonUv!.v, "zenith-230", 2, 2, 1, split, carrierHorizon),
      horizonDirection,
    );
  });

  test("maps CAVE eye level through the editable horizon carrier", () => {
    const eyeLevelFront: Vec3 = [0, 0, 1];
    const uv = sourceDirectionToUv(eyeLevelFront, "cave-270", 2, 2, 1, 1 / 3, 0.58);

    expect(uv).not.toBeNull();
    expect(uv!.u).toBeCloseTo(0.5, 8);
    expect(uv!.v).toBeCloseTo(0.5 - 0.58 * 0.5, 8);
    expectVectorClose(sourceUvToDirection(uv!.u, uv!.v, "cave-270", 2, 2, 1, 1 / 3, 0.58), eyeLevelFront);
  });

  test("encodes the WebGPU source theta slot through one projection helper", () => {
    expect(sourceProjectionShaderTheta("zenith-180")).toBeCloseTo(Math.PI * 0.5, 8);
    expect(sourceProjectionShaderTheta("zenith-230")).toBeCloseTo((Math.PI * 23) / 36, 8);
    expect(sourceProjectionShaderTheta("nadir-180")).toBeCloseTo(Math.PI * 0.5, 8);
    expect(sourceProjectionShaderTheta("cave-270")).toBeCloseTo(-DEFAULT_CAVE_CONTINUITY_FLOOR_BAND, 8);
    expect(sourceProjectionShaderTheta("cave-270", undefined, 0.5)).toBeCloseTo(-0.5, 8);
    expect(sourceProjectionHorizonRadius("cave-270", 0.5)).toBeCloseTo(0.5, 8);
  });

  test("summarizes projection profiles with production-facing geometry", () => {
    const expected: Record<SourceProjectionMode, { fov: number; beyondHorizon: number; center: "Zenith" | "Nadir" }> = {
      "zenith-180": { fov: 180, beyondHorizon: 0, center: "Zenith" },
      "zenith-230": { fov: 230, beyondHorizon: 25, center: "Zenith" },
      "nadir-180": { fov: 180, beyondHorizon: 0, center: "Nadir" },
      "cave-270": { fov: 270, beyondHorizon: 45, center: "Nadir" },
    };

    for (const mode of SOURCE_PROJECTION_MODES) {
      const summary = sourceProjectionSummary(mode);
      expect(summary.mode).toBe(mode);
      expect(summary.center).toBe(expected[mode].center);
      expect(summary.fieldOfViewDegrees).toBe(expected[mode].fov);
      expect(summary.halfAngleDegrees).toBe(expected[mode].fov * 0.5);
      expect(summary.beyondHorizonDegrees).toBe(expected[mode].beyondHorizon);
      expect(sourceProjectionFieldOfViewDegrees(mode)).toBe(expected[mode].fov);
      expect(sourceProjectionBeyondHorizonDegrees(mode)).toBe(expected[mode].beyondHorizon);
      expect(summary.horizonRadius).toBeCloseTo(sourceProjectionHorizonRadius(mode), 8);
    }
  });

  test("rejects directions outside each source cone", () => {
    const outside: Record<SourceProjectionMode, Vec3> = {
      "zenith-180": [0, -1, 0],
      "zenith-230": [0, -1, 0],
      "nadir-180": [0, 1, 0],
      "cave-270": [0, 1, 0],
    };

    for (const mode of SOURCE_PROJECTION_MODES) {
      expect(sourceProjectionContainsDirection(outside[mode], mode)).toBe(false);
    }
  });

  test("supports zenith 230 as a first-class projection mode", () => {
    expect(normalizeSourceProjectionMode("zenith-230")).toBe("zenith-230");
    expect(sourceProjectionLabel("zenith-230")).toBe("Zenith 230");
    expect(sourceProjectionHorizonRadius("zenith-230")).toBeCloseTo(18 / 23, 8);

    const range = sourceProjectionGeometryRange("zenith-230");
    expect(range.thetaStart).toBeCloseTo(0, 8);
    expect(range.thetaEnd).toBeCloseTo((Math.PI * 23) / 36, 8);
  });

  test("normalizes obsolete zenith 270 state to the default zenith source profile", () => {
    expect(normalizeSourceProjectionMode("zenith-270")).toBe("zenith-180");
  });

  test("normalizes legacy nadir 270 state to the CAVE 270 source profile", () => {
    expect(normalizeSourceProjectionMode("nadir-270")).toBe("cave-270");
    expect(sourceProjectionLabel("cave-270")).toBe("CAVE 270");
  });

  test("maps zenith 230 horizon and 25-degree below-horizon band into the source circle", () => {
    const profile = sourceProjectionProfileForMode("zenith-230", 1024, 1024);
    const horizon = directionToFisheyeUv([0, 0, 1], profile);
    const lowerRim = directionToFisheyeUv([0, Math.cos((Math.PI * 23) / 36), Math.sin((Math.PI * 23) / 36)], profile);

    expect(horizon?.u).toBeCloseTo(0.5, 8);
    expect(horizon?.v).toBeCloseTo(5 / 46, 8);
    expect(lowerRim?.u).toBeCloseTo(0.5, 8);
    expect(lowerRim?.v).toBeCloseTo(0, 8);
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

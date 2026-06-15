import { describe, expect, test } from "vitest";
import { angularDistance } from "../projection.js";
import { DEFAULT_CAVE_ROOM, caveContinuityDirectionFromSurfacePoint } from "./cave-projection.js";
import {
  DEFAULT_CAVE_CONTINUITY_FLOOR_BAND,
  carrierWallRadiusToPhysicalWallT,
  caveContinuitySurfacePointToUv,
  caveContinuityUvToDirection,
  caveContinuityUvToSurfacePoint,
  createCaveContinuityCarrierProfile,
  directionToCaveContinuityUv,
  physicalWallTToCarrierWallRadius,
} from "./cave-continuity-carrier.js";
import type { Vec3 } from "../projection.js";

describe("CAVE continuity carrier", () => {
  const profile = createCaveContinuityCarrierProfile({ width: 2048, height: 2048 });

  test("maps image center to the CAVE floor center", () => {
    expectVectorClose(caveContinuityUvToSurfacePoint(0.5, 0.5, profile), [0, -2, 0]);
    expectVectorClose(caveContinuityUvToDirection(0.5, 0.5, profile), [0, -1, 0]);
  });

  test("maps the carrier floor band to wall bases", () => {
    expectVectorClose(caveContinuityUvToSurfacePoint(0.5, 0.5 - DEFAULT_CAVE_CONTINUITY_FLOOR_BAND * 0.5, profile), [0, -2, 2]);
    expectVectorClose(caveContinuityUvToSurfacePoint(0.5 + DEFAULT_CAVE_CONTINUITY_FLOOR_BAND * 0.5, 0.5, profile), [2, -2, 0]);
  });

  test("maps the outer image boundary to the upper CAVE edge", () => {
    expectVectorClose(caveContinuityUvToSurfacePoint(0.5, 0, profile), [0, 2, 2]);
    expectVectorClose(caveContinuityUvToSurfacePoint(1, 0.5, profile), [2, 2, 0]);
    expectVectorClose(caveContinuityUvToSurfacePoint(0.5, 1, profile), [0, 2, -2]);
  });

  test("maps an editable carrier horizon to physical eye level", () => {
    const compressed = createCaveContinuityCarrierProfile({ floorBand: 1 / 3, horizonBand: 0.58 });

    expectVectorClose(caveContinuityUvToSurfacePoint(0.5, 0.5 - compressed.horizonBand * 0.5, compressed), [0, 0, 2]);
    expect(carrierWallRadiusToPhysicalWallT(compressed.horizonBand, compressed)).toBeCloseTo(0.5, 8);
    expect(physicalWallTToCarrierWallRadius(0.5, compressed)).toBeCloseTo(0.58, 8);

    const eyeLevelUv = caveContinuitySurfacePointToUv([0, 0, 2], compressed);
    expect(eyeLevelUv).not.toBeNull();
    expect(eyeLevelUv!.v).toBeCloseTo(0.5 - 0.58 * 0.5, 8);
  });

  test("round-trips wall and floor surface points through the carrier", () => {
    const points: Vec3[] = [
      [0, -2, 0],
      [0, -2, 2],
      [1.2, -2, 0.8],
      [2, -1, 1],
      [0, 0.25, 2],
      [-2, 1.5, -0.8],
    ];

    for (const point of points) {
      const uv = caveContinuitySurfacePointToUv(point, profile);
      expect(uv).not.toBeNull();
      expectVectorClose(caveContinuityUvToSurfacePoint(uv!.u, uv!.v, profile), point);
    }
  });

  test("round-trips CAVE continuity directions through source uv", () => {
    const points: Vec3[] = [
      [0, -2, 0],
      [0, -2, 2],
      [2, -2, 0],
      [0, 0, 2],
      [-2, 1.25, 0],
    ];

    for (const point of points) {
      const direction = caveContinuityDirectionFromSurfacePoint(point, DEFAULT_CAVE_ROOM);
      const uv = directionToCaveContinuityUv(direction, profile);
      expect(uv).not.toBeNull();
      const roundTrip = caveContinuityUvToDirection(uv!.u, uv!.v, profile);
      expect(roundTrip).not.toBeNull();
      expect(angularDistance(direction, roundTrip!)).toBeLessThan(0.00001);
    }
  });

  test("supports non-square carriers without changing the center and boundary invariants", () => {
    const wide = createCaveContinuityCarrierProfile({ width: 2100, height: 900 });
    expectVectorClose(caveContinuityUvToSurfacePoint(0.5, 0.5, wide), [0, -2, 0]);
    expect(caveContinuityUvToSurfacePoint(0.5, 0, wide)?.[1]).toBeCloseTo(2, 6);
    expect(caveContinuityUvToSurfacePoint(1, 0.5, wide)?.[1]).toBeCloseTo(2, 6);
  });
});

function expectVectorClose(actual: Vec3 | null, expected: Vec3, precision = 6): void {
  expect(actual).not.toBeNull();
  const value = actual as Vec3;
  for (let index = 0; index < 3; index += 1) {
    expect(value[index]).toBeCloseTo(expected[index], precision);
  }
}

import { describe, expect, test } from "vitest";
import {
  cornerOffsetFromLocal,
  directionFromPlateUv,
  directionToPlateLocal,
  normalizePlatePlacement,
  plateCornerBaseLocal,
  plateCornerLocal,
  plateLocalToWarpedUv,
  plateUvToLocal,
  preparePlatePlacement,
} from "./plate-placement.js";
import { SOURCE_PROJECTION_MODES } from "../geometry/source-projection.js";

describe("plate placement corner warp", () => {
  test("normalizes corner offsets with bounded defaults", () => {
    const placement = normalizePlatePlacement({
      cornerOffsets: {
        ne: { x: 1.5, y: -1.2 },
        sw: { x: 0.25 },
      },
    });

    expect(placement.cornerOffsets.nw).toEqual({ x: 0, y: 0 });
    expect(placement.cornerOffsets.ne).toEqual({ x: 0.85, y: -0.85 });
    expect(placement.cornerOffsets.sw).toEqual({ x: 0.25, y: 0 });
  });

  test("moves warped corners independently from the rectangular base", () => {
    const placement = preparePlatePlacement(
      {
        scale: 1,
        cornerOffsets: {
          ne: { x: -0.2, y: 0.3 },
        },
      },
      { aspect: 1 },
    );
    const base = plateCornerBaseLocal(placement, "ne");
    const warped = plateCornerLocal(placement, "ne");

    expect(warped.x).toBeLessThan(base.x);
    expect(warped.y).toBeGreaterThan(base.y);
  });

  test("round-trips warped uv through the local inverse", () => {
    const placement = preparePlatePlacement(
      {
        scale: 1,
        cornerOffsets: {
          nw: { x: 0.08, y: -0.05 },
          ne: { x: -0.18, y: 0.12 },
          se: { x: 0.09, y: -0.04 },
          sw: { x: -0.03, y: 0.16 },
        },
      },
      { aspect: 1.4 },
    );
    const local = plateUvToLocal(placement, 0.72, 0.28);
    const uv = plateLocalToWarpedUv(local, placement);

    expect(uv).not.toBeNull();
    expect(uv?.x).toBeCloseTo(0.72, 5);
    expect(uv?.y).toBeCloseTo(0.28, 5);
  });

  test("round-trips warped uv through spherical direction and local inverse", () => {
    const placement = preparePlatePlacement(
      {
        azimuth: 74,
        radius: 0.58,
        scale: 0.9,
        spin: -31,
        cornerOffsets: {
          nw: { x: 0.08, y: -0.05 },
          ne: { x: -0.14, y: 0.1 },
          se: { x: 0.07, y: -0.03 },
          sw: { x: -0.04, y: 0.12 },
        },
      },
      { aspect: 1.35 },
    );

    for (const [u, v] of [
      [0.5, 0.5],
      [0.22, 0.36],
      [0.74, 0.63],
    ]) {
      const direction = directionFromPlateUv(placement, u, v);
      const local = directionToPlateLocal(direction, placement);
      expect(local).not.toBeNull();
      const uv = plateLocalToWarpedUv(local!, placement);

      expect(uv).not.toBeNull();
      expect(uv?.x).toBeCloseTo(u, 5);
      expect(uv?.y).toBeCloseTo(v, 5);
    }
  });

  test("round-trips plate directions in every source projection mode", () => {
    for (const mode of SOURCE_PROJECTION_MODES) {
      const placement = preparePlatePlacement(
        {
          azimuth: -38,
          radius: 0.62,
          scale: 0.82,
          spin: 23,
          cornerOffsets: {
            nw: { x: 0.04, y: -0.03 },
            ne: { x: -0.1, y: 0.08 },
            se: { x: 0.06, y: -0.02 },
            sw: { x: -0.03, y: 0.09 },
          },
        },
        { aspect: 1.6 },
        mode,
      );

      for (const [u, v] of [
        [0.5, 0.5],
        [0.18, 0.24],
        [0.82, 0.76],
      ]) {
        const direction = directionFromPlateUv(placement, u, v);
        const local = directionToPlateLocal(direction, placement);
        expect(local).not.toBeNull();
        const uv = plateLocalToWarpedUv(local!, placement);

        expect(uv).not.toBeNull();
        expect(uv?.x).toBeCloseTo(u, 5);
        expect(uv?.y).toBeCloseTo(v, 5);
      }
    }
  });

  test("derives a bounded corner offset from a dragged local corner", () => {
    const placement = preparePlatePlacement({ scale: 1 }, { aspect: 1 });
    const base = plateCornerBaseLocal(placement, "se");
    const offset = cornerOffsetFromLocal(placement, "se", {
      x: base.x + placement.angularWidth * 0.4,
      y: base.y - placement.angularHeight * 0.2,
    });

    expect(offset.x).toBeCloseTo(0.4);
    expect(offset.y).toBeCloseTo(-0.2);
  });
});

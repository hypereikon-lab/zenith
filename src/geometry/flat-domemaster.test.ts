import { describe, expect, test } from "vitest";
import {
  clientPointToCanvasPoint,
  domeDirectionToFlatPoint,
  flatDisplayPointToDomeDirection,
  flatDisplayPointToDomePoint,
  sourceFlatToDisplayFlatPoint,
} from "./flat-domemaster.js";
import { HALF_PI } from "../projection.js";

describe("flat domemaster coordinate spaces", () => {
  test("maps viewport client points into canvas-local CSS pixels", () => {
    const point = clientPointToCanvasPoint(
      { x: 460, y: 190 },
      { left: 280, top: 40, width: 720, height: 720 },
      { width: 100, height: 100 },
    );

    expect(point.x).toBeCloseTo(25);
    expect(point.y).toBeCloseTo(20.833333);
  });

  test("undoes flat display rotation before reading dome azimuth", () => {
    const metrics = { cx: 50, cy: 50, radius: 50 };
    const sourceNorth = { x: 50, y: 25 };
    const displayedSouth = sourceFlatToDisplayFlatPoint(sourceNorth, 50, 50, Math.PI);

    const point = flatDisplayPointToDomePoint(displayedSouth, metrics, { rotationRadians: Math.PI });
    const direction = flatDisplayPointToDomeDirection(displayedSouth, metrics, { rotationRadians: Math.PI });

    expect(point).toEqual({ radius: 0.5, azimuth: 0 });
    expect(direction[0]).toBeCloseTo(0);
    expect(direction[1]).toBeCloseTo(Math.cos(Math.PI * 0.25));
    expect(direction[2]).toBeCloseTo(Math.sin(Math.PI * 0.25));
  });

  test("uses the active projection curve when reading flat source radius", () => {
    const metrics = { cx: 50, cy: 50, radius: 50 };
    const halfwayRight = { x: 75, y: 50 };

    const equidistant = flatDisplayPointToDomePoint(halfwayRight, metrics, { projectionMode: "equidistant" });
    const orthographic = flatDisplayPointToDomePoint(halfwayRight, metrics, { projectionMode: "orthographic" });

    expect(equidistant?.radius).toBeCloseTo(0.5);
    expect(orthographic?.radius).toBeCloseTo(Math.asin(0.5) / HALF_PI);
  });

  test("projects dome directions through the active flat projection curve", () => {
    const direction: [number, number, number] = [0.5, Math.sqrt(1 - 0.5 * 0.5), 0];
    const equidistant = domeDirectionToFlatPoint(direction, 50, 50, 50, { projectionMode: "equidistant" });
    const orthographic = domeDirectionToFlatPoint(direction, 50, 50, 50, { projectionMode: "orthographic" });

    expect(equidistant?.x).toBeCloseTo(50 + (Math.asin(0.5) / HALF_PI) * 50);
    expect(orthographic?.x).toBeCloseTo(75);
    expect(orthographic?.x).toBeGreaterThan(equidistant?.x ?? 0);
  });

  test("round-trips source directions through flat display mapping for every projection curve", () => {
    const metrics = { cx: 120, cy: 96, radius: 72 };
    const sourceDirection = normalize([0.33, 0.72, 0.61]);
    const rotationRadians = Math.PI * 0.37;

    for (const projectionMode of ["equidistant", "equisolid", "orthographic", "stereographic", "custom"]) {
      const options = { projectionMode, customCurve: 1.7 };
      const sourcePoint = domeDirectionToFlatPoint(sourceDirection, metrics.cx, metrics.cy, metrics.radius, options);
      const displayPoint = sourceFlatToDisplayFlatPoint(sourcePoint, metrics.cx, metrics.cy, rotationRadians);
      if (!displayPoint) throw new Error(`Expected display point for ${projectionMode}`);

      const roundTrip = flatDisplayPointToDomeDirection(displayPoint, metrics, {
        ...options,
        rotationRadians,
      });

      expectVectorClose(roundTrip, sourceDirection);
    }
  });
});

function normalize(vector: [number, number, number]): [number, number, number] {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function expectVectorClose(actual: [number, number, number] | null, expected: [number, number, number]): void {
  expect(actual).not.toBeNull();
  const value = actual as [number, number, number];
  for (let index = 0; index < 3; index += 1) {
    expect(value[index]).toBeCloseTo(expected[index], 8);
  }
}

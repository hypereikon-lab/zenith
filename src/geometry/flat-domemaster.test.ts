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
});

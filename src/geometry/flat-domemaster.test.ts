import { describe, expect, test } from "vitest";
import {
  clientPointToCanvasPoint,
  flatDisplayPointToDomeDirection,
  flatDisplayPointToDomePoint,
  sourceFlatToDisplayFlatPoint,
} from "./flat-domemaster.js";

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
});

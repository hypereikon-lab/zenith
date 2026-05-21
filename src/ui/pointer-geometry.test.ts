import { describe, expect, test } from "vitest";
import { flatMapMetricsFromClient } from "./pointer-geometry.js";

const layout = {
  flatRect: { x: 100, y: 50, width: 400, height: 400 },
};

describe("pointer geometry", () => {
  test("maps client coordinates into flat dome metrics", () => {
    const metrics = flatMapMetricsFromClient({ x: 300, y: 250 }, layout);
    expect(metrics).toMatchObject({
      rect: layout.flatRect,
      radius: 200,
      cx: 300,
      cy: 250,
      x: 300,
      y: 250,
      dx: 0,
      dy: 0,
    });
  });

  test("allows placement centers on the domemaster horizon", () => {
    const metrics = flatMapMetricsFromClient({ x: 500, y: 250 }, layout);
    expect(metrics).toMatchObject({ dx: 1, dy: 0 });
  });
});

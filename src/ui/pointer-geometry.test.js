import { describe, expect, test } from "vitest";
import {
  flatDomePointFromMetrics,
  flatMapMetricsFromClient,
  flatMapUvFromMetrics,
} from "./pointer-geometry.js";

const layout = {
  flatRect: { x: 100, y: 50, width: 400, height: 400 },
};

describe("pointer geometry", () => {
  test("maps client coordinates into flat dome metrics and uv", () => {
    const metrics = flatMapMetricsFromClient({ x: 300, y: 250 }, layout);
    expect(metrics).toMatchObject({ cx: 300, cy: 250, dx: 0, dy: 0 });
    expect(flatMapUvFromMetrics(metrics)).toEqual({ u: 0.5, v: 0.5 });
    expect(flatDomePointFromMetrics(metrics)).toEqual({ radius: 0, azimuth: -180 });
  });

  test("allows placement centers on the domemaster horizon", () => {
    const metrics = flatMapMetricsFromClient({ x: 500, y: 250 }, layout);
    expect(flatDomePointFromMetrics(metrics)).toMatchObject({ radius: 1 });
  });
});

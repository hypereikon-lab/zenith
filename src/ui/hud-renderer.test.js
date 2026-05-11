import { describe, expect, test } from "vitest";
import { preparePlatePlacement } from "../plates/plate-placement.js";
import { domeDirectionToFlatPoint, plateUvToFlatPoint, projectPoint, visiblePlateUvBounds } from "./hud-renderer.js";

const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

describe("hud renderer geometry", () => {
  test("projects clip-visible points into a screen rect", () => {
    const rect = { x: 20, y: 10, width: 200, height: 100 };
    expect(projectPoint(identity, [0, 0, 0.5], rect)).toEqual({ x: 120, y: 60 });
    expect(projectPoint(identity, [1.2, 0, 0.5], rect)).toBeNull();
    expect(projectPoint(identity, [0, 0, -0.1], rect)).toBeNull();
  });

  test("maps dome directions back to flat domemaster positions", () => {
    expect(domeDirectionToFlatPoint([0, 1, 0], 100, 80, 50)).toEqual({ x: 100, y: 80 });
    expect(domeDirectionToFlatPoint([0, 0, 1], 100, 80, 50)).toEqual({ x: 100, y: 30 });
    expect(domeDirectionToFlatPoint([0, -1, 0], 100, 80, 50)).toBeNull();
  });

  test("maps zero-spin plate vertical axis along the equidistant radial line", () => {
    const placement = preparePlatePlacement({
      azimuth: 0,
      radius: 0.5,
      scale: 0.7,
      spin: 0,
      opacity: 1,
    });

    const center = plateUvToFlatPoint(placement, 0.5, 0.5, 100, 100, 80);
    const top = plateUvToFlatPoint(placement, 0.5, 0, 100, 100, 80);
    const bottom = plateUvToFlatPoint(placement, 0.5, 1, 100, 100, 80);
    const left = plateUvToFlatPoint(placement, 0, 0.5, 100, 100, 80);
    const right = plateUvToFlatPoint(placement, 1, 0.5, 100, 100, 80);

    expect(center).toEqual({ x: 100, y: 60 });
    expect(Math.abs(top.x - center.x)).toBeLessThan(0.02);
    expect(Math.abs(bottom.x - center.x)).toBeLessThan(0.02);
    expect(top.y).toBeGreaterThan(center.y);
    expect(bottom.y).toBeLessThan(center.y);
    expect(left.x).toBeLessThan(center.x);
    expect(right.x).toBeGreaterThan(center.x);
  });

  test("rotates zero-spin plate axes around the domemaster center", () => {
    const placement = preparePlatePlacement({
      azimuth: 90,
      radius: 0.5,
      scale: 0.7,
      spin: 0,
      opacity: 1,
    });

    const center = plateUvToFlatPoint(placement, 0.5, 0.5, 100, 100, 80);
    const top = plateUvToFlatPoint(placement, 0.5, 0, 100, 100, 80);
    const bottom = plateUvToFlatPoint(placement, 0.5, 1, 100, 100, 80);

    expect(center).toEqual({ x: 140, y: 100 });
    expect(top.x).toBeLessThan(center.x);
    expect(bottom.x).toBeGreaterThan(center.x);
    expect(Math.abs(top.y - center.y)).toBeLessThan(0.02);
    expect(Math.abs(bottom.y - center.y)).toBeLessThan(0.02);
  });

  test("projects plate bounds as curved spherical patch edges", () => {
    const placement = preparePlatePlacement(
      {
        azimuth: 90,
        radius: 0.5,
        scale: 0.7,
        spin: 0,
        opacity: 1,
      },
      { aspect: 1 },
    );
    const left = plateUvToFlatPoint(placement, 0, 0, 100, 100, 80);
    const middle = plateUvToFlatPoint(placement, 0.5, 0, 100, 100, 80);
    const right = plateUvToFlatPoint(placement, 1, 0, 100, 100, 80);
    const linearY = left.y + ((right.y - left.y) * (middle.x - left.x)) / (right.x - left.x);

    expect(Math.abs(middle.y - linearY)).toBeGreaterThan(0.1);
  });

  test("keeps near-zenith spherical patch edges drawable", () => {
    const placement = preparePlatePlacement(
      {
        azimuth: 0,
        radius: 0.12,
        scale: 0.72,
        spin: 0,
        opacity: 1,
      },
      { aspect: 1 },
    );

    expect(plateUvToFlatPoint(placement, 0.5, 0, 100, 100, 80)).not.toBeNull();
  });

  test("insets contain-mode HUD bounds to the visible image area", () => {
    const placement = preparePlatePlacement(
      {
        azimuth: 0,
        radius: 0.5,
        scale: 1.2,
        spin: 0,
        opacity: 1,
      },
      { aspect: 1.8 },
    );
    const bounds = visiblePlateUvBounds(placement, "contain");

    expect(bounds.minU).toBe(0);
    expect(bounds.maxU).toBe(1);
    expect(bounds.minV).toBeGreaterThan(0);
    expect(bounds.maxV).toBeLessThan(1);
  });
});

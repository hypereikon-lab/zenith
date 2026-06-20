import { describe, expect, test } from "vitest";
import { lookAtLH, normalize } from "../projection.js";
import {
  caveSurfacePointForPhysicalDirection,
  sourceCaveDirectionFromScreenPoint,
  sourceCaveDirectionToScreenPoint,
} from "./cave-view.js";
import type { CaveViewProjection } from "./cave-view.js";
import type { Vec3 } from "../projection.js";

const frontProjection: CaveViewProjection = {
  rect: { x: 0, y: 0, width: 100, height: 100 },
  viewMatrix: lookAtLH([0, 0, 6], [0, 0, 0], [0, 1, 0]),
  fovDegrees: 90,
  sourceRotationRadians: 0,
  domeTiltRadians: 0,
  mirror: false,
  sourceProjectionMode: "cave-270",
};

describe("CAVE view projection", () => {
  test("projects source horizon north to the front wall center", () => {
    const screen = sourceCaveDirectionToScreenPoint([0, 0, 1], frontProjection);

    expect(screen?.x).toBeCloseTo(50, 6);
    expect(screen?.y).toBeCloseTo(50, 6);
    expectVectorClose(sourceCaveDirectionFromScreenPoint(screen!, frontProjection), [0, 0, 1]);
  });

  test("rejects rays that leave through the missing ceiling", () => {
    expect(caveSurfacePointForPhysicalDirection([0, 1, 0])).toBeNull();
    expect(sourceCaveDirectionToScreenPoint([0, 1, 0], frontProjection)).toBeNull();
  });

  test("round-trips transformed CAVE source directions through screen projection", () => {
    const projection: CaveViewProjection = {
      ...frontProjection,
      sourceRotationRadians: Math.PI * 0.18,
      domeTiltRadians: -Math.PI * 0.11,
      mirror: true,
    };
    const source = normalize([0.24, -0.35, 0.91]);
    const screen = sourceCaveDirectionToScreenPoint(source, projection);
    if (!screen) throw new Error("Expected source direction to hit a CAVE face");

    expectVectorClose(sourceCaveDirectionFromScreenPoint(screen, projection), source);
  });

  test("round-trips CAVE source directions through orthographic screen projection", () => {
    const projection: CaveViewProjection = {
      ...frontProjection,
      projectionMode: "orthographic",
      orthographicViewHeight: 5,
    };
    const source = normalize([0.24, -0.35, 0.91]);
    const screen = sourceCaveDirectionToScreenPoint(source, projection);
    if (!screen) throw new Error("Expected source direction to hit a CAVE face");

    expectVectorClose(sourceCaveDirectionFromScreenPoint(screen, projection), source);
  });

  test("projects and raycasts through front/blocking CAVE faces when mask is enabled", () => {
    const centerScreen = { x: 50, y: 50 };

    // With mask disabled: center screen hit should be on the front wall (z = 1.1)
    const hitWithoutMask = sourceCaveDirectionFromScreenPoint(centerScreen, {
      ...frontProjection,
      showCaveMask: false,
    });
    expect(hitWithoutMask).not.toBeNull();
    expectVectorClose(hitWithoutMask, [0, 0, 1]);

    // With mask enabled: center screen hit should pass through front wall and hit back wall (z = -1.1)
    const hitWithMask = sourceCaveDirectionFromScreenPoint(centerScreen, {
      ...frontProjection,
      showCaveMask: true,
    });
    expect(hitWithMask).not.toBeNull();
    expectVectorClose(hitWithMask, [0, 0, -1]);
  });
});

function expectVectorClose(actual: Vec3 | null, expected: Vec3): void {
  expect(actual).not.toBeNull();
  const value = actual as Vec3;
  for (let index = 0; index < 3; index += 1) {
    expect(value[index]).toBeCloseTo(expected[index], 5);
  }
}

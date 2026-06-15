import { describe, expect, test } from "vitest";
import { angularDistance, normalize } from "../projection.js";
import {
  eulerDegreesFromQuaternion,
  lookAtPivot,
  orbitCameraAroundPivot,
  quaternionFromEulerDegrees,
  rotateCameraLocal,
} from "../geometry/camera-rig.js";
import {
  cameraBasisFromPose,
  defaultRgbdCameraPath,
  defaultRgbdCameraPose,
  rgbdCameraDiagnostics,
  translatePoseLocal,
  worldRayFromCameraNdc,
} from "./camera-path.js";
import { cameraPoseAtTime, interpolateCameraPoses } from "./camera-path-interpolation.js";

describe("RGBD 6DoF camera path math", () => {
  test("constructs a stable forward/right/up basis from a quaternion orientation", () => {
    const basis = cameraBasisFromPose({ orientation: quaternionFromEulerDegrees(90, 0, 0), fovDegrees: 72 });
    expect(angularDistance(basis.forward, [1, 0, 0])).toBeLessThan(0.00001);
    expect(Math.abs(basis.right[2])).toBeCloseTo(1, 6);
  });

  test("builds center screen rays from the quaternion camera forward vector", () => {
    const ray = worldRayFromCameraNdc({ orientation: quaternionFromEulerDegrees(0, 0, 0), fovDegrees: 60 }, 0, 0, 1);
    expect(angularDistance(ray, normalize([0, 0, 1]))).toBeLessThan(0.00001);
  });

  test("uses quaternion slerp instead of Euler angle unwrapping", () => {
    const pose = interpolateCameraPoses(
      { ...defaultRgbdCameraPose(), orientation: quaternionFromEulerDegrees(0, 0, 0), fovDegrees: 70 },
      { ...defaultRgbdCameraPose(), position: [1, 0, 0], orientation: quaternionFromEulerDegrees(90, 0, 0), fovDegrees: 50, mode: "fly" },
      0.5,
    );
    expect(angularDistance(cameraBasisFromPose(pose).forward, normalize([1, 0, 1]))).toBeLessThan(0.00001);
    expect(pose.position[0]).toBeCloseTo(0.5, 6);
    expect(pose.fovDegrees).toBeCloseTo(60, 6);
  });

  test("samples a spline camera path by time", () => {
    const path = defaultRgbdCameraPath();
    const pose = cameraPoseAtTime(path, path.durationSeconds);
    expect(pose.position[2]).toBeGreaterThan(0);
    expect(pose.orientation).toHaveLength(4);
  });

  test("moves and rotates a pose in local 6DoF camera space", () => {
    const moved = translatePoseLocal(defaultRgbdCameraPose(), 1, 2, 3);
    expect(moved.position).toEqual([1, 2, 3]);
    const rotated = rotateCameraLocal(moved, 30, -10, 15);
    const euler = eulerDegreesFromQuaternion(rotated.orientation);
    expect(euler.yawDegrees).toBeGreaterThan(20);
    expect(euler.rollDegrees).toBeGreaterThan(10);
  });

  test("orbits around an editable pivot and can re-lock look-at", () => {
    const pose = {
      ...defaultRgbdCameraPose(),
      position: [0, 0, -4] as [number, number, number],
      pivot: [0, 0, 0] as [number, number, number],
      orientation: quaternionFromEulerDegrees(0, 0, 0),
      mode: "orbit" as const,
    };
    const orbited = orbitCameraAroundPivot(pose, 90, 0);
    expect(Math.abs(orbited.position[0])).toBeCloseTo(4, 5);
    const locked = lookAtPivot(orbited);
    expect(angularDistance(cameraBasisFromPose(locked).forward, normalize([-orbited.position[0], -orbited.position[1], -orbited.position[2]]))).toBeLessThan(0.00001);
  });

  test("reports camera expansion risk from travel and angular change", () => {
    const diagnostics = rgbdCameraDiagnostics({
      ...defaultRgbdCameraPose(),
      position: [2, 0, 0],
      orientation: quaternionFromEulerDegrees(80, 0, 0),
    });
    expect(diagnostics.expectedDisocclusion).toBeGreaterThan(0.5);
    expect(diagnostics.risk).not.toBe("low");
  });
});

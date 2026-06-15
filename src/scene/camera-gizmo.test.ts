import { describe, expect, test } from "vitest";
import { cameraBasisFromPose, defaultRgbdCameraPath, defaultRgbdCameraPose } from "./camera-path.js";
import {
  applyCameraGizmoDrag,
  buildCameraGizmoModel,
  defaultCameraGizmoView,
  fitCameraGizmoViewToPath,
  hitTestCameraGizmo,
  nudgePoseFromGizmoKeyboard,
  projectWorldPoint,
  sampleCameraPathForGizmo,
} from "./camera-gizmo.js";
import { angularDistance } from "../projection.js";

describe("camera gizmo viewport math", () => {
  const viewport = { width: 960, height: 540, pixelRatio: 1 };

  test("projects the author view target near the viewport center", () => {
    const view = defaultCameraGizmoView();
    const point = projectWorldPoint(view.target, view, viewport);
    expect(point?.visible).toBe(true);
    expect(point?.x).toBeCloseTo(viewport.width * 0.5, 3);
    expect(point?.y).toBeCloseTo(viewport.height * 0.5, 3);
  });

  test("builds handles, frustums, path samples, and hit targets for keyframes", () => {
    const path = defaultRgbdCameraPath();
    const model = buildCameraGizmoModel(path, "keyframe-expand", fitCameraGizmoViewToPath(path), viewport);
    expect(model.handles.some((handle) => handle.keyframeId === "keyframe-expand" && handle.kind === "keyframe")).toBe(true);
    expect(model.lines.some((line) => line.kind === "frustum")).toBe(true);
    expect(model.pathSamples.length).toBeGreaterThan(8);
    const selectedHandle = model.handles.find((handle) => handle.keyframeId === "keyframe-expand" && handle.kind === "keyframe");
    expect(selectedHandle).toBeTruthy();
    const hit = hitTestCameraGizmo(selectedHandle!.point, model);
    expect(hit.kind).toBe("keyframe");
    expect(hit.keyframeId).toBe("keyframe-expand");
  });

  test("moves camera and pivot through author-view screen deltas", () => {
    const path = defaultRgbdCameraPath();
    const view = fitCameraGizmoViewToPath(path);
    const pose = path.keyframes[1].pose;
    const moved = applyCameraGizmoDrag({
      pose,
      mode: "move-camera",
      delta: { x: 120, y: -40 },
      view,
      viewport,
    }).pose;
    expect(moved.position).not.toEqual(pose.position);
    const pivotMoved = applyCameraGizmoDrag({
      pose,
      mode: "move-pivot",
      delta: { x: 40, y: 80 },
      view,
      viewport,
    }).pose;
    expect(pivotMoved.pivot).not.toEqual(pose.pivot);
  });

  test("rotates and orbits with quaternion camera operations", () => {
    const path = defaultRgbdCameraPath();
    const view = fitCameraGizmoViewToPath(path);
    const pose = path.keyframes[1].pose;
    const rotated = applyCameraGizmoDrag({
      pose,
      mode: "rotate-camera",
      delta: { x: 80, y: -40 },
      view,
      viewport,
    }).pose;
    expect(angularDistance(cameraBasisFromPose(rotated).forward, cameraBasisFromPose(pose).forward)).toBeGreaterThan(0.05);
    const orbited = applyCameraGizmoDrag({
      pose,
      mode: "orbit-pivot",
      delta: { x: 80, y: 0 },
      view,
      viewport,
    }).pose;
    expect(orbited.position).not.toEqual(pose.position);
  });

  test("samples trajectory risk and keyboard nudges selected camera", () => {
    const path = defaultRgbdCameraPath();
    const samples = sampleCameraPathForGizmo(path, viewport, fitCameraGizmoViewToPath(path), 12);
    expect(samples).toHaveLength(12);
    expect(samples.some((sample) => sample.expectedDisocclusion > 0)).toBe(true);
    const pushed = nudgePoseFromGizmoKeyboard(defaultRgbdCameraPose(), "ArrowUp", 0.5, 5);
    expect(pushed.position[2]).toBeCloseTo(0.5, 6);
    const yawed = nudgePoseFromGizmoKeyboard(defaultRgbdCameraPose(), "d", 0.5, 5);
    expect(angularDistance(cameraBasisFromPose(yawed).forward, [0, 0, 1])).toBeGreaterThan(0.01);
  });
});

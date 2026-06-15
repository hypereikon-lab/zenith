import {
  cameraBasisFromRigPose,
  cameraRigDiagnostics,
  normalizeCameraRigPose,
  quaternionFromEulerDegrees,
  quaternionFromLookAt,
  translateCameraLocal as translateRigCameraLocal,
  viewMatrixFromCameraRigPose,
  worldRayFromCameraRigNdc,
} from "../geometry/camera-rig.js";
import { vectorLength } from "../projection.js";
import type { CameraEulerDegrees, CameraRigDiagnostics } from "../geometry/camera-rig.js";
import type { Mat4, Vec3 } from "../projection.js";
import type { RgbdCameraBasis, RgbdCameraKeyframe, RgbdCameraPath, RgbdCameraPose } from "./rgbd-scene-types.js";

export function defaultRgbdCameraPose(): RgbdCameraPose {
  return {
    position: [0, 0, 0],
    orientation: quaternionFromEulerDegrees(0, 0, 0),
    pivot: [0, 0, 1],
    fovDegrees: 72,
    nearMeters: 0.01,
    farMeters: 80,
    mode: "inside",
  };
}

export function defaultRgbdCameraPath(): RgbdCameraPath {
  const seedPose = defaultRgbdCameraPose();
  const expansionPosition: Vec3 = [0.18, 0.08, 0.36];
  return {
    id: "rgbd-camera-path",
    label: "Expansion camera path",
    durationSeconds: 5,
    keyframes: [
      {
        id: "keyframe-start",
        label: "Seed view",
        timeSeconds: 0,
        pose: seedPose,
        note: "Original source projection origin.",
      },
      {
        id: "keyframe-expand",
        label: "Expansion view",
        timeSeconds: 5,
        pose: normalizeRgbdCameraPose({
          position: expansionPosition,
          orientation: quaternionFromLookAt(expansionPosition, [0, 0, 1.4]),
          pivot: [0, 0, 1.4],
          fovDegrees: 64,
          mode: "fly",
        }),
        note: "Small parallax step for RGBD scene expansion.",
      },
    ],
  };
}

export function normalizeRgbdCameraPose(input: Partial<RgbdCameraPose> & Record<string, unknown> = {}): RgbdCameraPose {
  const normalized = normalizeCameraRigPose(input, defaultRgbdCameraPose());
  return {
    ...normalized,
    mode: normalized.mode === "orbit" || normalized.mode === "fly" ? normalized.mode : "inside",
  };
}

export function normalizeRgbdCameraPath(path: RgbdCameraPath): RgbdCameraPath {
  const keyframes = [...path.keyframes]
    .map((keyframe, index) => normalizeRgbdKeyframe(keyframe, index))
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
  const durationSeconds = Math.max(0.25, Number(path.durationSeconds) || keyframes.at(-1)?.timeSeconds || 5);
  return {
    ...path,
    durationSeconds,
    keyframes: keyframes.length > 0 ? keyframes : defaultRgbdCameraPath().keyframes,
  };
}

export function normalizeRgbdKeyframe(keyframe: RgbdCameraKeyframe, index = 0): RgbdCameraKeyframe {
  return {
    ...keyframe,
    id: keyframe.id || `keyframe-${index + 1}`,
    label: keyframe.label || `Keyframe ${index + 1}`,
    timeSeconds: Math.max(0, Number(keyframe.timeSeconds) || 0),
    pose: normalizeRgbdCameraPose(keyframe.pose as Partial<RgbdCameraPose> & Record<string, unknown>),
  };
}

export function cameraBasisFromPose(pose: Partial<RgbdCameraPose>): RgbdCameraBasis {
  return cameraBasisFromRigPose(normalizeRgbdCameraPose(pose as Partial<RgbdCameraPose> & Record<string, unknown>));
}

export function viewMatrixFromRgbdPose(pose: Partial<RgbdCameraPose>): Mat4 {
  return viewMatrixFromCameraRigPose(normalizeRgbdCameraPose(pose as Partial<RgbdCameraPose> & Record<string, unknown>));
}

export function worldRayFromCameraNdc(pose: Partial<RgbdCameraPose>, ndcX: number, ndcY: number, aspect = 1): Vec3 {
  return worldRayFromCameraRigNdc(normalizeRgbdCameraPose(pose as Partial<RgbdCameraPose> & Record<string, unknown>), ndcX, ndcY, aspect);
}

export function cameraTravelMeters(pose: Partial<RgbdCameraPose>): number {
  return vectorLength(normalizeRgbdCameraPose(pose as Partial<RgbdCameraPose> & Record<string, unknown>).position);
}

export function translatePoseLocal(pose: RgbdCameraPose, truck: number, lift: number, push: number): RgbdCameraPose {
  return normalizeRgbdCameraPose(translateRigCameraLocal(pose, truck, lift, push));
}

export function distanceBetweenCameraPoses(a: RgbdCameraPose, b: RgbdCameraPose): number {
  const left = normalizeRgbdCameraPose(a);
  const right = normalizeRgbdCameraPose(b);
  return vectorLength([left.position[0] - right.position[0], left.position[1] - right.position[1], left.position[2] - right.position[2]]);
}

export function rgbdCameraDiagnostics(pose: Partial<RgbdCameraPose>, reference: Partial<RgbdCameraPose> = defaultRgbdCameraPose()): CameraRigDiagnostics {
  return cameraRigDiagnostics(
    normalizeRgbdCameraPose(pose as Partial<RgbdCameraPose> & Record<string, unknown>),
    normalizeRgbdCameraPose(reference as Partial<RgbdCameraPose> & Record<string, unknown>),
  );
}

export type { CameraEulerDegrees };

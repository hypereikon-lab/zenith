import {
  normalizeCameraRigPose,
  quaternionFromLookAt,
  viewMatrixFromCameraRigPose,
} from "../geometry/camera-rig.js";
import type { CameraRigPose } from "../geometry/camera-rig.js";
import type { Mat4, Rect, Vec3 } from "../projection.js";
import type { CaveViewProjection } from "../geometry/cave-view.js";
import type { DomeViewProjection } from "../geometry/dome-view.js";
import type { SourceProjectionMode } from "../geometry/source-projection.js";

export const PLATE_EDITOR_VIEW_MODES = ["source-map", "dome-orbit", "dome-pov", "cave-room"] as const;

export type PlateEditorViewMode = (typeof PLATE_EDITOR_VIEW_MODES)[number];
export type PlateEditorCameraMode = "inside" | "orbit" | "fly";
export type PlateEditorCamera = CameraRigPose<PlateEditorCameraMode>;

export function plateEditorViewLabel(mode: PlateEditorViewMode): string {
  if (mode === "dome-orbit") return "Dome Orbit";
  if (mode === "dome-pov") return "Dome POV";
  if (mode === "cave-room") return "CAVE Room";
  return "Source Map";
}

export function plateEditorViewDisabledReason(mode: PlateEditorViewMode, sourceProjectionMode: SourceProjectionMode): string | null {
  if (mode === "cave-room" && sourceProjectionMode !== "cave-270") {
    return "CAVE Room is only available for CAVE 270.";
  }
  return null;
}

export function defaultPlateEditorCamera(sourceProjectionMode: SourceProjectionMode): PlateEditorCamera {
  const target = defaultPlateEditorPivot(sourceProjectionMode);
  const sign = projectionVerticalSign(sourceProjectionMode);
  const distance = sourceProjectionMode === "cave-270" ? 4.4 : 2.45;
  const yaw = -0.72;
  const pitch = sourceProjectionMode === "cave-270" ? 0.76 : 0.48 * sign;
  const position: Vec3 = [
    target[0] + distance * Math.cos(pitch) * Math.sin(yaw),
    target[1] + distance * Math.sin(pitch),
    target[2] + distance * Math.cos(pitch) * Math.cos(yaw),
  ];
  return normalizePlateEditorCamera({
    position,
    orientation: quaternionFromLookAt(position, target),
    pivot: target,
    fovDegrees: 78,
    nearMeters: 0.01,
    farMeters: 80,
    mode: "orbit",
  });
}

export function normalizePlateEditorCamera(camera: Partial<PlateEditorCamera> & Record<string, unknown> = {}): PlateEditorCamera {
  if (Number.isFinite(camera.yawRadians) || Number.isFinite(camera.pitchRadians) || Number.isFinite(camera.distance)) {
    return normalizeLegacyPlateCamera(camera);
  }
  const normalized = normalizeCameraRigPose<PlateEditorCameraMode>(camera, {
    position: [0, 0, -2.45],
    orientation: quaternionFromLookAt([0, 0, -2.45], [0, 0, 0]),
    pivot: [0, 0, 0],
    fovDegrees: 78,
    nearMeters: 0.01,
    farMeters: 80,
    mode: "orbit",
  });
  return {
    ...normalized,
    mode: normalized.mode === "inside" || normalized.mode === "fly" ? normalized.mode : "orbit",
  };
}

export function plateEditorViewMatrix(
  mode: Exclude<PlateEditorViewMode, "source-map">,
  camera: Partial<PlateEditorCamera>,
  sourceProjectionMode: SourceProjectionMode,
): Mat4 {
  const normalized = normalizePlateEditorCamera(camera as Partial<PlateEditorCamera> & Record<string, unknown>);
  if (mode === "dome-pov") {
    return viewMatrixFromCameraRigPose({
      ...normalized,
      mode: "inside",
    });
  }
  if (mode === "cave-room") {
    return viewMatrixFromCameraRigPose({
      ...normalized,
      pivot: normalized.pivot || defaultPlateEditorPivot(sourceProjectionMode),
    });
  }
  return viewMatrixFromCameraRigPose({
    ...normalized,
    pivot: normalized.pivot || defaultPlateEditorPivot(sourceProjectionMode),
  });
}

export function plateEditorDomeProjection(
  mode: "dome-orbit" | "dome-pov",
  camera: Partial<PlateEditorCamera>,
  sourceProjectionMode: SourceProjectionMode,
  rect: Rect,
  showCaveMask?: boolean,
): DomeViewProjection {
  const normalized = normalizePlateEditorCamera(camera as Partial<PlateEditorCamera> & Record<string, unknown>);
  return {
    rect,
    viewMatrix: plateEditorViewMatrix(mode, normalized, sourceProjectionMode),
    fovDegrees: normalized.fovDegrees,
    sourceRotationRadians: 0,
    domeTiltRadians: 0,
    mirror: false,
    sourceProjectionMode,
    showCaveMask,
  };
}

export function plateEditorCaveProjection(
  camera: Partial<PlateEditorCamera>,
  sourceProjectionMode: SourceProjectionMode,
  rect: Rect,
  showCaveMask?: boolean,
): CaveViewProjection {
  const normalized = normalizePlateEditorCamera(camera as Partial<PlateEditorCamera> & Record<string, unknown>);
  return {
    rect,
    viewMatrix: plateEditorViewMatrix("cave-room", normalized, sourceProjectionMode),
    fovDegrees: normalized.fovDegrees,
    sourceRotationRadians: 0,
    domeTiltRadians: 0,
    mirror: false,
    sourceProjectionMode,
    showCaveMask,
  };
}

function normalizeLegacyPlateCamera(camera: Partial<PlateEditorCamera> & Record<string, unknown>): PlateEditorCamera {
  const rawYaw = Number(camera.yawRadians);
  const rawPitch = Number(camera.pitchRadians);
  const rawDistance = Number(camera.distance);
  const yaw = Number.isFinite(rawYaw) ? rawYaw : -0.72;
  const pitch = Number.isFinite(rawPitch) ? rawPitch : 0.48;
  const distance = Math.max(0.05, Number.isFinite(rawDistance) ? rawDistance : 2.45);
  const pivot: Vec3 = Array.isArray(camera.pivot) ? camera.pivot as Vec3 : [0, 0, 0];
  const position: Vec3 = [
    pivot[0] + distance * Math.cos(pitch) * Math.sin(yaw),
    pivot[1] + distance * Math.sin(pitch),
    pivot[2] + distance * Math.cos(pitch) * Math.cos(yaw),
  ];
  return normalizeCameraRigPose<PlateEditorCameraMode>({
    position,
    orientation: quaternionFromLookAt(position, pivot),
    pivot,
    fovDegrees: Number(camera.fovDegrees) || 78,
    nearMeters: 0.01,
    farMeters: 80,
    mode: "orbit",
  });
}

function defaultPlateEditorPivot(sourceProjectionMode: SourceProjectionMode): Vec3 {
  if (sourceProjectionMode === "cave-270") return [0, 0, 0];
  return [0, 0.42 * projectionVerticalSign(sourceProjectionMode), 0];
}

function projectionVerticalSign(sourceProjectionMode: SourceProjectionMode): 1 | -1 {
  return sourceProjectionMode.startsWith("nadir") || sourceProjectionMode === "cave-270" ? -1 : 1;
}

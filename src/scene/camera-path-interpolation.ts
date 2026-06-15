import { lerp } from "../projection.js";
import { normalizeRgbdCameraPath, normalizeRgbdCameraPose } from "./camera-path.js";
import { slerpQuaternion } from "../geometry/camera-rig.js";
import type { Vec3 } from "../projection.js";
import type { RgbdCameraKeyframe, RgbdCameraPath, RgbdCameraPose } from "./rgbd-scene-types.js";

export function cameraPoseAtTime(path: RgbdCameraPath, timeSeconds: number): RgbdCameraPose {
  const normalizedPath = normalizeRgbdCameraPath(path);
  const keyframes = normalizedPath.keyframes;
  if (keyframes.length === 1) return keyframes[0].pose;
  const time = clampTime(Number(timeSeconds) || 0, normalizedPath.durationSeconds);
  const nextIndex = keyframes.findIndex((keyframe) => keyframe.timeSeconds >= time);
  if (nextIndex <= 0) return keyframes[0].pose;
  if (nextIndex === -1) return keyframes[keyframes.length - 1].pose;
  const previous = keyframes[nextIndex - 1];
  const next = keyframes[nextIndex];
  const beforePrevious = keyframes[Math.max(0, nextIndex - 2)] || previous;
  const afterNext = keyframes[Math.min(keyframes.length - 1, nextIndex + 1)] || next;
  return interpolateCameraKeyframes(previous, next, time, beforePrevious, afterNext);
}

export function interpolateCameraKeyframes(
  previous: RgbdCameraKeyframe,
  next: RgbdCameraKeyframe,
  timeSeconds: number,
  beforePrevious: RgbdCameraKeyframe = previous,
  afterNext: RgbdCameraKeyframe = next,
): RgbdCameraPose {
  const span = Math.max(0.000001, next.timeSeconds - previous.timeSeconds);
  const rawT = clamp01((timeSeconds - previous.timeSeconds) / span);
  const t = smoothstep(rawT);
  return interpolateCameraPoses(previous.pose, next.pose, t, beforePrevious.pose, afterNext.pose);
}

export function interpolateCameraPoses(
  previous: RgbdCameraPose,
  next: RgbdCameraPose,
  t: number,
  beforePrevious?: RgbdCameraPose,
  afterNext?: RgbdCameraPose,
): RgbdCameraPose {
  const amount = clamp01(t);
  const position = beforePrevious && afterNext
    ? catmullRomVec3(beforePrevious.position, previous.position, next.position, afterNext.position, amount)
    : lerpVec3(previous.position, next.position, amount);
  return normalizeRgbdCameraPose({
    position,
    orientation: slerpQuaternion(previous.orientation, next.orientation, amount),
    pivot: previous.pivot && next.pivot ? lerpVec3(previous.pivot, next.pivot, amount) : next.pivot || previous.pivot || null,
    fovDegrees: lerp(previous.fovDegrees, next.fovDegrees, amount),
    nearMeters: lerp(previous.nearMeters || 0.01, next.nearMeters || 0.01, amount),
    farMeters: lerp(previous.farMeters || 80, next.farMeters || 80, amount),
    mode: amount < 0.5 ? previous.mode : next.mode,
  });
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function catmullRomVec3(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  return [
    catmullRom(p0[0], p1[0], p2[0], p3[0], t),
    catmullRom(p0[1], p1[1], p2[1], p3[1], t),
    catmullRom(p0[2], p1[2], p2[2], p3[2], t),
  ];
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function smoothstep(t: number): number {
  const amount = clamp01(t);
  return amount * amount * (3 - 2 * amount);
}

function clampTime(value: number, duration: number): number {
  return Math.max(0, Math.min(duration, value));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

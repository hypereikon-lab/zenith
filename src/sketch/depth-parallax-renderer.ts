import { clamp } from "../projection.js";
import type { ProjectionProfile, Vec3 } from "../projection.js";

const DEG_TO_RAD = Math.PI / 180;
const GUIDE_MODE_INDEX = {
  source: 0,
  depthShaded: 1,
  depthMap: 2,
} as const;

export type DepthGuideMode = keyof typeof GUIDE_MODE_INDEX;
export type DepthPolarity = "brightFar" | "brightNear";
export type DepthProjectionInput = {
  size: number | string;
  radiusScale: number | string;
};
export type DepthMotionInput = Partial<{
  nearMeters: number | string;
  farMeters: number | string;
  polarity: DepthPolarity;
  yawDegrees: number | string;
  pitchDegrees: number | string;
  rollDegrees: number | string;
  truckMeters: number | string;
  liftMeters: number | string;
  pushMeters: number | string;
  motionGain: number | string;
  depthContrast: number | string;
  guideMode: DepthGuideMode | string;
  guideNoise: number | string;
  gapFillPasses: number | string;
  splatRadius: number | string;
}>;
export type DepthMotionSettings = {
  nearMeters: number;
  farMeters: number;
  polarity: DepthPolarity;
  yawDegrees: number;
  pitchDegrees: number;
  rollDegrees: number;
  truckMeters: number;
  liftMeters: number;
  pushMeters: number;
  motionGain: number;
  depthContrast: number;
  guideMode: DepthGuideMode;
  guideNoise: number;
  gapFillPasses: number;
  splatRadius: number;
};
export type MotionPose = {
  yaw: number;
  pitch: number;
  roll: number;
  offset: Vec3;
};

export function createDepthProjectionProfile({ size, radiusScale }: DepthProjectionInput): ProjectionProfile {
  const safeSize = Math.max(8, Math.round(Number(size) || 1024));
  const scale = clamp(Number(radiusScale) || 1, 0.25, 2);
  return {
    width: safeSize,
    height: safeSize,
    fisheyeScaleX: 0.5 * scale,
    fisheyeScaleY: 0.5 * scale,
    radiusPixels: safeSize * 0.5 * scale,
  };
}

export function normalizeDepthMotionSettings(input: DepthMotionInput = {}): DepthMotionSettings {
  const nearMeters = Math.max(0.001, Number(input.nearMeters) || 1);
  const rawFar = Math.max(0.002, Number(input.farMeters) || 24);
  return {
    nearMeters,
    farMeters: Math.max(rawFar, nearMeters + 0.001),
    polarity: input.polarity === "brightNear" ? "brightNear" : "brightFar",
    yawDegrees: clamp(Number(input.yawDegrees) || 0, -90, 90),
    pitchDegrees: clamp(Number(input.pitchDegrees) || 0, -45, 45),
    rollDegrees: clamp(Number(input.rollDegrees) || 0, -45, 45),
    truckMeters: clamp(Number(input.truckMeters) || 0, -20, 20),
    liftMeters: clamp(Number(input.liftMeters) || 0, -20, 20),
    pushMeters: clamp(Number(input.pushMeters) || 0, -20, 20),
    motionGain: clamp(Number(input.motionGain) || 1, 0.05, 12),
    depthContrast: clamp(Number(input.depthContrast) || 1, 0.25, 4),
    guideMode: guideModeFromInput(input.guideMode),
    guideNoise: clamp(Number(input.guideNoise) || 0, 0, 0.2),
    gapFillPasses: clamp(Math.round(Number(input.gapFillPasses) || 0), 0, 8),
    splatRadius: clamp(Math.round(Number(input.splatRadius) || 1), 0, 3),
  };
}

export function depthGuideModeIndex(mode: string): number {
  return GUIDE_MODE_INDEX[mode as DepthGuideMode] ?? GUIDE_MODE_INDEX.source;
}

export function depthMetersFromRgba(
  data: Uint8ClampedArray | Uint8Array,
  index: number,
  settings: DepthMotionSettings,
): number {
  const luma = (data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722) / 255;
  const rawFarFactor = settings.polarity === "brightNear" ? 1 - luma : luma;
  const farFactor = clamp(0.5 + (rawFarFactor - 0.5) * settings.depthContrast, 0, 1);
  return settings.nearMeters + clamp(farFactor, 0, 1) * (settings.farMeters - settings.nearMeters);
}

export function motionPoseAt(progress: number, settings: DepthMotionSettings): MotionPose {
  const t = smoothstep(clamp(Number(progress) || 0, 0, 1));
  const gain = settings.motionGain;
  return {
    yaw: cleanZero(settings.yawDegrees * DEG_TO_RAD * t * gain),
    pitch: cleanZero(settings.pitchDegrees * DEG_TO_RAD * t * gain),
    roll: cleanZero(settings.rollDegrees * DEG_TO_RAD * t * gain),
    offset: [
      cleanZero(settings.truckMeters * t * gain),
      cleanZero(settings.liftMeters * t * gain),
      cleanZero(settings.pushMeters * t * gain),
    ],
  };
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function cleanZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function guideModeFromInput(value: unknown): DepthGuideMode {
  return typeof value === "string" && Object.hasOwn(GUIDE_MODE_INDEX, value) ? (value as DepthGuideMode) : "source";
}

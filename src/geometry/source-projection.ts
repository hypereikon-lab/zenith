import { createFisheyeProjectionProfile, directionToFisheyeUv } from "./fisheye-projection.js";
import type { FisheyeProjectionProfile } from "./fisheye-projection.js";
import {
  caveContinuityUvToDirection,
  createCaveContinuityCarrierProfile,
  directionToCaveContinuityUv,
} from "./cave-continuity-carrier.js";
import { fisheyeUvToDirection } from "./fisheye-projection.js";
import {
  normalizeSourceInnerGuideSplit,
  sourceGuideCarrierHorizonRadius,
  sourceGuideGeometry,
} from "./source-guide-semantics.js";
import { clamp } from "../projection.js";
import type { MapUv, Vec3 } from "../projection.js";

export const SOURCE_PROJECTION_MODES = ["zenith-180", "zenith-230", "nadir-180", "cave-270"] as const;

export type SourceProjectionMode = (typeof SOURCE_PROJECTION_MODES)[number];

export type SourceProjectionGeometryRange = {
  thetaStart: number;
  thetaEnd: number;
};

export type SourceProjectionSummary = {
  mode: SourceProjectionMode;
  label: string;
  center: "Zenith" | "Nadir";
  fieldOfViewDegrees: number;
  halfAngleDegrees: number;
  horizonRadius: number;
  beyondHorizonDegrees: number;
};

export type SourceMapPoint = {
  radius: number;
  azimuth: number;
};

export function normalizeSourceProjectionMode(value: unknown): SourceProjectionMode {
  if (value === "nadir-270") return "cave-270";
  if (value === "zenith-230" || value === "nadir-180" || value === "cave-270") {
    return value;
  }
  return "zenith-180";
}

export function sourceProjectionProfileForMode(
  mode: SourceProjectionMode,
  width = 2,
  height = 2,
  radiusScale: number | string | null = 1,
): FisheyeProjectionProfile {
  if (mode === "nadir-180") {
    return createFisheyeProjectionProfile({ width, height, radiusScale, center: "nadir", fieldOfViewDegrees: 180 });
  }
  if (mode === "cave-270") {
    return createFisheyeProjectionProfile({ width, height, radiusScale, center: "nadir", fieldOfViewDegrees: 270 });
  }
  if (mode === "zenith-230") {
    return createFisheyeProjectionProfile({ width, height, radiusScale, center: "zenith", fieldOfViewDegrees: 230 });
  }
  return createFisheyeProjectionProfile({ width, height, radiusScale, center: "zenith", fieldOfViewDegrees: 180 });
}

export function sourceProjectionGeometryRange(mode: SourceProjectionMode): SourceProjectionGeometryRange {
  if (mode === "nadir-180") {
    return { thetaStart: Math.PI * 0.5, thetaEnd: Math.PI };
  }
  if (mode === "cave-270") {
    return { thetaStart: Math.PI * 0.25, thetaEnd: Math.PI };
  }
  if (mode === "zenith-230") {
    return { thetaStart: 0, thetaEnd: (Math.PI * 23) / 36 };
  }
  return { thetaStart: 0, thetaEnd: Math.PI * 0.5 };
}

export function sourceProjectionLabel(mode: SourceProjectionMode): string {
  if (mode === "zenith-230") return "Zenith 230";
  if (mode === "nadir-180") return "Nadir 180";
  if (mode === "cave-270") return "CAVE 270";
  return "Zenith 180";
}

export function sourceProjectionCenterLabel(mode: SourceProjectionMode): SourceProjectionSummary["center"] {
  return mode.startsWith("nadir") || mode === "cave-270" ? "Nadir" : "Zenith";
}

export function sourceProjectionFieldOfViewDegrees(mode: SourceProjectionMode): number {
  if (mode === "zenith-230") return 230;
  if (mode === "cave-270") return 270;
  return 180;
}

export function sourceProjectionBeyondHorizonDegrees(mode: SourceProjectionMode): number {
  return Math.max(0, sourceProjectionFieldOfViewDegrees(mode) * 0.5 - 90);
}

export function sourceProjectionHorizonRadius(
  mode: SourceProjectionMode,
  innerGuideSplit?: number | string | null,
  carrierHorizonRadius?: number | string | null,
): number {
  if (mode === "cave-270") return sourceGuideGeometry(mode, innerGuideSplit, carrierHorizonRadius).horizonRadius;
  const profile = sourceProjectionProfileForMode(mode);
  return (Math.PI * 0.5) / (profile.fieldOfViewDegrees * 0.5 * (Math.PI / 180));
}

export function sourceProjectionShaderTheta(
  mode: SourceProjectionMode,
  fieldOfViewDegrees?: number,
  innerGuideSplit?: number | string | null,
): number {
  if (mode === "cave-270") return -normalizeSourceInnerGuideSplit(innerGuideSplit);
  return ((fieldOfViewDegrees ?? sourceProjectionFieldOfViewDegrees(mode)) * 0.5 * Math.PI) / 180;
}

export function sourceProjectionSummary(
  mode: SourceProjectionMode,
  innerGuideSplit?: number | string | null,
): SourceProjectionSummary {
  const fieldOfViewDegrees = sourceProjectionFieldOfViewDegrees(mode);
  return {
    mode,
    label: sourceProjectionLabel(mode),
    center: sourceProjectionCenterLabel(mode),
    fieldOfViewDegrees,
    halfAngleDegrees: fieldOfViewDegrees * 0.5,
    horizonRadius: sourceProjectionHorizonRadius(mode, innerGuideSplit),
    beyondHorizonDegrees: sourceProjectionBeyondHorizonDegrees(mode),
  };
}

export function sourceProjectionContainsDirection(direction: Vec3, mode: SourceProjectionMode): boolean {
  return sourceDirectionToUv(direction, mode) !== null;
}

export function sourceDirectionToUv(
  direction: Vec3,
  mode: SourceProjectionMode,
  width = 2,
  height = 2,
  radiusScale: number | string | null = 1,
  innerGuideSplit?: number | string | null,
  carrierHorizonRadius?: number | string | null,
): MapUv | null {
  if (mode === "cave-270") {
    return directionToCaveContinuityUv(
      direction,
      createCaveContinuityCarrierProfile({ width, height, floorBand: innerGuideSplit, horizonBand: carrierHorizonRadius }),
    );
  }
  const profile = sourceProjectionProfileForMode(mode, width, height, radiusScale);
  const uv = directionToFisheyeUv(direction, profile);
  if (!uv || !sourceProjectionUsesRadialCarrierRemap(mode, innerGuideSplit)) return uv;

  const normalizedX = (uv.u - 0.5) / Math.max(profile.fisheyeScaleX, 0.000001);
  const normalizedY = (0.5 - uv.v) / Math.max(profile.fisheyeScaleY, 0.000001);
  const physicalRadius = Math.hypot(normalizedX, normalizedY);
  if (physicalRadius <= 0.000001) return uv;
  const carrierRadius = sourcePhysicalRadiusToCarrierRadius(
    physicalRadius,
    mode,
    innerGuideSplit,
    carrierHorizonRadius,
  );
  return {
    u: 0.5 + (normalizedX / physicalRadius) * profile.fisheyeScaleX * carrierRadius,
    v: 0.5 - (normalizedY / physicalRadius) * profile.fisheyeScaleY * carrierRadius,
  };
}

export function sourceMapPointToUv(point: SourceMapPoint, mode: SourceProjectionMode): MapUv {
  const azimuth = (point.azimuth * Math.PI) / 180;
  const sinAzimuth = Math.sin(azimuth);
  const cosAzimuth = Math.cos(azimuth);
  const radius = Math.max(0, Math.min(Number(point.radius) || 0, 1));
  const squareScale =
    mode === "cave-270" ? 1 / Math.max(Math.abs(sinAzimuth), Math.abs(cosAzimuth), 0.000001) : 1;
  const dx = sinAzimuth * radius * squareScale;
  const dy = -cosAzimuth * radius * squareScale;
  return {
    u: 0.5 + dx * 0.5,
    v: 0.5 + dy * 0.5,
  };
}

export function sourceUvToMapPoint(u: number, v: number, mode: SourceProjectionMode): SourceMapPoint | null {
  if (u < -0.000001 || u > 1.000001 || v < -0.000001 || v > 1.000001) return null;
  const dx = (Math.max(0, Math.min(u, 1)) - 0.5) * 2;
  const dy = (Math.max(0, Math.min(v, 1)) - 0.5) * 2;
  const radius = mode === "cave-270" ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.hypot(dx, dy);
  if (mode !== "cave-270" && radius > 1.0001) return null;
  return {
    radius: Math.max(0, Math.min(radius, 1)),
    azimuth: normalizeDegrees((Math.atan2(dx, -dy) * 180) / Math.PI),
  };
}

export function sourceMapPointToDirection(
  point: SourceMapPoint,
  mode: SourceProjectionMode,
  width = 2,
  height = 2,
  radiusScale: number | string | null = 1,
  innerGuideSplit?: number | string | null,
  carrierHorizonRadius?: number | string | null,
): Vec3 | null {
  const uv = sourceMapPointToUv(point, mode);
  return sourceUvToDirection(uv.u, uv.v, mode, width, height, radiusScale, innerGuideSplit, carrierHorizonRadius);
}

export function sourceDirectionToMapPoint(
  direction: Vec3,
  mode: SourceProjectionMode,
  width = 2,
  height = 2,
  radiusScale: number | string | null = 1,
  innerGuideSplit?: number | string | null,
  carrierHorizonRadius?: number | string | null,
): SourceMapPoint | null {
  const uv = sourceDirectionToUv(direction, mode, width, height, radiusScale, innerGuideSplit, carrierHorizonRadius);
  return uv ? sourceUvToMapPoint(uv.u, uv.v, mode) : null;
}

export function sourceUvToDirection(
  u: number,
  v: number,
  mode: SourceProjectionMode,
  width = 2,
  height = 2,
  radiusScale: number | string | null = 1,
  innerGuideSplit?: number | string | null,
  carrierHorizonRadius?: number | string | null,
): Vec3 | null {
  if (mode === "cave-270") {
    return caveContinuityUvToDirection(
      u,
      v,
      createCaveContinuityCarrierProfile({ width, height, floorBand: innerGuideSplit, horizonBand: carrierHorizonRadius }),
    );
  }
  const profile = sourceProjectionProfileForMode(mode, width, height, radiusScale);
  if (!sourceProjectionUsesRadialCarrierRemap(mode, innerGuideSplit)) {
    return fisheyeUvToDirection(u, v, profile);
  }

  const normalizedX = (u - 0.5) / Math.max(profile.fisheyeScaleX, 0.000001);
  const normalizedY = (0.5 - v) / Math.max(profile.fisheyeScaleY, 0.000001);
  const carrierRadius = Math.hypot(normalizedX, normalizedY);
  if (carrierRadius > 1.000001) return null;
  if (carrierRadius <= 0.000001) return profile.centerAxis;
  const physicalRadius = sourceCarrierRadiusToPhysicalRadius(
    carrierRadius,
    mode,
    innerGuideSplit,
    carrierHorizonRadius,
  );
  return fisheyeUvToDirection(
    0.5 + (normalizedX / carrierRadius) * profile.fisheyeScaleX * physicalRadius,
    0.5 - (normalizedY / carrierRadius) * profile.fisheyeScaleY * physicalRadius,
    profile,
  );
}

export function sourceProjectionUsesRadialCarrierRemap(
  mode: SourceProjectionMode,
  innerGuideSplit?: number | string | null,
): boolean {
  return mode !== "cave-270" && innerGuideSplit !== undefined && innerGuideSplit !== null;
}

export function sourcePhysicalRadiusToCarrierRadius(
  physicalRadius: number,
  mode: SourceProjectionMode,
  innerGuideSplit?: number | string | null,
  carrierHorizonRadius?: number | string | null,
): number {
  if (!sourceProjectionUsesRadialCarrierRemap(mode, innerGuideSplit)) return clamp(physicalRadius, 0, 1);
  const anchors = sourceRadialCarrierAnchors(mode, innerGuideSplit, carrierHorizonRadius);
  return piecewiseMapRadius(clamp(physicalRadius, 0, 1), anchors.physical, anchors.carrier);
}

export function sourceCarrierRadiusToPhysicalRadius(
  carrierRadius: number,
  mode: SourceProjectionMode,
  innerGuideSplit?: number | string | null,
  carrierHorizonRadius?: number | string | null,
): number {
  if (!sourceProjectionUsesRadialCarrierRemap(mode, innerGuideSplit)) return clamp(carrierRadius, 0, 1);
  const anchors = sourceRadialCarrierAnchors(mode, innerGuideSplit, carrierHorizonRadius);
  return piecewiseMapRadius(clamp(carrierRadius, 0, 1), anchors.carrier, anchors.physical);
}

function sourceRadialCarrierAnchors(
  mode: SourceProjectionMode,
  innerGuideSplit?: number | string | null,
  carrierHorizonRadius?: number | string | null,
): { physical: [number, number, number, number]; carrier: [number, number, number, number] } {
  const split = normalizeSourceInnerGuideSplit(innerGuideSplit);
  const horizon = clamp(sourceProjectionHorizonRadius(mode), 0.0001, 1);
  const semanticPhysical = clamp(horizon * 0.5, 0.0001, Math.max(horizon - 0.0001, 0.0001));
  const carrierHorizon = horizon < 0.999 ? sourceGuideCarrierHorizonRadius(mode, split, carrierHorizonRadius) : 1;
  return {
    physical: [0, semanticPhysical, horizon, 1],
    carrier: [0, split, carrierHorizon, 1],
  };
}

function piecewiseMapRadius(
  value: number,
  from: [number, number, number, number],
  to: [number, number, number, number],
): number {
  for (let index = 0; index < from.length - 1; index += 1) {
    const start = from[index];
    const end = from[index + 1];
    if (value <= end + 0.000001) {
      const amount = (value - start) / Math.max(end - start, 0.000001);
      return clamp(to[index] + amount * (to[index + 1] - to[index]), 0, 1);
    }
  }
  return 1;
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

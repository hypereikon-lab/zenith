import { createFisheyeProjectionProfile, directionToFisheyeUv } from "./fisheye-projection.js";
import type { FisheyeProjectionProfile } from "./fisheye-projection.js";
import type { Vec3 } from "../projection.js";

export const SOURCE_PROJECTION_MODES = ["zenith-180", "zenith-270", "nadir-180", "nadir-270"] as const;

export type SourceProjectionMode = (typeof SOURCE_PROJECTION_MODES)[number];

export type SourceProjectionGeometryRange = {
  thetaStart: number;
  thetaEnd: number;
};

export function normalizeSourceProjectionMode(value: unknown): SourceProjectionMode {
  if (value === "zenith-270" || value === "nadir-180" || value === "nadir-270") return value;
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
  if (mode === "nadir-270") {
    return createFisheyeProjectionProfile({ width, height, radiusScale, center: "nadir", fieldOfViewDegrees: 270 });
  }
  if (mode === "zenith-270") {
    return createFisheyeProjectionProfile({ width, height, radiusScale, center: "zenith", fieldOfViewDegrees: 270 });
  }
  return createFisheyeProjectionProfile({ width, height, radiusScale, center: "zenith", fieldOfViewDegrees: 180 });
}

export function sourceProjectionGeometryRange(mode: SourceProjectionMode): SourceProjectionGeometryRange {
  if (mode === "nadir-180") {
    return { thetaStart: Math.PI * 0.5, thetaEnd: Math.PI };
  }
  if (mode === "nadir-270") {
    return { thetaStart: Math.PI * 0.25, thetaEnd: Math.PI };
  }
  if (mode === "zenith-270") {
    return { thetaStart: 0, thetaEnd: Math.PI * 0.75 };
  }
  return { thetaStart: 0, thetaEnd: Math.PI * 0.5 };
}

export function sourceProjectionLabel(mode: SourceProjectionMode): string {
  if (mode === "zenith-270") return "Zenith 270";
  if (mode === "nadir-180") return "Nadir 180";
  if (mode === "nadir-270") return "Nadir 270";
  return "Zenith 180";
}

export function sourceProjectionCenterLabel(mode: SourceProjectionMode): string {
  return mode.startsWith("nadir") ? "Nadir" : "Zenith";
}

export function sourceProjectionHorizonRadius(mode: SourceProjectionMode): number {
  const profile = sourceProjectionProfileForMode(mode);
  return (Math.PI * 0.5) / (profile.fieldOfViewDegrees * 0.5 * (Math.PI / 180));
}

export function sourceProjectionContainsDirection(direction: Vec3, mode: SourceProjectionMode): boolean {
  return directionToFisheyeUv(direction, sourceProjectionProfileForMode(mode)) !== null;
}

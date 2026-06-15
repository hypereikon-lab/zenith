import {
  sourceProjectionCenterLabel,
  sourceProjectionGeometryRange,
  sourceProjectionHorizonRadius,
  sourceProjectionLabel,
  sourceProjectionProfileForMode,
} from "../geometry/source-projection.js";
import { clamp } from "../projection.js";
import type { SourceProjectionMode } from "../geometry/source-projection.js";

export type FulldomeProjectionCenter = "zenith" | "nadir";

export type FulldomeProfileInput = {
  projectionMode: SourceProjectionMode;
  radiusScale?: number | string;
  domeTiltDegrees?: number | string;
  masterWidth?: number | string;
  masterHeight?: number | string;
  fps?: number | string;
  audienceFrontAzimuthDegrees?: number | string;
};

export type FulldomeProfile = {
  schema: "zenith.fulldome-profile";
  version: 1;
  projectionMode: SourceProjectionMode;
  label: string;
  mapping: "equidistant-fisheye" | "cave-continuity-carrier";
  center: FulldomeProjectionCenter;
  fieldOfViewDegrees: number;
  thetaStartDegrees: number;
  thetaEndDegrees: number;
  horizonRadius: number;
  belowHorizonDegrees: number;
  aboveHorizonDegrees: number;
  radiusScale: number;
  domeTiltDegrees: number;
  audienceFrontAzimuthDegrees: number;
  master: {
    width: number;
    height: number;
    fps: number;
    square: boolean;
  };
  mask: {
    outsideCircle: "black";
    circleFillsFrame: boolean;
  };
};

export function buildFulldomeProfile(input: FulldomeProfileInput): FulldomeProfile {
  const projectionProfile = sourceProjectionProfileForMode(input.projectionMode, 2, 2, input.radiusScale ?? 1);
  const range = sourceProjectionGeometryRange(input.projectionMode);
  const radiusScale = clamp(Number(input.radiusScale) || 1, 0.05, 2);
  const width = Math.max(1, Math.round(Number(input.masterWidth) || 0));
  const height = Math.max(1, Math.round(Number(input.masterHeight) || width || 0));
  const fps = Math.max(0, Number(input.fps) || 0);
  const thetaStartDegrees = radiansToDegrees(range.thetaStart);
  const thetaEndDegrees = radiansToDegrees(range.thetaEnd);
  const center = sourceProjectionCenterLabel(input.projectionMode).toLowerCase() as FulldomeProjectionCenter;
  const belowHorizonDegrees = center === "zenith" ? Math.max(0, thetaEndDegrees - 90) : 0;
  const aboveHorizonDegrees = center === "nadir" ? Math.max(0, 90 - thetaStartDegrees) : 0;

  return {
    schema: "zenith.fulldome-profile",
    version: 1,
    projectionMode: input.projectionMode,
    label: sourceProjectionLabel(input.projectionMode),
    mapping: input.projectionMode === "cave-270" ? "cave-continuity-carrier" : "equidistant-fisheye",
    center,
    fieldOfViewDegrees: projectionProfile.fieldOfViewDegrees,
    thetaStartDegrees,
    thetaEndDegrees,
    horizonRadius: sourceProjectionHorizonRadius(input.projectionMode),
    belowHorizonDegrees,
    aboveHorizonDegrees,
    radiusScale,
    domeTiltDegrees: clamp(Number(input.domeTiltDegrees) || 0, -90, 90),
    audienceFrontAzimuthDegrees: wrapDegrees(Number(input.audienceFrontAzimuthDegrees) || 0),
    master: {
      width,
      height,
      fps,
      square: width === height,
    },
    mask: {
      outsideCircle: "black",
      circleFillsFrame: Math.abs(radiusScale - 1) <= 0.0001,
    },
  };
}

export function summarizeFulldomeProfile(profile: FulldomeProfile): string {
  const horizonBand =
    profile.belowHorizonDegrees > 0
      ? `, ${round1(profile.belowHorizonDegrees)} deg below horizon`
      : profile.aboveHorizonDegrees > 0
        ? `, ${round1(profile.aboveHorizonDegrees)} deg above horizon`
        : "";
  const tilt = profile.domeTiltDegrees ? `, tilt ${round1(profile.domeTiltDegrees)} deg` : "";
  const master =
    profile.master.width && profile.master.height
      ? `, ${profile.master.width} x ${profile.master.height}${profile.master.fps ? ` @ ${round1(profile.master.fps)}fps` : ""}`
      : "";
  const mapping = profile.mapping === "cave-continuity-carrier" ? "continuity carrier" : "equidistant";
  return `${profile.label} ${mapping}${horizonBand}${tilt}${master}`;
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function wrapDegrees(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

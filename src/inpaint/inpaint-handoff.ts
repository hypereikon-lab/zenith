import {
  normalizeSourceProjectionMode,
  sourceProjectionHorizonRadius,
  sourceProjectionProfileForMode,
} from "../geometry/source-projection.js";
import {
  CAVE_HANDOFF_GUIDE,
  caveGuideFloorBands,
  caveGuideHorizonBand,
  caveGuideLineWidthForSize,
  caveGuideWallBands,
  caveGuideWallColor,
} from "../geometry/cave-handoff-guide.js";
import {
  domeGuideBackgroundColor,
  domeGuideScaffold,
  normalizeDomeGuideSemanticSplit,
} from "../geometry/dome-handoff-guide.js";
import { clamp } from "../projection.js";
import type { SourceProjectionMode } from "../geometry/source-projection.js";

const GUIDE_INTERVAL_RADIANS = Math.PI / 6;
const GUIDE_LINE_COLOR: [number, number, number] = [0, 0, 0];
const OUTSIDE_PROJECTION_COLOR: [number, number, number] = [0, 0, 0];
const BLACK_LINE_THRESHOLD = CAVE_HANDOFF_GUIDE.line.blackThreshold;

export type InpaintHandoffOptions = {
  sourceProjectionMode?: SourceProjectionMode | string | null;
  domeGuideSemanticSplit?: number | string | null;
  domeGuideHorizonSplit?: number | string | null;
};

export function createInpaintHandoffCanvases(
  sourceCanvas: HTMLCanvasElement,
  options: InpaintHandoffOptions = {},
): {
  white: HTMLCanvasElement;
  mask: HTMLCanvasElement;
} {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const source = sourceContext.getImageData(0, 0, width, height);
  const whiteCanvas = document.createElement("canvas");
  const maskCanvas = document.createElement("canvas");
  whiteCanvas.width = width;
  whiteCanvas.height = height;
  maskCanvas.width = width;
  maskCanvas.height = height;

  const whiteContext = whiteCanvas.getContext("2d", { willReadFrequently: true });
  const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
  const whiteImage = whiteContext.createImageData(width, height);
  const maskImage = maskContext.createImageData(width, height);
  const src = source.data;
  const dst = whiteImage.data;
  const mask = maskImage.data;
  const guide = createProjectionGuideSampler(
    width,
    height,
    normalizeSourceProjectionMode(options.sourceProjectionMode),
    normalizeDomeGuideSemanticSplit(options.domeGuideSemanticSplit),
    options.domeGuideHorizonSplit,
  );

  for (let index = 0; index < src.length; index += 4) {
    const pixel = index / 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const alpha = src[index + 3] / 255;
    const guidePixel = guide(x, y);
    const missing = guidePixel.insideProjection ? 255 - src[index + 3] : 0;

    dst[index] = Math.round(src[index] * alpha + guidePixel.color[0] * (1 - alpha));
    dst[index + 1] = Math.round(src[index + 1] * alpha + guidePixel.color[1] * (1 - alpha));
    dst[index + 2] = Math.round(src[index + 2] * alpha + guidePixel.color[2] * (1 - alpha));
    dst[index + 3] = 255;
    mask[index] = missing;
    mask[index + 1] = missing;
    mask[index + 2] = missing;
    mask[index + 3] = 255;
  }

  whiteContext.putImageData(whiteImage, 0, 0);
  maskContext.putImageData(maskImage, 0, 0);
  return { white: whiteCanvas, mask: maskCanvas };
}

function createProjectionGuideSampler(
  width: number,
  height: number,
  sourceProjectionMode: SourceProjectionMode,
  domeGuideSemanticSplit: number,
  domeGuideHorizonSplit?: number | string | null,
): (x: number, y: number) => { color: [number, number, number]; insideProjection: boolean } {
  if (sourceProjectionMode === "cave-270") {
    return createCaveContinuityGuideSampler(width, height, domeGuideSemanticSplit, domeGuideHorizonSplit);
  }

  const profile = sourceProjectionProfileForMode(sourceProjectionMode, width, height);
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const radiusPixels = Math.min(width * profile.fisheyeScaleX, height * profile.fisheyeScaleY);
  const thetaMax = (profile.fieldOfViewDegrees * 0.5 * Math.PI) / 180;
  const radiusLineWidth = 1.5 / Math.max(radiusPixels, 1);
  const horizonRadius = Math.PI * 0.5 / Math.max(thetaMax, 0.000001);
  const scaffold = domeGuideScaffold(sourceProjectionMode, horizonRadius, domeGuideSemanticSplit, domeGuideHorizonSplit);

  return (x: number, y: number) => {
    const localX = (x + 0.5 - centerX) / Math.max(radiusPixels, 1);
    const localY = (y + 0.5 - centerY) / Math.max(radiusPixels, 1);
    const radius = Math.hypot(localX, localY);
    if (radius > 1.0001) {
      return { color: OUTSIDE_PROJECTION_COLOR, insideProjection: false };
    }

    const ring = maxGuideLines(scaffold.ringRadii.map((ringRadius) => radialGuideLine(radius, ringRadius, radiusLineWidth)));
    const horizon =
      sourceProjectionMode === "zenith-230"
        ? radialGuideLine(radius, horizonRadius, radiusLineWidth * 1.4)
        : 0;
    const sourceCircle = radialGuideLine(radius, 1, 1.6 / Math.max(radiusPixels, 1));
    const spoke =
      spokeGuideLine(localX, localY, radiusPixels) *
      smoothstep(scaffold.spokeStartRadius + 0.015, scaffold.spokeStartRadius + 0.055, radius);
    const line = clamp(Math.max(ring, spoke, horizon, sourceCircle), 0, 1);
    const guideBackground = domeGuideBackgroundColor(
      sourceProjectionMode,
      radius,
      horizonRadius,
      domeGuideSemanticSplit,
      domeGuideHorizonSplit,
    );
    const color = line >= BLACK_LINE_THRESHOLD
      ? GUIDE_LINE_COLOR
      : mixGuideColors(guideBackground, GUIDE_LINE_COLOR, line);
    return { color, insideProjection: true };
  };
}

function createCaveContinuityGuideSampler(
  width: number,
  height: number,
  domeGuideSemanticSplit: number,
  domeGuideHorizonSplit?: number | string | null,
): (x: number, y: number) => { color: [number, number, number]; insideProjection: boolean } {
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const halfWidth = Math.max(width * 0.5, 1);
  const halfHeight = Math.max(height * 0.5, 1);
  const minSide = Math.max(Math.min(width, height), 1);
  const lineWidth = caveGuideLineWidthForSize(minSide);
  const floorBand = sourceProjectionHorizonRadius("cave-270", domeGuideSemanticSplit, domeGuideHorizonSplit);
  const floorBands = caveGuideFloorBands(floorBand);
  const wallBands = caveGuideWallBands(floorBand, domeGuideHorizonSplit);
  const horizonBand = caveGuideHorizonBand(floorBand, domeGuideHorizonSplit);

  return (x: number, y: number) => {
    const localX = (x + 0.5 - centerX) / halfWidth;
    const localY = (centerY - y - 0.5) / halfHeight;
    const rho = Math.max(Math.abs(localX), Math.abs(localY));
    const wallT = clamp(
      rho <= horizonBand
        ? ((rho - floorBand) / Math.max(horizonBand - floorBand, 0.000001)) * 0.5
        : 0.5 + ((rho - horizonBand) / Math.max(1 - horizonBand, 0.000001)) * 0.5,
      0,
      1,
    );
    const wallColor = caveGuideWallColor(wallT);
    const guideBackground: [number, number, number] =
      rho <= floorBand ? [...CAVE_HANDOFF_GUIDE.colors.floor] : wallColor;
    const floorRings = maxGuideLines(floorBands.map((band) => radialGuideLine(rho, band, lineWidth)));
    const wallRings = maxGuideLines(wallBands.map((band) => radialGuideLine(rho, band, lineWidth)));
    const horizon = radialGuideLine(rho, horizonBand, lineWidth * CAVE_HANDOFF_GUIDE.line.horizonWidthMultiplier);
    const ring = Math.max(floorRings, wallRings);
    const seam = radialGuideLine(rho, floorBand, lineWidth * CAVE_HANDOFF_GUIDE.line.seamWidthMultiplier);
    const boundary = radialGuideLine(rho, 1, lineWidth * CAVE_HANDOFF_GUIDE.line.boundaryWidthMultiplier);
    const wallMask = smoothstep(
      floorBand + CAVE_HANDOFF_GUIDE.line.wallMaskStartOffset,
      floorBand + CAVE_HANDOFF_GUIDE.line.wallMaskEndOffset,
      rho,
    );
    const wallGrid =
      spokeGuideLine(
        localX,
        -localY,
        minSide * 0.5,
        CAVE_HANDOFF_GUIDE.wallRayLineWidthPixels,
        CAVE_HANDOFF_GUIDE.wallRayIntervalRadians,
      ) *
      wallMask *
      CAVE_HANDOFF_GUIDE.wallRayOpacity;
    const line = clamp(Math.max(ring, seam, horizon, boundary, wallGrid), 0, 1);
    const color =
      line >= BLACK_LINE_THRESHOLD ? GUIDE_LINE_COLOR : mixGuideColors(guideBackground, GUIDE_LINE_COLOR, line);
    return { color, insideProjection: true };
  };
}

function maxGuideLines(values: number[]): number {
  return values.reduce((max, value) => Math.max(max, value), 0);
}

function radialGuideLine(radius: number, targetRadius: number, width: number): number {
  return 1 - smoothstep(0, width, Math.abs(radius - targetRadius));
}

function spokeGuideLine(
  localX: number,
  localY: number,
  radiusPixels: number,
  lineWidthPixels = 1.25,
  interval = GUIDE_INTERVAL_RADIANS,
): number {
  const radius = Math.hypot(localX, localY);
  if (radius <= 0.000001) return 0;
  const angle = Math.atan2(localX, -localY);
  const wrapped = Math.abs((((angle / interval + 0.5) % 1) + 1) % 1 - 0.5) * interval;
  const arcPixels = wrapped * radius * radiusPixels;
  return 1 - smoothstep(0, lineWidthPixels, arcPixels);
}

function mixGuideColors(
  from: [number, number, number],
  to: [number, number, number],
  amount: number,
): [number, number, number] {
  const t = clamp(amount, 0, 1);
  return [
    Math.round(from[0] + (to[0] - from[0]) * t),
    Math.round(from[1] + (to[1] - from[1]) * t),
    Math.round(from[2] + (to[2] - from[2]) * t),
  ];
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / Math.max(edge1 - edge0, 0.000001), 0, 1);
  return t * t * (3 - 2 * t);
}

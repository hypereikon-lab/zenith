import { normalizeSourceProjectionMode, sourceProjectionProfileForMode } from "../geometry/source-projection.js";
import { clamp } from "../projection.js";
import type { SourceProjectionMode } from "../geometry/source-projection.js";

const GUIDE_INTERVAL_RADIANS = Math.PI / 12;
const GUIDE_BACKGROUND_COLOR: [number, number, number] = [0, 255, 0];
const GUIDE_LINE_COLOR: [number, number, number] = [0, 0, 0];
const OUTSIDE_PROJECTION_COLOR: [number, number, number] = [0, 0, 0];
const BLACK_LINE_THRESHOLD = 0.52;

export type InpaintHandoffOptions = {
  sourceProjectionMode?: SourceProjectionMode | string | null;
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
): (x: number, y: number) => { color: [number, number, number]; insideProjection: boolean } {
  const profile = sourceProjectionProfileForMode(sourceProjectionMode, width, height);
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const radiusPixels = Math.min(width * profile.fisheyeScaleX, height * profile.fisheyeScaleY);
  const thetaMax = (profile.fieldOfViewDegrees * 0.5 * Math.PI) / 180;
  const thetaPerPixel = thetaMax / Math.max(radiusPixels, 1);
  const lineWidthTheta = thetaPerPixel * 1.45;
  const horizonRadius = Math.PI * 0.5 / Math.max(thetaMax, 0.000001);

  return (x: number, y: number) => {
    const localX = (x + 0.5 - centerX) / Math.max(radiusPixels, 1);
    const localY = (y + 0.5 - centerY) / Math.max(radiusPixels, 1);
    const radius = Math.hypot(localX, localY);
    if (radius > 1.0001) {
      return { color: OUTSIDE_PROJECTION_COLOR, insideProjection: false };
    }

    const theta = radius * thetaMax;
    const ring =
      guideLine(theta, GUIDE_INTERVAL_RADIANS, lineWidthTheta) * smoothstep(0.025, 0.08, radius);
    const horizon = radialGuideLine(radius, horizonRadius, 1.5 / Math.max(radiusPixels, 1));
    const sourceCircle = radialGuideLine(radius, 1, 1.6 / Math.max(radiusPixels, 1));
    const spoke = spokeGuideLine(localX, localY, radiusPixels) * smoothstep(0.035, 0.12, radius);
    const line = clamp(Math.max(ring, spoke, horizon, sourceCircle), 0, 1);
    const color = line >= BLACK_LINE_THRESHOLD
      ? GUIDE_LINE_COLOR
      : mixGuideColors(GUIDE_BACKGROUND_COLOR, GUIDE_LINE_COLOR, line);
    return { color, insideProjection: true };
  };
}

function guideLine(value: number, interval: number, width: number): number {
  const wrapped = Math.abs((((value / interval + 0.5) % 1) + 1) % 1 - 0.5) * interval;
  return 1 - smoothstep(0, width, wrapped);
}

function radialGuideLine(radius: number, targetRadius: number, width: number): number {
  return 1 - smoothstep(0, width, Math.abs(radius - targetRadius));
}

function spokeGuideLine(localX: number, localY: number, radiusPixels: number): number {
  const radius = Math.hypot(localX, localY);
  if (radius <= 0.000001) return 0;
  const angle = Math.atan2(localX, -localY);
  const wrapped = Math.abs((((angle / GUIDE_INTERVAL_RADIANS + 0.5) % 1) + 1) % 1 - 0.5) * GUIDE_INTERVAL_RADIANS;
  const arcPixels = wrapped * radius * radiusPixels;
  return 1 - smoothstep(0, 1.25, arcPixels);
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

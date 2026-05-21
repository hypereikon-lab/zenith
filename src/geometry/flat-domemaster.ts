import { directionFromPlateUv } from "../plates/plate-placement.js";
import { HALF_PI, clamp, inverseMotionProjectionRadius, projectionRadiusForTheta } from "../projection.js";
import type { PreparedPlatePlacement } from "../plates/plate-placement.js";
import type { Point2D, ProjectionProfile, Vec3 } from "../projection.js";

/**
 * Coordinate-space contract for the flat domemaster:
 * - client points are viewport-relative PointerEvent coordinates.
 * - canvas points are CSS pixels local to the visible canvas element.
 * - flat display points are canvas points after the flat shader rotation.
 * - flat source points are unrotated domemaster source points.
 */
export type Size2D = { width: number; height: number };
export type ClientRectLike = { left: number; top: number; width: number; height: number };
export type FlatMapMetrics = { cx: number; cy: number; radius: number };
export type FlatProjectionOptions = {
  projectionMode?: string | null;
  customCurve?: number | string | null;
};
export type FlatTransformOptions = FlatProjectionOptions & {
  radiusScale?: number | string | null;
  rotationRadians?: number | string | null;
};
export type DomePoint = { radius: number; azimuth: number };
export type SourceOffset = { dx: number; dy: number };
export type UvBounds = { minU: number; maxU: number; minV: number; maxV: number };

export function clientEventToCanvasPoint(
  event: { clientX: number; clientY: number },
  canvas: { clientWidth: number; clientHeight: number; getBoundingClientRect?: () => ClientRectLike },
): Point2D {
  return clientPointToCanvasPoint({ x: event.clientX, y: event.clientY }, canvas.getBoundingClientRect?.(), {
    width: canvas.clientWidth,
    height: canvas.clientHeight,
  });
}

export function clientPointToCanvasPoint(
  clientPoint: Point2D,
  canvasRect: ClientRectLike | DOMRect | null | undefined,
  canvasSize: Size2D,
): Point2D {
  if (!canvasRect) return clientPoint;
  const scaleX = canvasRect.width > 0 ? canvasSize.width / canvasRect.width : 1;
  const scaleY = canvasRect.height > 0 ? canvasSize.height / canvasRect.height : 1;
  return {
    x: (clientPoint.x - canvasRect.left) * scaleX,
    y: (clientPoint.y - canvasRect.top) * scaleY,
  };
}

export function flatMapRadius(metrics: FlatMapMetrics, radiusScale: number | string | null = 1): number {
  return metrics.radius * clamp(Number(radiusScale) || 1, 0.2, 2);
}

export function flatDisplayPointToDomePoint(
  point: Point2D,
  metrics: FlatMapMetrics,
  options: FlatTransformOptions = {},
): DomePoint | null {
  const offset = flatDisplayPointToSourceOffset(point, metrics, options);
  return flatSourceOffsetToDomePoint(offset.dx, offset.dy, options);
}

export function flatDisplayPointToDomeDirection(
  point: Point2D,
  metrics: FlatMapMetrics,
  options: FlatTransformOptions = {},
): Vec3 | null {
  const offset = flatDisplayPointToSourceOffset(point, metrics, options);
  return flatSourceOffsetToDomeDirection(offset.dx, offset.dy, options);
}

export function flatDisplayPointToSourceOffset(
  point: Point2D,
  metrics: FlatMapMetrics,
  options: FlatTransformOptions = {},
): SourceOffset {
  const radius = flatMapRadius(metrics, options.radiusScale);
  const sourcePoint = displayFlatToSourceFlatPoint(point, metrics.cx, metrics.cy, options.rotationRadians);
  return {
    dx: (sourcePoint.x - metrics.cx) / radius,
    dy: (sourcePoint.y - metrics.cy) / radius,
  };
}

export function flatSourceOffsetToDomePoint(
  dx: number,
  dy: number,
  options: FlatProjectionOptions = {},
): DomePoint | null {
  const r = Math.hypot(dx, dy);
  if (r > 1.02) return null;
  const theta = thetaFromFlatRadial(r, options);
  return {
    radius: clamp(theta / HALF_PI, 0, 1),
    azimuth: normalizeDegrees((Math.atan2(dx, -dy) * 180) / Math.PI),
  };
}

export function flatSourceOffsetToDomeDirection(
  dx: number,
  dy: number,
  options: FlatProjectionOptions = {},
): Vec3 | null {
  const r = Math.hypot(dx, dy);
  if (r > 1.02) return null;
  const theta = thetaFromFlatRadial(r, options);
  const azimuth = Math.atan2(dx, -dy);
  const sinTheta = Math.sin(theta);
  return [sinTheta * Math.sin(azimuth), Math.cos(theta), sinTheta * Math.cos(azimuth)];
}

export function plateUvToFlatPoint(
  placement: PreparedPlatePlacement,
  u: number,
  v: number,
  cx: number,
  cy: number,
  radius: number,
  projectionOptions: FlatProjectionOptions = {},
): Point2D | null {
  const direction = directionFromPlateUv(placement, u, v);
  if (!direction) return null;
  return domeDirectionToFlatPoint(direction, cx, cy, radius, projectionOptions);
}

export function plateUvToDisplayFlatPoint(
  placement: PreparedPlatePlacement,
  u: number,
  v: number,
  cx: number,
  cy: number,
  radius: number,
  rotationRadians: number | string | null = 0,
  projectionOptions: FlatProjectionOptions = {},
): Point2D | null {
  return sourceFlatToDisplayFlatPoint(
    plateUvToFlatPoint(placement, u, v, cx, cy, radius, projectionOptions),
    cx,
    cy,
    rotationRadians,
  );
}

export function domeDirectionToFlatPoint(
  direction: Vec3,
  cx: number,
  cy: number,
  radius: number,
  options: FlatProjectionOptions = {},
): Point2D | null {
  if (direction[1] < -0.0001) return null;
  const theta = Math.acos(clamp(direction[1], 0, 1));
  const r = projectionRadiusForTheta(theta, projectionProfileForFlatOptions(options));
  if (r > 1.02) return null;
  const azimuth = Math.atan2(direction[0], direction[2]);
  return {
    x: cx + Math.sin(azimuth) * r * radius,
    y: cy - Math.cos(azimuth) * r * radius,
  };
}

export function sourceFlatToDisplayFlatPoint(
  point: Point2D | null,
  cx: number,
  cy: number,
  rotationRadians: number | string | null = 0,
): Point2D | null {
  return rotateFlatPoint(point, cx, cy, -(Number(rotationRadians) || 0));
}

export function displayFlatToSourceFlatPoint(
  point: Point2D,
  cx: number,
  cy: number,
  rotationRadians: number | string | null = 0,
): Point2D {
  return rotateFlatPoint(point, cx, cy, rotationRadians) as Point2D;
}

export function visiblePlateUvBounds(placement: PreparedPlatePlacement, fitMode = "contain"): UvBounds {
  if (fitMode !== "contain") {
    return { minU: 0, maxU: 1, minV: 0, maxV: 1 };
  }
  const imageAspect = Math.max(Number(placement.aspect) || 1, 0.000001);
  const domainAspect = Math.max(placement.angularWidth / Math.max(placement.angularHeight, 0.000001), 0.000001);
  if (imageAspect > domainAspect) {
    const fittedHeight = domainAspect / imageAspect;
    const inset = (1 - fittedHeight) * 0.5;
    return { minU: 0, maxU: 1, minV: inset, maxV: 1 - inset };
  }
  const fittedWidth = imageAspect / domainAspect;
  const inset = (1 - fittedWidth) * 0.5;
  return { minU: inset, maxU: 1 - inset, minV: 0, maxV: 1 };
}

function rotateFlatPoint(
  point: Point2D | null,
  cx: number,
  cy: number,
  angle: number | string | null = 0,
): Point2D | null {
  if (!point || !angle) return point;
  const radians = Number(angle) || 0;
  const dx = point.x - cx;
  const dy = point.y - cy;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return {
    x: cx + dx * c - dy * s,
    y: cy + dx * s + dy * c,
  };
}

function thetaFromFlatRadial(radial: number, options: FlatProjectionOptions): number {
  return inverseMotionProjectionRadius(radial, projectionProfileForFlatOptions(options));
}

function projectionProfileForFlatOptions(options: FlatProjectionOptions = {}): ProjectionProfile {
  return {
    width: 1,
    height: 1,
    fisheyeScaleX: 0.5,
    fisheyeScaleY: 0.5,
    radiusPixels: 0.5,
    projectionMode: options.projectionMode || "equidistant",
    customCurve: Number(options.customCurve) || 1,
  };
}

function normalizeDegrees(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

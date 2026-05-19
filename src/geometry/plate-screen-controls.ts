import { directionFromPlateUv } from "../plates/plate-placement.js";
import type { PlateCorner, PreparedPlatePlacement } from "../plates/plate-placement.js";
import type { Point2D, Rect, Vec3 } from "../projection.js";

const OUTLINE_SEGMENTS = 12;
const MIN_HANDLE_BOX = 42;
const ROTATE_HANDLE_OFFSET = 30;
const VALIDATION_STEPS = 8;

export type UvBounds = { minU: number; minV: number; maxU: number; maxV: number };
export type PlateScreenProjector = {
  projectSourceDirection: (direction: Vec3) => Point2D | null;
  sourceDirectionAt?: (point: Point2D) => Vec3 | null;
  rect?: Rect | null;
};
export type PlateScaleScreenHandle = Point2D & { corner: PlateCorner };
export type PlateScreenControls = {
  center: Point2D;
  outline: Point2D[];
  scaleHandles: PlateScaleScreenHandle[];
  rotateAnchor: Point2D | null;
  rotateHandle: Point2D | null;
};

export function projectPlateScreenControls(
  placement: PreparedPlatePlacement,
  bounds: UvBounds,
  projector: PlateScreenProjector,
): PlateScreenControls | null {
  const center = projector.projectSourceDirection(placement.center);
  if (!center) return null;

  const outline = projectedOutlinePoints(placement, bounds, projector);
  const box = boundingBox(outline.length > 0 ? outline : [center], center);
  const canonicalScaleHandles = [
    { corner: "nw" as const, point: projectUv(placement, bounds.minU, bounds.minV, projector) },
    { corner: "ne" as const, point: projectUv(placement, bounds.maxU, bounds.minV, projector) },
    { corner: "se" as const, point: projectUv(placement, bounds.maxU, bounds.maxV, projector) },
    { corner: "sw" as const, point: projectUv(placement, bounds.minU, bounds.maxV, projector) },
  ]
    .filter((handle): handle is { corner: PlateCorner; point: Point2D } => Boolean(handle.point))
    .map(({ corner, point }) => ({ ...point, corner }));

  const scaleHandles =
    canonicalScaleHandles.length >= 3 ? canonicalScaleHandles : fallbackScaleHandles(box, center, projector);

  const centerU = (bounds.minU + bounds.maxU) * 0.5;
  const canonicalRotate = projectUv(placement, centerU, bounds.minV - 0.18, projector);
  const canonicalTop = projectUv(placement, centerU, bounds.minV, projector);
  const fallbackRotate = fallbackRotateHandle(box, center, outline, projector);
  const rotateHandle = canonicalRotate || fallbackRotate?.handle || null;
  const rotateAnchor = canonicalRotate ? canonicalTop || nearestOutlinePoint(rotateHandle, outline) : fallbackRotate?.anchor || null;

  return {
    center,
    outline,
    scaleHandles,
    rotateAnchor,
    rotateHandle,
  };
}

function projectedOutlinePoints(
  placement: PreparedPlatePlacement,
  bounds: UvBounds,
  projector: PlateScreenProjector,
): Point2D[] {
  const points: Point2D[] = [];
  const edges = [
    [bounds.minU, bounds.minV, bounds.maxU, bounds.minV],
    [bounds.maxU, bounds.minV, bounds.maxU, bounds.maxV],
    [bounds.maxU, bounds.maxV, bounds.minU, bounds.maxV],
    [bounds.minU, bounds.maxV, bounds.minU, bounds.minV],
  ];
  for (const edge of edges) {
    for (let step = 0; step <= OUTLINE_SEGMENTS; step += 1) {
      const t = step / OUTLINE_SEGMENTS;
      const point = projectUv(placement, lerp(edge[0], edge[2], t), lerp(edge[1], edge[3], t), projector);
      if (point) points.push(point);
    }
  }
  return points;
}

function fallbackScaleHandles(box: Rect, center: Point2D, projector: PlateScreenProjector): PlateScaleScreenHandle[] {
  const candidates = [
    { corner: "nw" as const, x: box.x, y: box.y },
    { corner: "ne" as const, x: box.x + box.width, y: box.y },
    { corner: "se" as const, x: box.x + box.width, y: box.y + box.height },
    { corner: "sw" as const, x: box.x, y: box.y + box.height },
  ];
  return candidates
    .map((candidate) => {
      const point = nearestValidPoint(candidate, center, projector);
      return point ? { ...point, corner: candidate.corner } : null;
    })
    .filter((point): point is PlateScaleScreenHandle => Boolean(point));
}

function fallbackRotateHandle(
  box: Rect,
  center: Point2D,
  outline: Point2D[],
  projector: PlateScreenProjector,
): { anchor: Point2D; handle: Point2D } | null {
  const anchor = topMostPoint(outline) || { x: box.x + box.width * 0.5, y: box.y };
  const vector = normalize2d({ x: anchor.x - center.x, y: anchor.y - center.y }) || { x: 0, y: -1 };
  const desired = {
    x: anchor.x + vector.x * ROTATE_HANDLE_OFFSET,
    y: anchor.y + vector.y * ROTATE_HANDLE_OFFSET,
  };
  const handle = nearestValidPoint(desired, anchor, projector) || anchor;
  return { anchor, handle };
}

function projectUv(
  placement: PreparedPlatePlacement,
  u: number,
  v: number,
  projector: PlateScreenProjector,
): Point2D | null {
  return projector.projectSourceDirection(directionFromPlateUv(placement, u, v));
}

function boundingBox(points: Point2D[], center: Point2D): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    minX = center.x;
    maxX = center.x;
    minY = center.y;
    maxY = center.y;
  }
  const halfWidth = Math.max((maxX - minX) * 0.5, MIN_HANDLE_BOX * 0.5);
  const halfHeight = Math.max((maxY - minY) * 0.5, MIN_HANDLE_BOX * 0.5);
  return {
    x: center.x - halfWidth,
    y: center.y - halfHeight,
    width: halfWidth * 2,
    height: halfHeight * 2,
  };
}

function nearestValidPoint(point: Point2D, anchor: Point2D, projector: PlateScreenProjector): Point2D | null {
  for (let step = 0; step <= VALIDATION_STEPS; step += 1) {
    const t = 1 - step / VALIDATION_STEPS;
    const candidate = {
      x: lerp(anchor.x, point.x, t),
      y: lerp(anchor.y, point.y, t),
    };
    if (isValidScreenPoint(candidate, projector)) return candidate;
  }
  return null;
}

function isValidScreenPoint(point: Point2D, projector: PlateScreenProjector): boolean {
  if (projector.rect && !pointInRect(point, projector.rect)) return false;
  return projector.sourceDirectionAt ? Boolean(projector.sourceDirectionAt(point)) : true;
}

function topMostPoint(points: Point2D[]): Point2D | null {
  let top: Point2D | null = null;
  for (const point of points) {
    if (!top || point.y < top.y) top = point;
  }
  return top;
}

function nearestOutlinePoint(point: Point2D | null, outline: Point2D[]): Point2D | null {
  if (!point || outline.length === 0) return null;
  let nearest = outline[0];
  let nearestDistance = distance2d(point, nearest);
  for (const candidate of outline) {
    const candidateDistance = distance2d(point, candidate);
    if (candidateDistance < nearestDistance) {
      nearest = candidate;
      nearestDistance = candidateDistance;
    }
  }
  return nearest;
}

function normalize2d(point: Point2D): Point2D | null {
  const length = Math.hypot(point.x, point.y);
  return length > 0.000001 ? { x: point.x / length, y: point.y / length } : null;
}

function pointInRect(point: Point2D, rect: Rect): boolean {
  return point.x >= rect.x && point.y >= rect.y && point.x <= rect.x + rect.width && point.y <= rect.y + rect.height;
}

function distance2d(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

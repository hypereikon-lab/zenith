import type { PlateCorner, PreparedPlatePlacement } from "../plates/plate-placement.js";
import type { Point2D, Vec3 } from "../projection.js";

const OUTLINE_SEGMENTS = 12;

export type UvBounds = { minU: number; minV: number; maxU: number; maxV: number };
export type PlateScreenProjector = {
  projectSourceDirection: (direction: Vec3) => Point2D | null;
  projectPlateUv: (placement: PreparedPlatePlacement, u: number, v: number) => Point2D | null;
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
  const scaleHandles = [
    { corner: "nw" as const, point: projectUv(placement, bounds.minU, bounds.minV, projector) },
    { corner: "ne" as const, point: projectUv(placement, bounds.maxU, bounds.minV, projector) },
    { corner: "se" as const, point: projectUv(placement, bounds.maxU, bounds.maxV, projector) },
    { corner: "sw" as const, point: projectUv(placement, bounds.minU, bounds.maxV, projector) },
  ]
    .filter((handle): handle is { corner: PlateCorner; point: Point2D } => Boolean(handle.point))
    .map(({ corner, point }) => ({ ...point, corner }));

  const centerU = (bounds.minU + bounds.maxU) * 0.5;
  const rotateHandle = projectUv(placement, centerU, bounds.minV - 0.18, projector);
  const rotateAnchor = rotateHandle ? projectUv(placement, centerU, bounds.minV, projector) || nearestOutlinePoint(rotateHandle, outline) : null;

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

function projectUv(
  placement: PreparedPlatePlacement,
  u: number,
  v: number,
  projector: PlateScreenProjector,
): Point2D | null {
  return projector.projectPlateUv(placement, u, v);
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

function distance2d(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

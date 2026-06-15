import { dot, multiplyMat4, multiplyMat4Vec4, normalize, perspectiveLH, scaleVec3 } from "../projection.js";
import { domePointFromSourceDirection } from "./dome-view.js";
import {
  DEFAULT_CAVE_ROOM,
  caveContinuityDirectionFromSurfacePoint,
  caveSurfacePointFromContinuityDirection,
  normalizeCaveRoom,
} from "./cave-projection.js";
import { physicalDirectionFromSourceDirection, sourceDirectionFromPhysicalDirection } from "./source-transform.js";
import { sourceProjectionContainsDirection } from "./source-projection.js";
import type { CaveRoom } from "./cave-projection.js";
import type { SourceProjectionMode } from "./source-projection.js";
import type { Mat4, Point2D, Rect, Vec3 } from "../projection.js";

export type CaveViewProjection = {
  rect: Rect;
  viewMatrix: Mat4;
  fovDegrees: number;
  sourceRotationRadians: number;
  domeTiltRadians: number;
  mirror: boolean;
  sourceProjectionMode?: SourceProjectionMode;
  room?: CaveRoom;
};

type Ray = { origin: Vec3; direction: Vec3 };

const EPSILON = 0.000001;

export function sourceCaveDirectionFromScreenPoint(point: Point2D, projection: CaveViewProjection): Vec3 | null {
  const surfacePoint = caveSurfacePointFromScreenPoint(point, projection);
  if (!surfacePoint) return null;
  const continuityPhysical = caveContinuityDirectionFromSurfacePoint(surfacePoint, projection.room);
  const source = sourceDirectionFromPhysicalDirection(continuityPhysical, projection);
  return sourceProjectionContainsDirection(source, projection.sourceProjectionMode || "zenith-180") ? source : null;
}

export function sourceCavePointFromScreenPoint(point: Point2D, projection: CaveViewProjection) {
  const direction = sourceCaveDirectionFromScreenPoint(point, projection);
  return direction ? domePointFromSourceDirection(direction, projection.sourceProjectionMode || "zenith-180") : null;
}

export function sourceCaveDirectionToScreenPoint(direction: Vec3, projection: CaveViewProjection): Point2D | null {
  if (!sourceProjectionContainsDirection(direction, projection.sourceProjectionMode || "zenith-180")) return null;
  const continuityPhysical = physicalDirectionFromSourceDirection(direction, projection);
  const hit = caveSurfacePointFromContinuityDirection(continuityPhysical, projection.room);
  if (!hit) return null;

  const aspect = projection.rect.width / Math.max(projection.rect.height, EPSILON);
  const cameraProjection = perspectiveLH((projection.fovDegrees * Math.PI) / 180, aspect, 0.01, 20);
  const mvp = multiplyMat4(cameraProjection, projection.viewMatrix);
  const clip = multiplyMat4Vec4(mvp, [hit[0], hit[1], hit[2], 1]);
  if (clip[3] <= 0.0001) return null;

  const x = clip[0] / clip[3];
  const y = clip[1] / clip[3];
  const z = clip[2] / clip[3];
  if (x < -1.1 || x > 1.1 || y < -1.1 || y > 1.1 || z < 0 || z > 1.05) return null;

  const screenPoint = {
    x: projection.rect.x + (x * 0.5 + 0.5) * projection.rect.width,
    y: projection.rect.y + (1 - (y * 0.5 + 0.5)) * projection.rect.height,
  };
  const visibleSurfacePoint = caveSurfacePointFromScreenPoint(screenPoint, projection);
  if (!visibleSurfacePoint) return null;
  const visibleContinuityPhysical = caveContinuityDirectionFromSurfacePoint(visibleSurfacePoint, projection.room);
  return dot(visibleContinuityPhysical, normalize(continuityPhysical)) > 0.999 ? screenPoint : null;
}

function caveSurfacePointFromScreenPoint(point: Point2D, projection: CaveViewProjection): Vec3 | null {
  if (!pointInRect(point, projection.rect)) return null;
  const ray = worldRayFromScreenPoint(point, projection);
  if (!ray) return null;
  return intersectCaveSurface(ray, projection.room);
}

export function caveSurfacePointForPhysicalDirection(direction: Vec3, room: CaveRoom = DEFAULT_CAVE_ROOM): Vec3 | null {
  return intersectCaveSurface({ origin: [0, 0, 0], direction: normalize(direction) }, room);
}

function intersectCaveSurface(ray: Ray, room: CaveRoom = DEFAULT_CAVE_ROOM): Vec3 | null {
  const safeRoom = normalizeCaveRoom(room);
  const halfWidth = safeRoom.width * 0.5;
  const halfDepth = safeRoom.depth * 0.5;
  const bottom = -safeRoom.eyeHeight;
  const top = safeRoom.height - safeRoom.eyeHeight;
  const candidates: Array<{ t: number; point: Vec3 }> = [];

  addPlaneCandidate(candidates, ray, 0, halfWidth, bottom, top, -halfDepth, halfDepth);
  addPlaneCandidate(candidates, ray, 0, -halfWidth, bottom, top, -halfDepth, halfDepth);
  addPlaneCandidate(candidates, ray, 2, halfDepth, -halfWidth, halfWidth, bottom, top);
  addPlaneCandidate(candidates, ray, 2, -halfDepth, -halfWidth, halfWidth, bottom, top);
  addPlaneCandidate(candidates, ray, 1, bottom, -halfWidth, halfWidth, -halfDepth, halfDepth);

  candidates.sort((a, b) => a.t - b.t);
  return candidates[0]?.point || null;
}

function addPlaneCandidate(
  candidates: Array<{ t: number; point: Vec3 }>,
  ray: Ray,
  axis: 0 | 1 | 2,
  value: number,
  firstMin: number,
  firstMax: number,
  secondMin: number,
  secondMax: number,
): void {
  const denominator = ray.direction[axis];
  if (Math.abs(denominator) <= EPSILON) return;
  const t = (value - ray.origin[axis]) / denominator;
  if (t <= EPSILON) return;
  const point: Vec3 = [
    ray.origin[0] + ray.direction[0] * t,
    ray.origin[1] + ray.direction[1] * t,
    ray.origin[2] + ray.direction[2] * t,
  ];
  const first = axis === 0 ? point[1] : point[0];
  const second = axis === 0 ? point[2] : axis === 1 ? point[2] : point[1];
  if (first < firstMin - 0.0001 || first > firstMax + 0.0001) return;
  if (second < secondMin - 0.0001 || second > secondMax + 0.0001) return;
  candidates.push({ t, point });
}

function worldRayFromScreenPoint(
  point: Point2D,
  projection: Pick<CaveViewProjection, "rect" | "viewMatrix" | "fovDegrees">,
): Ray | null {
  const { rect, viewMatrix } = projection;
  if (rect.width <= 0 || rect.height <= 0) return null;

  const ndcX = ((point.x - rect.x) / rect.width) * 2 - 1;
  const ndcY = 1 - ((point.y - rect.y) / rect.height) * 2;
  const fovRadians = (projection.fovDegrees * Math.PI) / 180;
  const tanHalfFov = Math.tan(fovRadians * 0.5);
  if (!Number.isFinite(tanHalfFov) || tanHalfFov <= 0) return null;

  const aspect = rect.width / Math.max(rect.height, EPSILON);
  const cameraDirection: Vec3 = normalize([ndcX * tanHalfFov * aspect, ndcY * tanHalfFov, 1]);
  const xAxis: Vec3 = [viewMatrix[0], viewMatrix[4], viewMatrix[8]];
  const yAxis: Vec3 = [viewMatrix[1], viewMatrix[5], viewMatrix[9]];
  const zAxis: Vec3 = [viewMatrix[2], viewMatrix[6], viewMatrix[10]];
  const origin = addVec3(
    addVec3(scaleVec3(xAxis, -viewMatrix[12]), scaleVec3(yAxis, -viewMatrix[13])),
    scaleVec3(zAxis, -viewMatrix[14]),
  );
  const direction = normalize(
    addVec3(addVec3(scaleVec3(xAxis, cameraDirection[0]), scaleVec3(yAxis, cameraDirection[1])), scaleVec3(zAxis, cameraDirection[2])),
  );
  return { origin, direction };
}

function pointInRect(point: Point2D, rect: Rect): boolean {
  return point.x >= rect.x && point.y >= rect.y && point.x <= rect.x + rect.width && point.y <= rect.y + rect.height;
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

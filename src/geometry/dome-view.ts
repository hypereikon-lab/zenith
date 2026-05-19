import {
  HALF_PI,
  clamp,
  dot,
  multiplyMat4,
  multiplyMat4Vec4,
  normalize,
  perspectiveLH,
  scaleVec3,
} from "../projection.js";
import type { Mat4, Point2D, Rect, Vec3 } from "../projection.js";

const CUTAWAY_HIDDEN_X = -0.025;
const VISIBILITY_DOT_THRESHOLD = 0.999;

export type DomeViewProjection = {
  rect: Rect;
  viewMatrix: Mat4;
  fovDegrees: number;
  sourceRotationRadians: number;
  domeTiltRadians: number;
  mirror: boolean;
  cutaway?: boolean;
};

export type DomePoint = { radius: number; azimuth: number };

export function sourceDomeDirectionFromScreenPoint(
  point: Point2D,
  projection: DomeViewProjection,
): Vec3 | null {
  const physical = physicalDomeDirectionFromScreenPoint(point, projection);
  return physical ? sourceDirectionFromPhysicalDomeDirection(physical, projection) : null;
}

export function sourceDomePointFromScreenPoint(
  point: Point2D,
  projection: DomeViewProjection,
): DomePoint | null {
  const direction = sourceDomeDirectionFromScreenPoint(point, projection);
  return direction ? domePointFromSourceDirection(direction) : null;
}

export function sourceDomeDirectionToScreenPoint(
  direction: Vec3,
  projection: DomeViewProjection,
): Point2D | null {
  const physical = physicalDomeDirectionFromSourceDirection(direction, projection);
  if (physical[1] < -0.001) return null;
  if (projection.cutaway && physical[0] < CUTAWAY_HIDDEN_X) return null;

  const aspect = projection.rect.width / Math.max(projection.rect.height, 0.000001);
  const cameraProjection = perspectiveLH((projection.fovDegrees * Math.PI) / 180, aspect, 0.01, 20);
  const mvp = multiplyMat4(cameraProjection, projection.viewMatrix);
  const clip = multiplyMat4Vec4(mvp, [physical[0], physical[1], physical[2], 1]);
  if (clip[3] <= 0.0001) return null;

  const x = clip[0] / clip[3];
  const y = clip[1] / clip[3];
  const z = clip[2] / clip[3];
  if (x < -1.1 || x > 1.1 || y < -1.1 || y > 1.1 || z < 0 || z > 1.05) return null;

  const screenPoint = {
    x: projection.rect.x + (x * 0.5 + 0.5) * projection.rect.width,
    y: projection.rect.y + (1 - (y * 0.5 + 0.5)) * projection.rect.height,
  };
  const visiblePhysical = physicalDomeDirectionFromScreenPoint(screenPoint, projection);
  if (!visiblePhysical || dot(visiblePhysical, physical) < VISIBILITY_DOT_THRESHOLD) return null;
  return screenPoint;
}

export function domePointFromSourceDirection(direction: Vec3): DomePoint {
  const theta = Math.acos(clamp(direction[1], 0, 1));
  return {
    radius: clamp(theta / HALF_PI, 0, 1),
    azimuth: normalizeDegrees((Math.atan2(direction[0], direction[2]) * 180) / Math.PI),
  };
}

export function sourceDirectionFromPhysicalDomeDirection(
  physicalDirection: Vec3,
  projection: Pick<DomeViewProjection, "domeTiltRadians" | "mirror" | "sourceRotationRadians">,
): Vec3 {
  const tilted = rotateX(normalize(physicalDirection), projection.domeTiltRadians);
  const theta = Math.acos(clamp(tilted[1], 0, 1));
  const sinTheta = Math.sin(theta);
  let azimuth = Math.atan2(tilted[0], tilted[2]);
  if (projection.mirror) {
    azimuth = -azimuth;
  }
  azimuth += projection.sourceRotationRadians;
  return normalize([sinTheta * Math.sin(azimuth), Math.cos(theta), sinTheta * Math.cos(azimuth)]);
}

export function physicalDomeDirectionFromSourceDirection(
  sourceDirection: Vec3,
  projection: Pick<DomeViewProjection, "domeTiltRadians" | "mirror" | "sourceRotationRadians">,
): Vec3 {
  const source = normalize(sourceDirection);
  const theta = Math.acos(clamp(source[1], 0, 1));
  const sinTheta = Math.sin(theta);
  let azimuth = Math.atan2(source[0], source[2]) - projection.sourceRotationRadians;
  if (projection.mirror) {
    azimuth = -azimuth;
  }
  const tilted: Vec3 = [sinTheta * Math.sin(azimuth), Math.cos(theta), sinTheta * Math.cos(azimuth)];
  return normalize(rotateX(tilted, -projection.domeTiltRadians));
}

function physicalDomeDirectionFromScreenPoint(point: Point2D, projection: DomeViewProjection): Vec3 | null {
  if (!pointInRect(point, projection.rect)) return null;

  const ray = worldRayFromScreenPoint(point, projection);
  if (!ray) return null;

  const a = dot(ray.direction, ray.direction);
  const b = 2 * dot(ray.origin, ray.direction);
  const c = dot(ray.origin, ray.origin) - 1;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;

  const root = Math.sqrt(discriminant);
  const candidates = [(-b - root) / (2 * a), (-b + root) / (2 * a)].filter((value) => value >= 0);
  candidates.sort((left, right) => left - right);
  for (const distance of candidates) {
    const hit = addVec3(ray.origin, scaleVec3(ray.direction, distance));
    if (hit[1] < -0.001) continue;
    if (projection.cutaway && hit[0] < CUTAWAY_HIDDEN_X) continue;
    return normalize(hit);
  }
  return null;
}

function worldRayFromScreenPoint(
  point: Point2D,
  projection: Pick<DomeViewProjection, "rect" | "viewMatrix" | "fovDegrees">,
): { origin: Vec3; direction: Vec3 } | null {
  const { rect, viewMatrix } = projection;
  if (rect.width <= 0 || rect.height <= 0) return null;

  const ndcX = ((point.x - rect.x) / rect.width) * 2 - 1;
  const ndcY = 1 - ((point.y - rect.y) / rect.height) * 2;
  const fovRadians = (projection.fovDegrees * Math.PI) / 180;
  const tanHalfFov = Math.tan(fovRadians * 0.5);
  if (!Number.isFinite(tanHalfFov) || tanHalfFov <= 0) return null;

  const aspect = rect.width / Math.max(rect.height, 0.000001);
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

function rotateX(value: Vec3, angle: number): Vec3 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [value[0], value[1] * cosine - value[2] * sine, value[1] * sine + value[2] * cosine];
}

function pointInRect(point: Point2D, rect: Rect): boolean {
  return point.x >= rect.x && point.y >= rect.y && point.x <= rect.x + rect.width && point.y <= rect.y + rect.height;
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function normalizeDegrees(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

import { clamp, dot, normalize } from "../projection.js";
import {
  sourceMapPointToDirection,
  sourceMapPointToUv,
} from "../geometry/source-projection.js";
import type { SourceProjectionMode } from "../geometry/source-projection.js";
import type { Vec3 } from "../projection.js";

export type PlateLike = { aspect?: number | string | null };
export type PlateCorner = "nw" | "ne" | "se" | "sw";
export type PlateCornerOffset = { x: number; y: number };
export type PlateCornerOffsets = Record<PlateCorner, PlateCornerOffset>;
export type PlatePlacementInput = {
  azimuth?: number | string | null;
  radius?: number | string | null;
  scale?: number | string | null;
  width?: number | string | null;
  height?: number | string | null;
  spin?: number | string | null;
  opacity?: number | string | null;
  flipX?: boolean | null;
  flipY?: boolean | null;
  aspect?: number | string | null;
  cornerOffsets?: Partial<Record<PlateCorner, Partial<PlateCornerOffset> | null>> | null;
};
export type NormalizedPlatePlacement = {
  azimuth: number;
  radius: number;
  scale: number;
  spin: number;
  opacity: number;
  flipX: boolean;
  flipY: boolean;
  cornerOffsets: PlateCornerOffsets;
};
export type PreparedPlatePlacement = NormalizedPlatePlacement & {
  theta: number;
  azimuthRadians: number;
  center: Vec3;
  right: Vec3;
  down: Vec3;
  mapCenter: [number, number];
  mapWidth: number;
  mapHeight: number;
  angularWidth: number;
  angularHeight: number;
  aspect: number;
  spinSin: number;
  spinCos: number;
};
export type PlateMapDimensions = { width: number; height: number };
export type PlateLocalPoint = { x: number; y: number };

export const MIN_PLATE_SCALE = 0.08;
export const MAX_PLATE_SCALE = 2.2;
export const PLATE_CORNERS: PlateCorner[] = ["nw", "ne", "se", "sw"];
export const PLATE_PLACEMENT_MODEL_VERSION = 9;
const DEFAULT_PLATE_SCALE = 0.72;
const CORNER_OFFSET_LIMIT = 0.85;
const DEFAULT_CORNER_OFFSETS: PlateCornerOffsets = {
  nw: { x: 0, y: 0 },
  ne: { x: 0, y: 0 },
  se: { x: 0, y: 0 },
  sw: { x: 0, y: 0 },
};

export function normalizePlatePlacement(placement: PlatePlacementInput = {}, plate: PlateLike | null = null): NormalizedPlatePlacement {
  const aspect = plateAspect(plate, placement);
  const legacyScale = Number.isFinite(Number(placement.width))
    ? Number(placement.width)
    : Number.isFinite(Number(placement.height))
      ? Number(placement.height) * aspect
      : DEFAULT_PLATE_SCALE;
  const scale = Number.isFinite(Number(placement.scale)) ? Number(placement.scale) : legacyScale;

  return {
    azimuth: normalizeDegrees(Number(placement.azimuth) || 0),
    radius: clamp(Number(placement.radius) || 0, 0, 1),
    scale: clamp(scale, MIN_PLATE_SCALE, MAX_PLATE_SCALE),
    spin: normalizeDegrees(Number(placement.spin) || 0),
    opacity: clamp(Number(placement.opacity) || 1, 0, 1),
    flipX: Boolean(placement.flipX),
    flipY: Boolean(placement.flipY),
    cornerOffsets: normalizeCornerOffsets(placement.cornerOffsets),
  };
}

export function preparePlatePlacement(
  placement: PlatePlacementInput | NormalizedPlatePlacement,
  plate: PlateLike | null = null,
  sourceProjectionMode: SourceProjectionMode = "zenith-180",
  innerGuideSplit?: number | string | null,
  carrierHorizonRadius?: number | string | null,
): PreparedPlatePlacement {
  const normalized = normalizePlatePlacement(placement, plate);
  const aspect = plateAspect(plate, placement);
  const spin = (normalized.spin * Math.PI) / 180;
  const dimensions = plateMapDimensions(normalized, plate);
  return prepareSourceMapCarrierPlatePlacement(
    normalized,
    aspect,
    spin,
    dimensions,
    sourceProjectionMode,
    innerGuideSplit,
    carrierHorizonRadius,
  );
}

function prepareSourceMapCarrierPlatePlacement(
  normalized: NormalizedPlatePlacement,
  aspect: number,
  spin: number,
  dimensions: PlateMapDimensions,
  sourceProjectionMode: SourceProjectionMode,
  innerGuideSplit?: number | string | null,
  carrierHorizonRadius?: number | string | null,
): PreparedPlatePlacement {
  const azimuth = (normalized.azimuth * Math.PI) / 180;
  const mapPoint = { radius: normalized.radius, azimuth: normalized.azimuth };
  const mapUv = sourceMapPointToUv(mapPoint, sourceProjectionMode);
  const center: Vec3 =
    sourceMapPointToDirection(mapPoint, sourceProjectionMode, 2, 2, 1, innerGuideSplit, carrierHorizonRadius) ||
    fallbackCenter(sourceProjectionMode);
  const right: Vec3 =
    sourceMapPointTangent(center, mapPoint, sourceProjectionMode, 0, 0.1, innerGuideSplit, carrierHorizonRadius) ||
    fallbackRight(center);
  const rawDown: Vec3 =
    sourceMapPointTangent(center, mapPoint, sourceProjectionMode, 0.0025, 0, innerGuideSplit, carrierHorizonRadius) ||
    fallbackDown(center, right);
  const down = normalize([
    rawDown[0] - center[0] * dot(rawDown, center) - right[0] * dot(rawDown, right),
    rawDown[1] - center[1] * dot(rawDown, center) - right[1] * dot(rawDown, right),
    rawDown[2] - center[2] * dot(rawDown, center) - right[2] * dot(rawDown, right),
  ]);

  return {
    ...normalized,
    theta: normalized.radius,
    azimuthRadians: azimuth,
    center,
    right,
    down,
    mapCenter: [(mapUv.u - 0.5) * 2, (mapUv.v - 0.5) * 2],
    mapWidth: dimensions.width,
    mapHeight: dimensions.height,
    angularWidth: 2 * Math.atan(dimensions.width * 0.5),
    angularHeight: 2 * Math.atan(dimensions.height * 0.5),
    aspect,
    spinSin: Math.sin(spin),
    spinCos: Math.cos(spin),
  };
}

function sourceMapPointTangent(
  center: Vec3,
  point: { radius: number; azimuth: number },
  sourceProjectionMode: SourceProjectionMode,
  dRadius: number,
  dAzimuth: number,
  innerGuideSplit?: number | string | null,
  carrierHorizonRadius?: number | string | null,
): Vec3 | null {
  const forward = sourceMapPointToDirection(
    {
      radius: clamp(point.radius + dRadius, 0, 1),
      azimuth: normalizeDegrees(point.azimuth + dAzimuth),
    },
    sourceProjectionMode,
    2,
    2,
    1,
    innerGuideSplit,
    carrierHorizonRadius,
  );
  const backward = sourceMapPointToDirection(
    {
      radius: clamp(point.radius - dRadius, 0, 1),
      azimuth: normalizeDegrees(point.azimuth - dAzimuth),
    },
    sourceProjectionMode,
    2,
    2,
    1,
    innerGuideSplit,
    carrierHorizonRadius,
  );
  let tangent: Vec3 | null = null;
  if (forward && backward) {
    tangent = [forward[0] - backward[0], forward[1] - backward[1], forward[2] - backward[2]];
  } else if (forward) {
    tangent = [forward[0] - center[0], forward[1] - center[1], forward[2] - center[2]];
  } else if (backward) {
    tangent = [center[0] - backward[0], center[1] - backward[1], center[2] - backward[2]];
  }
  if (!tangent || Math.hypot(tangent[0], tangent[1], tangent[2]) <= 0.000001) return null;
  const projected: Vec3 = [
    tangent[0] - center[0] * dot(tangent, center),
    tangent[1] - center[1] * dot(tangent, center),
    tangent[2] - center[2] * dot(tangent, center),
  ];
  if (Math.hypot(projected[0], projected[1], projected[2]) <= 0.000001) return null;
  return normalize(projected);
}

function fallbackCenter(sourceProjectionMode: SourceProjectionMode): Vec3 {
  if (sourceProjectionMode === "nadir-180" || sourceProjectionMode === "cave-270") return [0, -1, 0];
  return [0, 1, 0];
}

function fallbackRight(center: Vec3): Vec3 {
  return Math.abs(center[1]) > 0.97 ? [1, 0, 0] : normalize([center[2], 0, -center[0]]);
}

function fallbackDown(center: Vec3, right: Vec3): Vec3 {
  return normalize([
    center[1] * right[2] - center[2] * right[1],
    center[2] * right[0] - center[0] * right[2],
    center[0] * right[1] - center[1] * right[0],
  ]);
}

export function plateMapDimensions(
  placement: PlatePlacementInput | NormalizedPlatePlacement,
  plate: PlateLike | null = null,
): PlateMapDimensions {
  const scale = clamp(Number(placement.scale) || DEFAULT_PLATE_SCALE, MIN_PLATE_SCALE, MAX_PLATE_SCALE);
  const aspect = plateAspect(plate, placement);
  return {
    width: scale,
    height: scale / aspect,
  };
}

export function directionFromPlateUv(placement: PreparedPlatePlacement, u: number, v: number): Vec3 {
  const local = plateUvToLocal(placement, u, v);
  const mapX = local.x * placement.spinCos - local.y * placement.spinSin;
  const mapY = local.x * placement.spinSin + local.y * placement.spinCos;
  const angle = Math.hypot(mapX, mapY);
  return angle <= 0.000001
    ? placement.center
    : normalize([
        placement.center[0] * Math.cos(angle) +
          ((placement.right[0] * mapX + placement.down[0] * mapY) / angle) * Math.sin(angle),
        placement.center[1] * Math.cos(angle) +
          ((placement.right[1] * mapX + placement.down[1] * mapY) / angle) * Math.sin(angle),
        placement.center[2] * Math.cos(angle) +
          ((placement.right[2] * mapX + placement.down[2] * mapY) / angle) * Math.sin(angle),
      ]);
}

export function directionToPlateLocal(direction: Vec3, placement: PreparedPlatePlacement): PlateLocalPoint | null {
  const cosine = clamp(dot(direction, placement.center), -1, 1);
  const angle = Math.acos(cosine);
  if (angle > Math.PI - 0.0001) return null;

  let mapX = 0;
  let mapY = 0;
  if (angle > 0.000001) {
    const scale = angle / Math.max(Math.sin(angle), 0.000001);
    mapX = dot(direction, placement.right) * scale;
    mapY = dot(direction, placement.down) * scale;
  }

  return {
    x: mapX * placement.spinCos + mapY * placement.spinSin,
    y: -mapX * placement.spinSin + mapY * placement.spinCos,
  };
}

export function plateCornerBaseLocal(placement: PreparedPlatePlacement, corner: PlateCorner): PlateLocalPoint {
  const halfWidth = placement.angularWidth * 0.5;
  const halfHeight = placement.angularHeight * 0.5;
  return {
    x: corner === "ne" || corner === "se" ? halfWidth : -halfWidth,
    y: corner === "se" || corner === "sw" ? halfHeight : -halfHeight,
  };
}

export function plateCornerLocal(placement: PreparedPlatePlacement, corner: PlateCorner): PlateLocalPoint {
  const base = plateCornerBaseLocal(placement, corner);
  const offset = placement.cornerOffsets[corner] || DEFAULT_CORNER_OFFSETS[corner];
  return {
    x: base.x + offset.x * placement.angularWidth,
    y: base.y + offset.y * placement.angularHeight,
  };
}

export function plateUvToLocal(placement: PreparedPlatePlacement, u: number, v: number): PlateLocalPoint {
  const clampedU = Number.isFinite(u) ? u : 0.5;
  const clampedV = Number.isFinite(v) ? v : 0.5;
  const nw = plateCornerLocal(placement, "nw");
  const ne = plateCornerLocal(placement, "ne");
  const se = plateCornerLocal(placement, "se");
  const sw = plateCornerLocal(placement, "sw");
  const top = lerpPoint(nw, ne, clampedU);
  const bottom = lerpPoint(sw, se, clampedU);
  return lerpPoint(top, bottom, clampedV);
}

export function plateLocalToWarpedUv(local: PlateLocalPoint, placement: PreparedPlatePlacement): PlateLocalPoint | null {
  let uv = {
    x: local.x / Math.max(placement.angularWidth, 0.000001) + 0.5,
    y: local.y / Math.max(placement.angularHeight, 0.000001) + 0.5,
  };

  for (let iteration = 0; iteration < 8; iteration += 1) {
    const solved = solveWarpIteration(placement, uv, local);
    if (!solved) return null;
    uv = {
      x: uv.x - solved.step.x,
      y: uv.y - solved.step.y,
    };
    if (Math.hypot(solved.step.x, solved.step.y) < 0.000001) break;
  }

  const projected = plateUvToLocal(placement, uv.x, uv.y);
  if (Math.hypot(projected.x - local.x, projected.y - local.y) > 0.004) return null;
  return uv;
}

export function cornerOffsetFromLocal(
  placement: PreparedPlatePlacement,
  corner: PlateCorner,
  local: PlateLocalPoint,
): PlateCornerOffset {
  const base = plateCornerBaseLocal(placement, corner);
  return {
    x: clamp((local.x - base.x) / Math.max(placement.angularWidth, 0.000001), -CORNER_OFFSET_LIMIT, CORNER_OFFSET_LIMIT),
    y: clamp(
      (local.y - base.y) / Math.max(placement.angularHeight, 0.000001),
      -CORNER_OFFSET_LIMIT,
      CORNER_OFFSET_LIMIT,
    ),
  };
}

export function clonePlateCornerOffsets(offsets: PlateCornerOffsets): PlateCornerOffsets {
  return {
    nw: { ...offsets.nw },
    ne: { ...offsets.ne },
    se: { ...offsets.se },
    sw: { ...offsets.sw },
  };
}

function plateAspect(plate: PlateLike | null | undefined, placement: PlatePlacementInput | NormalizedPlatePlacement): number {
  const explicitAspect = Number(plate?.aspect);
  if (Number.isFinite(explicitAspect) && explicitAspect > 0) return explicitAspect;
  const width = Number("width" in placement ? placement.width : undefined);
  const height = Number("height" in placement ? placement.height : undefined);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return width / height;
  }
  return 1;
}

function normalizeDegrees(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function normalizeCornerOffsets(
  offsets: PlatePlacementInput["cornerOffsets"] | PlateCornerOffsets | undefined,
): PlateCornerOffsets {
  const normalized = clonePlateCornerOffsets(DEFAULT_CORNER_OFFSETS);
  for (const corner of PLATE_CORNERS) {
    const offset = offsets?.[corner];
    normalized[corner] = {
      x: normalizeCornerOffsetValue(offset?.x),
      y: normalizeCornerOffsetValue(offset?.y),
    };
  }
  return normalized;
}

function normalizeCornerOffsetValue(value: number | string | null | undefined): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? clamp(numericValue, -CORNER_OFFSET_LIMIT, CORNER_OFFSET_LIMIT) : 0;
}

function solveWarpIteration(
  placement: PreparedPlatePlacement,
  uv: PlateLocalPoint,
  local: PlateLocalPoint,
): { step: PlateLocalPoint } | null {
  const nw = plateCornerLocal(placement, "nw");
  const ne = plateCornerLocal(placement, "ne");
  const se = plateCornerLocal(placement, "se");
  const sw = plateCornerLocal(placement, "sw");
  const top = lerpPoint(nw, ne, uv.x);
  const bottom = lerpPoint(sw, se, uv.x);
  const point = lerpPoint(top, bottom, uv.y);
  const du = lerpPoint(subtractPoint(ne, nw), subtractPoint(se, sw), uv.y);
  const dv = lerpPoint(subtractPoint(sw, nw), subtractPoint(se, ne), uv.x);
  const error = subtractPoint(point, local);
  const determinant = du.x * dv.y - du.y * dv.x;
  if (Math.abs(determinant) < 0.0000001) return null;
  return {
    step: {
      x: (error.x * dv.y - error.y * dv.x) / determinant,
      y: (-error.x * du.y + error.y * du.x) / determinant,
    },
  };
}

function lerpPoint(a: PlateLocalPoint, b: PlateLocalPoint, t: number): PlateLocalPoint {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function subtractPoint(a: PlateLocalPoint, b: PlateLocalPoint): PlateLocalPoint {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
  };
}

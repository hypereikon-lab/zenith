import { HALF_PI, clamp, dot, normalize } from "../projection.js";

export const MIN_PLATE_SCALE = 0.08;
export const MAX_PLATE_SCALE = 2.2;
export const PLATE_PLACEMENT_MODEL_VERSION = 8;
const DEFAULT_PLATE_SCALE = 0.72;

export function normalizePlatePlacement(placement = {}, plate = null) {
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
  };
}

export function preparePlatePlacement(placement, plate = null) {
  const normalized = normalizePlatePlacement(placement, plate);
  const aspect = plateAspect(plate, placement);
  const azimuth = (normalized.azimuth * Math.PI) / 180;
  const theta = normalized.radius * HALF_PI;
  const sinTheta = Math.sin(theta);
  const sinAzimuth = Math.sin(azimuth);
  const cosAzimuth = Math.cos(azimuth);
  const spin = (normalized.spin * Math.PI) / 180;
  const dimensions = plateMapDimensions(normalized, plate);
  const center = [sinTheta * sinAzimuth, Math.cos(theta), sinTheta * cosAzimuth];

  return {
    ...normalized,
    theta,
    azimuthRadians: azimuth,
    center,
    right: [cosAzimuth, 0, -sinAzimuth],
    down: [Math.cos(theta) * sinAzimuth, -sinTheta, Math.cos(theta) * cosAzimuth],
    mapCenter: [sinAzimuth * normalized.radius, -cosAzimuth * normalized.radius],
    mapWidth: dimensions.width,
    mapHeight: dimensions.height,
    angularWidth: 2 * Math.atan(dimensions.width * 0.5),
    angularHeight: 2 * Math.atan(dimensions.height * 0.5),
    aspect,
    spinSin: Math.sin(spin),
    spinCos: Math.cos(spin),
  };
}

export function plateMapDimensions(placement, plate = null) {
  const scale = clamp(Number(placement.scale) || DEFAULT_PLATE_SCALE, MIN_PLATE_SCALE, MAX_PLATE_SCALE);
  const aspect = plateAspect(plate, placement);
  return {
    width: scale,
    height: scale / aspect,
  };
}

export function directionFromPlateUv(placement, u, v) {
  const localX = (u - 0.5) * placement.angularWidth;
  const localY = (v - 0.5) * placement.angularHeight;
  const mapX = localX * placement.spinCos - localY * placement.spinSin;
  const mapY = localX * placement.spinSin + localY * placement.spinCos;
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

export function directionToPlateLocal(direction, placement) {
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

function plateAspect(plate, placement) {
  const explicitAspect = Number(plate?.aspect);
  if (Number.isFinite(explicitAspect) && explicitAspect > 0) return explicitAspect;
  const width = Number(placement?.width);
  const height = Number(placement?.height);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return width / height;
  }
  return 1;
}

function normalizeDegrees(value) {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

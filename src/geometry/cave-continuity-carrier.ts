import { clamp } from "../projection.js";
import {
  DEFAULT_SOURCE_INNER_GUIDE_SPLIT,
  sourceGuideCarrierHorizonRadius,
} from "./source-guide-semantics.js";
import {
  DEFAULT_CAVE_ROOM,
  caveContinuityDirectionFromSurfacePoint,
  caveSurfacePointFromContinuityDirection,
  caveWallPerimeterFraction,
  caveWallPointFromPerimeterFraction,
  normalizeCaveRoom,
} from "./cave-projection.js";
import type { CaveRoom } from "./cave-projection.js";
import type { MapUv, Vec3 } from "../projection.js";

export type CaveContinuityCarrierProfile = {
  width: number;
  height: number;
  aspect: number;
  room: Required<CaveRoom>;
  floorBand: number;
  horizonBand: number;
};

export type CaveContinuityCarrierInput = {
  width?: number | string | null;
  height?: number | string | null;
  room?: CaveRoom | null;
  floorBand?: number | string | null;
  horizonBand?: number | string | null;
};

export type CaveCarrierPoint = {
  rho: number;
  perimeterFraction: number;
};

export const DEFAULT_CAVE_CONTINUITY_FLOOR_BAND = DEFAULT_SOURCE_INNER_GUIDE_SPLIT;

const EPSILON = 0.000001;

export function createCaveContinuityCarrierProfile({
  width = 1,
  height = 1,
  room = DEFAULT_CAVE_ROOM,
  floorBand = DEFAULT_CAVE_CONTINUITY_FLOOR_BAND,
  horizonBand = null,
}: CaveContinuityCarrierInput = {}): CaveContinuityCarrierProfile {
  const safeWidth = Math.max(1, Math.round(Number(width) || 1));
  const safeHeight = Math.max(1, Math.round(Number(height) || 1));
  const normalizedFloorBand = clamp(Number(floorBand) || DEFAULT_CAVE_CONTINUITY_FLOOR_BAND, 0.08, 0.92);
  return {
    width: safeWidth,
    height: safeHeight,
    aspect: safeWidth / safeHeight,
    room: normalizeCaveRoom(room || DEFAULT_CAVE_ROOM),
    floorBand: normalizedFloorBand,
    horizonBand: sourceGuideCarrierHorizonRadius("cave-270", normalizedFloorBand, horizonBand),
  };
}

export function caveContinuityUvToDirection(
  u: number,
  v: number,
  profile: CaveContinuityCarrierProfile = createCaveContinuityCarrierProfile(),
): Vec3 | null {
  const surfacePoint = caveContinuityUvToSurfacePoint(u, v, profile);
  return surfacePoint ? caveContinuityDirectionFromSurfacePoint(surfacePoint, profile.room) : null;
}

export function directionToCaveContinuityUv(
  direction: Vec3,
  profile: CaveContinuityCarrierProfile = createCaveContinuityCarrierProfile(),
): MapUv | null {
  const surfacePoint = caveSurfacePointFromContinuityDirection(direction, profile.room);
  return surfacePoint ? caveContinuitySurfacePointToUv(surfacePoint, profile) : null;
}

export function caveContinuityUvToSurfacePoint(
  u: number,
  v: number,
  profile: CaveContinuityCarrierProfile = createCaveContinuityCarrierProfile(),
): Vec3 | null {
  if (u < -EPSILON || u > 1 + EPSILON || v < -EPSILON || v > 1 + EPSILON) return null;
  const carrierPoint = caveCarrierPointFromUv(u, v, profile);
  const wallBase = caveWallPointFromPerimeterFraction(carrierPoint.perimeterFraction, profile.room);
  const bottom = -profile.room.eyeHeight;
  const top = profile.room.height - profile.room.eyeHeight;

  if (carrierPoint.rho <= profile.floorBand + EPSILON) {
    const floorT = profile.floorBand > EPSILON ? clamp(carrierPoint.rho / profile.floorBand, 0, 1) : 0;
    return [wallBase[0] * floorT, bottom, wallBase[2] * floorT];
  }

  const wallT = carrierWallRadiusToPhysicalWallT(carrierPoint.rho, profile);
  return [wallBase[0], bottom + (top - bottom) * wallT, wallBase[2]];
}

export function caveContinuitySurfacePointToUv(
  surfacePoint: Vec3,
  profile: CaveContinuityCarrierProfile = createCaveContinuityCarrierProfile(),
): MapUv | null {
  const bottom = -profile.room.eyeHeight;
  const top = profile.room.height - profile.room.eyeHeight;

  if (Math.abs(surfacePoint[1] - bottom) <= 0.0001) {
    const distance = Math.hypot(surfacePoint[0], surfacePoint[2]);
    if (distance <= EPSILON) return { u: 0.5, v: 0.5 };
    const boundary = floorBoundaryPointForRay(surfacePoint[0], surfacePoint[2], profile.room);
    const perimeterFraction = caveWallPerimeterFraction([boundary[0], 0, boundary[1]], profile.room);
    const boundaryDistance = Math.hypot(boundary[0], boundary[1]);
    const rho = profile.floorBand * clamp(distance / Math.max(boundaryDistance, EPSILON), 0, 1);
    return uvFromCaveCarrierPoint({ rho, perimeterFraction }, profile);
  }

  const perimeterFraction = caveWallPerimeterFraction(surfacePoint, profile.room);
  const wallT = clamp((surfacePoint[1] - bottom) / Math.max(top - bottom, EPSILON), 0, 1);
  return uvFromCaveCarrierPoint(
    {
      rho: physicalWallTToCarrierWallRadius(wallT, profile),
      perimeterFraction,
    },
    profile,
  );
}

export function carrierWallRadiusToPhysicalWallT(
  rho: number,
  profile: CaveContinuityCarrierProfile = createCaveContinuityCarrierProfile(),
): number {
  const carrier = clamp(rho, profile.floorBand, 1);
  const physicalHorizon = cavePhysicalHorizonWallFraction(profile.room);
  if (carrier <= profile.horizonBand + EPSILON) {
    return (
      ((carrier - profile.floorBand) / Math.max(profile.horizonBand - profile.floorBand, EPSILON)) *
      physicalHorizon
    );
  }
  return physicalHorizon +
    ((carrier - profile.horizonBand) / Math.max(1 - profile.horizonBand, EPSILON)) * (1 - physicalHorizon);
}

export function physicalWallTToCarrierWallRadius(
  wallT: number,
  profile: CaveContinuityCarrierProfile = createCaveContinuityCarrierProfile(),
): number {
  const physical = clamp(wallT, 0, 1);
  const physicalHorizon = cavePhysicalHorizonWallFraction(profile.room);
  if (physical <= physicalHorizon + EPSILON) {
    return profile.floorBand +
      (physical / Math.max(physicalHorizon, EPSILON)) * (profile.horizonBand - profile.floorBand);
  }
  return profile.horizonBand +
    ((physical - physicalHorizon) / Math.max(1 - physicalHorizon, EPSILON)) * (1 - profile.horizonBand);
}

function cavePhysicalHorizonWallFraction(room: Required<CaveRoom>): number {
  const bottom = -room.eyeHeight;
  const top = room.height - room.eyeHeight;
  return clamp((0 - bottom) / Math.max(top - bottom, EPSILON), 0.0001, 0.9999);
}

export function caveCarrierPointFromUv(
  u: number,
  v: number,
  profile: CaveContinuityCarrierProfile = createCaveContinuityCarrierProfile(),
): CaveCarrierPoint {
  const localX = (clamp(u, 0, 1) - 0.5) * 2;
  const localY = (0.5 - clamp(v, 0, 1)) * 2;
  const rho = Math.max(Math.abs(localX), Math.abs(localY));
  if (rho <= EPSILON) {
    return { rho: 0, perimeterFraction: 0.125 };
  }
  const boundary = {
    x: (localX / rho) * profile.aspect,
    y: localY / rho,
  };
  return {
    rho: clamp(rho, 0, 1),
    perimeterFraction: rectangleBoundaryFraction(boundary.x, boundary.y, profile.aspect),
  };
}

export function uvFromCaveCarrierPoint(
  point: CaveCarrierPoint,
  profile: CaveContinuityCarrierProfile = createCaveContinuityCarrierProfile(),
): MapUv {
  const boundary = rectangleBoundaryPoint(point.perimeterFraction, profile.aspect);
  const rho = clamp(point.rho, 0, 1);
  return {
    u: 0.5 + (boundary.x / Math.max(profile.aspect, EPSILON)) * rho * 0.5,
    v: 0.5 - boundary.y * rho * 0.5,
  };
}

export function rectangleBoundaryFraction(x: number, y: number, aspect = 1): number {
  const safeAspect = Math.max(0.001, Number(aspect) || 1);
  const clampedX = clamp(x, -safeAspect, safeAspect);
  const clampedY = clamp(y, -1, 1);
  const top = Math.abs(clampedY - 1);
  const right = Math.abs(clampedX - safeAspect);
  const bottom = Math.abs(clampedY + 1);
  const left = Math.abs(clampedX + safeAspect);
  const edge = [
    { name: "top" as const, distance: top },
    { name: "right" as const, distance: right },
    { name: "bottom" as const, distance: bottom },
    { name: "left" as const, distance: left },
  ].sort((a, b) => a.distance - b.distance)[0].name;
  const perimeter = 4 * (safeAspect + 1);
  let distance: number;
  if (edge === "top") {
    distance = clampedX + safeAspect;
  } else if (edge === "right") {
    distance = safeAspect * 2 + (1 - clampedY);
  } else if (edge === "bottom") {
    distance = safeAspect * 2 + 2 + (safeAspect - clampedX);
  } else {
    distance = safeAspect * 4 + 2 + (clampedY + 1);
  }
  return (((distance / perimeter) % 1) + 1) % 1;
}

export function rectangleBoundaryPoint(fraction: number, aspect = 1): { x: number; y: number } {
  const safeAspect = Math.max(0.001, Number(aspect) || 1);
  const perimeter = 4 * (safeAspect + 1);
  const distance = (((fraction % 1) + 1) % 1) * perimeter;
  if (distance <= safeAspect * 2) return { x: distance - safeAspect, y: 1 };
  if (distance <= safeAspect * 2 + 2) return { x: safeAspect, y: 1 - (distance - safeAspect * 2) };
  if (distance <= safeAspect * 4 + 2) return { x: safeAspect - (distance - safeAspect * 2 - 2), y: -1 };
  return { x: -safeAspect, y: -1 + (distance - safeAspect * 4 - 2) };
}

function floorBoundaryPointForRay(x: number, z: number, room: Required<CaveRoom>): [number, number] {
  const halfWidth = room.width * 0.5;
  const halfDepth = room.depth * 0.5;
  const scaleX = Math.abs(x) > EPSILON ? halfWidth / Math.abs(x) : Infinity;
  const scaleZ = Math.abs(z) > EPSILON ? halfDepth / Math.abs(z) : Infinity;
  const scale = Math.min(scaleX, scaleZ);
  return [x * scale, z * scale];
}

import { angularDistance, clamp, normalize } from "../projection.js";
import { directionToFisheyeUv } from "./fisheye-projection.js";
import type { FisheyeProjectionProfile } from "./fisheye-projection.js";
import type { Vec3 } from "../projection.js";

export const CAVE_FACES = ["front", "right", "back", "left", "floor"] as const;

export type CaveFace = (typeof CAVE_FACES)[number];

export type CaveRoom = {
  width: number;
  depth: number;
  height: number;
  eyeHeight: number;
  eyeX?: number;
  eyeZ?: number;
};

export type CaveFaceSample = {
  u: number;
  v: number;
};

export type CaveCoverage = {
  covered: number;
  total: number;
  ratio: number;
};

export type CavePerimeterPoint = {
  fraction: number;
  point: Vec3;
};

export const DEFAULT_CAVE_ROOM: CaveRoom = {
  width: 4,
  depth: 4,
  height: 4,
  eyeHeight: 2,
  eyeX: 0,
  eyeZ: 0,
};

export function caveFacePoint(face: CaveFace, sample: CaveFaceSample, room: CaveRoom = DEFAULT_CAVE_ROOM): Vec3 {
  const safeRoom = normalizeCaveRoom(room);
  const u = clamp(sample.u, 0, 1);
  const v = clamp(sample.v, 0, 1);
  const halfWidth = safeRoom.width * 0.5;
  const halfDepth = safeRoom.depth * 0.5;
  const wallY = (1 - v) * safeRoom.height;

  if (face === "front") {
    return [lerp(-halfWidth, halfWidth, u), wallY, halfDepth];
  }
  if (face === "right") {
    return [halfWidth, wallY, lerp(halfDepth, -halfDepth, u)];
  }
  if (face === "back") {
    return [lerp(halfWidth, -halfWidth, u), wallY, -halfDepth];
  }
  if (face === "left") {
    return [-halfWidth, wallY, lerp(-halfDepth, halfDepth, u)];
  }
  return [lerp(-halfWidth, halfWidth, u), 0, lerp(halfDepth, -halfDepth, v)];
}

export function caveFaceDirection(face: CaveFace, sample: CaveFaceSample, room: CaveRoom = DEFAULT_CAVE_ROOM): Vec3 {
  const safeRoom = normalizeCaveRoom(room);
  const point = caveFacePoint(face, sample, safeRoom);
  return normalize([point[0] - safeRoom.eyeX, point[1] - safeRoom.eyeHeight, point[2] - safeRoom.eyeZ]);
}

export function caveContinuityDirectionFromSurfacePoint(surfacePoint: Vec3, room: CaveRoom = DEFAULT_CAVE_ROOM): Vec3 {
  const safeRoom = normalizeCaveRoom(room);
  const bottom = -safeRoom.eyeHeight;
  if (Math.abs(surfacePoint[1] - bottom) < 0.0001) {
    return caveFloorContinuityDirection(surfacePoint, safeRoom);
  }

  const angle = caveWallPerimeterAngle(surfacePoint, safeRoom);
  const horizontalDistance = Math.hypot(surfacePoint[0], surfacePoint[2]);
  const elevation = Math.atan2(surfacePoint[1], Math.max(horizontalDistance, 0.000001));
  const cosElevation = Math.cos(elevation);
  return normalize([
    Math.sin(angle) * cosElevation,
    Math.sin(elevation),
    Math.cos(angle) * cosElevation,
  ]);
}

export function caveSurfacePointFromContinuityDirection(direction: Vec3, room: CaveRoom = DEFAULT_CAVE_ROOM): Vec3 | null {
  const safeRoom = normalizeCaveRoom(room);
  const dir = normalize(direction);
  const bottom = -safeRoom.eyeHeight;
  const angle = Math.atan2(dir[0], dir[2]);
  const wallPoint = caveWallPointFromPerimeterAngle(angle, safeRoom);
  const horizontalDistance = Math.hypot(wallPoint[0], wallPoint[2]);
  const horizontalLength = Math.hypot(dir[0], dir[2]);
  const elevation = Math.atan2(dir[1], Math.max(horizontalLength, 0.000001));
  const boundaryElevation = Math.atan2(bottom, Math.max(horizontalDistance, 0.000001));
  const top = safeRoom.height - safeRoom.eyeHeight;
  if (elevation >= boundaryElevation - 0.0001) {
    const y = horizontalLength > 0.000001 ? horizontalDistance * (dir[1] / horizontalLength) : Infinity;
    if (!Number.isFinite(y) || y < bottom - 0.0001 || y > top + 0.0001) return null;
    return [wallPoint[0], clamp(y, bottom, top), wallPoint[2]];
  }
  return caveFloorPointFromContinuityAngleElevation(angle, elevation, safeRoom);
}

export function estimateCaveFaceCoverage(
  face: CaveFace,
  sourceProfile: FisheyeProjectionProfile,
  room: CaveRoom = DEFAULT_CAVE_ROOM,
  samples = 33,
): CaveCoverage {
  const steps = Math.max(2, Math.round(samples));
  let covered = 0;
  let total = 0;
  for (let y = 0; y < steps; y += 1) {
    for (let x = 0; x < steps; x += 1) {
      const direction = caveFaceDirection(
        face,
        {
          u: steps === 1 ? 0.5 : x / (steps - 1),
          v: steps === 1 ? 0.5 : y / (steps - 1),
        },
        room,
      );
      total += 1;
      if (directionToFisheyeUv(direction, sourceProfile)) covered += 1;
    }
  }
  return {
    covered,
    total,
    ratio: total > 0 ? covered / total : 0,
  };
}

export function requiredFisheyeFieldOfViewDegrees(
  centerAxis: Vec3,
  room: CaveRoom = DEFAULT_CAVE_ROOM,
  faces: readonly CaveFace[] = CAVE_FACES,
  samples = 33,
): number {
  const center = normalize(centerAxis);
  const steps = Math.max(2, Math.round(samples));
  let maxTheta = 0;
  for (const face of faces) {
    for (let y = 0; y < steps; y += 1) {
      for (let x = 0; x < steps; x += 1) {
        const direction = caveFaceDirection(
          face,
          {
            u: x / (steps - 1),
            v: y / (steps - 1),
          },
          room,
        );
        maxTheta = Math.max(maxTheta, angularDistance(direction, center));
      }
    }
  }
  return maxTheta * 2 * (180 / Math.PI);
}

export function normalizeCaveRoom(room: CaveRoom): Required<CaveRoom> {
  const width = Math.max(0.001, Number(room.width) || DEFAULT_CAVE_ROOM.width);
  const depth = Math.max(0.001, Number(room.depth) || DEFAULT_CAVE_ROOM.depth);
  const height = Math.max(0.01, Number(room.height) || DEFAULT_CAVE_ROOM.height);
  return {
    width,
    depth,
    height,
    eyeHeight: clamp(Number(room.eyeHeight) || height * 0.5, 0.001, height - 0.001),
    eyeX: clamp(Number(room.eyeX) || 0, -width * 0.5 + 0.001, width * 0.5 - 0.001),
    eyeZ: clamp(Number(room.eyeZ) || 0, -depth * 0.5 + 0.001, depth * 0.5 - 0.001),
  };
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function caveWallPerimeterAngle(point: Vec3, room: Required<CaveRoom>): number {
  const fraction = caveWallPerimeterFraction(point, room);
  return (fraction * roomPerimeter(room) - room.width * 0.5) / roomPerimeter(room) * Math.PI * 2;
}

export function caveWallPerimeterFraction(point: Vec3, room: CaveRoom = DEFAULT_CAVE_ROOM): number {
  const safeRoom = normalizeCaveRoom(room);
  const halfWidth = safeRoom.width * 0.5;
  const halfDepth = safeRoom.depth * 0.5;
  const perimeter = roomPerimeter(safeRoom);
  const planeDistances = [
    { face: "front" as const, distance: Math.abs(point[2] - halfDepth) },
    { face: "right" as const, distance: Math.abs(point[0] - halfWidth) },
    { face: "back" as const, distance: Math.abs(point[2] + halfDepth) },
    { face: "left" as const, distance: Math.abs(point[0] + halfWidth) },
  ].sort((a, b) => a.distance - b.distance);
  const face = planeDistances[0].face;
  let distance: number;
  if (face === "front") {
    distance = point[0] + halfWidth;
  } else if (face === "right") {
    distance = safeRoom.width + (halfDepth - point[2]);
  } else if (face === "back") {
    distance = safeRoom.width + safeRoom.depth + (halfWidth - point[0]);
  } else {
    distance = safeRoom.width * 2 + safeRoom.depth + (point[2] + halfDepth);
  }
  return clamp(distance / perimeter, 0, 1);
}

function caveWallPointFromPerimeterAngle(angle: number, room: Required<CaveRoom>): Vec3 {
  const perimeter = roomPerimeter(room);
  return caveWallPointFromPerimeterFraction(angle / (Math.PI * 2) + (room.width * 0.5) / perimeter, room);
}

export function caveWallPointFromPerimeterFraction(fraction: number, room: CaveRoom = DEFAULT_CAVE_ROOM): Vec3 {
  const safeRoom = normalizeCaveRoom(room);
  const halfWidth = safeRoom.width * 0.5;
  const halfDepth = safeRoom.depth * 0.5;
  const perimeter = roomPerimeter(safeRoom);
  const wrapped = (((fraction % 1) + 1) % 1) * perimeter;
  if (wrapped <= safeRoom.width) return [wrapped - halfWidth, 0, halfDepth];
  if (wrapped <= safeRoom.width + safeRoom.depth) return [halfWidth, 0, halfDepth - (wrapped - safeRoom.width)];
  if (wrapped <= safeRoom.width * 2 + safeRoom.depth) return [halfWidth - (wrapped - safeRoom.width - safeRoom.depth), 0, -halfDepth];
  return [-halfWidth, 0, -halfDepth + (wrapped - safeRoom.width * 2 - safeRoom.depth)];
}

function roomPerimeter(room: Pick<Required<CaveRoom>, "width" | "depth">): number {
  return 2 * (room.width + room.depth);
}

function caveFloorContinuityDirection(point: Vec3, room: Required<CaveRoom>): Vec3 {
  const x = point[0];
  const z = point[2];
  const distance = Math.hypot(x, z);
  if (distance <= 0.000001) return [0, -1, 0];
  const boundary = caveFloorBoundaryPointForRay(x, z, room);
  const angle = caveWallPerimeterAngle([boundary[0], 0, boundary[1]], room);
  const boundaryDistance = Math.hypot(boundary[0], boundary[1]);
  const boundaryElevation = Math.atan2(-room.eyeHeight, Math.max(boundaryDistance, 0.000001));
  const radiusFraction = clamp(distance / Math.max(boundaryDistance, 0.000001), 0, 1);
  const elevation = -Math.PI * 0.5 + radiusFraction * (boundaryElevation + Math.PI * 0.5);
  const cosElevation = Math.cos(elevation);
  return normalize([
    Math.sin(angle) * cosElevation,
    Math.sin(elevation),
    Math.cos(angle) * cosElevation,
  ]);
}

function caveFloorPointFromContinuityAngleElevation(
  angle: number,
  elevation: number,
  room: Required<CaveRoom>,
): Vec3 | null {
  const boundary = caveWallPointFromPerimeterAngle(angle, room);
  const boundaryDistance = Math.hypot(boundary[0], boundary[2]);
  const boundaryElevation = Math.atan2(-room.eyeHeight, Math.max(boundaryDistance, 0.000001));
  const denominator = boundaryElevation + Math.PI * 0.5;
  const radiusFraction = denominator > 0.000001 ? clamp((elevation + Math.PI * 0.5) / denominator, 0, 1) : 0;
  return [boundary[0] * radiusFraction, -room.eyeHeight, boundary[2] * radiusFraction];
}

function caveFloorBoundaryPointForRay(x: number, z: number, room: Required<CaveRoom>): [number, number] {
  const halfWidth = room.width * 0.5;
  const halfDepth = room.depth * 0.5;
  const scaleX = Math.abs(x) > 0.000001 ? halfWidth / Math.abs(x) : Infinity;
  const scaleZ = Math.abs(z) > 0.000001 ? halfDepth / Math.abs(z) : Infinity;
  const scale = Math.min(scaleX, scaleZ);
  return [x * scale, z * scale];
}

import { clamp, normalize } from "../projection.js";
import type { Vec3 } from "../projection.js";

export type SourceOrientationTransform = {
  sourceRotationRadians: number;
  domeTiltRadians: number;
  mirror: boolean;
};

export function sourceDirectionFromPhysicalDirection(
  physicalDirection: Vec3,
  transform: SourceOrientationTransform,
): Vec3 {
  const tilted = rotateX(normalize(physicalDirection), transform.domeTiltRadians);
  const theta = Math.acos(clamp(tilted[1], -1, 1));
  const sinTheta = Math.sin(theta);
  let azimuth = Math.atan2(tilted[0], tilted[2]);
  if (transform.mirror) {
    azimuth = -azimuth;
  }
  azimuth += transform.sourceRotationRadians;
  return normalize([sinTheta * Math.sin(azimuth), Math.cos(theta), sinTheta * Math.cos(azimuth)]);
}

export function physicalDirectionFromSourceDirection(
  sourceDirection: Vec3,
  transform: SourceOrientationTransform,
): Vec3 {
  const source = normalize(sourceDirection);
  const theta = Math.acos(clamp(source[1], -1, 1));
  const sinTheta = Math.sin(theta);
  let azimuth = Math.atan2(source[0], source[2]) - transform.sourceRotationRadians;
  if (transform.mirror) {
    azimuth = -azimuth;
  }
  const tilted: Vec3 = [sinTheta * Math.sin(azimuth), Math.cos(theta), sinTheta * Math.cos(azimuth)];
  return normalize(rotateX(tilted, -transform.domeTiltRadians));
}

function rotateX(value: Vec3, angle: number): Vec3 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [value[0], value[1] * cosine - value[2] * sine, value[1] * sine + value[2] * cosine];
}

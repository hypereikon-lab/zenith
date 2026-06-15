import { domePointFromSourceDirection } from "../geometry/dome-view.js";
import { sourceDirectionToMapPoint } from "../geometry/source-projection.js";
import { clamp, normalize, rotationRowsFromTo, wrapDegrees } from "../projection.js";
import type { DomePoint } from "../geometry/dome-view.js";
import type { SourceProjectionMode } from "../geometry/source-projection.js";
import type { Point2D, Vec3 } from "../projection.js";
import {
  clonePlateCornerOffsets,
  cornerOffsetFromLocal,
  directionToPlateLocal,
  plateCornerLocal,
} from "./plate-placement.js";
import type { PlateCorner, PlateCornerOffsets, PreparedPlatePlacement } from "./plate-placement.js";

export function moveDomePointBySourcePointerDrag(
  startCenterDirection: Vec3,
  startPointerDirection: Vec3,
  currentPointerDirection: Vec3,
  sourceProjectionMode: SourceProjectionMode,
  innerGuideSplit?: number | string | null,
  carrierHorizonRadius?: number | string | null,
): DomePoint {
  const rotation = rotationRowsFromTo(startPointerDirection, currentPointerDirection);
  const movedCenter = normalize([
    rotation[0][0] * startCenterDirection[0] + rotation[0][1] * startCenterDirection[1] + rotation[0][2] * startCenterDirection[2],
    rotation[1][0] * startCenterDirection[0] + rotation[1][1] * startCenterDirection[1] + rotation[1][2] * startCenterDirection[2],
    rotation[2][0] * startCenterDirection[0] + rotation[2][1] * startCenterDirection[1] + rotation[2][2] * startCenterDirection[2],
  ]);
  return sourceDirectionToMapPoint(movedCenter, sourceProjectionMode, 2, 2, 1, innerGuideSplit, carrierHorizonRadius) ||
    domePointFromSourceDirection(movedCenter, sourceProjectionMode);
}

export function plateLocalFromSourceDirection(direction: Vec3 | null, placement: PreparedPlatePlacement): Point2D | null {
  return direction ? directionToPlateLocal(direction, placement) : null;
}

export function scaleFromSourceLocalDrag(
  startScale: number,
  startLocal: Point2D | null,
  currentLocal: Point2D | null,
  fallbackLocal: Point2D,
  minScale: number,
  maxScale: number,
): number | null {
  if (!currentLocal) return null;
  const anchorLocal = startLocal || fallbackLocal;
  const widthFactor = Math.abs(currentLocal.x) / Math.max(Math.abs(anchorLocal.x), 0.0001);
  const heightFactor = Math.abs(currentLocal.y) / Math.max(Math.abs(anchorLocal.y), 0.0001);
  const factor = clamp(Math.max(widthFactor, heightFactor, 0.01), minScale / startScale, maxScale / startScale);
  return startScale * factor;
}

export function cornerOffsetsFromSourceLocalDrag(
  startPlacement: PreparedPlatePlacement,
  corner: PlateCorner,
  startLocal: Point2D | null,
  currentLocal: Point2D | null,
  startCornerOffsets: PlateCornerOffsets,
): PlateCornerOffsets | null {
  if (!currentLocal) return null;
  const startCornerLocal = plateCornerLocal(startPlacement, corner);
  const targetLocal = startLocal
    ? {
        x: startCornerLocal.x + currentLocal.x - startLocal.x,
        y: startCornerLocal.y + currentLocal.y - startLocal.y,
      }
    : currentLocal;
  const nextOffsets = clonePlateCornerOffsets(startCornerOffsets);
  nextOffsets[corner] = cornerOffsetFromLocal(startPlacement, corner, targetLocal);
  return nextOffsets;
}

export function spinFromSourceLocalRotateDrag(
  startSpin: number,
  startLocal: Point2D | null,
  currentLocal: Point2D | null,
): number | null {
  if (!startLocal || !currentLocal) return null;
  if (Math.hypot(startLocal.x, startLocal.y) < 0.0001 || Math.hypot(currentLocal.x, currentLocal.y) < 0.0001) {
    return null;
  }
  const startAngle = Math.atan2(startLocal.y, startLocal.x);
  const currentAngle = Math.atan2(currentLocal.y, currentLocal.x);
  return wrapDegrees(startSpin + ((currentAngle - startAngle) * 180) / Math.PI);
}

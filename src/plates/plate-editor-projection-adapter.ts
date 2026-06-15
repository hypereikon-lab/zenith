import { sourceCaveDirectionFromScreenPoint, sourceCaveDirectionToScreenPoint } from "../geometry/cave-view.js";
import { sourceDomeDirectionFromScreenPoint, sourceDomeDirectionToScreenPoint } from "../geometry/dome-view.js";
import { sourceDirectionToMapPoint, sourceDirectionToUv, sourceUvToDirection } from "../geometry/source-projection.js";
import { directionFromPlateUv } from "./plate-placement.js";
import { plateEditorCaveProjection, plateEditorDomeProjection, plateEditorViewDisabledReason } from "./plate-editor-view.js";
import type { SourceProjectionMode } from "../geometry/source-projection.js";
import type { Point2D, Rect, Vec3 } from "../projection.js";
import type { PreparedPlatePlacement } from "./plate-placement.js";
import type { PlateEditorCamera, PlateEditorViewMode } from "./plate-editor-view.js";

export type PlateEditorSourcePoint = { radius: number; azimuth: number };

export type PlateEditorProjectionAdapter = {
  mode: PlateEditorViewMode;
  sourceProjectionMode: SourceProjectionMode;
  projectSourceDirection(direction: Vec3): Point2D | null;
  sourceDirectionAt(point: Point2D): Vec3 | null;
  projectPlateUv(placement: PreparedPlatePlacement, u: number, v: number): Point2D | null;
  sourcePointAt(point: Point2D): PlateEditorSourcePoint | null;
};

export type PlateEditorProjectionAdapterOptions = {
  mode: PlateEditorViewMode;
  sourceProjectionMode: SourceProjectionMode;
  camera: Partial<PlateEditorCamera>;
  rect: Rect;
  domeGuideSemanticSplit?: number | string | null;
  domeGuideHorizonSplit?: number | string | null;
};

export function createPlateEditorProjectionAdapter({
  mode,
  sourceProjectionMode,
  camera,
  rect,
  domeGuideSemanticSplit,
  domeGuideHorizonSplit,
}: PlateEditorProjectionAdapterOptions): PlateEditorProjectionAdapter {
  const disabledReason = plateEditorViewDisabledReason(mode, sourceProjectionMode);
  if (disabledReason) {
    throw new Error(disabledReason);
  }

  const projectSourceDirection = (direction: Vec3): Point2D | null => {
    if (mode === "source-map") {
      const uv = sourceDirectionToUv(
        direction,
        sourceProjectionMode,
        rect.width,
        rect.height,
        1,
        domeGuideSemanticSplit,
        domeGuideHorizonSplit,
      );
      return uv ? { x: rect.x + uv.u * rect.width, y: rect.y + uv.v * rect.height } : null;
    }
    if (mode === "cave-room") {
      return sourceCaveDirectionToScreenPoint(direction, plateEditorCaveProjection(camera, sourceProjectionMode, rect));
    }
    return sourceDomeDirectionToScreenPoint(direction, plateEditorDomeProjection(mode, camera, sourceProjectionMode, rect));
  };

  const sourceDirectionAt = (point: Point2D): Vec3 | null => {
    if (mode === "source-map") {
      return sourceUvToDirection(
        (point.x - rect.x) / Math.max(rect.width, 0.000001),
        (point.y - rect.y) / Math.max(rect.height, 0.000001),
        sourceProjectionMode,
        rect.width,
        rect.height,
        1,
        domeGuideSemanticSplit,
        domeGuideHorizonSplit,
      );
    }
    if (mode === "cave-room") {
      return sourceCaveDirectionFromScreenPoint(point, plateEditorCaveProjection(camera, sourceProjectionMode, rect));
    }
    return sourceDomeDirectionFromScreenPoint(point, plateEditorDomeProjection(mode, camera, sourceProjectionMode, rect));
  };

  const adapter: PlateEditorProjectionAdapter = {
    mode,
    sourceProjectionMode,
    projectSourceDirection,
    sourceDirectionAt,
    projectPlateUv(placement, u, v) {
      return projectSourceDirection(directionFromPlateUv(placement, u, v));
    },
    sourcePointAt(point) {
      const direction = sourceDirectionAt(point);
      return direction
        ? sourceDirectionToMapPoint(
            direction,
            sourceProjectionMode,
            rect.width,
            rect.height,
            1,
            domeGuideSemanticSplit,
            domeGuideHorizonSplit,
          )
        : null;
    },
  };
  return adapter;
}

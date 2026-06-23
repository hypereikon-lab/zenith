import { normalizeDomeGuideSemanticSplit } from "../geometry/dome-handoff-guide.js";
import {
  sourceProjectionProfileForMode,
  sourceProjectionShaderTheta,
  type SourceProjectionMode,
} from "../geometry/source-projection.js";
import { sourceGuideCarrierHorizonRadius } from "../geometry/source-guide-semantics.js";
import { multiplyMat4 } from "../projection.js";
import {
  normalizePlateEditorCamera,
  plateEditorProjectionMatrix,
  plateEditorViewMatrix,
  type PlateEditorCamera,
  type PlateEditorViewMode,
} from "../plates/plate-editor-view.js";
import { buildProjectionPreviewUniformArray } from "./projection-preview-uniforms.js";

export type ProjectionPreviewRenderUniformOptions = {
  targetWidth: number;
  targetHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceProjectionMode: SourceProjectionMode;
  projectionViewMode?: PlateEditorViewMode;
  projectionCamera?: Partial<PlateEditorCamera>;
  showProjectionGuides?: boolean;
  domeGuideSemanticSplit?: number | string | null;
  domeGuideHorizonSplit?: number | string | null;
  showCaveMask?: boolean;
  invertCaveMask?: boolean;
};

export function buildProjectionPreviewRenderUniforms({
  targetWidth,
  targetHeight,
  sourceWidth,
  sourceHeight,
  sourceProjectionMode,
  projectionViewMode = "dome-orbit",
  projectionCamera,
  showProjectionGuides,
  domeGuideSemanticSplit,
  domeGuideHorizonSplit,
  showCaveMask,
  invertCaveMask,
}: ProjectionPreviewRenderUniformOptions): Float32Array {
  const camera = normalizePlateEditorCamera(projectionCamera || {});
  const resolvedViewMode = projectionViewMode === "source-map" ? "dome-orbit" : projectionViewMode;
  const projection = plateEditorProjectionMatrix(
    camera,
    sourceProjectionMode,
    Math.max(1, targetWidth) / Math.max(1, targetHeight),
  );
  const view = plateEditorViewMatrix(resolvedViewMode, camera, sourceProjectionMode);
  const profile = sourceProjectionProfileForMode(sourceProjectionMode, sourceWidth, sourceHeight, 1);
  const sourceCarrierSplit = normalizeDomeGuideSemanticSplit(domeGuideSemanticSplit);

  return buildProjectionPreviewUniformArray({
    mvp: multiplyMat4(projection, view),
    fisheyeScale: [profile.fisheyeScaleX, profile.fisheyeScaleY],
    overlayOpacity: showProjectionGuides ? 0.78 : 0.28,
    showGuides: Boolean(showProjectionGuides),
    shellShade: resolvedViewMode === "dome-pov" ? 0.12 : 0.3,
    sourceCarrierSplit,
    sourceCarrierHorizon: sourceGuideCarrierHorizonRadius(
      sourceProjectionMode,
      sourceCarrierSplit,
      domeGuideHorizonSplit,
    ),
    sourceCenterAxis: profile.centerAxis,
    sourceTheta: sourceProjectionShaderTheta(sourceProjectionMode, profile.fieldOfViewDegrees, domeGuideSemanticSplit),
    sourceRightAxis: profile.imageRightAxis,
    sourceUpAxis: profile.imageUpAxis,
    caveMaskMode: showCaveMask ? (invertCaveMask ? 2 : 1) : 0,
    cameraPosition: camera.position,
  });
}

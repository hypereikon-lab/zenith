import { caveGuideLineWidthForSize } from "../geometry/cave-handoff-guide.js";
import { normalizeDomeGuideSemanticSplit } from "../geometry/dome-handoff-guide.js";
import {
  sourceProjectionHorizonRadius,
  sourceProjectionProfileForMode,
  sourceProjectionShaderTheta,
  type SourceProjectionMode,
} from "../geometry/source-projection.js";
import { sourceGuideCarrierHorizonRadius } from "../geometry/source-guide-semantics.js";
import { preparePlatePlacement } from "./plate-placement.js";
import { PLATE_UNIFORM_FLOATS, type PlacementUniformOptions } from "./plate-gpu-compositor-types.js";

export function placementUniformData({
  placement,
  plate,
  plateFit,
  plateFeather,
  outputSize,
  sourceProjectionMode,
  domeGuideSemanticSplit,
  domeGuideHorizonSplit,
}: PlacementUniformOptions): Float32Array {
  const prepared = preparePlatePlacement(
    placement,
    plate,
    sourceProjectionMode,
    domeGuideSemanticSplit,
    domeGuideHorizonSplit,
  );
  const projection = sourceProjectionProfileForMode(sourceProjectionMode, outputSize, outputSize);
  const data = new Float32Array(PLATE_UNIFORM_FLOATS);
  data.set(prepared.center, 0);
  data.set(prepared.right, 4);
  data.set(prepared.down, 8);
  data[12] = prepared.angularWidth;
  data[13] = prepared.angularHeight;
  data[14] = prepared.spinSin;
  data[15] = prepared.spinCos;
  data[16] = Number(prepared.opacity) || 0;
  data[17] = Number(plateFeather) || 0;
  data[18] = Number(plate.aspect) || 1;
  data[19] = plateFitMode(plateFit);
  data[20] = prepared.flipX ? 1 : 0;
  data[21] = prepared.flipY ? 1 : 0;
  data[22] = Math.max(0.001, (outputSize * 0.5 - 2) / outputSize);
  data[23] = normalizeDomeGuideSemanticSplit(domeGuideSemanticSplit);
  data[24] = prepared.cornerOffsets.nw.x;
  data[25] = prepared.cornerOffsets.ne.x;
  data[26] = prepared.cornerOffsets.se.x;
  data[27] = prepared.cornerOffsets.sw.x;
  data[28] = prepared.cornerOffsets.nw.y;
  data[29] = prepared.cornerOffsets.ne.y;
  data[30] = prepared.cornerOffsets.se.y;
  data[31] = prepared.cornerOffsets.sw.y;
  data.set(projection.centerAxis, 32);
  data[35] = sourceProjectionShaderTheta(sourceProjectionMode, projection.fieldOfViewDegrees, domeGuideSemanticSplit);
  data.set(projection.imageRightAxis, 36);
  data[39] = sourceGuideCarrierHorizonRadius(sourceProjectionMode, data[23], domeGuideHorizonSplit);
  data.set(projection.imageUpAxis, 40);
  return data;
}

export function plateFitMode(value: string): number {
  if (value === "cover") return 1;
  if (value === "stretch") return 2;
  return 0;
}

export function guideUniformData(
  outputSize: number,
  sourceProjectionMode: SourceProjectionMode,
  domeGuideSemanticSplit: number | string | null | undefined,
  domeGuideHorizonSplit?: number | string | null,
): Float32Array {
  const split = normalizeDomeGuideSemanticSplit(domeGuideSemanticSplit);
  const carrierHorizon = sourceGuideCarrierHorizonRadius(sourceProjectionMode, split, domeGuideHorizonSplit);
  if (sourceProjectionMode === "cave-270") {
    const normalizedLineWidth = caveGuideLineWidthForSize(outputSize);
    return new Float32Array([
      -1,
      normalizedLineWidth,
      outputSize * 0.5,
      sourceProjectionHorizonRadius(sourceProjectionMode, split, carrierHorizon),
      split,
      carrierHorizon,
      0,
      0,
    ]);
  }
  const projection = sourceProjectionProfileForMode(sourceProjectionMode, outputSize, outputSize);
  const domeRadiusUv = Math.max(0.001, (outputSize * 0.5 - 2) / outputSize);
  const thetaMax = (projection.fieldOfViewDegrees * 0.5 * Math.PI) / 180;
  const thetaPerPixel = thetaMax / Math.max(outputSize * domeRadiusUv, 1);
  const horizonRadius = (Math.PI * 0.5) / Math.max(thetaMax, 0.000001);
  return new Float32Array([
    domeRadiusUv,
    thetaMax,
    thetaPerPixel * 1.45,
    sourceProjectionMode === "nadir-180" ? -horizonRadius : horizonRadius,
    split,
    carrierHorizon,
    0,
    0,
  ]);
}

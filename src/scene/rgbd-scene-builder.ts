import type { SourceProjectionMode } from "../geometry/source-projection.js";
import { normalizeSourceInnerGuideSplit, sourceGuideCarrierHorizonRadius } from "../geometry/source-guide-semantics.js";
import type { RgbdDepthConvention, RgbdSceneMap, RgbdSeedSource } from "./rgbd-scene-types.js";

export type BuildRgbdSceneInput = {
  projectionProfile: SourceProjectionMode;
  innerGuideSplit?: number | string | null;
  carrierHorizonSplit?: number | string | null;
  sourceWidth: number;
  sourceHeight: number;
  depthWidth: number;
  depthHeight: number;
  depthConvention?: Partial<RgbdDepthConvention>;
  now?: () => string;
};

export function buildCanonicalRgbdScene(input: BuildRgbdSceneInput): RgbdSceneMap {
  const createdAt = (input.now || (() => new Date().toISOString()))();
  const seed: RgbdSeedSource = {
    sourceArtifactId: "start-state",
    depthArtifactId: "start-depth",
    sourceWidth: Math.max(1, Math.round(input.sourceWidth)),
    sourceHeight: Math.max(1, Math.round(input.sourceHeight)),
    depthWidth: Math.max(1, Math.round(input.depthWidth)),
    depthHeight: Math.max(1, Math.round(input.depthHeight)),
  };
  const depthConvention: RgbdDepthConvention = {
    polarity: input.depthConvention?.polarity || "brightFar",
    nearMeters: Math.max(0.001, Number(input.depthConvention?.nearMeters) || 1),
    farMeters: Math.max(0.002, Number(input.depthConvention?.farMeters) || 24),
    source: input.depthConvention?.source || "imported-relative",
  };
  if (depthConvention.farMeters <= depthConvention.nearMeters) {
    depthConvention.farMeters = depthConvention.nearMeters + 0.001;
  }
  return {
    id: "canonical-rgbd-scene",
    label: "Canonical RGBD Scene Map",
    status: "seeded",
    projectionProfile: input.projectionProfile,
    sourceMapGeometry: {
      profile: input.projectionProfile,
      innerGuideSplit: normalizeSourceInnerGuideSplit(input.innerGuideSplit),
      carrierHorizonSplit: sourceGuideCarrierHorizonRadius(
        input.projectionProfile,
        input.innerGuideSplit,
        input.carrierHorizonSplit,
      ),
      width: seed.sourceWidth,
      height: seed.sourceHeight,
    },
    depthConvention,
    cameraAssumptions: {
      origin: [0, 0, 0],
      unit: "meters",
      seedIsSingleProjection: true,
    },
    seed,
    fusedViews: [],
    confidenceMean: 0.82,
    warnings: [
      "Seed RGBD is a single projection, so large camera translations need reconstruction and confidence-weighted fusion.",
    ],
    createdAt,
    updatedAt: createdAt,
  };
}

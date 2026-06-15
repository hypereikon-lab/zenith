import { clamp } from "../projection.js";
import type {
  DepthAlignmentResult,
  FeatureAnchorReport,
  RgbdDepthArtifact,
  RgbdFusedView,
  RgbdProxyArtifact,
  RgbdReconstructionArtifact,
  RgbdSceneMap,
} from "./rgbd-scene-types.js";

export type FusionOptions = {
  baseConfidence?: number;
  hallucinatedRegionPenalty?: number;
  featureDriftPenalty?: number;
  now?: () => string;
};

export function fuseReconstructedView(
  scene: RgbdSceneMap,
  proxy: RgbdProxyArtifact,
  reconstruction: RgbdReconstructionArtifact,
  depth: RgbdDepthArtifact,
  alignment: DepthAlignmentResult,
  featureReport?: FeatureAnchorReport,
  options: FusionOptions = {},
): { scene: RgbdSceneMap; fusedView: RgbdFusedView } {
  const createdAt = (options.now || (() => new Date().toISOString()))();
  const baseConfidence = clamp(options.baseConfidence ?? 0.56, 0, 1);
  const alignmentConfidence = alignment.status === "aligned" ? alignmentQuality(alignment) : 0.12;
  const featureConfidence = featureReport ? featureQuality(featureReport, options.featureDriftPenalty ?? 0.24) : 0.74;
  const confidenceMean = clamp(baseConfidence * 0.35 + alignmentConfidence * 0.45 + featureConfidence * 0.2, 0, 1);
  const insertedSamples = Math.round(alignment.samplesUsed * clamp(1 - (options.hallucinatedRegionPenalty ?? 0.18), 0, 1));
  const reinforcedSamples = Math.round(alignment.samplesUsed * clamp(alignmentConfidence, 0, 1));
  const skippedSamples = Math.max(0, alignment.rejectedSamples + Math.round(alignment.samplesUsed * (1 - confidenceMean) * 0.25));

  const fusedView: RgbdFusedView = {
    id: `fused-view-${proxy.id}`,
    proxyId: proxy.id,
    reconstructionId: reconstruction.id,
    depthId: depth.id,
    alignmentId: alignment.id,
    featureReportId: featureReport?.id,
    cameraPose: proxy.pose,
    confidenceMean,
    insertedSamples,
    reinforcedSamples,
    skippedSamples,
    provenance: {
      reconstructionPrompt: reconstruction.prompt,
      depthPrompt: depth.prompt,
      projectionProfile: scene.projectionProfile,
      notes: [
        "Existing high-confidence seed geometry wins over new reconstructed regions.",
        "New GPT/Gemini regions enter the scene at lower confidence until reinforced by later views.",
      ],
    },
    createdAt,
  };

  const existingIndex = scene.fusedViews.findIndex((view) => view.id === fusedView.id);
  const fusedViews = existingIndex >= 0 ? [...scene.fusedViews] : [...scene.fusedViews, fusedView];
  if (existingIndex >= 0) fusedViews[existingIndex] = fusedView;
  const confidenceValues = [0.82, ...fusedViews.map((view) => view.confidenceMean)];
  const confidenceMeanScene = confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length;
  const warnings = [...scene.warnings.filter((warning) => !warning.startsWith("Fusion warning:"))];
  if (confidenceMean < 0.42) {
    warnings.push("Fusion warning: latest reconstructed view has low confidence; inspect masks and alignment before using it for production.");
  }
  return {
    scene: {
      ...scene,
      status: fusedViews.length > 0 ? "expanded" : scene.status,
      fusedViews,
      confidenceMean: confidenceMeanScene,
      warnings,
      updatedAt: createdAt,
    },
    fusedView,
  };
}

function alignmentQuality(alignment: DepthAlignmentResult): number {
  if (alignment.samplesUsed <= 0 || !Number.isFinite(alignment.rmse)) return 0;
  const errorQuality = 1 - clamp(alignment.rmse / 0.12, 0, 1);
  const sampleQuality = clamp(alignment.samplesUsed / Math.max(32, alignment.samplesUsed + alignment.rejectedSamples), 0, 1);
  const scaleQuality = alignment.scale > 0 ? 1 : 0.1;
  return clamp(errorQuality * 0.58 + sampleQuality * 0.32 + scaleQuality * 0.1, 0, 1);
}

function featureQuality(report: FeatureAnchorReport, driftPenalty: number): number {
  if (report.status === "not-run" || report.status === "not-available") return 0.72;
  if (report.status === "failed") return 0.2;
  const anchorQuality = clamp(report.anchors.length / 80, 0, 1);
  const drift = report.driftScore === null ? 0.18 : clamp(report.driftScore, 0, 1);
  return clamp(report.coverage * 0.46 + anchorQuality * 0.34 + (1 - drift * driftPenalty) * 0.2, 0, 1);
}

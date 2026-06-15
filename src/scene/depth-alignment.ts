import { clamp } from "../projection.js";
import type { DepthAlignmentResult } from "./rgbd-scene-types.js";

export type DepthAlignmentSample = {
  sceneDepthMeters: number;
  viewDepthMeters: number;
  confidence: number;
  disoccluded?: boolean;
  reprojectionError?: number;
};

export type DepthAlignmentOptions = {
  minSamples?: number;
  minConfidence?: number;
  maxReprojectionError?: number;
  residualTrimSigma?: number;
  now?: () => string;
};

type FitSample = {
  x: number;
  y: number;
  weight: number;
};

export function fitInverseDepthAlignment(
  proxyId: string,
  depthId: string,
  samples: DepthAlignmentSample[],
  options: DepthAlignmentOptions = {},
): DepthAlignmentResult {
  const minSamples = Math.max(3, Math.round(options.minSamples ?? 16));
  const minConfidence = clamp(options.minConfidence ?? 0.35, 0, 1);
  const maxReprojectionError = Math.max(0, options.maxReprojectionError ?? 2.5);
  const fitSamples = samplesToFitSpace(samples, minConfidence, maxReprojectionError);
  const rejectedBeforeFit = samples.length - fitSamples.length;
  const createdAt = (options.now || (() => new Date().toISOString()))();

  if (fitSamples.length < minSamples) {
    return result({
      proxyId,
      depthId,
      status: "insufficient-overlap",
      scale: 1,
      offset: 0,
      samplesUsed: fitSamples.length,
      rejectedSamples: rejectedBeforeFit,
      rmse: Infinity,
      medianAbsoluteError: Infinity,
      minAcceptedConfidence: minConfidence,
      warnings: [`Needs at least ${minSamples} reliable overlap samples.`],
      createdAt,
    });
  }

  const initial = weightedLinearFit(fitSamples);
  const residuals = fitSamples.map((sample) => Math.abs(sample.y - (initial.scale * sample.x + initial.offset)));
  const median = medianValue(residuals);
  const trimSigma = Math.max(1, options.residualTrimSigma ?? 3);
  const cutoff = Math.max(0.002, median * trimSigma);
  const trimmed = fitSamples.filter((sample) => Math.abs(sample.y - (initial.scale * sample.x + initial.offset)) <= cutoff);
  const rejectedByResidual = fitSamples.length - trimmed.length;

  if (trimmed.length < minSamples) {
    return result({
      proxyId,
      depthId,
      status: "unstable",
      scale: initial.scale,
      offset: initial.offset,
      samplesUsed: trimmed.length,
      rejectedSamples: rejectedBeforeFit + rejectedByResidual,
      rmse: rmse(fitSamples, initial),
      medianAbsoluteError: median,
      minAcceptedConfidence: minConfidence,
      warnings: ["Depth overlap exists, but robust residual trimming left too few stable samples."],
      createdAt,
    });
  }

  const fitted = weightedLinearFit(trimmed);
  const fittedResiduals = trimmed.map((sample) => Math.abs(sample.y - (fitted.scale * sample.x + fitted.offset)));
  const fittedMedian = medianValue(fittedResiduals);
  const fittedRmse = rmse(trimmed, fitted);
  const warnings: string[] = [];
  if (fitted.scale <= 0) warnings.push("Aligned inverse-depth scale is non-positive; depth convention may be inverted.");
  if (fittedRmse > 0.08) warnings.push("High inverse-depth RMSE; inspect drift and disocclusion masks before fusing.");
  if (Math.abs(fitted.offset) > 0.35) warnings.push("Large inverse-depth offset; generated depth may not share the seed depth range.");

  return result({
    proxyId,
    depthId,
    status: warnings.some((warning) => warning.includes("non-positive")) ? "unstable" : "aligned",
    scale: fitted.scale,
    offset: fitted.offset,
    samplesUsed: trimmed.length,
    rejectedSamples: rejectedBeforeFit + rejectedByResidual,
    rmse: fittedRmse,
    medianAbsoluteError: fittedMedian,
    minAcceptedConfidence: minConfidence,
    warnings,
    createdAt,
  });
}

export function applyInverseDepthAlignment(depthMeters: number, alignment: Pick<DepthAlignmentResult, "scale" | "offset">): number {
  const inverse = 1 / Math.max(0.000001, depthMeters);
  const alignedInverse = Math.max(0.000001, alignment.scale * inverse + alignment.offset);
  return 1 / alignedInverse;
}

export function grayscaleToDepthMeters(luma: number, nearMeters: number, farMeters: number, polarity: "brightFar" | "brightNear"): number {
  const rawFar = polarity === "brightNear" ? 1 - luma : luma;
  return nearMeters + clamp(rawFar, 0, 1) * Math.max(0.000001, farMeters - nearMeters);
}

function samplesToFitSpace(samples: DepthAlignmentSample[], minConfidence: number, maxReprojectionError: number): FitSample[] {
  return samples
    .filter((sample) => {
      if (sample.disoccluded) return false;
      if (sample.confidence < minConfidence) return false;
      if (!Number.isFinite(sample.sceneDepthMeters) || !Number.isFinite(sample.viewDepthMeters)) return false;
      if (sample.sceneDepthMeters <= 0 || sample.viewDepthMeters <= 0) return false;
      if ((sample.reprojectionError ?? 0) > maxReprojectionError) return false;
      return true;
    })
    .map((sample) => ({
      x: 1 / sample.viewDepthMeters,
      y: 1 / sample.sceneDepthMeters,
      weight: clamp(sample.confidence, 0.001, 1),
    }));
}

function weightedLinearFit(samples: FitSample[]): { scale: number; offset: number } {
  const sumW = samples.reduce((sum, sample) => sum + sample.weight, 0);
  const meanX = samples.reduce((sum, sample) => sum + sample.x * sample.weight, 0) / sumW;
  const meanY = samples.reduce((sum, sample) => sum + sample.y * sample.weight, 0) / sumW;
  let numerator = 0;
  let denominator = 0;
  for (const sample of samples) {
    const dx = sample.x - meanX;
    numerator += sample.weight * dx * (sample.y - meanY);
    denominator += sample.weight * dx * dx;
  }
  const scale = Math.abs(denominator) <= 0.0000001 ? 1 : numerator / denominator;
  const offset = meanY - scale * meanX;
  return { scale, offset };
}

function rmse(samples: FitSample[], fit: { scale: number; offset: number }): number {
  const sumW = samples.reduce((sum, sample) => sum + sample.weight, 0);
  const error = samples.reduce((sum, sample) => {
    const residual = sample.y - (fit.scale * sample.x + fit.offset);
    return sum + sample.weight * residual * residual;
  }, 0);
  return Math.sqrt(error / Math.max(0.000001, sumW));
}

function medianValue(values: number[]): number {
  if (values.length === 0) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) * 0.5 : sorted[mid];
}

function result(
  partial: Omit<DepthAlignmentResult, "id" | "fitSpace">,
): DepthAlignmentResult {
  return {
    id: `depth-alignment-${partial.proxyId}-${partial.depthId}`,
    fitSpace: "inverse-depth",
    ...partial,
  };
}

import type { FeatureAnchorReport } from "./rgbd-scene-types.js";
import type { FeatureAnchorRequest, FeatureAnchorServiceCapabilities } from "./feature-anchor-types.js";

export type FeatureAnchorService = {
  capabilities: FeatureAnchorServiceCapabilities;
  compare: (request: FeatureAnchorRequest) => Promise<FeatureAnchorReport>;
  importReport: (json: string, proxyId: string, reconstructionId?: string) => FeatureAnchorReport;
};

export function createExternalFeatureAnchorService(): FeatureAnchorService {
  return {
    capabilities: {
      provider: "dinov3",
      runsInBrowser: false,
      requiresExternalRuntime: true,
      description:
        "Dense feature anchoring is prepared for DINOv3/VGGT/DUSt3R/MASt3R-style external runtimes. The app can import reports and use them for drift diagnostics.",
    },
    async compare(request) {
      return unavailableReport(request.proxyId, request.reconstructionId);
    },
    importReport,
  };
}

export function unavailableReport(proxyId: string, reconstructionId?: string): FeatureAnchorReport {
  return {
    id: `feature-report-${proxyId}`,
    proxyId,
    reconstructionId,
    status: "not-available",
    model: "unavailable",
    anchors: [],
    driftScore: null,
    coverage: 0,
    warnings: [
      "No in-browser dense feature runtime is configured. Import a DINOv3/VGGT/DUSt3R/MASt3R report to enable drift diagnostics.",
    ],
    createdAt: new Date().toISOString(),
  };
}

export function importReport(json: string, proxyId: string, reconstructionId?: string): FeatureAnchorReport {
  const parsed = JSON.parse(json) as Partial<FeatureAnchorReport>;
  const anchors = Array.isArray(parsed.anchors)
    ? parsed.anchors
        .filter((anchor) => {
          return (
            anchor &&
            Number.isFinite(anchor.confidence) &&
            Number.isFinite(anchor.sourcePoint?.x) &&
            Number.isFinite(anchor.sourcePoint?.y) &&
            Number.isFinite(anchor.targetPoint?.x) &&
            Number.isFinite(anchor.targetPoint?.y)
          );
        })
        .map((anchor, index) => ({
          id: anchor.id || `manual-anchor-${index + 1}`,
          sourcePoint: { x: Number(anchor.sourcePoint.x), y: Number(anchor.sourcePoint.y) },
          targetPoint: { x: Number(anchor.targetPoint.x), y: Number(anchor.targetPoint.y) },
          confidence: Math.max(0, Math.min(1, Number(anchor.confidence))),
          descriptor: anchor.descriptor,
        }))
    : [];

  return {
    id: parsed.id || `feature-report-${proxyId}`,
    proxyId,
    reconstructionId,
    status: anchors.length > 0 ? "imported" : "warning",
    model: parsed.model || "manual",
    anchors,
    driftScore: Number.isFinite(parsed.driftScore) ? Number(parsed.driftScore) : null,
    coverage: Number.isFinite(parsed.coverage) ? Math.max(0, Math.min(1, Number(parsed.coverage))) : 0,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : anchors.length > 0 ? [] : ["Imported feature report has no valid anchors."],
    createdAt: parsed.createdAt || new Date().toISOString(),
  };
}

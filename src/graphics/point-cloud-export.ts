import type { RgbdSceneMap } from "../scene/rgbd-scene-types.js";

export type PointCloudExportManifest = {
  version: 1;
  format: "zenith-rgbd-splat-candidate";
  sceneId: string;
  projectionProfile: string;
  fusedViewCount: number;
  confidenceMean: number;
  notes: string[];
};

export function createPointCloudExportManifest(scene: RgbdSceneMap): PointCloudExportManifest {
  return {
    version: 1,
    format: "zenith-rgbd-splat-candidate",
    sceneId: scene.id,
    projectionProfile: scene.projectionProfile,
    fusedViewCount: scene.fusedViews.length,
    confidenceMean: scene.confidenceMean,
    notes: [
      "This manifest is the explicit splat/point-cloud export foundation.",
      "A full Gaussian splat model still requires a separate reconstruction/training/runtime pipeline.",
      "Each fused view preserves camera pose, prompts, depth alignment, feature report, and confidence provenance.",
    ],
  };
}

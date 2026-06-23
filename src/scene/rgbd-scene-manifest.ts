import { createPointCloudExportManifest, type PointCloudExportManifest } from "../graphics/point-cloud-export.js";
import type {
  DepthAlignmentResult,
  FeatureAnchorReport,
  RgbdCameraPath,
  RgbdDepthArtifact,
  RgbdFusedView,
  RgbdProxyArtifact,
  RgbdReconstructionArtifact,
  RgbdSceneMap,
} from "./rgbd-scene-types.js";

export type RgbdSceneExportManifest = {
  scene: RgbdSceneMap;
  cameraPath: RgbdCameraPath;
  selectedKeyframeId: string;
  proxy: RgbdProxyArtifact | null;
  reconstruction: RgbdReconstructionArtifact | null;
  depth: RgbdDepthArtifact | null;
  alignment: DepthAlignmentResult | null;
  featureReport: FeatureAnchorReport | null;
  fusedView: RgbdFusedView | null;
  splatCandidate: PointCloudExportManifest;
};

export function createRgbdSceneExportManifest(input: {
  scene: RgbdSceneMap;
  cameraPath: RgbdCameraPath;
  selectedKeyframeId: string;
  proxy: RgbdProxyArtifact | null;
  reconstruction: RgbdReconstructionArtifact | null;
  depth: RgbdDepthArtifact | null;
  alignment: DepthAlignmentResult | null;
  featureReport: FeatureAnchorReport | null;
  fusedView: RgbdFusedView | null;
}): RgbdSceneExportManifest {
  return {
    ...input,
    splatCandidate: createPointCloudExportManifest(input.scene),
  };
}

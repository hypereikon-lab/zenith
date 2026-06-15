export type {
  FeatureAnchor,
  FeatureAnchorReport,
  FeatureAnchorStatus,
} from "./rgbd-scene-types.js";

export type FeatureAnchorProviderId = "dinov3" | "vggt" | "dust3r" | "mast3r" | "manual";

export type FeatureAnchorRequest = {
  proxyId: string;
  reconstructionId?: string;
  sourceImage: ImageData | null;
  targetImage: ImageData | null;
  provider: FeatureAnchorProviderId;
};

export type FeatureAnchorServiceCapabilities = {
  provider: FeatureAnchorProviderId;
  runsInBrowser: boolean;
  requiresExternalRuntime: boolean;
  description: string;
};

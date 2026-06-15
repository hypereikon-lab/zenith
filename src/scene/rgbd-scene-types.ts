import type { SourceProjectionMode } from "../geometry/source-projection.js";
import type { CameraRigBasis, CameraRigPose } from "../geometry/camera-rig.js";
import type { Vec3 } from "../projection.js";

export type RgbdSceneStatus = "empty" | "seeded" | "expanded" | "warning";
export type RgbdArtifactStatus = "missing" | "ready" | "working" | "warning" | "stale";
export type RgbdDepthPolarity = "brightFar" | "brightNear";
export type RgbdCameraMode = "orbit" | "inside" | "fly";
export type RgbdRenderTargetKind = "rectangular" | "domemaster" | "cave-270" | "video-handoff";

export type RgbdDepthConvention = {
  polarity: RgbdDepthPolarity;
  nearMeters: number;
  farMeters: number;
  source: "gemini-relative" | "imported-relative" | "aligned-inverse-depth";
};

export type RgbdCameraPose = CameraRigPose<RgbdCameraMode>;

export type RgbdCameraBasis = CameraRigBasis;

export type RgbdCameraKeyframe = {
  id: string;
  label: string;
  timeSeconds: number;
  pose: RgbdCameraPose;
  note?: string;
};

export type RgbdCameraPath = {
  id: string;
  label: string;
  durationSeconds: number;
  keyframes: RgbdCameraKeyframe[];
};

export type RgbdMediaRef = {
  kind: "none" | "image" | "video" | "canvas";
  url?: string;
  name?: string;
  mime?: string;
  alt?: string;
};

export type RgbdSeedSource = {
  sourceArtifactId: "start-state";
  depthArtifactId: "start-depth";
  sourceWidth: number;
  sourceHeight: number;
  depthWidth: number;
  depthHeight: number;
};

export type RgbdProxyArtifact = {
  id: string;
  keyframeId: string;
  label: string;
  status: RgbdArtifactStatus;
  pose: RgbdCameraPose;
  projectionProfile: SourceProjectionMode;
  createdAt: string;
  updatedAt: string;
  rgb: RgbdMediaRef;
  depthPreview: RgbdMediaRef;
  knownMask: RgbdMediaRef;
  disocclusionMask: RgbdMediaRef;
  confidencePreview: RgbdMediaRef;
  warnings: string[];
};

export type RgbdReconstructionArtifact = {
  id: string;
  proxyId: string;
  label: string;
  status: RgbdArtifactStatus;
  media: RgbdMediaRef;
  prompt: string;
  model: "gpt-image-2" | "manual-import";
  createdAt: string;
  warnings: string[];
};

export type RgbdDepthArtifact = {
  id: string;
  reconstructionId: string;
  label: string;
  status: RgbdArtifactStatus;
  media: RgbdMediaRef;
  prompt: string;
  convention: RgbdDepthConvention;
  createdAt: string;
  warnings: string[];
};

export type DepthAlignmentStatus = "not-run" | "aligned" | "insufficient-overlap" | "unstable";

export type DepthAlignmentResult = {
  id: string;
  proxyId: string;
  depthId: string;
  status: DepthAlignmentStatus;
  fitSpace: "inverse-depth";
  scale: number;
  offset: number;
  samplesUsed: number;
  rejectedSamples: number;
  rmse: number;
  medianAbsoluteError: number;
  minAcceptedConfidence: number;
  warnings: string[];
  createdAt: string;
};

export type FeatureAnchorStatus = "not-run" | "not-available" | "imported" | "warning" | "failed";

export type FeatureAnchor = {
  id: string;
  sourcePoint: { x: number; y: number };
  targetPoint: { x: number; y: number };
  confidence: number;
  descriptor?: string;
};

export type FeatureAnchorReport = {
  id: string;
  proxyId: string;
  reconstructionId?: string;
  status: FeatureAnchorStatus;
  model: "dinov3" | "vggt" | "dust3r" | "mast3r" | "manual" | "unavailable";
  anchors: FeatureAnchor[];
  driftScore: number | null;
  coverage: number;
  warnings: string[];
  createdAt: string;
};

export type RgbdFusedView = {
  id: string;
  proxyId: string;
  reconstructionId: string;
  depthId: string;
  alignmentId: string;
  featureReportId?: string;
  cameraPose: RgbdCameraPose;
  confidenceMean: number;
  insertedSamples: number;
  reinforcedSamples: number;
  skippedSamples: number;
  provenance: {
    reconstructionPrompt: string;
    depthPrompt: string;
    projectionProfile: SourceProjectionMode;
    notes: string[];
  };
  createdAt: string;
};

export type RgbdSceneMap = {
  id: string;
  label: string;
  status: RgbdSceneStatus;
  projectionProfile: SourceProjectionMode;
  sourceMapGeometry: {
    profile: SourceProjectionMode;
    innerGuideSplit: number;
    carrierHorizonSplit: number;
    width: number;
    height: number;
  };
  depthConvention: RgbdDepthConvention;
  cameraAssumptions: {
    origin: Vec3;
    unit: "meters";
    seedIsSingleProjection: boolean;
  };
  seed: RgbdSeedSource | null;
  fusedViews: RgbdFusedView[];
  confidenceMean: number;
  warnings: string[];
  createdAt: string;
  updatedAt: string;
};

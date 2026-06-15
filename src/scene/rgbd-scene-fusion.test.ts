import { describe, expect, test } from "vitest";
import { quaternionFromEulerDegrees } from "../geometry/camera-rig.js";
import { buildCanonicalRgbdScene } from "./rgbd-scene-builder.js";
import { fuseReconstructedView } from "./rgbd-scene-fusion.js";
import type { DepthAlignmentResult, RgbdDepthArtifact, RgbdProxyArtifact, RgbdReconstructionArtifact } from "./rgbd-scene-types.js";

describe("RGBD scene fusion", () => {
  test("adds a fused view with confidence and provenance", () => {
    const scene = buildCanonicalRgbdScene({
      projectionProfile: "zenith-180",
      sourceWidth: 1024,
      sourceHeight: 1024,
      depthWidth: 1024,
      depthHeight: 1024,
      now: () => "t",
    });
    const proxy = proxyArtifact();
    const reconstruction = reconstructionArtifact();
    const depth = depthArtifact();
    const alignment: DepthAlignmentResult = {
      id: "alignment",
      proxyId: proxy.id,
      depthId: depth.id,
      status: "aligned",
      fitSpace: "inverse-depth",
      scale: 1,
      offset: 0,
      samplesUsed: 80,
      rejectedSamples: 6,
      rmse: 0.02,
      medianAbsoluteError: 0.01,
      minAcceptedConfidence: 0.35,
      warnings: [],
      createdAt: "t",
    };
    const result = fuseReconstructedView(scene, proxy, reconstruction, depth, alignment, undefined, { now: () => "t2" });
    expect(result.scene.status).toBe("expanded");
    expect(result.scene.fusedViews).toHaveLength(1);
    expect(result.fusedView.confidenceMean).toBeGreaterThan(0.5);
    expect(result.fusedView.provenance.reconstructionPrompt).toBe("reconstruct prompt");
  });
});

function proxyArtifact(): RgbdProxyArtifact {
  return {
    id: "proxy-keyframe",
    keyframeId: "keyframe",
    label: "Proxy",
    status: "ready",
    pose: {
      position: [0, 0, 0.2],
      orientation: quaternionFromEulerDegrees(0, 0, 0),
      pivot: [0, 0, 1],
      fovDegrees: 70,
      nearMeters: 0.01,
      farMeters: 80,
      mode: "fly",
    },
    projectionProfile: "zenith-180",
    createdAt: "t",
    updatedAt: "t",
    rgb: { kind: "image", url: "rgb" },
    depthPreview: { kind: "image", url: "depth" },
    knownMask: { kind: "image", url: "known" },
    disocclusionMask: { kind: "image", url: "holes" },
    confidencePreview: { kind: "image", url: "confidence" },
    warnings: [],
  };
}

function reconstructionArtifact(): RgbdReconstructionArtifact {
  return {
    id: "reconstruction",
    proxyId: "proxy-keyframe",
    label: "Reconstruction",
    status: "ready",
    media: { kind: "image", url: "recon" },
    prompt: "reconstruct prompt",
    model: "manual-import",
    createdAt: "t",
    warnings: [],
  };
}

function depthArtifact(): RgbdDepthArtifact {
  return {
    id: "depth",
    reconstructionId: "reconstruction",
    label: "Depth",
    status: "ready",
    media: { kind: "image", url: "depth" },
    prompt: "depth prompt",
    convention: { polarity: "brightFar", nearMeters: 1, farMeters: 24, source: "imported-relative" },
    createdAt: "t",
    warnings: [],
  };
}

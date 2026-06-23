import { describe, expect, test } from "vitest";
import { buildCanonicalRgbdScene } from "./rgbd-scene-builder.js";
import { createRgbdDepthArtifact, createRgbdReconstructionArtifact } from "./rgbd-scene-artifacts.js";
import { createRgbdSceneExportManifest } from "./rgbd-scene-manifest.js";
import type { RgbdCameraPath, RgbdMediaRef } from "./rgbd-scene-types.js";

const createdAt = "2026-06-23T12:00:00.000Z";
const media: RgbdMediaRef = {
  kind: "image",
  url: "data:image/png;base64,RGBD",
  name: "rgbd.png",
  mime: "image/png",
  alt: "RGBD test media",
};

describe("RGBD scene artifact ownership", () => {
  test("builds reconstruction artifacts without reading mutable lab state", () => {
    const artifact = createRgbdReconstructionArtifact({
      proxyId: "proxy-keyframe-expand",
      media,
      prompt: "Reconstruct prompt",
      model: "manual-import",
      createdAt,
    });

    expect(artifact).toEqual({
      id: "reconstruction-proxy-keyframe-expand",
      proxyId: "proxy-keyframe-expand",
      label: "Reconstructed Proxy View",
      status: "ready",
      media,
      prompt: "Reconstruct prompt",
      model: "manual-import",
      createdAt,
      warnings: ["Manual import bypassed paid API; verify it preserves the proxy camera geometry."],
    });
  });

  test("maps RGBD depth source labels into portable depth conventions", () => {
    const baseConvention = {
      polarity: "brightFar" as const,
      nearMeters: 1,
      farMeters: 24,
      source: "imported-relative" as const,
    };

    expect(
      createRgbdDepthArtifact({
        reconstructionId: "reconstruction-proxy-keyframe-expand",
        media,
        prompt: "Depth prompt",
        depthConvention: baseConvention,
        sourceLabel: "manual import",
        createdAt,
      }).convention.source,
    ).toBe("imported-relative");

    expect(
      createRgbdDepthArtifact({
        reconstructionId: "reconstruction-proxy-keyframe-expand",
        media,
        prompt: "Depth prompt",
        depthConvention: baseConvention,
        sourceLabel: "Gemini relative depth prior",
        createdAt,
      }).convention.source,
    ).toBe("gemini-relative");
  });

  test("creates JSON-portable RGBD scene export manifests", () => {
    const scene = buildCanonicalRgbdScene({
      projectionProfile: "zenith-180",
      innerGuideSplit: 1 / 3,
      carrierHorizonSplit: 0.58,
      sourceWidth: 1024,
      sourceHeight: 1024,
      depthWidth: 1024,
      depthHeight: 1024,
      depthConvention: {
        polarity: "brightFar",
        nearMeters: 1,
        farMeters: 24,
        source: "imported-relative",
      },
    });
    const cameraPath: RgbdCameraPath = {
      id: "path",
      label: "Path",
      durationSeconds: 5,
      keyframes: [],
    };

    const manifest = createRgbdSceneExportManifest({
      scene,
      cameraPath,
      selectedKeyframeId: "keyframe-expand",
      proxy: null,
      reconstruction: null,
      depth: null,
      alignment: null,
      featureReport: null,
      fusedView: null,
    });

    expect(manifest.splatCandidate).toMatchObject({
      version: 1,
      format: "zenith-rgbd-splat-candidate",
      sceneId: scene.id,
      fusedViewCount: 0,
    });
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
  });
});

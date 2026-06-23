import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderRgbdProxyViews } from "../graphics/rgbd-proxy-renderer.js";
import { buildCanonicalRgbdScene } from "./rgbd-scene-builder.js";
import { renderSelectedRgbdProxy } from "./rgbd-scene-commands.js";
import { defaultRgbdCameraPath, defaultRgbdCameraPose } from "./camera-path.js";
import { rgbdCanvasHandles, rgbdLab } from "./rgbd-scene-store.svelte.js";
import type { RgbdDepthArtifact, RgbdProxyArtifact, RgbdReconstructionArtifact } from "./rgbd-scene-types.js";

vi.mock("../graphics/rgbd-proxy-renderer.js", () => ({
  renderRgbdProxyViews: vi.fn(),
}));

describe("RGBD scene commands", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetRgbdLab();
  });

  test("revokes old proxy and dependent object URLs when rendering a replacement proxy", async () => {
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const newProxy = proxyArtifact("new");
    vi.mocked(renderRgbdProxyViews).mockResolvedValueOnce({
      artifact: newProxy,
      canvases: {
        rgb: fakeCanvas("new-rgb"),
        depthPreview: fakeCanvas("new-depth"),
        knownMask: fakeCanvas("new-known"),
        disocclusionMask: fakeCanvas("new-hole"),
        confidencePreview: fakeCanvas("new-confidence"),
      },
      blobs: {
        rgb: new Blob(["new-rgb"], { type: "image/png" }),
        depthPreview: new Blob(["new-depth"], { type: "image/png" }),
        knownMask: new Blob(["new-known"], { type: "image/png" }),
        disocclusionMask: new Blob(["new-hole"], { type: "image/png" }),
        confidencePreview: new Blob(["new-confidence"], { type: "image/png" }),
      },
    });

    await renderSelectedRgbdProxy();

    expect(revokeSpy.mock.calls.map(([url]) => url)).toEqual([
      "blob:http://127.0.0.1/old-rgb",
      "blob:http://127.0.0.1/old-depth",
      "blob:http://127.0.0.1/old-known",
      "blob:http://127.0.0.1/old-hole",
      "blob:http://127.0.0.1/old-confidence",
      "blob:http://127.0.0.1/old-reconstruction",
      "blob:http://127.0.0.1/old-generated-depth",
    ]);
    expect(revokeSpy).not.toHaveBeenCalledWith("blob:http://127.0.0.1/new-rgb");
    expect(rgbdLab.proxy).toBe(newProxy);
    expect(rgbdLab.reconstruction).toBeNull();
    expect(rgbdLab.depth).toBeNull();
    expect(rgbdLab.alignment).toBeNull();
    expect(rgbdLab.fusedView).toBeNull();
    expect(rgbdLab.featureReport).toBeNull();
    expect(rgbdCanvasHandles.reconstructionCanvas).toBeNull();
    expect(rgbdCanvasHandles.generatedDepthCanvas).toBeNull();
    expect(rgbdCanvasHandles.alignedDepthCanvas).toBeNull();
    expect(rgbdLab.selectedStep).toBe("reconstruct");
  });
});

function resetRgbdLab(): void {
  const path = defaultRgbdCameraPath();
  rgbdLab.scene = buildCanonicalRgbdScene({
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
  rgbdLab.cameraPath = path;
  rgbdLab.selectedKeyframeId = "keyframe-expand";
  rgbdLab.proxy = proxyArtifact("old");
  rgbdLab.reconstruction = reconstructionArtifact();
  rgbdLab.depth = depthArtifact();
  rgbdLab.alignment = {
    id: "alignment",
    proxyId: "old-proxy",
    depthId: "old-depth",
    status: "aligned",
    fitSpace: "inverse-depth",
    scale: 1,
    offset: 0,
    samplesUsed: 16,
    rejectedSamples: 0,
    rmse: 0.1,
    medianAbsoluteError: 0.05,
    minAcceptedConfidence: 0.5,
    warnings: [],
    createdAt: "2026-06-23T12:00:00.000Z",
  };
  rgbdLab.fusedView = {
    id: "fused",
    proxyId: "old-proxy",
    reconstructionId: "old-reconstruction",
    depthId: "old-depth",
    alignmentId: "alignment",
    cameraPose: defaultRgbdCameraPose(),
    confidenceMean: 0.75,
    insertedSamples: 10,
    reinforcedSamples: 2,
    skippedSamples: 1,
    provenance: {
      reconstructionPrompt: "Reconstruct",
      depthPrompt: "Depth",
      projectionProfile: "zenith-180",
      notes: [],
    },
    createdAt: "2026-06-23T12:00:00.000Z",
  };
  rgbdLab.featureReport = {
    id: "feature-report",
    proxyId: "old-proxy",
    reconstructionId: "old-reconstruction",
    status: "imported",
    model: "manual",
    anchors: [],
    driftScore: null,
    coverage: 0,
    warnings: [],
    createdAt: "2026-06-23T12:00:00.000Z",
  };
  Object.assign(rgbdCanvasHandles, {
    sourceCanvas: fakeCanvas("source"),
    depthCanvas: fakeCanvas("depth"),
    proxyRgbCanvas: fakeCanvas("old-rgb"),
    proxyDepthCanvas: fakeCanvas("old-depth"),
    knownMaskCanvas: fakeCanvas("old-known"),
    disocclusionMaskCanvas: fakeCanvas("old-hole"),
    confidenceCanvas: fakeCanvas("old-confidence"),
    reconstructionCanvas: fakeCanvas("old-reconstruction"),
    generatedDepthCanvas: fakeCanvas("old-generated-depth"),
    alignedDepthCanvas: fakeCanvas("old-aligned-depth"),
  });
}

function proxyArtifact(prefix: "old" | "new"): RgbdProxyArtifact {
  const pose = defaultRgbdCameraPose();
  return {
    id: `${prefix}-proxy`,
    keyframeId: "keyframe-expand",
    label: `${prefix} proxy`,
    status: "ready",
    pose,
    projectionProfile: "zenith-180",
    createdAt: "2026-06-23T12:00:00.000Z",
    updatedAt: "2026-06-23T12:00:00.000Z",
    rgb: { kind: "image", url: `blob:http://127.0.0.1/${prefix}-rgb` },
    depthPreview: { kind: "image", url: `blob:http://127.0.0.1/${prefix}-depth` },
    knownMask: { kind: "image", url: `blob:http://127.0.0.1/${prefix}-known` },
    disocclusionMask: { kind: "image", url: `blob:http://127.0.0.1/${prefix}-hole` },
    confidencePreview: { kind: "image", url: `blob:http://127.0.0.1/${prefix}-confidence` },
    warnings: [],
  };
}

function reconstructionArtifact(): RgbdReconstructionArtifact {
  return {
    id: "old-reconstruction",
    proxyId: "old-proxy",
    label: "Old Reconstruction",
    status: "ready",
    media: { kind: "image", url: "blob:http://127.0.0.1/old-reconstruction" },
    prompt: "Reconstruct",
    model: "manual-import",
    createdAt: "2026-06-23T12:00:00.000Z",
    warnings: [],
  };
}

function depthArtifact(): RgbdDepthArtifact {
  return {
    id: "old-depth",
    reconstructionId: "old-reconstruction",
    label: "Old Depth",
    status: "ready",
    media: { kind: "image", url: "blob:http://127.0.0.1/old-generated-depth" },
    prompt: "Depth",
    convention: {
      polarity: "brightFar",
      nearMeters: 1,
      farMeters: 24,
      source: "imported-relative",
    },
    createdAt: "2026-06-23T12:00:00.000Z",
    warnings: [],
  };
}

function fakeCanvas(label: string): HTMLCanvasElement {
  return { width: 4, height: 4, toDataURL: () => `data:image/png;base64,${label}` } as HTMLCanvasElement;
}

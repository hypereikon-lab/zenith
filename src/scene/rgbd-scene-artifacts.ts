import type {
  RgbdDepthArtifact,
  RgbdDepthConvention,
  RgbdMediaRef,
  RgbdReconstructionArtifact,
} from "./rgbd-scene-types.js";

export function createRgbdReconstructionArtifact({
  proxyId,
  media,
  prompt,
  model,
  createdAt = new Date().toISOString(),
}: {
  proxyId: string;
  media: RgbdMediaRef;
  prompt: string;
  model: RgbdReconstructionArtifact["model"];
  createdAt?: string;
}): RgbdReconstructionArtifact {
  return {
    id: `reconstruction-${proxyId}`,
    proxyId,
    label: "Reconstructed Proxy View",
    status: "ready",
    media,
    prompt,
    model,
    createdAt,
    warnings:
      model === "manual-import"
        ? ["Manual import bypassed paid API; verify it preserves the proxy camera geometry."]
        : [],
  };
}

export function createRgbdDepthArtifact({
  reconstructionId,
  media,
  prompt,
  depthConvention,
  sourceLabel,
  createdAt = new Date().toISOString(),
}: {
  reconstructionId: string;
  media: RgbdMediaRef;
  prompt: string;
  depthConvention: RgbdDepthConvention;
  sourceLabel: string;
  createdAt?: string;
}): RgbdDepthArtifact {
  return {
    id: `depth-${reconstructionId}`,
    reconstructionId,
    label: "Proxy Relative Depth",
    status: "ready",
    media,
    prompt,
    convention: {
      ...depthConvention,
      source: sourceLabel.includes("Gemini") ? "gemini-relative" : "imported-relative",
    },
    createdAt,
    warnings: ["Depth is a relative dense prior and must be aligned before fusion."],
  };
}

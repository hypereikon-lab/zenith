import {
  getArtifact,
  getArtifactMediaHandle,
  startJob,
  updateJob,
  workbench,
} from "../artifacts/artifact-store.svelte.js";
import type { ArtifactMedia, ArtifactSlotId, OperatorId } from "../artifacts/artifact-types.js";
import { readArtifactMediaAsDataUrl } from "../artifacts/artifact-runtime-media.js";
import { downloadBlob } from "../media/canvas-utils.js";
import {
  exportableDepthMotionConfig,
  imageArtifactUrlToCanvas,
  renderDepthMotionProxy,
  renderDisplacedEndpoint,
  type DepthMotionWorkbenchConfig,
} from "../services/depth-motion-service.js";
import { getOperator } from "./operator-registry.js";
import { applyOperatorArtifactResult } from "./operator-artifact-results.js";

export async function executeLocalRenderOperator(operatorId: OperatorId): Promise<void> {
  switch (operatorId) {
    case "preview-motion-draft":
      await createMotionDraft(operatorId);
      return;
    case "export-motion-proxy":
      await downloadArtifactMedia("motion-draft", `zenith-motion-draft-${Date.now()}.mp4`);
      return;
    case "export-motion-config":
      exportMotionConfig();
      return;
    case "capture-displaced-endpoint":
      await createDisplacedEndpoint(operatorId);
      return;
    case "export-start-depth":
      await downloadArtifactMedia("start-depth", `zenith-start-depth-${Date.now()}.png`);
      return;
    case "export-end-depth":
      await downloadArtifactMedia("end-depth", `zenith-end-depth-${Date.now()}.png`);
      return;
    default:
      throw new Error(`Local render operator ${operatorId} is not implemented.`);
  }
}

async function createMotionDraft(operatorId: OperatorId): Promise<void> {
  const operator = getOperator(operatorId);
  startJob(operatorId, operator.label, "Preparing canvases");
  const sourceCanvas = await artifactImageCanvas("start-state");
  const depthCanvas = await artifactImageCanvas("start-depth");
  const result = await renderDepthMotionProxy({
    sourceCanvas,
    depthCanvas,
    config: workbench.motionConfig as DepthMotionWorkbenchConfig,
    onProgress: (stage, progress) => updateJob(operatorId, stage, progress),
  });
  const media: ArtifactMedia = {
    kind: "video",
    url: result.url,
    name: `Local 2.5D motion proxy ${result.settings.size}px ${result.settings.fps}fps`,
    mime: result.blob.type || "video/mp4",
    alt: "Real local 2.5D depth-motion guide/proxy video",
    blob: null,
    file: null,
    canvas: null,
  };
  applyOperatorArtifactResult({
    artifactId: "motion-draft",
    operatorId,
    media,
    handle: { blob: result.blob, file: null, canvas: null },
    resultLabel: `2.5D proxy ${result.settings.frameCount} frames`,
    summary: "Real local WebGPU 2.5D motion proxy ready. This is still a guide, not final production quality.",
    config: exportableDepthMotionConfig(workbench.motionConfig as DepthMotionWorkbenchConfig),
    warnings: ["Motion Draft is a spatial guide/proxy, not a final production render."],
  });
}

async function createDisplacedEndpoint(operatorId: OperatorId): Promise<void> {
  const operator = getOperator(operatorId);
  startJob(operatorId, operator.label, "Preparing endpoint render");
  const sourceCanvas = await artifactImageCanvas("start-state");
  const depthCanvas = await artifactImageCanvas("start-depth");
  const result = await renderDisplacedEndpoint({
    sourceCanvas,
    depthCanvas,
    config: workbench.motionConfig as DepthMotionWorkbenchConfig,
    onProgress: (stage, progress) => updateJob(operatorId, stage, progress),
  });
  const media: ArtifactMedia = {
    kind: "image",
    url: result.url,
    name: `Displaced endpoint ${result.settings.size}px`,
    mime: result.blob.type || "image/png",
    alt: "Captured final frame from the real local 2.5D depth-motion engine",
    blob: null,
    file: null,
    canvas: null,
  };
  applyOperatorArtifactResult({
    artifactId: "displaced-endpoint",
    operatorId,
    media,
    handle: { blob: result.blob, file: null, canvas: result.canvas },
    resultLabel: "Captured 2.5D endpoint",
    summary: "Displaced endpoint captured from the real local 2.5D depth-motion engine.",
    config: exportableDepthMotionConfig(workbench.motionConfig as DepthMotionWorkbenchConfig),
    warnings: ["Endpoint is structurally useful but should be reconstructed before video generation."],
  });
}

async function artifactImageCanvas(artifactId: ArtifactSlotId): Promise<HTMLCanvasElement> {
  const artifact = getArtifact(artifactId);
  if (artifact.media.kind !== "image" && artifact.media.kind !== "canvas") {
    throw new Error(`${artifact.label} must be an image artifact for local depth-motion.`);
  }
  return imageArtifactUrlToCanvas(await readArtifactMediaAsDataUrl(artifact, getArtifactMediaHandle(artifactId)));
}

function exportMotionConfig(): void {
  const config = exportableDepthMotionConfig(workbench.motionConfig as DepthMotionWorkbenchConfig);
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
  downloadBlob(blob, `zenith-depth-motion-config-${Date.now()}.json`);
}

async function downloadArtifactMedia(artifactId: ArtifactSlotId, filename: string): Promise<void> {
  const media = getArtifact(artifactId).media;
  if (!media.url) throw new Error("No media available to download.");
  const response = await fetch(media.url);
  if (!response.ok) throw new Error("Could not fetch artifact media.");
  const blob = await response.blob();
  downloadBlob(blob, filename);
}

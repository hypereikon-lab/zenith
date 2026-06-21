import {
  addArtifactResult,
  finishJob,
  getArtifact,
  getArtifactMediaHandle,
  selectArtifact,
  setArtifactMediaHandle,
  startJob,
  updateArtifact,
  updateJob,
  workbench,
} from "../artifacts/artifact-store.svelte.js";
import type { ArtifactMedia, ArtifactSlotId, OperatorId } from "../artifacts/artifact-types.js";
import { downloadBlob } from "../media/canvas-utils.js";
import {
  exportableDepthMotionConfig,
  imageArtifactUrlToCanvas,
  renderDepthMotionProxy,
  renderDisplacedEndpoint,
  type DepthMotionWorkbenchConfig,
} from "../services/depth-motion-service.js";
import { getOperator } from "./operator-registry.js";

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
  setArtifactMediaHandle("motion-draft", { blob: result.blob, file: null, canvas: null });
  updateArtifact("motion-draft", {
    status: "ready",
    stale: false,
    summary: "Real local WebGPU 2.5D motion proxy ready. This is still a guide, not final production quality.",
    operatorId,
    config: exportableDepthMotionConfig(workbench.motionConfig as DepthMotionWorkbenchConfig),
    media,
    warnings: ["Motion Draft is a spatial guide/proxy, not a final production render."],
  });
  addArtifactResult("motion-draft", {
    label: `2.5D proxy ${result.settings.frameCount} frames`,
    media,
    operatorId,
  });
  finishJob(operatorId, "Complete");
  selectArtifact("motion-draft");
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
  setArtifactMediaHandle("displaced-endpoint", { blob: result.blob, file: null, canvas: result.canvas });
  updateArtifact("displaced-endpoint", {
    status: "ready",
    stale: false,
    summary: "Displaced endpoint captured from the real local 2.5D depth-motion engine.",
    operatorId,
    config: exportableDepthMotionConfig(workbench.motionConfig as DepthMotionWorkbenchConfig),
    media,
    warnings: ["Endpoint is structurally useful but should be reconstructed before video generation."],
  });
  addArtifactResult("displaced-endpoint", {
    label: "Captured 2.5D endpoint",
    media,
    operatorId,
  });
  finishJob(operatorId, "Complete");
  selectArtifact("displaced-endpoint");
}

async function artifactImageCanvas(artifactId: ArtifactSlotId): Promise<HTMLCanvasElement> {
  const artifact = getArtifact(artifactId);
  if (artifact.media.kind !== "image" && artifact.media.kind !== "canvas") {
    throw new Error(`${artifact.label} must be an image artifact for local depth-motion.`);
  }
  const handle = getArtifactMediaHandle(artifactId);
  if (handle?.canvas) return handle.canvas;
  if (handle?.blob) return imageArtifactUrlToCanvas(await blobToDataUrl(handle.blob));
  if (artifact.media.blob) return imageArtifactUrlToCanvas(await blobToDataUrl(artifact.media.blob));
  if (!artifact.media.url) throw new Error(`${artifact.label} has no readable media.`);
  return imageArtifactUrlToCanvas(artifact.media.url);
}

function exportMotionConfig(): void {
  const config = exportableDepthMotionConfig(workbench.motionConfig as DepthMotionWorkbenchConfig);
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
  downloadBlob(blob, `zenith-depth-motion-config-${Date.now()}.json`);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read blob."));
    reader.readAsDataURL(blob);
  });
}

async function downloadArtifactMedia(artifactId: ArtifactSlotId, filename: string): Promise<void> {
  const media = getArtifact(artifactId).media;
  if (!media.url) throw new Error("No media available to download.");
  const response = await fetch(media.url);
  if (!response.ok) throw new Error("Could not fetch artifact media.");
  const blob = await response.blob();
  downloadBlob(blob, filename);
}

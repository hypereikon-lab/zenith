import {
  finishJob,
  getArtifact,
  getArtifactMediaHandle,
  replaceArtifactMedia,
  selectArtifact,
  startJob,
  updateJob,
  workbench,
} from "../artifacts/artifact-store.svelte.js";
import type { ArtifactMedia, ArtifactSlotId, OperatorId } from "../artifacts/artifact-types.js";
import { readArtifactMediaAsDataUrl } from "../artifacts/artifact-runtime-media.js";
import { requestRunwayDepthMap, requestRunwayInpaint, requestRunwaySeedanceVideo } from "../runway/client.js";
import type { RunwayStreamResult } from "../runway/client.js";
import { getOperator } from "./operator-registry.js";

export async function executePaidOperator(operatorId: OperatorId): Promise<void> {
  const operator = getOperator(operatorId);
  if (operator.kind !== "paid-api") {
    throw new Error(`Operator ${operatorId} is not a paid API operator.`);
  }

  startJob(operatorId, operator.label);

  switch (operatorId) {
    case "repair-start-state": {
      const plateSketch = await mediaToDataUrl("plate-sketch");
      const prompt = workbench.promptDrafts.repair;
      const result = await requestRunwayInpaint(
        {
          imageDataUrl: plateSketch,
          model: "gpt_image_2",
          ratio: "1920:1920",
          prompt,
          quality: "high",
          outputCount: 1,
          referenceImageTag: "plate_sketch",
          sourceImageTag: "source",
        },
        { onProgress: (stage, progress) => updateJob(operatorId, stage, progress) },
      );
      applyImageResult("start-state", result, operatorId, prompt, "Repaired Start State");
      return;
    }
    case "generate-start-depth": {
      const source = await mediaToDataUrl("start-state");
      const prompt = workbench.promptDrafts.startDepth;
      const result = await requestRunwayDepthMap(
        {
          imageDataUrl: source,
          ratio: "2048:2048",
          prompt,
          outputCount: 1,
        },
        { onProgress: (stage, progress) => updateJob(operatorId, stage, progress) },
      );
      applyImageResult("start-depth", result, operatorId, prompt, "Start Depth");
      return;
    }
    case "reconstruct-end-state": {
      const endpoint = await mediaToDataUrl("displaced-endpoint");
      const start = await mediaToDataUrl("start-state");
      const prompt = workbench.promptDrafts.reconstruct;
      const result = await requestRunwayInpaint(
        {
          imageDataUrl: endpoint,
          sourceImageDataUrl: start,
          sourceFilename: "zenith-start-state-reference.png",
          model: "gpt_image_2",
          ratio: "1920:1920",
          prompt,
          quality: "high",
          outputCount: 1,
          referenceImageTag: "displaced_endpoint",
          sourceImageTag: "start_state",
        },
        { onProgress: (stage, progress) => updateJob(operatorId, stage, progress) },
      );
      applyImageResult("end-state", result, operatorId, prompt, "Reconstructed End State");
      return;
    }
    case "generate-end-depth": {
      const end = await mediaToDataUrl("end-state");
      const prompt = workbench.promptDrafts.endDepth;
      const result = await requestRunwayDepthMap(
        {
          imageDataUrl: end,
          ratio: "2048:2048",
          prompt,
          outputCount: 1,
        },
        { onProgress: (stage, progress) => updateJob(operatorId, stage, progress) },
      );
      applyImageResult("end-depth", result, operatorId, prompt, "End Depth");
      return;
    }
    case "generate-video-take": {
      const start = await mediaToDataUrl("start-state");
      const end = await mediaToDataUrl("end-state");
      const motion = await mediaToDataUrl("motion-draft");
      const prompt = workbench.promptDrafts.video;
      const result = await requestRunwaySeedanceVideo(
        {
          imageDataUrl: start,
          finalImageDataUrl: end,
          videoDataUrl: motion,
          imageFilename: "zenith-image-1-start-state.png",
          finalFilename: "zenith-image-2-end-state.png",
          filename: "zenith-video-1-motion-draft.mp4",
          prompt,
          ratio: "960:960",
          duration: workbench.motionConfig.duration,
        },
        { onProgress: (stage, progress) => updateJob(operatorId, stage, progress) },
      );
      applyVideoResult("video-take", result, operatorId, prompt, "Generated Video Take");
      return;
    }
    default:
      throw new Error(`Paid operator ${operatorId} is not implemented.`);
  }
}

function applyImageResult(
  artifactId: ArtifactSlotId,
  result: RunwayStreamResult,
  operatorId: OperatorId,
  prompt: string,
  label: string,
): void {
  const output = result.outputs?.find((item) => item.dataUri || item.url);
  if (!output) throw new Error("API returned no image output.");
  const media: ArtifactMedia = {
    kind: "image",
    url: output.dataUri || output.url,
    name: output.name || label,
    mime: output.contentType || "image/png",
    alt: label,
    blob: null,
    file: null,
    canvas: null,
  };
  replaceArtifactMedia(artifactId, {
    patch: {
      status: "ready",
      stale: false,
      summary: `${label} ready from ${result.model || "API"}.`,
      operatorId,
      prompt,
      media,
      warnings: [],
    },
    handle: { blob: null, file: null, canvas: null },
    result: { label, media, prompt, operatorId },
  });
  finishJob(operatorId, "Complete");
  selectArtifact(artifactId);
}

function applyVideoResult(
  artifactId: ArtifactSlotId,
  result: RunwayStreamResult,
  operatorId: OperatorId,
  prompt: string,
  label: string,
): void {
  const output = result.outputs?.find((item) => item.dataUri || item.url);
  if (!output) throw new Error("API returned no video output.");
  const media: ArtifactMedia = {
    kind: "video",
    url: output.dataUri || output.url,
    name: output.name || label,
    mime: output.contentType || "video/mp4",
    alt: label,
    blob: null,
    file: null,
    canvas: null,
  };
  replaceArtifactMedia(artifactId, {
    patch: {
      status: "ready",
      stale: false,
      summary: `${label} ready from ${result.model || "Seedance"}.`,
      operatorId,
      prompt,
      media,
      warnings: [],
    },
    handle: { blob: null, file: null, canvas: null },
    result: { label, media, prompt, operatorId },
  });
  finishJob(operatorId, "Complete");
  selectArtifact(artifactId);
}

async function mediaToDataUrl(artifactId: ArtifactSlotId): Promise<string> {
  return readArtifactMediaAsDataUrl(getArtifact(artifactId), getArtifactMediaHandle(artifactId));
}

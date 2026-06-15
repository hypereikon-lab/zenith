import {
  addArtifactResult,
  finishJob,
  getArtifact,
  getArtifactMediaHandle,
  getMediaPreviewHandle,
  recordWorkbenchError,
  replaceArtifacts,
  replaceQcItems,
  selectArtifact,
  setMediaPreview,
  setMediaPreviewHandle,
  setArtifactMediaHandle,
  setProjectionProfile,
  startJob,
  updateArtifact,
  updateJob,
  workbench,
} from "../artifacts/artifact-store.svelte.js";
import { getOperator } from "./operator-registry.js";
import { inpaintPromptForProjection, shouldReplaceWithProjectionInpaintPrompt } from "./app-state.js";
import { requestRunwayDepthMap, requestRunwayInpaint, requestRunwaySeedanceVideo } from "../runway/client.js";
import { downloadBlob } from "../media/canvas-utils.js";
import { normalizeDomeGuideSemanticSplit } from "../geometry/dome-handoff-guide.js";
import {
  defaultSourceGuideCarrierHorizonRadius,
  normalizeSourceGuideCarrierHorizonRadius,
  sourceGuideHasCarrierHorizon,
} from "../geometry/source-guide-semantics.js";
import {
  exportableDepthMotionConfig,
  imageArtifactUrlToCanvas,
  renderDepthMotionProxy,
  renderDisplacedEndpoint,
  type DepthMotionWorkbenchConfig,
} from "../services/depth-motion-service.js";
import type { ArtifactMedia, ArtifactRecord, ArtifactSlotId, OperatorId, QcItem } from "../artifacts/artifact-types.js";
import type { SourceProjectionMode } from "../geometry/source-projection.js";
import type { RunwayStreamResult } from "../runway/client.js";

type ProjectSnapshot = {
  version: 1;
  createdAt: string;
  selectedArtifactId: ArtifactSlotId;
  selectedStageId: typeof workbench.selectedStageId;
  projectionProfile: SourceProjectionMode;
  domeGuideSemanticSplit?: number;
  domeGuideHorizonSplit?: number;
  viewerMode: typeof workbench.viewerMode;
  artifacts: Record<ArtifactSlotId, ArtifactRecord>;
  prompts: typeof workbench.promptDrafts;
  motionConfig: typeof workbench.motionConfig;
  qcItems: QcItem[];
};

let plateSketchCommitHandler: (() => Promise<void>) | null = null;

export function installPlateSketchCommitHandler(handler: (() => Promise<void>) | null): () => void {
  plateSketchCommitHandler = handler;
  return () => {
    if (plateSketchCommitHandler === handler) {
      plateSketchCommitHandler = null;
    }
  };
}

export async function importPlateSketchFile(file: File): Promise<void> {
  const url = URL.createObjectURL(file);
  setArtifactMediaHandle("plate-sketch", { blob: file, file, canvas: null });
  updateArtifact("plate-sketch", {
    status: "ready",
    stale: false,
    summary: `${file.name} imported as Plate Sketch inpaint handoff.`,
    operatorId: "import-plate-sketch",
    media: {
      kind: "image",
      url,
      name: file.name,
      mime: file.type,
      alt: "Imported fulldome Plate Sketch composition handoff",
      blob: null,
      file: null,
      canvas: null,
    },
    warnings: file.type.startsWith("image/") ? [] : ["Plate Sketch should be a square image handoff for inpaint."],
  });
  addArtifactResult("plate-sketch", {
    label: `Imported ${file.name}`,
    media: getArtifact("plate-sketch").media,
    operatorId: "import-plate-sketch",
  });
  selectArtifact("plate-sketch");
}

export async function importSourceFile(file: File): Promise<void> {
  const url = URL.createObjectURL(file);
  const kind = file.type.startsWith("video/") ? "video" : "image";
  setArtifactMediaHandle("start-state", { blob: file, file, canvas: null });
  updateArtifact("start-state", {
    status: "ready",
    stale: false,
    summary: `${file.name} imported as already-clean Start State.`,
    operatorId: "import-source",
    media: {
      kind,
      url,
      name: file.name,
      mime: file.type,
      alt: `Imported ${kind} Start State`,
      blob: null,
      file: null,
      canvas: null,
    },
    warnings: kind === "video" ? ["Video sources should be paused/selected before paid still-image operations."] : [],
  });
  addArtifactResult("start-state", {
    label: `Imported ${file.name}`,
    media: getArtifact("start-state").media,
    operatorId: "import-source",
  });
  selectArtifact("start-state");
}

export async function importDepthFile(artifactId: "start-depth" | "end-depth", file: File): Promise<void> {
  const url = URL.createObjectURL(file);
  const operatorId = artifactId === "start-depth" ? "import-start-depth" : "import-end-depth";
  setArtifactMediaHandle(artifactId, { blob: file, file, canvas: null });
  updateArtifact(artifactId, {
    status: "ready",
    stale: false,
    summary: `${file.name} imported as ${getArtifact(artifactId).label}.`,
    operatorId,
    media: {
      kind: "image",
      url,
      name: file.name,
      mime: file.type,
      alt: `Imported ${getArtifact(artifactId).label}`,
      blob: null,
      file: null,
      canvas: null,
    },
    warnings: file.type.startsWith("image/") ? [] : ["Depth maps should be image files."],
  });
  addArtifactResult(artifactId, {
    label: `Imported ${file.name}`,
    media: getArtifact(artifactId).media,
    operatorId,
  });
  selectArtifact(artifactId);
}

export async function importPreviewMediaFile(file: File): Promise<void> {
  const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : "none";
  if (kind === "none") {
    recordWorkbenchError("Drop an image or video file for Media Preview.", "media-preview");
    return;
  }
  const url = URL.createObjectURL(file);
  setMediaPreviewHandle({ blob: file, file, canvas: null });
  setMediaPreview(
    {
      kind,
      url,
      name: file.name,
      mime: file.type,
      alt: `Imported ${kind} for projection Media Preview`,
      blob: null,
      file: null,
      canvas: null,
    },
    `${file.name} loaded into Media Preview. It has not changed the production artifact graph.`,
  );
}

export async function promotePreviewMedia(targetArtifactId: ArtifactSlotId): Promise<void> {
  const file = getMediaPreviewHandle().file;
  if (!file) {
    recordWorkbenchError("Media Preview does not have a file to promote yet.", "media-preview");
    return;
  }
  if (targetArtifactId === "plate-sketch") {
    await importPlateSketchFile(file);
    return;
  }
  if (targetArtifactId === "start-state") {
    await importSourceFile(file);
    return;
  }
  if (targetArtifactId === "start-depth" || targetArtifactId === "end-depth") {
    await importDepthFile(targetArtifactId, file);
    return;
  }
  if (targetArtifactId === "deliverables") {
    recordWorkbenchError("Media Preview cannot be promoted directly to Deliverables.", "media-preview");
    return;
  }
  await importMediaToArtifact(targetArtifactId, file);
}

async function importMediaToArtifact(
  artifactId: Exclude<ArtifactSlotId, "plate-sketch" | "start-state" | "start-depth" | "end-depth" | "deliverables">,
  file: File,
): Promise<void> {
  const artifact = getArtifact(artifactId);
  const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : "none";
  if (kind === "none") {
    recordWorkbenchError(`Import ${artifact.label} from an image or video file.`, artifactId);
    return;
  }
  if ((artifactId === "displaced-endpoint" || artifactId === "end-state") && kind !== "image") {
    recordWorkbenchError(`${artifact.label} should be imported as a still image.`, artifactId);
    return;
  }
  const url = URL.createObjectURL(file);
  setArtifactMediaHandle(artifactId, { blob: file, file, canvas: null });
  updateArtifact(artifactId, {
    status: "ready",
    stale: false,
    summary: `${file.name} imported as ${artifact.label} from Media Preview.`,
    operatorId: `import-${artifactId}`,
    media: {
      kind,
      url,
      name: file.name,
      mime: file.type,
      alt: `Imported ${artifact.label}`,
      blob: null,
      file: null,
      canvas: null,
    },
    warnings:
      artifactId === "motion-draft" && kind !== "video"
        ? ["Motion Draft is normally a video proxy. A still image can be inspected, but it will not drive video choreography."]
        : [],
  });
  addArtifactResult(artifactId, {
    label: `Imported ${file.name}`,
    media: getArtifact(artifactId).media,
    operatorId: `import-${artifactId}`,
  });
  selectArtifact(artifactId);
}

export function changeProjectionProfile(profile: SourceProjectionMode): void {
  const previousProfile = workbench.projectionProfile;
  const refreshRepairPrompt = shouldReplaceWithProjectionInpaintPrompt(workbench.promptDrafts.repair);
  setProjectionProfile(profile);
  if (sourceGuideHasCarrierHorizon(profile)) {
    const nextHorizon = sourceGuideHasCarrierHorizon(previousProfile)
      ? workbench.domeGuideHorizonSplit
      : defaultSourceGuideCarrierHorizonRadius(profile, workbench.domeGuideSemanticSplit);
    workbench.domeGuideHorizonSplit = normalizeSourceGuideCarrierHorizonRadius(
      profile,
      workbench.domeGuideSemanticSplit,
      nextHorizon,
    );
  } else {
    workbench.domeGuideHorizonSplit = defaultSourceGuideCarrierHorizonRadius(
      profile,
      workbench.domeGuideSemanticSplit,
    );
  }
  if (refreshRepairPrompt) {
    workbench.promptDrafts.repair = inpaintPromptForProjection(
      profile,
      workbench.domeGuideSemanticSplit,
      workbench.domeGuideHorizonSplit,
    );
  }
  updateArtifact("plate-sketch", {
    operatorId: "choose-projection",
    summary: `${projectionLabel(profile)} profile selected.`,
  });
}

export function setDomeGuideSemanticSplit(value: number | string | null | undefined): void {
  const refreshRepairPrompt = shouldReplaceWithProjectionInpaintPrompt(workbench.promptDrafts.repair);
  workbench.domeGuideSemanticSplit = normalizeDomeGuideSemanticSplit(value);
  workbench.domeGuideHorizonSplit = normalizeSourceGuideCarrierHorizonRadius(
    workbench.projectionProfile,
    workbench.domeGuideSemanticSplit,
    workbench.domeGuideHorizonSplit,
  );
  if (refreshRepairPrompt) {
    workbench.promptDrafts.repair = inpaintPromptForProjection(
      workbench.projectionProfile,
      workbench.domeGuideSemanticSplit,
      workbench.domeGuideHorizonSplit,
    );
  }
  updateArtifact("plate-sketch", {
    operatorId: "choose-projection",
    summary: projectionGuideSummary(),
  });
}

export function setDomeGuideHorizonSplit(value: number | string | null | undefined): void {
  const refreshRepairPrompt = shouldReplaceWithProjectionInpaintPrompt(workbench.promptDrafts.repair);
  workbench.domeGuideHorizonSplit = normalizeSourceGuideCarrierHorizonRadius(
    workbench.projectionProfile,
    workbench.domeGuideSemanticSplit,
    value,
  );
  if (refreshRepairPrompt) {
    workbench.promptDrafts.repair = inpaintPromptForProjection(
      workbench.projectionProfile,
      workbench.domeGuideSemanticSplit,
      workbench.domeGuideHorizonSplit,
    );
  }
  updateArtifact("plate-sketch", {
    operatorId: "choose-projection",
    summary: projectionGuideSummary(),
  });
}

export async function executeOperator(operatorId: OperatorId, options: { confirmed?: boolean } = {}): Promise<void> {
  const operator = getOperator(operatorId);
  if (operator.kind === "paid-api" && operator.requiresConfirmation && !options.confirmed) {
    workbench.pendingPaidAction = {
      operatorId,
      label: operator.label,
      body:
        operator.confirmationBody ||
        "This action sends the visible prompt/config and referenced artifacts to a paid API endpoint.",
    };
    return;
  }

  try {
    if (operator.kind === "local") {
      await executeLocalOperator(operatorId);
    } else {
      await executePaidOperator(operatorId);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Operator failed.";
    recordWorkbenchError(message, operatorId);
    finishJob(operatorId, "Failed");
  }
}

export async function confirmPendingPaidAction(): Promise<void> {
  const pending = workbench.pendingPaidAction;
  if (!pending) return;
  workbench.pendingPaidAction = null;
  await executeOperator(pending.operatorId, { confirmed: true });
}

export function cancelPendingPaidAction(): void {
  workbench.pendingPaidAction = null;
}

export async function importProjectSnapshotFile(file: File): Promise<void> {
  const snapshot = JSON.parse(await file.text()) as ProjectSnapshot;
  if (snapshot.version !== 1 || !snapshot.artifacts) {
    throw new Error("This is not a Zenith artifact project snapshot.");
  }
  const restored = {} as Record<ArtifactSlotId, ArtifactRecord>;
  for (const [id, artifact] of Object.entries(snapshot.artifacts)) {
    restored[id as ArtifactSlotId] = {
      ...artifact,
      media: {
        ...artifact.media,
        blob: null,
        file: null,
        canvas: null,
      },
      results: artifact.results.map((result) => ({
        ...result,
        media: {
          ...result.media,
          blob: null as Blob | null,
          file: null as File | null,
          canvas: null as HTMLCanvasElement | null,
        },
      })),
    };
    setArtifactMediaHandle(id as ArtifactSlotId, { blob: null, file: null, canvas: null });
  }
  replaceArtifacts(restored);
  if (snapshot.prompts) Object.assign(workbench.promptDrafts, snapshot.prompts);
  if (snapshot.motionConfig) Object.assign(workbench.motionConfig, snapshot.motionConfig);
  if (snapshot.qcItems) replaceQcItems(snapshot.qcItems);
  if (snapshot.viewerMode) workbench.viewerMode = snapshot.viewerMode;
  if (snapshot.domeGuideSemanticSplit !== undefined) {
    workbench.domeGuideSemanticSplit = normalizeDomeGuideSemanticSplit(snapshot.domeGuideSemanticSplit);
  }
  if (snapshot.domeGuideHorizonSplit !== undefined) {
    workbench.domeGuideHorizonSplit = normalizeSourceGuideCarrierHorizonRadius(
      snapshot.projectionProfile || workbench.projectionProfile,
      workbench.domeGuideSemanticSplit,
      snapshot.domeGuideHorizonSplit,
    );
  }
  if (snapshot.projectionProfile) setProjectionProfile(snapshot.projectionProfile);
  if (snapshot.selectedStageId) workbench.selectedStageId = snapshot.selectedStageId;
  selectArtifact(snapshot.selectedArtifactId || "plate-sketch");
}

async function executeLocalOperator(operatorId: OperatorId): Promise<void> {
  switch (operatorId) {
    case "import-plate-sketch":
      selectArtifact("plate-sketch");
      return;
    case "commit-plates":
      if (plateSketchCommitHandler) {
        await plateSketchCommitHandler();
        return;
      }
      updateArtifact("plate-sketch", {
        status: "ready",
        stale: false,
        summary: "Plate Sketch committed as the inpaint handoff.",
        operatorId,
      });
      addArtifactResult("plate-sketch", {
        label: "Committed Plate Sketch",
        media: getArtifact("plate-sketch").media,
        operatorId,
      });
      selectArtifact("plate-sketch");
      return;
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
    case "inspect-qc":
      selectArtifact("deliverables");
      return;
    case "export-deliverables":
      downloadDeliveryManifest();
      return;
    case "save-project":
      await downloadProjectSnapshot();
      return;
    case "import-source":
    case "import-start-depth":
    case "import-end-depth":
    case "choose-projection":
    case "load-project":
      return;
    default:
      recordWorkbenchError(`Local operator ${operatorId} is not implemented yet.`, operatorId);
  }
}

async function executePaidOperator(operatorId: OperatorId): Promise<void> {
  const operator = getOperator(operatorId);
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
  updateArtifact(artifactId, {
    status: "ready",
    stale: false,
    summary: `${label} ready from ${result.model || "API"}.`,
    operatorId,
    prompt,
    media,
    warnings: [],
  });
  addArtifactResult(artifactId, { label, media, prompt, operatorId });
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
  updateArtifact(artifactId, {
    status: "ready",
    stale: false,
    summary: `${label} ready from ${result.model || "Seedance"}.`,
    operatorId,
    prompt,
    media,
    warnings: [],
  });
  addArtifactResult(artifactId, { label, media, prompt, operatorId });
  finishJob(operatorId, "Complete");
  selectArtifact(artifactId);
}

async function mediaToDataUrl(artifactId: ArtifactSlotId): Promise<string> {
  const media = getArtifact(artifactId).media;
  const handle = getArtifactMediaHandle(artifactId);
  if (media.kind === "none") throw new Error("Artifact has no media.");
  if (media.url?.startsWith("data:")) return media.url;
  if (handle?.canvas) return handle.canvas.toDataURL("image/png");
  if (handle?.blob) return blobToDataUrl(handle.blob);
  if (media.blob) return blobToDataUrl(media.blob);
  if (!media.url) throw new Error("Artifact media is missing a URL.");
  const response = await fetch(media.url);
  if (!response.ok) throw new Error(`Could not read artifact media: ${media.name || media.url}`);
  const blob = await response.blob();
  return blobToDataUrl(blob);
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

async function downloadProjectSnapshot(): Promise<void> {
  const artifacts = {} as Record<ArtifactSlotId, ArtifactRecord>;
  for (const [id, artifact] of Object.entries(workbench.artifacts)) {
    artifacts[id as ArtifactSlotId] = await serializeArtifactRecord(artifact);
  }
  const snapshot: ProjectSnapshot = {
    version: 1,
    createdAt: new Date().toISOString(),
    selectedArtifactId: workbench.selectedArtifactId,
    selectedStageId: workbench.selectedStageId,
    projectionProfile: workbench.projectionProfile,
    domeGuideSemanticSplit: workbench.domeGuideSemanticSplit,
    domeGuideHorizonSplit: workbench.domeGuideHorizonSplit,
    viewerMode: workbench.viewerMode,
    artifacts,
    prompts: jsonClone(workbench.promptDrafts),
    motionConfig: jsonClone(workbench.motionConfig),
    qcItems: jsonClone(workbench.qcItems),
  };
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  downloadBlob(blob, `zenith-artifact-project-${Date.now()}.json`);
}

async function serializeArtifactRecord(artifact: ArtifactRecord): Promise<ArtifactRecord> {
  const media = await serializableMedia(artifact.id, artifact.media, true);
  return {
    ...jsonClone({
      ...artifact,
      media: {
        ...artifact.media,
        blob: null,
        file: null,
        canvas: null,
      },
      results: artifact.results.map((result) => ({
        ...result,
        media: {
          ...result.media,
          blob: null as Blob | null,
          file: null as File | null,
          canvas: null as HTMLCanvasElement | null,
        },
      })),
    }),
    media,
    results: await Promise.all(
      artifact.results.map(async (result) => ({
        ...result,
        media: await serializableMedia(artifact.id, result.media, false),
      })),
    ),
  };
}

async function serializableMedia(
  artifactId: ArtifactSlotId,
  media: ArtifactMedia,
  preferLiveHandle: boolean,
): Promise<ArtifactMedia> {
  const handle = getArtifactMediaHandle(artifactId);
  const cleanMedia: ArtifactMedia = {
    ...media,
    blob: null,
    file: null,
    canvas: null,
  };
  if (media.kind === "none") return cleanMedia;
  if (media.url?.startsWith("data:")) return cleanMedia;
  if (preferLiveHandle && handle?.canvas) {
    return { ...cleanMedia, url: handle.canvas.toDataURL("image/png"), mime: "image/png" };
  }
  if (preferLiveHandle && handle?.blob) {
    return { ...cleanMedia, url: await blobToDataUrl(handle.blob), mime: handle.blob.type || cleanMedia.mime };
  }
  if (media.blob) {
    return { ...cleanMedia, url: await blobToDataUrl(media.blob), mime: media.blob.type || cleanMedia.mime };
  }
  if (!media.url) return cleanMedia;
  const response = await fetch(media.url);
  if (!response.ok) return cleanMedia;
  const blob = await response.blob();
  return { ...cleanMedia, url: await blobToDataUrl(blob), mime: blob.type || cleanMedia.mime };
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function downloadDeliveryManifest(): void {
  const manifest = {
    createdAt: new Date().toISOString(),
    projectionProfile: workbench.projectionProfile,
    domeGuideSemanticSplit: workbench.domeGuideSemanticSplit,
    domeGuideHorizonSplit: workbench.domeGuideHorizonSplit,
    artifacts: Object.fromEntries(
      Object.entries(workbench.artifacts).map(([id, artifact]) => [
        id,
        {
          label: artifact.label,
          status: artifact.status,
          inputs: artifact.inputs,
          operatorId: artifact.operatorId,
          projectionProfile: artifact.projectionProfile,
          prompt: artifact.prompt,
          media: {
            kind: artifact.media.kind,
            name: artifact.media.name,
            mime: artifact.media.mime,
            url: artifact.media.url,
          },
          warnings: artifact.warnings,
          stale: artifact.stale,
          updatedAt: artifact.updatedAt,
        },
      ]),
    ),
    prompts: { ...workbench.promptDrafts },
    motionConfig: { ...workbench.motionConfig },
    qc: workbench.qcItems.map((item) => ({ id: item.id, label: item.label, checked: item.checked })),
  };
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
  downloadBlob(blob, `zenith-delivery-manifest-${Date.now()}.json`);
}

function projectionLabel(profile: SourceProjectionMode): string {
  return profile
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function projectionGuideSummary(): string {
  const inner = Math.round(workbench.domeGuideSemanticSplit * 100);
  if (!sourceGuideHasCarrierHorizon(workbench.projectionProfile)) {
    return `${projectionLabel(workbench.projectionProfile)} profile selected with ${inner}% semantic guide split.`;
  }
  const horizon = Math.round(workbench.domeGuideHorizonSplit * 100);
  return `${projectionLabel(workbench.projectionProfile)} profile selected with ${inner}% inner split and ${horizon}% horizon carrier.`;
}

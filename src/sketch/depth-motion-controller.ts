import { cloneCanvas, downloadBlob, loadCanvasFromImageSource } from "../media/canvas-utils.js";
import { encodeCanvasSequenceMp4, hasWebCodecsMp4Support, supportedMp4VideoConfig } from "../media/webcodecs-mp4.js";
import { isStaleOperationError } from "../operation-manager.js";
import { PLATE_PLACEMENT_MODEL_VERSION } from "../plates/plate-placement.js";
import { clamp } from "../projection.js";
import {
  requestCodexSeedanceImagePrompt,
  requestCodexSeedancePrompt,
  requestRunwayDepthMap,
  requestRunwaySeedanceImageVideo,
  requestRunwaySeedanceVideo,
} from "../runway/client.js";
import { clearProgressButton, setProgressButton } from "../ui/progress-buttons.js";
import { errorMessage } from "../utils/errors.js";
import { createDepthProjectionProfile, normalizeDepthMotionSettings } from "./depth-parallax-renderer.js";
import { createDepthWebGpuPreviewRenderer } from "./depth-webgpu-renderer.js";
import type { OperationToken } from "../operation-manager.js";
import type { RunwayStreamResult } from "../runway/client.js";
import type {
  PlateSource,
  RunwayOutput,
  ScheduleWorkspaceAutosave,
  SeedanceOutput,
  ZenithState,
} from "../app/types.js";
import type { ZenithControls } from "../ui/dom.js";
import type { DepthMotionSettings } from "./depth-parallax-renderer.js";

const DEPTH_MAP_MODEL = "gemini_image3_pro";
const DEPTH_MAP_RATIO = "2048:2048";
type DepthWebGpuPreviewRenderer = ReturnType<typeof createDepthWebGpuPreviewRenderer>;
type Mp4SupportState = "checking" | "available" | "unavailable";
type ProgressHandler = (stage: string, progress: number) => void;
type ProgressButtonOptions = {
  operation: OperationToken;
  button: HTMLButtonElement;
  progressStart: number;
  progressEnd: number;
};
type CodexPromptResult = RunwayStreamResult & {
  diagnosis?: string;
  selectedMode?: string;
  seedancePrompt?: string;
  variants?: {
    strictRepair?: string;
    conservativeLock?: string;
    moreVolumetric?: string;
    ambientSceneMotion?: string;
    sceneEvent?: string;
    materialLife?: string;
  };
};
type DepthGpuExportRenderer = {
  settings: DepthMotionSettings & { size: number };
  renderFrame: (progress: number) => Promise<HTMLCanvasElement>;
  size: number;
};
type ControlValueElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type DepthMotionControllerOptions = {
  state: ZenithState;
  controls: ZenithControls;
  video: HTMLVideoElement;
  elements: {
    runwayDepthMap: HTMLButtonElement;
    previewDepthMotion: HTMLButtonElement;
    exportDepthMotion: HTMLButtonElement;
    codexSeedancePrompt: HTMLButtonElement;
    runwaySeedance: HTMLButtonElement;
    showSeedanceOutput: HTMLButtonElement;
    exportSeedanceOutput: HTMLButtonElement;
    copyDepthMotionConfig: HTMLButtonElement;
    exportDepthMotionConfig: HTMLButtonElement;
    codexImageSeedancePrompt: HTMLButtonElement;
    runwayImageSeedance: HTMLButtonElement;
    seedanceResults: HTMLElement;
    seedancePromptPreview: HTMLElement;
    seedancePromptState: HTMLElement;
    imageSeedancePromptPreview: HTMLElement;
    imageSeedancePromptState: HTMLElement;
    depthMotionReadout: HTMLElement;
  };
  runwayOperations: {
    start: (scope: string, fingerprint: unknown) => OperationToken;
    assertCurrent: (operation: OperationToken, fingerprint?: unknown) => void;
    finish: (operation: OperationToken) => void;
  };
  actions: {
    getRenderDevice?: () => GPUDevice | null;
    loadMediaFile?: (file: File) => Promise<void>;
    displayDepthPreviewTexture?: (texture: GPUTexture, width: number, height: number, name?: string) => void;
    restoreMediaTexture?: () => void;
    scheduleWorkspaceAutosave: ScheduleWorkspaceAutosave;
    saveWorkspaceSnapshot?: (reason: string) => Promise<unknown> | unknown;
  };
};

export function createDepthMotionController({
  state,
  controls,
  video,
  elements,
  runwayOperations,
  actions,
}: DepthMotionControllerOptions) {
  const {
    runwayDepthMap,
    previewDepthMotion,
    exportDepthMotion,
    codexSeedancePrompt,
    runwaySeedance,
    showSeedanceOutput: showSeedanceOutputButton,
    exportSeedanceOutput,
    copyDepthMotionConfig: copyDepthMotionConfigButton,
    exportDepthMotionConfig: exportDepthMotionConfigButton,
    codexImageSeedancePrompt,
    runwayImageSeedance,
    seedanceResults,
    seedancePromptPreview,
    seedancePromptState,
    imageSeedancePromptPreview,
    imageSeedancePromptState,
    depthMotionReadout,
  } = elements;
  let exporting = false;
  let sendingSeedance = false;
  let planningSeedancePrompt = false;
  let planningImageSeedancePrompt = false;
  let generatingDepth = false;
  let generatedSeedancePromptFingerprint = "";
  let generatedImageSeedancePromptFingerprint = "";
  let gpuPreviewRenderer: DepthWebGpuPreviewRenderer | null = null;
  let gpuPreviewActive = false;
  let gpuPreviewPlaying = false;
  let gpuPreviewFrameId = 0;
  let gpuPreviewStartTime = 0;
  let gpuPreviewProgress = 0.55;
  let mp4ExportSupport: Mp4SupportState = hasWebCodecsMp4Support() ? "checking" : "unavailable";
  let mp4ExportSupportMessage = hasWebCodecsMp4Support()
    ? "Checking WebCodecs MP4 encoder"
    : "WebCodecs MP4 export is not available in this browser";

  refreshMp4ExportSupport();

  function setDepthMapCanvas(canvas: HTMLCanvasElement | null, name?: string): void {
    state.depthMapCanvas = canvas ? cloneCanvas(canvas) : null;
    state.depthMapName = state.depthMapCanvas ? name || "Restored depth map" : "";
    state.depthMotionPreviewCanvas = null;
    stopDepthGpuPreview();
    gpuPreviewActive = false;
    actions.restoreMediaTexture?.();
    updateDepthMotionUiState();
  }

  function clearDepthMapState(message = "") {
    if (!state.depthMapCanvas && !state.depthMotionPreviewCanvas && !state.depthPreviewActive) {
      updateDepthMotionUiState();
      return;
    }
    state.depthMapCanvas = null;
    state.depthMapName = "";
    state.depthMotionPreviewCanvas = null;
    stopDepthGpuPreview();
    gpuPreviewActive = false;
    actions.restoreMediaTexture?.();
    updateDepthMotionUiState(message || "Depth map cleared");
  }

  async function previewDepthMotionFrame() {
    if (gpuPreviewPlaying) {
      stopDepthGpuPreview("GPU preview stopped");
      updateDepthMotionUiState({ preserveText: true });
      return;
    }

    const previousText = previewDepthMotion.textContent;
    previewDepthMotion.disabled = true;
    depthMotionReadout.textContent = "Starting GPU preview";

    try {
      try {
        const frame = await startDepthGpuPreviewLoop();
        depthMotionReadout.textContent = `${frame.width} x ${frame.height} realtime WebGPU reprojection in main viewer`;
      } catch (gpuError) {
        previewDepthMotion.textContent = previousText;
        throw gpuError;
      }
      actions.scheduleWorkspaceAutosave("depth-preview", 500);
    } catch (error) {
      console.error(error);
      depthMotionReadout.textContent = errorMessage(error) || "Depth preview failed";
    } finally {
      updateDepthMotionUiState();
    }
  }

  async function runRunwayDepthMap() {
    const sourceCanvas = sourceFrameCanvas();
    if (!sourceCanvas || generatingDepth) return;

    const operation = runwayOperations.start("depth-map", depthMapOperationFingerprint());
    const previousText = runwayDepthMap.textContent;
    generatingDepth = true;
    setProgressButton(runwayDepthMap, depthMotionReadout, "Starting", 0.01);
    updateDepthMotionUiState({ preserveText: true });

    try {
      const result = await requestRunwayDepthMap(
        {
          imageDataUrl: sourceCanvas.toDataURL("image/png"),
          model: DEPTH_MAP_MODEL,
          ratio: DEPTH_MAP_RATIO,
          prompt: controls.depthPrompt.value.trim(),
        },
        {
          signal: operation.signal,
          onProgress: (stage: string, progress: number) =>
            setProgressButton(runwayDepthMap, depthMotionReadout, stage, progress),
        },
      );
      runwayOperations.assertCurrent(operation, depthMapOperationFingerprint());

      const output = result.outputs?.[0];
      if (!output?.dataUri && !output?.url) {
        throw new Error("Runway returned no depth map.");
      }
      const depthCanvas = await loadCanvasFromImageSource(output.dataUri || output.url);
      setDepthMapCanvas(depthCanvas, `Runway depth ${result.model || ""}`.trim());
      controls.depthPolarity.value = "brightFar";
      depthMotionReadout.textContent = `${depthCanvas.width} x ${depthCanvas.height} depth map from ${result.model}`;
      await actions.saveWorkspaceSnapshot?.("depth-map-complete");
      actions.scheduleWorkspaceAutosave("runway-depth", 300);
    } catch (error) {
      if (!isStaleOperationError(error)) {
        console.error(error);
        depthMotionReadout.textContent = errorMessage(error) || "Runway depth failed";
      }
    } finally {
      runwayOperations.finish(operation);
      generatingDepth = false;
      clearProgressButton(runwayDepthMap, previousText);
      updateDepthMotionUiState({ preserveText: true });
    }
  }

  async function exportDepthMotionVideo() {
    if (exporting) return;
    if (mp4ExportSupport !== "available") {
      depthMotionReadout.textContent = mp4ExportSupportMessage;
      return;
    }
    const previousText = exportDepthMotion.textContent;
    exporting = true;
    stopDepthGpuPreview();
    updateDepthMotionUiState();

    try {
      const { blob, settings, duration } = await renderDepthMotionVideoBlob({
        onProgress: (stage: string, progress: number) =>
          setProgressButton(exportDepthMotion, depthMotionReadout, stage, progress),
      });
      downloadBlob(blob, `fulldome-depth-motion-${Date.now()}.mp4`);
      stopDepthGpuPreview();
      gpuPreviewActive = false;
      await renderDepthMotionGpuFrame(1);
      depthMotionReadout.textContent = `${settings.size} square, ${duration}s ${depthGuideModeLabel()} WebGPU MP4 exported`;
      actions.scheduleWorkspaceAutosave("depth-export", 500);
    } catch (error) {
      console.error(error);
      depthMotionReadout.textContent = errorMessage(error) || "Depth motion export failed";
    } finally {
      clearProgressButton(exportDepthMotion, previousText);
      exporting = false;
      updateDepthMotionUiState({ preserveText: true });
    }
  }

  async function planSeedancePrompt() {
    if (planningSeedancePrompt) return;

    const operation = runwayOperations.start("codex-seedance-prompt", codexPromptOperationFingerprint());
    const previousText = codexSeedancePrompt.textContent;
    planningSeedancePrompt = true;
    stopDepthGpuPreview();
    updateDepthMotionUiState();

    try {
      const { result } = await generateSeedancePrompt({
        operation,
        button: codexSeedancePrompt,
        progressStart: 0,
        progressEnd: 1,
      });
      depthMotionReadout.textContent = result.diagnosis || `${promptModeLabel(result.selectedMode)} prompt planned`;
      actions.scheduleWorkspaceAutosave("codex-seedance-prompt", 250);
    } catch (error) {
      if (!isStaleOperationError(error)) {
        console.error(error);
        depthMotionReadout.textContent = errorMessage(error) || "Codex prompt planning failed";
      }
    } finally {
      runwayOperations.finish(operation);
      clearProgressButton(codexSeedancePrompt, previousText);
      planningSeedancePrompt = false;
      updateDepthMotionUiState({ preserveText: true });
    }
  }

  async function sendDepthMotionToSeedance() {
    if (sendingSeedance) return;
    if (mp4ExportSupport !== "available") {
      depthMotionReadout.textContent = mp4ExportSupportMessage;
      return;
    }

    const operation = runwayOperations.start("seedance", seedanceOperationFingerprint());
    const previousText = runwaySeedance.textContent;
    sendingSeedance = true;
    stopDepthGpuPreview();
    updateDepthMotionUiState();

    try {
      const prompt = await ensureSeedancePrompt({
        operation,
        button: runwaySeedance,
        progressStart: 0,
        progressEnd: 0.28,
      });
      const sourceCanvas = sourceFrameCanvas();
      if (!sourceCanvas) {
        throw new Error("Load a still image or pause on a video frame first.");
      }

      const { blob, settings, duration } = await renderDepthMotionVideoBlob({
        onProgress: (stage: string, progress: number) =>
          setProgressButton(runwaySeedance, depthMotionReadout, `Render ${stage}`, 0.28 + progress * 0.27),
      });
      runwayOperations.assertCurrent(operation, seedanceOperationFingerprint());
      if (blob.size > 32 * 1024 * 1024) {
        throw new Error("Seedance input must be 32 MB or smaller. Reduce export size, FPS, or duration.");
      }
      const videoDataUrl = await blobToDataUrl(blob);
      runwayOperations.assertCurrent(operation, seedanceOperationFingerprint());
      const seedanceDuration = seedanceDurationSeconds(duration);

      const result = await requestRunwaySeedanceVideo(
        {
          imageDataUrl: canvasPromptDataUrl(sourceCanvas, { size: 1536, type: "image/png" }),
          imageFilename: `fulldome-seedance-source-${Date.now()}.png`,
          videoDataUrl,
          filename: `fulldome-depth-motion-${settings.size}-${Date.now()}.mp4`,
          prompt,
          ratio: seedanceSquareRatio(settings.size),
          duration: seedanceDuration,
        },
        {
          signal: operation.signal,
          onProgress: (stage: string, progress: number) =>
            setProgressButton(runwaySeedance, depthMotionReadout, stage, 0.55 + progress * 0.45),
        },
      );
      runwayOperations.assertCurrent(operation, seedanceOperationFingerprint());

      const output = result.outputs?.[0];
      if (!output?.dataUri && !output?.url) {
        throw new Error("Runway returned no Seedance video.");
      }
      const outputs = (result.outputs || [])
        .filter((item) => item.dataUri || item.url)
        .map((item, index) => ({
          ...item,
          name: `Seedance ${index + 1}`,
          workflow: "depth-motion-reference",
          prompt,
          model: result.model || "seedance2",
          duration: result.duration || seedanceDuration,
        }));
      const activeOutputIndex = appendSeedanceOutputs(outputs);
      renderSeedanceResults();
      if (state.seedanceOutputs.length > 0) {
        const readyMessage = `${result.model || "Seedance"} ${result.duration || seedanceDuration}s video ready`;
        depthMotionReadout.textContent = readyMessage;
        await actions.saveWorkspaceSnapshot?.("seedance-complete");
        actions.scheduleWorkspaceAutosave("seedance", 500);
        const shown = await showSeedanceOutput(state.activeSeedanceOutputIndex);
        if (shown && activeOutputIndex === state.activeSeedanceOutputIndex) {
          depthMotionReadout.textContent = readyMessage;
        } else if (!shown) {
          depthMotionReadout.textContent = `${readyMessage}; saved in results, but viewer load failed`;
        }
      } else {
        depthMotionReadout.textContent = "Runway returned no Seedance video";
      }
    } catch (error) {
      if (!isStaleOperationError(error)) {
        console.error(error);
        depthMotionReadout.textContent = errorMessage(error) || "Seedance handoff failed";
      }
    } finally {
      runwayOperations.finish(operation);
      clearProgressButton(runwaySeedance, previousText);
      sendingSeedance = false;
      updateDepthMotionUiState({ preserveText: true });
    }
  }

  async function planImageSeedancePrompt() {
    if (planningImageSeedancePrompt) return;

    const operation = runwayOperations.start("codex-seedance-image-prompt", codexImagePromptOperationFingerprint());
    const previousText = codexImageSeedancePrompt.textContent;
    planningImageSeedancePrompt = true;
    stopDepthGpuPreview();
    updateDepthMotionUiState();

    try {
      const { result } = await generateImageSeedancePrompt({
        operation,
        button: codexImageSeedancePrompt,
        progressStart: 0,
        progressEnd: 1,
      });
      depthMotionReadout.textContent =
        result.diagnosis || `${imagePromptModeLabel(result.selectedMode)} image prompt planned`;
      actions.scheduleWorkspaceAutosave("codex-seedance-image-prompt", 250);
    } catch (error) {
      if (!isStaleOperationError(error)) {
        console.error(error);
        depthMotionReadout.textContent = errorMessage(error) || "Codex image prompt planning failed";
      }
    } finally {
      runwayOperations.finish(operation);
      clearProgressButton(codexImageSeedancePrompt, previousText);
      planningImageSeedancePrompt = false;
      updateDepthMotionUiState({ preserveText: true });
    }
  }

  async function sendImageToSeedance() {
    if (sendingSeedance) return;

    const sourceCanvas = sourceFrameCanvas();
    if (!sourceCanvas) {
      depthMotionReadout.textContent = "Load a still image or pause on a video frame first.";
      return;
    }

    const operation = runwayOperations.start("seedance-image", imageSeedanceOperationFingerprint());
    const previousText = runwayImageSeedance.textContent;
    sendingSeedance = true;
    stopDepthGpuPreview();
    updateDepthMotionUiState();

    try {
      const prompt = await ensureImageSeedancePrompt({
        operation,
        button: runwayImageSeedance,
        progressStart: 0,
        progressEnd: 0.28,
      });
      runwayOperations.assertCurrent(operation, imageSeedanceOperationFingerprint());

      const duration = imageSeedanceDurationSeconds();
      const result = await requestRunwaySeedanceImageVideo(
        {
          imageDataUrl: canvasPromptDataUrl(sourceCanvas, { size: 1536, type: "image/png" }),
          filename: `fulldome-seedance-source-${Date.now()}.png`,
          prompt,
          ratio: seedanceImageRatio(sourceCanvas),
          duration,
        },
        {
          signal: operation.signal,
          onProgress: (stage: string, progress: number) =>
            setProgressButton(runwayImageSeedance, depthMotionReadout, stage, 0.28 + progress * 0.72),
        },
      );
      runwayOperations.assertCurrent(operation, imageSeedanceOperationFingerprint());

      const output = result.outputs?.[0];
      if (!output?.dataUri && !output?.url) {
        throw new Error("Runway returned no Seedance image video.");
      }
      const outputs = (result.outputs || [])
        .filter((item) => item.dataUri || item.url)
        .map((item, index) => ({
          ...item,
          name: `Seedance image ${index + 1}`,
          workflow: "image-to-video",
          prompt,
          model: result.model || "seedance2",
          duration: result.duration || duration,
        }));
      const activeOutputIndex = appendSeedanceOutputs(outputs);
      renderSeedanceResults();
      if (state.seedanceOutputs.length > 0) {
        const readyMessage = `${result.model || "Seedance"} image-to-video ready`;
        depthMotionReadout.textContent = readyMessage;
        await actions.saveWorkspaceSnapshot?.("seedance-image-complete");
        actions.scheduleWorkspaceAutosave("seedance-image", 500);
        const shown = await showSeedanceOutput(state.activeSeedanceOutputIndex);
        if (shown && activeOutputIndex === state.activeSeedanceOutputIndex) {
          depthMotionReadout.textContent = readyMessage;
        } else if (!shown) {
          depthMotionReadout.textContent = `${readyMessage}; saved in results, but viewer load failed`;
        }
      } else {
        depthMotionReadout.textContent = "Runway returned no Seedance image video";
      }
    } catch (error) {
      if (!isStaleOperationError(error)) {
        console.error(error);
        depthMotionReadout.textContent = errorMessage(error) || "Seedance image handoff failed";
      }
    } finally {
      runwayOperations.finish(operation);
      clearProgressButton(runwayImageSeedance, previousText);
      sendingSeedance = false;
      updateDepthMotionUiState({ preserveText: true });
    }
  }

  async function showActiveSeedanceOutput() {
    return showSeedanceOutput(state.activeSeedanceOutputIndex);
  }

  async function showSeedanceOutput(index: number): Promise<boolean> {
    const output = state.seedanceOutputs?.[index];
    if (!output) return false;

    showSeedanceOutputButtonBusy(true);
    try {
      const blob = await seedanceOutputBlob(output);
      const filename = `fulldome-seedance-result-${index + 1}-${Date.now()}.mp4`;
      await actions.loadMediaFile?.(new File([blob], filename, { type: blob.type || "video/mp4" }));
      state.activeSeedanceOutputIndex = index;
      renderSeedanceResults();
      depthMotionReadout.textContent = `Showing Seedance result ${index + 1}`;
      actions.scheduleWorkspaceAutosave("seedance-show", 300);
      return true;
    } catch (error) {
      console.error(error);
      depthMotionReadout.textContent = errorMessage(error) || "Could not show Seedance video";
      return false;
    } finally {
      showSeedanceOutputButtonBusy(false);
      updateDepthMotionUiState({ preserveText: true });
    }
  }

  async function exportActiveSeedanceOutput() {
    const index = clamp(
      Math.round(state.activeSeedanceOutputIndex) || 0,
      0,
      Math.max(0, (state.seedanceOutputs?.length || 1) - 1),
    );
    const output = state.seedanceOutputs?.[index];
    if (!output) return;

    exportSeedanceOutput.disabled = true;
    try {
      const blob = await seedanceOutputBlob(output);
      downloadBlob(blob, `fulldome-seedance-result-${index + 1}-${Date.now()}.mp4`);
      depthMotionReadout.textContent = `Exported Seedance result ${index + 1}`;
    } catch (error) {
      console.error(error);
      depthMotionReadout.textContent = errorMessage(error) || "Could not export Seedance video";
    } finally {
      updateDepthMotionUiState({ preserveText: true });
    }
  }

  async function copyDepthMotionConfig() {
    const previousText = copyDepthMotionConfigButton?.textContent || "Copy config";
    if (copyDepthMotionConfigButton) {
      copyDepthMotionConfigButton.disabled = true;
      copyDepthMotionConfigButton.textContent = "Copying";
    }
    try {
      const json = depthMotionConfigJson();
      await copyTextToClipboard(json);
      depthMotionReadout.textContent = "Copied depth motion config JSON";
    } catch (error) {
      console.error(error);
      exportDepthMotionConfig();
      depthMotionReadout.textContent = "Clipboard unavailable; exported config JSON";
    } finally {
      if (copyDepthMotionConfigButton) {
        copyDepthMotionConfigButton.textContent = previousText;
      }
      updateDepthMotionUiState({ preserveText: true });
    }
  }

  function exportDepthMotionConfig() {
    const blob = new Blob([depthMotionConfigJson()], { type: "application/json" });
    downloadBlob(blob, `zenith-depth-motion-config-${Date.now()}.json`);
    depthMotionReadout.textContent = "Exported depth motion config JSON";
  }

  function depthMotionConfigJson() {
    return JSON.stringify(buildDepthMotionConfig(), null, 2);
  }

  function buildDepthMotionConfig() {
    return {
      schema: "zenith.depth-motion-config",
      version: 1,
      exportedAt: new Date().toISOString(),
      source: {
        name: state.sourceName,
        kind: state.mediaKind,
        width: state.sourceWidth,
        height: state.sourceHeight,
        duration: state.mediaDuration,
        fpsEstimate: state.mediaFps,
      },
      depthMap: {
        name: state.depthMapName,
        loaded: Boolean(state.depthMapCanvas),
        width: state.depthMapCanvas?.width || 0,
        height: state.depthMapCanvas?.height || 0,
        model: DEPTH_MAP_MODEL,
      },
      viewer: {
        viewMode: state.viewMode,
        camera: { ...state.camera },
        controls: controlSnapshot([
          "projectionMode",
          "fov",
          "renderScale",
          "meshQuality",
          "radiusScale",
          "rotation",
          "domeTilt",
          "theaterEyeDrop",
          "theaterSeatBack",
          "theaterPitch",
          "customCurve",
          "shellShade",
          "floorOpacity",
          "exposure",
          "overlayOpacity",
          "mirror",
          "showRings",
          "showSpokes",
          "showHorizon",
          "showLabels",
          "showSourceCircle",
          "showZenith",
        ]),
      },
      plateSketch: {
        placementModelVersion: PLATE_PLACEMENT_MODEL_VERSION,
        controls: controlSnapshot(["plateFit", "plateFeather", "editPlacement", "activePlate"]),
        activePlateIndex: state.activePlateIndex,
        plates: state.plates.map((plate: PlateSource) => ({
          name: plate.name,
          width: plate.width,
          height: plate.height,
          aspect: plate.aspect,
        })),
        placements: state.platePlacements,
      },
      inpaint: {
        model: "gpt_image_2",
        prompt: controls.runwayPrompt.value,
        controls: controlSnapshot(["runwayQuality", "runwayOutputCount"]),
        outputCount: state.runwayOutputs.length,
        activeOutputIndex: state.activeRunwayOutputIndex || 0,
        outputs: state.runwayOutputs.map((output: RunwayOutput, index: number) => ({
          index,
          url: output.url || "",
          dataUri: output.dataUri || "",
          contentType: output.contentType || "",
          active: index === state.activeRunwayOutputIndex,
        })),
      },
      depthMotion: {
        prompt: controls.depthPrompt.value,
        controls: controlSnapshot([
          "depthPolarity",
          "depthGuideMode",
          "depthSketchSize",
          "depthNear",
          "depthFar",
          "depthSketchDuration",
          "depthSketchFps",
          "depthMotionGain",
          "depthContrast",
          "depthGuideNoise",
          "depthSketchYaw",
          "depthSketchPitch",
          "depthSketchRoll",
          "depthSketchTruck",
          "depthSketchLift",
          "depthSketchPush",
          "depthSketchGapFill",
        ]),
        normalizedSettings: readDepthMotionSettings(),
      },
      seedance: {
        model: "seedance2",
        promptMode: controls.seedancePromptMode.value,
        generatedPrompt: controls.seedancePrompt.value.trim(),
        generatedPromptFresh: Boolean(
          controls.seedancePrompt.value.trim() &&
          generatedSeedancePromptFingerprint === codexPromptOperationFingerprint(),
        ),
        outputCount: state.seedanceOutputs?.length || 0,
        activeOutputIndex: state.activeSeedanceOutputIndex || 0,
        outputs: serializeSeedanceOutputs(),
        imageToVideo: {
          promptMode: controls.imageSeedancePromptMode.value,
          ratio: controls.imageSeedanceRatio?.value || "auto",
          generatedPrompt: controls.imageSeedancePrompt.value.trim(),
          generatedPromptFresh: Boolean(
            controls.imageSeedancePrompt.value.trim() &&
            generatedImageSeedancePromptFingerprint === codexImagePromptOperationFingerprint(),
          ),
        },
      },
    };
  }

  function controlSnapshot(keys: Array<keyof ZenithControls>) {
    return Object.fromEntries(keys.map((key) => [key, controlValue(controls[key] as ControlValueElement)]));
  }

  function appendSeedanceOutputs(outputs: SeedanceOutput[]): number {
    if (!outputs.length) return -1;
    const startIndex = state.seedanceOutputs?.length || 0;
    state.seedanceOutputs = [...(state.seedanceOutputs || []), ...outputs];
    state.activeSeedanceOutputIndex = startIndex;
    return startIndex;
  }

  function serializeSeedanceOutputs() {
    return (state.seedanceOutputs || []).map((output: SeedanceOutput, index: number) => ({
      index,
      url: output.url || "",
      dataUri: output.dataUri || "",
      contentType: output.contentType || "",
      name: output.name || "",
      model: output.model || "",
      duration: output.duration || 0,
      workflow: output.workflow || "",
      prompt: output.prompt || "",
      active: index === state.activeSeedanceOutputIndex,
    }));
  }

  function controlValue(control: ControlValueElement | null | undefined): string | number | boolean | null {
    if (!control) return null;
    if (isCheckboxControl(control)) return Boolean(control.checked);
    const number = Number(control.value);
    return control.type === "number" || control.type === "range" ? number : control.value;
  }

  async function seedanceOutputBlob(output: SeedanceOutput): Promise<Blob> {
    return output.dataUri ? dataUriToBlob(output.dataUri) : fetchUrlAsBlob(output.url);
  }

  function showSeedanceOutputButtonBusy(busy: boolean): void {
    if (!showSeedanceOutputButton) return;
    showSeedanceOutputButton.disabled = busy || (state.seedanceOutputs?.length || 0) === 0;
  }

  function renderSeedanceResults() {
    if (!seedanceResults) return;
    seedanceResults.replaceChildren();
    (state.seedanceOutputs || []).forEach((output: SeedanceOutput, index: number) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "result-thumb";
      button.classList.toggle("active", index === state.activeSeedanceOutputIndex);
      button.title = `Show Seedance result ${index + 1}`;

      const preview = document.createElement("video");
      preview.src = output.dataUri || output.url;
      preview.muted = true;
      preview.loop = true;
      preview.autoplay = true;
      preview.playsInline = true;
      preview.preload = "metadata";
      preview.setAttribute("aria-label", `Seedance result ${index + 1}`);
      button.append(preview);
      button.addEventListener("click", () => showSeedanceOutput(index));
      seedanceResults.append(button);
    });
    updateDepthMotionUiState({ preserveText: true });
  }

  async function ensureSeedancePrompt({ operation, button, progressStart, progressEnd }: ProgressButtonOptions): Promise<string> {
    const prompt = controls.seedancePrompt.value.trim();
    if (prompt && generatedSeedancePromptFingerprint === codexPromptOperationFingerprint()) {
      syncSeedancePromptPreview();
      return prompt;
    }
    const generated = await generateSeedancePrompt({ operation, button, progressStart, progressEnd });
    return generated.prompt;
  }

  async function generateSeedancePrompt({
    operation,
    button,
    progressStart,
    progressEnd,
  }: ProgressButtonOptions): Promise<{ prompt: string; result: CodexPromptResult }> {
    const fingerprint = codexPromptOperationFingerprint();
    const span = Math.max(0.01, progressEnd - progressStart);
    setProgressButton(button, depthMotionReadout, "Sampling guide", progressStart + span * 0.06);
    syncSeedancePromptPreview("Planning");
    const payload = await buildCodexSeedancePromptPayload();
    const result = await requestCodexSeedancePrompt(payload, {
      signal: operation.signal,
      onProgress: (stage: string, progress: number) =>
        setProgressButton(button, depthMotionReadout, stage, progressStart + progress * span),
    });
    assertCurrentSeedanceWorkflow(operation);
    const prompt = selectedCodexPrompt(result);
    if (!prompt) {
      throw new Error("Codex returned no Seedance prompt.");
    }
    controls.seedancePrompt.value = prompt;
    generatedSeedancePromptFingerprint = fingerprint;
    syncSeedancePromptPreview();
    return { prompt, result };
  }

  async function ensureImageSeedancePrompt({
    operation,
    button,
    progressStart,
    progressEnd,
  }: ProgressButtonOptions): Promise<string> {
    const prompt = controls.imageSeedancePrompt.value.trim();
    if (prompt && generatedImageSeedancePromptFingerprint === codexImagePromptOperationFingerprint()) {
      syncImageSeedancePromptPreview();
      return prompt;
    }
    const generated = await generateImageSeedancePrompt({ operation, button, progressStart, progressEnd });
    return generated.prompt;
  }

  async function generateImageSeedancePrompt({
    operation,
    button,
    progressStart,
    progressEnd,
  }: ProgressButtonOptions): Promise<{ prompt: string; result: CodexPromptResult }> {
    const fingerprint = codexImagePromptOperationFingerprint();
    const span = Math.max(0.01, progressEnd - progressStart);
    setProgressButton(button, depthMotionReadout, "Reading image", progressStart + span * 0.06);
    syncImageSeedancePromptPreview("Planning");
    const payload = buildCodexSeedanceImagePromptPayload();
    const result = await requestCodexSeedanceImagePrompt(payload, {
      signal: operation.signal,
      onProgress: (stage: string, progress: number) =>
        setProgressButton(button, depthMotionReadout, stage, progressStart + progress * span),
    });
    assertCurrentSeedanceWorkflow(operation);
    const prompt = selectedImageCodexPrompt(result);
    if (!prompt) {
      throw new Error("Codex returned no image-to-video prompt.");
    }
    controls.imageSeedancePrompt.value = prompt;
    generatedImageSeedancePromptFingerprint = fingerprint;
    syncImageSeedancePromptPreview();
    return { prompt, result };
  }

  async function renderDepthMotionVideoBlob({ onProgress }: { onProgress: ProgressHandler }) {
    const duration = clamp(Number(controls.depthSketchDuration.value) || 6, 1, 15);
    const fps = clamp(Math.round(Number(controls.depthSketchFps.value) || 12), 6, 30);
    const frameCount = Math.max(2, Math.round(duration * fps));
    const { renderFrame, settings } = await buildDepthGpuExportRenderer();
    const blob = await encodeCanvasSequenceMp4({
      width: settings.size,
      height: settings.size,
      fps,
      frameCount,
      renderFrame,
      onProgress,
    });
    return { blob, settings, duration, fps, frameCount };
  }

  async function buildDepthGpuExportRenderer(): Promise<DepthGpuExportRenderer> {
    const { sourceCanvas, profile, settings, size } = depthRenderInputs();
    const device = actions.getRenderDevice?.();
    if (!device) {
      throw new Error("Main WebGPU renderer is not ready for MP4 export.");
    }
    const outputCanvas = document.createElement("canvas");
    const renderer = createDepthWebGpuPreviewRenderer({ canvas: outputCanvas, device });
    return {
      settings,
      renderFrame: async (progress: number) => {
        await renderer.render({
          sourceCanvas,
          depthCanvas: state.depthMapCanvas,
          profile,
          settings,
          progress,
          waitForCompletion: true,
        });
        return outputCanvas;
      },
      size,
    };
  }

  function depthRenderInputs() {
    const sourceCanvas = sourceFrameCanvas();
    if (!sourceCanvas) {
      throw new Error("Load a still image or pause on a video frame first.");
    }
    if (!state.depthMapCanvas) {
      throw new Error("Generate a depth map first.");
    }

    const size = clamp(Math.round(Number(controls.depthSketchSize.value) || 1024), 256, 1536);
    const profile = createDepthProjectionProfile({
      size,
      radiusScale: Number(controls.radiusScale.value),
      projectionMode: controls.projectionMode.value,
      customCurve: Number(controls.customCurve.value),
    });
    const settings: DepthMotionSettings & { size: number } = {
      ...readDepthMotionSettings(),
      size,
    };
    return { sourceCanvas, profile, settings, size };
  }

  async function renderDepthMotionGpuFrame(progress = 0.55) {
    const { sourceCanvas, profile, settings } = depthRenderInputs();
    if (!gpuPreviewRenderer) {
      const device = actions.getRenderDevice?.();
      if (!device) {
        throw new Error("Main WebGPU renderer is not ready for depth preview.");
      }
      gpuPreviewRenderer = createDepthWebGpuPreviewRenderer({ device });
    }
    const frame = await gpuPreviewRenderer.render({
      sourceCanvas,
      depthCanvas: state.depthMapCanvas,
      profile,
      settings,
      progress,
    });
    if (!frame.texture) {
      throw new Error("Depth preview did not produce a GPU texture.");
    }
    state.depthMotionPreviewCanvas = null;
    gpuPreviewActive = true;
    gpuPreviewProgress = progress;
    actions.displayDepthPreviewTexture?.(frame.texture, frame.width, frame.height, "Depth GPU preview");
    return frame;
  }

  async function startDepthGpuPreviewLoop() {
    const frame = await renderDepthMotionGpuFrame(0);
    gpuPreviewPlaying = true;
    gpuPreviewStartTime = performance.now();
    previewDepthMotion.textContent = "Stop preview";
    gpuPreviewFrameId = requestAnimationFrame(loopDepthGpuPreview);
    return frame;
  }

  function stopDepthGpuPreview(message = "") {
    gpuPreviewPlaying = false;
    cancelAnimationFrame(gpuPreviewFrameId);
    gpuPreviewFrameId = 0;
    previewDepthMotion.textContent = "Play GPU";
    if (message) {
      depthMotionReadout.textContent = message;
    }
  }

  function loopDepthGpuPreview(now: number): void {
    if (!gpuPreviewPlaying) return;
    const durationMs = clamp(Number(controls.depthSketchDuration.value) || 6, 1, 15) * 1000;
    const cycle = durationMs * 2;
    const elapsed = (((now - gpuPreviewStartTime) % cycle) + cycle) % cycle;
    const progress = elapsed <= durationMs ? elapsed / durationMs : 2 - elapsed / durationMs;
    renderDepthMotionGpuFrame(progress)
      .then(() => {
        if (gpuPreviewPlaying) {
          gpuPreviewFrameId = requestAnimationFrame(loopDepthGpuPreview);
        }
      })
      .catch((error) => {
        console.warn(error);
        stopDepthGpuPreview(errorMessage(error) || "WebGPU preview failed");
        updateDepthMotionUiState({ preserveText: true });
      });
  }

  function scheduleDepthGpuPreviewRefresh() {
    syncSeedancePromptPreview();
    syncImageSeedancePromptPreview();
    if (
      !gpuPreviewActive ||
      exporting ||
      sendingSeedance ||
      planningSeedancePrompt ||
      planningImageSeedancePrompt ||
      generatingDepth
    ) {
      return;
    }
    if (gpuPreviewPlaying) return;
    cancelAnimationFrame(gpuPreviewFrameId);
    gpuPreviewFrameId = requestAnimationFrame(() => {
      renderDepthMotionGpuFrame(gpuPreviewProgress).catch((error) => {
        console.warn(error);
        depthMotionReadout.textContent = errorMessage(error) || "WebGPU preview failed";
      });
    });
  }

  function readDepthMotionSettings(): DepthMotionSettings {
    return normalizeDepthMotionSettings({
      nearMeters: Number(controls.depthNear.value),
      farMeters: Number(controls.depthFar.value),
      polarity: controls.depthPolarity.value === "brightNear" ? "brightNear" : "brightFar",
      guideMode: controls.depthGuideMode.value,
      motionGain: Number(controls.depthMotionGain.value),
      depthContrast: Number(controls.depthContrast.value),
      guideNoise: Number(controls.depthGuideNoise.value),
      yawDegrees: Number(controls.depthSketchYaw.value),
      pitchDegrees: Number(controls.depthSketchPitch.value),
      rollDegrees: Number(controls.depthSketchRoll.value),
      truckMeters: Number(controls.depthSketchTruck.value),
      liftMeters: Number(controls.depthSketchLift.value),
      pushMeters: Number(controls.depthSketchPush.value),
      gapFillPasses: Number(controls.depthSketchGapFill.value),
      splatRadius: Number(controls.depthSketchGapFill.value) > 0 ? 1 : 0,
    });
  }

  async function buildCodexSeedancePromptPayload(): Promise<Record<string, unknown>> {
    const sourceCanvas = sourceFrameCanvas();
    if (!sourceCanvas) {
      throw new Error("Load a still image or pause on a video frame first.");
    }
    if (!state.depthMapCanvas) {
      throw new Error("Generate a depth map first.");
    }
    return {
      sourceImageDataUrl: canvasPromptDataUrl(sourceCanvas, { size: 768, type: "image/jpeg", quality: 0.88 }),
      depthImageDataUrl: canvasPromptDataUrl(state.depthMapCanvas, { size: 768, type: "image/png" }),
      motionFrames: await sampleDepthMotionGuideFrames(),
      currentPrompt:
        generatedSeedancePromptFingerprint === codexPromptOperationFingerprint()
          ? controls.seedancePrompt.value.trim()
          : "",
      promptMode: controls.seedancePromptMode.value,
      source: {
        name: state.sourceName,
        kind: state.mediaKind,
        width: state.sourceWidth,
        height: state.sourceHeight,
      },
      depth: {
        name: state.depthMapName,
        width: state.depthMapCanvas.width,
        height: state.depthMapCanvas.height,
        polarity: controls.depthPolarity.value,
        nearMeters: Number(controls.depthNear.value),
        farMeters: Number(controls.depthFar.value),
        contrast: Number(controls.depthContrast.value),
      },
      projection: {
        mode: controls.projectionMode.value,
        radiusScale: Number(controls.radiusScale.value),
        customCurve: Number(controls.customCurve.value),
      },
      guide: {
        look: controls.depthGuideMode.value,
        lookLabel: depthGuideModeLabel(),
        noise: Number(controls.depthGuideNoise.value),
        outsideMask: "pitch black outside the circular domemaster projection",
      },
      motion: {
        durationSeconds: clamp(Number(controls.depthSketchDuration.value) || 6, 1, 15),
        fps: clamp(Math.round(Number(controls.depthSketchFps.value) || 12), 6, 30),
        size: clamp(Math.round(Number(controls.depthSketchSize.value) || 1024), 256, 1536),
        ...readDepthMotionSettings(),
      },
    };
  }

  function buildCodexSeedanceImagePromptPayload(): Record<string, unknown> {
    const sourceCanvas = sourceFrameCanvas();
    if (!sourceCanvas) {
      throw new Error("Load a still image or pause on a video frame first.");
    }
    const fingerprint = codexImagePromptOperationFingerprint();
    const durationSeconds = imageSeedanceDurationSeconds();
    const ratio = seedanceImageRatio(sourceCanvas);
    return {
      sourceImageDataUrl: canvasPromptDataUrl(sourceCanvas, { size: 768, type: "image/jpeg", quality: 0.9 }),
      currentPrompt:
        generatedImageSeedancePromptFingerprint === fingerprint ? controls.imageSeedancePrompt.value.trim() : "",
      promptMode: controls.imageSeedancePromptMode.value,
      durationSeconds,
      ratio,
      source: {
        name: state.sourceName,
        kind: state.mediaKind,
        width: state.sourceWidth,
        height: state.sourceHeight,
      },
      projection: {
        mode: controls.projectionMode.value,
        radiusScale: Number(controls.radiusScale.value),
        customCurve: Number(controls.customCurve.value),
        outsideMask: "preserve pitch black outside the circular domemaster projection when present",
      },
    };
  }

  async function sampleDepthMotionGuideFrames(): Promise<Array<{ label: string; progress: number; imageDataUrl: string }>> {
    const samples = [0, 0.18, 0.36, 0.56, 0.78, 1];
    const { renderFrame } = await buildDepthGpuExportRenderer();
    const frames = [];
    for (const [index, progress] of samples.entries()) {
      const canvas = await renderFrame(progress);
      frames.push({
        label: index === 0 ? "start" : index === samples.length - 1 ? "end" : `mid ${index}`,
        progress,
        imageDataUrl: canvasPromptDataUrl(canvas, { size: 768, type: "image/jpeg", quality: 0.86 }),
      });
    }
    return frames;
  }

  function sourceFrameCanvas(): HTMLCanvasElement | null {
    if (state.sourceCanvas) return state.sourceCanvas;
    if (state.mediaKind !== "video" || !video.videoWidth || !video.videoHeight) return null;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function hasSourceFrame(): boolean {
    return Boolean(state.sourceCanvas || (state.mediaKind === "video" && video.videoWidth && video.videoHeight));
  }

  function imageSeedanceDurationSeconds(): number {
    return seedanceDurationSeconds(controls.depthSketchDuration.value);
  }

  function seedanceDurationSeconds(value: number | string): number {
    return clamp(Math.round(Number(value) || 5), 5, 15);
  }

  function seedanceSquareRatio(size: number): string {
    return Number(size) >= 900 ? "960:960" : "640:640";
  }

  function seedanceImageRatio(sourceCanvas: HTMLCanvasElement): string {
    const selected = controls.imageSeedanceRatio?.value || "auto";
    if (selected !== "auto") return selected;
    const aspect = sourceCanvas.width / Math.max(1, sourceCanvas.height);
    if (Math.abs(aspect - 1) < 0.08) return "960:960";
    return aspect > 1 ? "1280:720" : "720:1280";
  }

  function depthMapOperationFingerprint(): string {
    return [state.sourceName, state.sourceWidth, state.sourceHeight, DEPTH_MAP_MODEL, controls.depthPrompt.value].join(
      "|",
    );
  }

  function seedanceOperationFingerprint(): string {
    return [
      depthMapOperationFingerprint(),
      state.depthMapName,
      controls.seedancePromptMode.value,
      controls.depthPolarity.value,
      controls.depthNear.value,
      controls.depthFar.value,
      controls.depthGuideMode.value,
      controls.depthGuideNoise.value,
      controls.depthSketchSize.value,
      controls.depthSketchDuration.value,
      controls.depthSketchFps.value,
      controls.depthMotionGain.value,
      controls.depthContrast.value,
      controls.depthSketchYaw.value,
      controls.depthSketchPitch.value,
      controls.depthSketchRoll.value,
      controls.depthSketchTruck.value,
      controls.depthSketchLift.value,
      controls.depthSketchPush.value,
      controls.depthSketchGapFill.value,
    ].join("|");
  }

  function codexPromptOperationFingerprint(): string {
    return [
      depthMapOperationFingerprint(),
      state.depthMapName,
      controls.seedancePromptMode.value,
      controls.depthPolarity.value,
      controls.depthNear.value,
      controls.depthFar.value,
      controls.depthGuideMode.value,
      controls.depthGuideNoise.value,
      controls.depthSketchSize.value,
      controls.depthSketchDuration.value,
      controls.depthSketchFps.value,
      controls.depthMotionGain.value,
      controls.depthContrast.value,
      controls.depthSketchYaw.value,
      controls.depthSketchPitch.value,
      controls.depthSketchRoll.value,
      controls.depthSketchTruck.value,
      controls.depthSketchLift.value,
      controls.depthSketchPush.value,
      controls.depthSketchGapFill.value,
    ].join("|");
  }

  function imageSeedanceOperationFingerprint(): string {
    return codexImagePromptOperationFingerprint();
  }

  function codexImagePromptOperationFingerprint(): string {
    return [
      state.sourceName,
      state.sourceWidth,
      state.sourceHeight,
      state.mediaKind,
      controls.imageSeedancePromptMode.value,
      controls.imageSeedanceRatio?.value || "auto",
      controls.projectionMode.value,
      controls.radiusScale.value,
      controls.customCurve.value,
      controls.depthSketchDuration.value,
    ].join("|");
  }

  function updateDepthMotionUiState(options: { preserveText?: boolean } | string = {}) {
    syncSeedancePromptPreview();
    syncImageSeedancePromptPreview();
    const hasSource = hasSourceFrame();
    const ready = Boolean(state.depthMapCanvas && hasSource);
    const hasSeedanceOutput = (state.seedanceOutputs?.length || 0) > 0;
    const busy =
      exporting || sendingSeedance || planningSeedancePrompt || planningImageSeedancePrompt || generatingDepth;
    runwayDepthMap.disabled = busy || !hasSource || state.runwayConfigured === false;
    previewDepthMotion.disabled = busy || !ready;
    exportDepthMotion.disabled = busy || !ready || mp4ExportSupport !== "available";
    codexSeedancePrompt.disabled = busy || !ready;
    runwaySeedance.disabled = busy || !ready || state.runwayConfigured === false || mp4ExportSupport !== "available";
    if (codexImageSeedancePrompt) {
      codexImageSeedancePrompt.disabled = busy || !hasSource;
    }
    if (runwayImageSeedance) {
      runwayImageSeedance.disabled = busy || !hasSource || state.runwayConfigured === false;
    }
    if (showSeedanceOutputButton) {
      showSeedanceOutputButton.disabled = busy || !hasSeedanceOutput;
    }
    if (exportSeedanceOutput) {
      exportSeedanceOutput.disabled = busy || !hasSeedanceOutput;
    }
    if (copyDepthMotionConfigButton) {
      copyDepthMotionConfigButton.disabled = busy;
    }
    if (exportDepthMotionConfigButton) {
      exportDepthMotionConfigButton.disabled = busy;
    }
    if (options && typeof options === "string") {
      depthMotionReadout.textContent = options;
      return;
    }
    previewDepthMotion.textContent = gpuPreviewPlaying ? "Stop preview" : "Play GPU";
    if (typeof options === "object" && options.preserveText) return;
    if (!state.depthMapCanvas) {
      depthMotionReadout.textContent =
        state.runwayConfigured === false ? "Set RUNWAYML_API_SECRET" : "Generate a depth map";
    } else if (!hasSource) {
      depthMotionReadout.textContent = "Load source media";
    } else if (mp4ExportSupport !== "available") {
      depthMotionReadout.textContent = mp4ExportSupportMessage;
    } else {
      const depthSize = `${state.depthMapCanvas.width} x ${state.depthMapCanvas.height}`;
      depthMotionReadout.textContent = `${state.depthMapName || "Depth map"} (${depthSize}), ${depthGuideModeLabel()}`;
    }
  }

  async function refreshMp4ExportSupport() {
    if (!hasWebCodecsMp4Support()) return;
    try {
      const size = clamp(Math.round(Number(controls.depthSketchSize.value) || 1024), 256, 1536);
      const fps = clamp(Math.round(Number(controls.depthSketchFps.value) || 12), 6, 30);
      await supportedMp4VideoConfig({ width: size, height: size, fps });
      mp4ExportSupport = "available";
      mp4ExportSupportMessage = "WebCodecs MP4 export ready";
    } catch (error) {
      mp4ExportSupport = "unavailable";
      mp4ExportSupportMessage = errorMessage(error) || "No MP4-compatible WebCodecs encoder is available in this browser";
    } finally {
      updateDepthMotionUiState({ preserveText: true });
    }
  }

  function assertCurrentSeedanceWorkflow(operation: OperationToken | null | undefined): void {
    if (!operation) return;
    let fingerprint = codexPromptOperationFingerprint();
    if (operation.scope === "seedance") {
      fingerprint = seedanceOperationFingerprint();
    } else if (operation.scope === "seedance-image") {
      fingerprint = imageSeedanceOperationFingerprint();
    } else if (operation.scope === "codex-seedance-image-prompt") {
      fingerprint = codexImagePromptOperationFingerprint();
    }
    runwayOperations.assertCurrent(operation, fingerprint);
  }

  function syncSeedancePromptPreview(forcedState = "") {
    if (!seedancePromptPreview || !seedancePromptState) return;
    const prompt = controls.seedancePrompt.value.trim();
    const fresh = Boolean(prompt && generatedSeedancePromptFingerprint === codexPromptOperationFingerprint());
    seedancePromptPreview.textContent = prompt || "Generated on send";
    seedancePromptPreview.classList.toggle("empty", !prompt);
    seedancePromptPreview.classList.toggle("stale", Boolean(prompt && !fresh));
    seedancePromptState.textContent = forcedState || (!prompt ? "Not planned" : fresh ? "Ready" : "Stale");
  }

  function syncImageSeedancePromptPreview(forcedState = "") {
    if (!imageSeedancePromptPreview || !imageSeedancePromptState) return;
    const prompt = controls.imageSeedancePrompt.value.trim();
    const fresh = Boolean(prompt && generatedImageSeedancePromptFingerprint === codexImagePromptOperationFingerprint());
    imageSeedancePromptPreview.textContent = prompt || "Generated on send";
    imageSeedancePromptPreview.classList.toggle("empty", !prompt);
    imageSeedancePromptPreview.classList.toggle("stale", Boolean(prompt && !fresh));
    imageSeedancePromptState.textContent = forcedState || (!prompt ? "Not planned" : fresh ? "Ready" : "Stale");
  }

  function depthGuideModeLabel() {
    switch (controls.depthGuideMode.value) {
      case "depthShaded":
        return "depth shaded mono";
      case "depthMap":
        return "depth map mono";
      default:
        return "source color";
    }
  }

  function selectedCodexPrompt(result: CodexPromptResult | null | undefined): string {
    if (!result) return "";
    switch (controls.seedancePromptMode.value) {
      case "strict_repair":
        return result.variants?.strictRepair || result.seedancePrompt || "";
      case "conservative_lock":
        return result.variants?.conservativeLock || result.seedancePrompt || "";
      case "more_volumetric":
        return result.variants?.moreVolumetric || result.seedancePrompt || "";
      default:
        return result.seedancePrompt || "";
    }
  }

  function selectedImageCodexPrompt(result: CodexPromptResult | null | undefined): string {
    if (!result) return "";
    switch (controls.imageSeedancePromptMode.value) {
      case "ambient_scene_motion":
        return result.variants?.ambientSceneMotion || result.seedancePrompt || "";
      case "scene_event":
        return result.variants?.sceneEvent || result.seedancePrompt || "";
      case "material_life":
        return result.variants?.materialLife || result.seedancePrompt || "";
      default:
        return result.seedancePrompt || "";
    }
  }

  function promptModeLabel(mode?: string): string {
    switch (mode || controls.seedancePromptMode.value) {
      case "conservative_lock":
        return "Conservative lock";
      case "more_volumetric":
        return "More volumetric";
      default:
        return "Strict repair";
    }
  }

  function imagePromptModeLabel(mode?: string): string {
    switch (mode || controls.imageSeedancePromptMode.value) {
      case "scene_event":
        return "Scene event";
      case "material_life":
        return "Material life";
      default:
        return "Ambient scene";
    }
  }

  return {
    setDepthMapCanvas,
    clearDepthMapState,
    runRunwayDepthMap,
    previewDepthMotionFrame,
    exportDepthMotionVideo,
    planSeedancePrompt,
    sendDepthMotionToSeedance,
    planImageSeedancePrompt,
    sendImageToSeedance,
    showActiveSeedanceOutput,
    exportActiveSeedanceOutput,
    copyDepthMotionConfig,
    exportDepthMotionConfig,
    renderSeedanceResults,
    scheduleDepthGpuPreviewRefresh,
    updateDepthMotionUiState,
  };
}

function canvasPromptDataUrl(
  sourceCanvas: HTMLCanvasElement,
  { size, type, quality }: { size: number; type: string; quality?: number },
): string {
  const scale = Math.min(1, size / Math.max(sourceCanvas.width, sourceCanvas.height));
  const width = Math.max(1, Math.round(sourceCanvas.width * scale));
  const height = Math.max(1, Math.round(sourceCanvas.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
  context.drawImage(sourceCanvas, 0, 0, width, height);
  return canvas.toDataURL(type, quality);
}

function isCheckboxControl(
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): control is HTMLInputElement {
  return control instanceof HTMLInputElement && control.type === "checkbox";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")), { once: true });
    reader.addEventListener("error", () => reject(reader.error || new Error("Could not read generated MP4.")), {
      once: true,
    });
    reader.readAsDataURL(blob);
  });
}

async function dataUriToBlob(dataUri: string): Promise<Blob> {
  const response = await fetch(dataUri);
  if (!response.ok) throw new Error("Could not load Seedance output.");
  return response.blob();
}

async function fetchUrlAsBlob(url = ""): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not download Seedance output.");
  return response.blob();
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error("Clipboard copy failed.");
    }
  } finally {
    textarea.remove();
  }
}


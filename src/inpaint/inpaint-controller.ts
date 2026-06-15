import { downloadCanvasPng, imageBitmapToCanvas, loadCanvasFromImageSource } from "../media/canvas-utils.js";
import { isStaleOperationError } from "../operation-manager.js";
import { clamp } from "../projection.js";
import { requestRunwayInpaint, requestRunwayStatus } from "../runway/client.js";
import { clearProgressButton, setProgressButton } from "../ui/progress-buttons.js";
import { errorMessage } from "../utils/errors.js";
import { createInpaintHandoffCanvases } from "./inpaint-handoff.js";
import type { OperationToken } from "../operation-manager.js";
import type { RunwayOutput, ScheduleWorkspaceAutosave, SetGpuState, ZenithState } from "../app/types.js";
import type { ZenithControls } from "../ui/dom.js";

const INPAINT_MODEL = "gpt_image_2";
const INPAINT_RATIO = "1920:1920";
const INPAINT_QUALITIES = new Set(["auto", "high", "medium", "low"]);

export function createInpaintController({
  state,
  controls,
  elements,
  runwayOperations,
  videoTransport,
  defaultInpaintPrompt,
  actions,
}: {
  state: ZenithState;
  controls: ZenithControls;
  elements: {
    runwayInpaint: HTMLButtonElement;
    useRunwayOutput: HTMLButtonElement;
    exportRunwayOutput: HTMLButtonElement;
    runwayResults: HTMLElement;
    inpaintReadout: HTMLElement;
  };
  runwayOperations: {
    start: (scope: string, fingerprint: unknown) => OperationToken;
    assertCurrent: (operation: OperationToken, fingerprint?: unknown) => void;
    finish: (operation: OperationToken) => void;
    abort: (scope: string, reason?: string) => void;
  };
  videoTransport: {
    setControlsEnabled: (enabled: boolean) => void;
    updateTransport: () => void;
  };
  defaultInpaintPrompt: () => string;
  actions: {
    commitPlateSketchSafely: () => Promise<void>;
    uploadCanvasAsSource: (canvas: HTMLCanvasElement, name: string) => void;
    uploadMediaSource: (
      source: ImageBitmap | HTMLCanvasElement | HTMLVideoElement,
      width: number,
      height: number,
    ) => void;
    updateMediaReadouts: () => void;
    updateDepthMotionUiState?: () => void;
    scheduleWorkspaceAutosave: ScheduleWorkspaceAutosave;
    setGpuState?: SetGpuState;
  };
}) {
  const { runwayInpaint, useRunwayOutput, exportRunwayOutput, runwayResults, inpaintReadout } = elements;

  function useActiveRunwayOutput() {
    return loadRunwayOutput(state.activeRunwayOutputIndex);
  }

  async function ensureInpaintHandoff() {
    if (!state.plateCompositeCanvas || state.plateCompositeDirty) {
      await actions.commitPlateSketchSafely();
    }
    if (!state.plateCompositeCanvas || state.plateCompositeDirty) return null;
    const handoff = createInpaintHandoffCanvases(state.plateCompositeCanvas, {
      sourceProjectionMode: controls.sourceProjection.value,
    });
    state.inpaintWhiteCanvas = handoff.white;
    state.inpaintMaskCanvas = handoff.mask;
    updateInpaintUiState();
    return state.inpaintWhiteCanvas;
  }

  function clearInpaintState() {
    runwayOperations.abort("inpaint", "Inpaint state cleared.");
    state.inpaintWhiteCanvas = null;
    state.inpaintMaskCanvas = null;
    state.runwayOutputs = [];
    state.activeRunwayOutputIndex = 0;
    renderRunwayResults();
    updateInpaintUiState();
  }

  function inpaintOperationFingerprint() {
    return [
      state.plateCompositeCanvas?.width || 0,
      state.plateCompositeCanvas?.height || 0,
      state.plates.length,
      controls.plateFit.value,
      controls.plateFeather.value,
      controls.sourceProjection.value,
      controls.runwayPrompt.value.trim(),
    ].join("|");
  }

  async function runRunwayInpaint() {
    const canvas = await ensureInpaintHandoff();
    if (!canvas) return;

    const operation = runwayOperations.start("inpaint", inpaintOperationFingerprint());
    const previousText = runwayInpaint.textContent;
    runwayInpaint.disabled = true;
    setRunwayButtonProgress("Starting", 0.01);

    try {
      const dataUrl = canvas.toDataURL("image/png");
      const prompt = controls.runwayPrompt.value.trim() || defaultInpaintPrompt();
      const quality = readInpaintQuality();
      const request = {
        imageDataUrl: dataUrl,
        model: INPAINT_MODEL,
        ratio: INPAINT_RATIO,
        prompt,
        quality,
        outputCount: 1,
      };

      const result = await requestRunwayInpaint(request, {
        signal: operation.signal,
        onProgress: setRunwayButtonProgress,
      });
      runwayOperations.assertCurrent(operation, inpaintOperationFingerprint());

      const createdAt = new Date().toISOString();
      state.runwayOutputs = (result.outputs || [])
        .filter((output) => output.dataUri || output.url)
        .map((output, index) => ({
          ...output,
          name: `Runway inpaint ${index + 1}`,
          model: result.model || INPAINT_MODEL,
          ratio: String(result.ratio || INPAINT_RATIO),
          quality,
          prompt,
          createdAt,
          sourceProjectionMode: controls.sourceProjection.value,
        }));
      state.activeRunwayOutputIndex = 0;
      renderRunwayResults();
      if (state.runwayOutputs.length > 0) {
        await loadRunwayOutput(0);
        inpaintReadout.textContent = `${state.runwayOutputs.length} result${state.runwayOutputs.length === 1 ? "" : "s"} from ${result.model}`;
      } else {
        inpaintReadout.textContent = "Runway returned no images";
      }
    } catch (error) {
      if (!handleStaleOperation(error, inpaintReadout)) {
        console.error(error);
        inpaintReadout.textContent = errorMessage(error);
      }
    } finally {
      runwayOperations.finish(operation);
      clearRunwayButtonProgress(previousText);
      updateInpaintUiState();
      actions.scheduleWorkspaceAutosave("inpaint", 300);
    }
  }

  function setRunwayButtonProgress(stage: string, progress: number): void {
    setProgressButton(runwayInpaint, inpaintReadout, stage, progress);
  }

  function clearRunwayButtonProgress(label: string | null): void {
    clearProgressButton(runwayInpaint, label || "Run inpaint");
  }

  async function loadRunwayOutput(index: number): Promise<void> {
    const output = state.runwayOutputs[index];
    if (!output) return;
    const source = output.dataUri || output.url;
    const response = await fetch(source);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const resultCanvas = imageBitmapToCanvas(bitmap);
    actions.uploadMediaSource(bitmap, bitmap.width, bitmap.height);
    state.mediaKind = "image";
    state.sourceWidth = bitmap.width;
    state.sourceHeight = bitmap.height;
    state.sourceName = `Runway inpaint ${index + 1}`;
    state.sourceCanvas = resultCanvas;
    state.mediaDuration = 0;
    videoTransport.setControlsEnabled(false);
    state.activeRunwayOutputIndex = index;
    renderRunwayResults();
    actions.updateMediaReadouts();
    videoTransport.updateTransport();
    actions.scheduleWorkspaceAutosave("runway-output", 250);
  }

  async function exportActiveRunwayOutput() {
    const index = clamp(Math.round(state.activeRunwayOutputIndex) || 0, 0, Math.max(0, state.runwayOutputs.length - 1));
    const output = state.runwayOutputs[index];
    if (!output) return;

    exportRunwayOutput.disabled = true;
    try {
      const source = output.dataUri || output.url;
      const resultCanvas = await loadCanvasFromImageSource(source);
      await downloadCanvasPng(resultCanvas, `fulldome-inpaint-result-${index + 1}-${Date.now()}.png`);
      inpaintReadout.textContent = `Exported result ${index + 1} PNG`;
    } catch (error) {
      console.error(error);
      inpaintReadout.textContent = errorMessage(error) || "Could not export inpaint PNG";
    } finally {
      updateInpaintUiState();
    }
  }

  function renderRunwayResults() {
    runwayResults.replaceChildren();
    state.runwayOutputs.forEach((output: RunwayOutput, index: number) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "result-thumb";
      button.classList.toggle("active", index === state.activeRunwayOutputIndex);
      button.title = `Use result ${index + 1}`;
      const image = document.createElement("img");
      image.alt = `Runway result ${index + 1}`;
      image.src = output.dataUri || output.url;
      button.append(image);
      button.addEventListener("click", () => loadRunwayOutput(index));
      runwayResults.append(button);
    });
  }

  async function checkRunwayStatus() {
    try {
      const status = await requestRunwayStatus();
      if (!status) return;
      state.runwayConfigured = Boolean((status as { configured?: unknown }).configured);
      updateInpaintUiState();
      actions.updateDepthMotionUiState?.();
    } catch {
      state.runwayConfigured = null;
      actions.updateDepthMotionUiState?.();
    }
  }

  function updateInpaintUiState() {
    const hasPlateMap = Boolean(state.plateCompositeCanvas && !state.plateCompositeDirty);
    runwayInpaint.disabled = !hasPlateMap || state.runwayConfigured === false;
    useRunwayOutput.disabled = state.runwayOutputs.length === 0;
    exportRunwayOutput.disabled = state.runwayOutputs.length === 0;
    if (!hasPlateMap) {
      const keyStatus = state.runwayConfigured === false ? "; key missing" : "";
      inpaintReadout.textContent = state.plateCompositeDirty
        ? `Commit GPU map first${keyStatus}`
        : state.plates.length >= 1
          ? `Commit images first${keyStatus}`
          : `Load images${keyStatus}`;
    } else if (state.runwayConfigured === false) {
      inpaintReadout.textContent = "Set RUNWAYML_API_SECRET";
    }
    controls.runwayQuality.disabled = false;
    controls.runwayOutputCount.value = "1";
    controls.runwayOutputCount.disabled = true;
    controls.runwayOutputCount.max = "1";
  }

  function readInpaintQuality() {
    const quality = controls.runwayQuality.value;
    return INPAINT_QUALITIES.has(quality) ? quality : "high";
  }

  function handleStaleOperation(
    error: unknown,
    readout: HTMLElement,
    message = "Ignored outdated Runway result",
  ): boolean {
    if (!isStaleOperationError(error)) return false;
    readout.textContent = message;
    return true;
  }

  return {
    useActiveRunwayOutput,
    ensureInpaintHandoff,
    clearInpaintState,
    runRunwayInpaint,
    loadRunwayOutput,
    exportActiveRunwayOutput,
    renderRunwayResults,
    checkRunwayStatus,
    updateInpaintUiState,
  };
}

import {
  downloadCanvasPng,
  imageBitmapToCanvas,
  loadCanvasFromImageSource,
} from "../media/canvas-utils.js";
import { isStaleOperationError } from "../operation-manager.js";
import { clamp } from "../projection.js";
import { requestRunwayInpaint, requestRunwayStatus } from "../runway/client.js";
import { clearProgressButton, setProgressButton } from "../ui/progress-buttons.js";

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
}) {
  const {
    runwayInpaint,
    useRunwayOutput,
    exportRunwayOutput,
    runwayResults,
    inpaintReadout,
  } = elements;

  function useActiveRunwayOutput() {
    return loadRunwayOutput(state.activeRunwayOutputIndex);
  }

  async function ensureInpaintHandoff() {
    if (!state.plateCompositeCanvas || state.plateCompositeDirty) {
      await actions.commitPlateSketchSafely();
    }
    if (!state.plateCompositeCanvas || state.plateCompositeDirty) return null;
    if (!state.inpaintWhiteCanvas || !state.inpaintMaskCanvas) {
      const handoff = createInpaintHandoffCanvases(state.plateCompositeCanvas);
      state.inpaintWhiteCanvas = handoff.white;
      state.inpaintMaskCanvas = handoff.mask;
    }
    updateInpaintUiState();
    return state.inpaintWhiteCanvas;
  }

  function createInpaintHandoffCanvases(sourceCanvas) {
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
    const source = sourceContext.getImageData(0, 0, width, height);
    const whiteCanvas = document.createElement("canvas");
    const maskCanvas = document.createElement("canvas");
    whiteCanvas.width = width;
    whiteCanvas.height = height;
    maskCanvas.width = width;
    maskCanvas.height = height;

    const whiteContext = whiteCanvas.getContext("2d", { willReadFrequently: true });
    const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
    const whiteImage = whiteContext.createImageData(width, height);
    const maskImage = maskContext.createImageData(width, height);
    const src = source.data;
    const dst = whiteImage.data;
    const mask = maskImage.data;

    for (let index = 0; index < src.length; index += 4) {
      const alpha = src[index + 3] / 255;
      const missing = 255 - src[index + 3];
      dst[index] = Math.round(src[index] + 255 * (1 - alpha));
      dst[index + 1] = Math.round(src[index + 1] + 255 * (1 - alpha));
      dst[index + 2] = Math.round(src[index + 2] + 255 * (1 - alpha));
      dst[index + 3] = 255;
      mask[index] = missing;
      mask[index + 1] = missing;
      mask[index + 2] = missing;
      mask[index + 3] = 255;
    }

    whiteContext.putImageData(whiteImage, 0, 0);
    maskContext.putImageData(maskImage, 0, 0);
    return { white: whiteCanvas, mask: maskCanvas };
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
      const request = {
        imageDataUrl: dataUrl,
        model: INPAINT_MODEL,
        ratio: INPAINT_RATIO,
        prompt: controls.runwayPrompt.value.trim() || defaultInpaintPrompt,
        quality: readInpaintQuality(),
        outputCount: 1,
      };

      const result = await requestRunwayInpaint(request, {
        signal: operation.signal,
        onProgress: setRunwayButtonProgress,
      });
      runwayOperations.assertCurrent(operation, inpaintOperationFingerprint());

      state.runwayOutputs = (result.outputs || []).filter((output) => output.dataUri || output.url);
      state.activeRunwayOutputIndex = 0;
      renderRunwayResults();
      if (state.runwayOutputs.length > 0) {
        await loadRunwayOutput(0);
        inpaintReadout.textContent = `${state.runwayOutputs.length} result${state.runwayOutputs.length === 1 ? "" : "s"} from ${result.model}`;
      } else {
        inpaintReadout.textContent = "Runway returned no images";
      }
      await actions.saveWorkspaceSnapshot?.("inpaint-complete");
    } catch (error) {
      if (!handleStaleOperation(error, inpaintReadout)) {
        console.error(error);
        inpaintReadout.textContent = error.message;
      }
    } finally {
      runwayOperations.finish(operation);
      clearRunwayButtonProgress(previousText);
      updateInpaintUiState();
      actions.scheduleWorkspaceAutosave("inpaint", 300);
    }
  }

  function setRunwayButtonProgress(stage, progress) {
    setProgressButton(runwayInpaint, inpaintReadout, stage, progress);
  }

  function clearRunwayButtonProgress(label) {
    clearProgressButton(runwayInpaint, label);
  }

  async function loadRunwayOutput(index) {
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
      inpaintReadout.textContent = error.message || "Could not export inpaint PNG";
    } finally {
      updateInpaintUiState();
    }
  }

  function renderRunwayResults() {
    runwayResults.replaceChildren();
    state.runwayOutputs.forEach((output, index) => {
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
      state.runwayConfigured = Boolean(status.configured);
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

  function handleStaleOperation(error, readout, message = "Ignored outdated Runway result") {
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

import {
  DEFAULT_DEPTH_PROMPT,
  DEFAULT_INPAINT_PROMPT,
  VERSION_STORAGE_KEY,
  VIEW_LABELS,
  createInitialState,
} from "./app/app-state.js";
import { createViewController } from "./app/view-controller.js";
import { DEMO_SEEDANCE_OUTPUTS } from "./app/demo-seedance-outputs.js";
import { DEFAULT_PLATE_REFERENCES, applyDefaultControlValues } from "./app/default-profile.js";
import { createDomeRenderer } from "./graphics/renderer.js";
import { createViewCamera } from "./graphics/view-camera.js";
import { createInpaintController } from "./inpaint/inpaint-controller.js";
import { downloadBlob } from "./media/canvas-utils.js";
import { createMediaController } from "./media/media-controller.js";
import { createVideoTransport } from "./media/video-transport.js";
import { OperationManager } from "./operation-manager.js";
import { createPlateController } from "./plates/plate-controller.js";
import { queryZenithDom } from "./ui/dom.js";
import { applyWorkspaceDom, bindZenithEvents } from "./ui/events.js";
import { drawZenithHud } from "./ui/hud-renderer.js";
import { createPointerToolController } from "./ui/pointer-tools.js";
import { errorMessage } from "./utils/errors.js";
import { createDepthMotionController } from "./sketch/depth-motion-controller.js";
import { createDemoTourController } from "./capture/demo-tour-controller.js";
import { createWorkspaceSessionRepository, WORKSPACE_AUTOSAVE_DELAY_MS } from "./workspace/session-repository.js";
import { createVersionController } from "./workspace/version-controller.js";
import { formatVersionDate } from "./workspace/version-utils.js";
import {
  applyWorkspaceSnapshot as hydrateWorkspaceSnapshot,
  createWorkspaceSnapshot as buildWorkspaceSnapshot,
} from "./workspace/workspace-snapshot.js";
import { createViewCaptureController } from "./capture/view-capture-controller.js";
import type { RunwayOutput, SeedanceOutput, WorkspaceId } from "./app/types.js";
import type { CssLayout } from "./graphics/render-layout.js";
import type { HudOptions } from "./ui/hud-renderer.js";

type WorkspaceSnapshot = Awaited<ReturnType<typeof buildWorkspaceSnapshot>>;
type PortableWorkspaceSnapshot = Record<string, unknown> & {
  media: Record<string, unknown> & { sourceCanvas?: Blob | string | null };
  canvases: Record<string, unknown> & { plateComposite?: Blob | string | null };
  depthMotion: Record<string, unknown> & { depthMap?: Blob | string | null };
  plates: Array<Record<string, unknown> & { image?: Blob | string | null }>;
};

const domeForgeDom = queryZenithDom();
const {
  canvas,
  demoCursor,
  gpuState,
  workflowSteps,
  flowSourceState,
  flowPlateState,
  flowInpaintState,
  flowMotionState,
  flowExportState,
  commitPlateMap,
  exportPlateMap,
  platesReadout,
  patchEditor,
  patchTransform,
  autoArrangePatches,
  resetPatch,
  resetPatchWarp,
  flipPatchX,
  flipPatchY,
  runwayInpaint,
  useRunwayOutput,
  exportRunwayOutput,
  runwayResults,
  inpaintReadout,
  runwayDepthMap,
  previewDepthMotion,
  exportDepthMotion,
  codexSeedancePrompt,
  runwaySeedance,
  showSeedanceOutput,
  exportSeedanceOutput,
  copyDepthMotionConfig,
  exportDepthMotionConfig,
  codexImageSeedancePrompt,
  runwayImageSeedance,
  seedanceResults,
  seedancePromptPreview,
  seedancePromptState,
  seedanceStillReference,
  seedanceMotionReference,
  depthMotionPresetDescription,
  imageSeedancePromptPreview,
  imageSeedancePromptState,
  imageSeedanceReference,
  depthMotionReadout,
  saveWorkspace,
  restoreWorkspace,
  clearWorkspace,
  sessionReadout,
  saveVersion,
  applyVersion,
  deleteVersion,
  exportVersion,
  importVersion,
  versionSelect,
  versionGallery,
  versionReadout,
  playToggle,
  stepBack,
  stepForward,
  timeline,
  playbackRate,
  timeReadout,
  video,
  dropOverlay,
  sidePanel,
  viewButtons,
  sourceReadout,
  mediaReadout,
  viewReadout,
  uploadReadout,
  captureSquareFrame,
  recordCanvas,
  demoPlateCompose,
  demoViewTour,
  demoInpaintPulse,
  captureReadout,
  controls,
} = domeForgeDom;

applyDefaultControlValues(controls);
controls.runwayPrompt.value = DEFAULT_INPAINT_PROMPT;
controls.depthPrompt.value = DEFAULT_DEPTH_PROMPT;
controls.seedancePrompt.value = "";
controls.imageSeedancePrompt.value = "";

const state = createInitialState();

const runwayOperations = new OperationManager();
const workspaceSession = createWorkspaceSessionRepository();
const viewCamera = createViewCamera({ state, controls });
const videoTransport = createVideoTransport({
  video,
  state,
  elements: {
    playToggle,
    stepBack,
    stepForward,
    timeline,
    playbackRate,
    timeReadout,
  },
  actions: {
    setGpuState,
  },
});
const viewController = createViewController({
  state,
  controls,
  viewLabels: VIEW_LABELS,
  elements: {
    viewButtons,
    viewReadout,
  },
  actions: {
    scheduleWorkspaceAutosave,
  },
});
const renderer = createDomeRenderer({
  dom: domeForgeDom,
  state,
  controls,
  video,
  videoTransport,
  viewCamera,
  actions: {
    setGpuState,
    updateMediaReadouts: () => mediaController.updateMediaReadouts(),
    drawHud: drawZenithHud,
    buildHudOptions,
  },
});
const mediaController = createMediaController({
  state,
  video,
  videoTransport,
  renderer,
  runwayOperations,
  elements: {
    sourceReadout,
    mediaReadout,
    uploadReadout,
    playbackRate,
  },
  actions: {
    setGpuState,
    clearDepthMapState: (message) => depthMotionController?.clearDepthMapState(message),
    scheduleWorkspaceAutosave,
  },
});
const inpaintController = createInpaintController({
  state,
  controls,
  runwayOperations,
  videoTransport,
  defaultInpaintPrompt: DEFAULT_INPAINT_PROMPT,
  elements: {
    runwayInpaint,
    useRunwayOutput,
    exportRunwayOutput,
    runwayResults,
    inpaintReadout,
  },
  actions: {
    commitPlateSketchSafely: () => plateController.commitPlateSketchSafely(),
    uploadCanvasAsSource: mediaController.uploadCanvasAsSource,
    uploadMediaSource: mediaController.uploadMediaSource,
    updateMediaReadouts: mediaController.updateMediaReadouts,
    updateDepthMotionUiState: () => depthMotionController?.updateDepthMotionUiState(),
    scheduleWorkspaceAutosave,
    saveWorkspaceSnapshot: saveWorkspaceSnapshotNow,
  },
});
const depthMotionController = createDepthMotionController({
  state,
  controls,
  video,
  runwayOperations,
  elements: {
    runwayDepthMap,
    previewDepthMotion,
    exportDepthMotion,
    codexSeedancePrompt,
    runwaySeedance,
    showSeedanceOutput,
    exportSeedanceOutput,
    copyDepthMotionConfig,
    exportDepthMotionConfig,
    codexImageSeedancePrompt,
    runwayImageSeedance,
    seedanceResults,
    seedancePromptPreview,
    seedancePromptState,
    depthMotionPresetDescription,
    imageSeedancePromptPreview,
    imageSeedancePromptState,
    depthMotionReadout,
  },
  actions: {
    getRenderDevice: renderer.getDevice,
    loadMediaFile: mediaController.loadMediaFileSafely,
    displayDepthPreviewTexture: mediaController.displayDepthPreviewTexture,
    restoreMediaTexture: mediaController.restoreMediaTexture,
    scheduleWorkspaceAutosave,
    saveWorkspaceSnapshot: saveWorkspaceSnapshotNow,
  },
});
const plateController = createPlateController({
  state,
  controls,
  video,
  videoTransport,
  renderer,
  elements: {
    commitPlateMap,
    exportPlateMap,
    platesReadout,
    patchEditor,
    patchTransform,
    autoArrangePatches,
    resetPatch,
    resetPatchWarp,
    flipPatchX,
    flipPatchY,
  },
  actions: {
    abortInpaint: (message) => runwayOperations.abort("inpaint", message),
    clearInpaintState: inpaintController.clearInpaintState,
    setGpuState,
    setViewMode: viewController.setViewMode,
    uploadCanvasAsSource: mediaController.uploadCanvasAsSource,
    displayTextureAsSource: mediaController.displayTextureAsSource,
    updateInpaintUiState: inpaintController.updateInpaintUiState,
    updateVersionUi: () => versionController.updateVersionUi(),
    scheduleWorkspaceAutosave,
  },
});
const versionController = createVersionController({
  storageKey: VERSION_STORAGE_KEY,
  defaultInpaintPrompt: DEFAULT_INPAINT_PROMPT,
  state,
  controls,
  elements: {
    versionSelect,
    versionGallery,
    versionReadout,
    saveVersion,
    applyVersion,
    deleteVersion,
    exportVersion,
    importVersion,
  },
  actions: {
    commitPlateSketchSafely: plateController.commitPlateSketchSafely,
    ensurePlatePlacements: plateController.ensurePlatePlacements,
    resolvedPlateCount: plateController.resolvedPlateCount,
    scheduleWorkspaceAutosave,
    updatePlateSelect: plateController.updatePlateSelect,
    updatePatchControlsFromActive: plateController.updatePatchControlsFromActive,
    updatePlateLayoutUi: plateController.updatePlateLayoutUi,
  },
});
const pointerTools = createPointerToolController({
  canvas,
  state,
  controls,
  getCssLayout,
  activeDomeCamera: viewCamera.activeDomeCamera,
  currentDomeViewMatrix: viewCamera.currentDomeViewMatrix,
  actions: {
    ensurePlatePlacements: plateController.ensurePlatePlacements,
    resolvedPlateCount: plateController.resolvedPlateCount,
    updatePatchControlsFromActive: plateController.updatePatchControlsFromActive,
    updatePlateSelect: plateController.updatePlateSelect,
    renderPlatePreviewNow: plateController.renderPlatePreviewNow,
    schedulePlatePreview: plateController.schedulePlatePreview,
    scheduleWorkspaceAutosave,
  },
});
const viewCaptureController = createViewCaptureController({
  renderer,
  elements: {
    captureSquareFrame,
    recordCanvas,
    captureReadout,
  },
});
const demoTourController = createDemoTourController({
  state,
  controls,
  video,
  elements: {
    demoPlateCompose,
    demoViewTour,
    demoInpaintPulse,
    demoCursor,
    captureReadout,
  },
  actions: {
    setWorkspace,
    setViewMode: viewController.setViewMode,
    updateTransport: videoTransport.updateTransport,
    displayTemporaryCanvas: mediaController.displayTemporaryCanvas,
    restoreMediaTexture: mediaController.restoreMediaTexture,
    updateMediaReadouts: mediaController.updateMediaReadouts,
    updatePatchControlsFromActive: plateController.updatePatchControlsFromActive,
    updatePlateSelect: plateController.updatePlateSelect,
    schedulePlatePreview: plateController.schedulePlatePreview,
    onPlateComposeComplete: () => {
      if (viewCaptureController?.isRecording?.()) {
        viewCaptureController.stopRecording();
      }
    },
    onViewTourComplete: () => {
      if (viewCaptureController?.isRecording?.()) {
        viewCaptureController.stopRecording();
      }
    },
    setPulseButtonText: (text: string) => {
      demoInpaintPulse.textContent = text;
    },
  },
});

async function init() {
  await renderer.initialize();
  await mediaController.loadDefaultTexture();
  versionController.loadSavedVersions();
  const restored = await restoreWorkspaceAutosave({ silent: true });
  if (!restored) {
    await refreshWorkspaceAutosaveStatus();
    await loadDefaultPlateReferences();
  }
  await loadDemoSeedanceOutputs();
  bindEvents();
  renderer.resize();
  plateController.updatePlateLayoutUi();
  versionController.updateVersionUi();
  updateWorkspaceUi();
  updateWorkflowStatus();
  viewController.updateUiState();
  depthMotionController.updateDepthMotionUiState();
  inpaintController.checkRunwayStatus().finally(() => depthMotionController.updateDepthMotionUiState());
  setGpuState("Ready", false);
  renderer.startFrameLoop();
  window.setInterval(updateWorkflowStatus, 700);
}

async function loadDefaultPlateReferences() {
  if (state.plates.length > 0 || DEFAULT_PLATE_REFERENCES.length < 1) return;
  try {
    const files = await Promise.all(
      DEFAULT_PLATE_REFERENCES.map(async (reference) => {
        const response = await fetch(reference.url);
        if (!response.ok) {
          throw new Error(`Could not load default plate reference: ${reference.name}`);
        }
        const blob = await response.blob();
        return new File([blob], reference.name, { type: blob.type || "image/png" });
      }),
    );
    await workspaceSession.withHydration(() => plateController.loadPlateFiles(files));
  } catch (error) {
    console.error(error);
    platesReadout.textContent = errorMessage(error) || "Could not load default plate references";
  }
}

async function loadDemoSeedanceOutputs() {
  if ((state.seedanceOutputs?.length || 0) > 0 || DEMO_SEEDANCE_OUTPUTS.length < 1) return;
  const available = [];
  for (const output of DEMO_SEEDANCE_OUTPUTS) {
    try {
      const response = await fetch(output.url, { method: "HEAD" });
      if (response.ok) {
        available.push({ ...output, duration: 0 });
      }
    } catch (error) {
      console.warn(`Could not load demo Seedance output: ${output.name}`, error);
    }
  }
  if (available.length < 1) return;
  state.seedanceOutputs = available;
  state.activeSeedanceOutputIndex = 0;
  depthMotionController.renderSeedanceResults();
  await saveWorkspaceSnapshotNow("demo-seedance-outputs");
}

async function refreshWorkspaceAutosaveStatus() {
  try {
    const snapshot = (await workspaceSession.loadSnapshot()) as WorkspaceSnapshot | null;
    state.workspaceSavedAt = snapshot?.savedAt || null;
  } catch (error) {
    console.error(error);
    state.workspaceSavedAt = null;
  }
  updateWorkspaceUi();
}

function bindEvents() {
  bindZenithEvents(domeForgeDom, eventActions());
}

function eventActions() {
  return {
    resize: renderer.resize,
    loadMediaFile: mediaController.loadMediaFileSafely,
    loadPlateFiles: plateController.loadPlateFiles,
    commitPlateSketch: plateController.commitPlateSketchSafely,
    exportPlateMap: plateController.exportPlateMapImage,
    runRunwayInpaint: inpaintController.runRunwayInpaint,
    useActiveRunwayOutput: inpaintController.useActiveRunwayOutput,
    exportActiveRunwayOutput: inpaintController.exportActiveRunwayOutput,
    runRunwayDepthMap: depthMotionController.runRunwayDepthMap,
    previewDepthMotion: depthMotionController.previewDepthMotionFrame,
    exportDepthMotion: depthMotionController.exportDepthMotionVideo,
    planSeedancePrompt: depthMotionController.planSeedancePrompt,
    sendDepthMotionToSeedance: depthMotionController.sendDepthMotionToSeedance,
    showActiveSeedanceOutput: depthMotionController.showActiveSeedanceOutput,
    exportActiveSeedanceOutput: depthMotionController.exportActiveSeedanceOutput,
    copyDepthMotionConfig: depthMotionController.copyDepthMotionConfig,
    exportDepthMotionConfig: depthMotionController.exportDepthMotionConfig,
    planImageSeedancePrompt: depthMotionController.planImageSeedancePrompt,
    sendImageToSeedance: depthMotionController.sendImageToSeedance,
    applyDepthMotionPreset: depthMotionController.applyDepthMotionPreset,
    handleDepthMotionControlInput: depthMotionController.handleDepthMotionControlInput,
    setWorkspace,
    saveWorkspaceSnapshot: saveWorkspaceSnapshotNow,
    exportWorkspaceState,
    restoreWorkspaceAutosave,
    clearWorkspaceAutosave,
    saveCurrentVersion: versionController.saveCurrentVersion,
    applySelectedVersion: versionController.applySelectedVersion,
    deleteSelectedVersion: versionController.deleteSelectedVersion,
    exportSelectedVersion: versionController.exportSelectedVersion,
    updateVersionUi: versionController.updateVersionUi,
    importVersionFile: versionController.importVersionFile,
    handlePlacementEditChange: plateController.handlePlacementEditChange,
    handleActivePlateChange: plateController.handleActivePlateChange,
    handlePatchTransformInput: plateController.handlePatchTransformInput,
    handleAutoArrangePatches: plateController.handleAutoArrangePatches,
    handleResetPatch: plateController.handleResetPatch,
    handleResetPatchWarp: plateController.handleResetPatchWarp,
    handleFlipPatchX: plateController.handleFlipPatchX,
    handleFlipPatchY: plateController.handleFlipPatchY,
    handlePlateCountFitChange: plateController.handlePlateCountFitChange,
    handlePlatePreviewControlInput: plateController.handlePlatePreviewControlInput,
    setViewMode: viewController.setViewMode,
    lookAtPreset: viewController.lookAtPreset,
    captureFrame: () => renderer.captureFrame(downloadBlob),
    captureSquareFrame: viewCaptureController.exportSquareFrame,
    toggleCanvasRecording: viewCaptureController.toggleCanvasRecording,
    playPlateComposeDemo: demoTourController.playPlateComposeDemo,
    playViewTour: demoTourController.playViewTour,
    playInpaintPulse: demoTourController.playInpaintPulse,
    exportPreset: viewController.exportPreset,
    toggleVideo: videoTransport.toggleVideo,
    stepVideo: videoTransport.stepVideo,
    handlePlaybackRateChange: videoTransport.handlePlaybackRateChange,
    handleMeshQualityInput: renderer.createDomeGeometry,
    handleTimelinePointerDown: videoTransport.handleTimelinePointerDown,
    handleTimelineInput: videoTransport.handleTimelineInput,
    handleTimelinePointerUp: videoTransport.handleTimelinePointerUp,
    handleTimelineChange: videoTransport.handleTimelineChange,
    updateTransport: videoTransport.updateTransport,
    handleVideoSeeked: videoTransport.handleVideoSeeked,
    handleCanvasPointerDown: pointerTools.handlePointerDown,
    handleCanvasPointerMove: pointerTools.handlePointerMove,
    handleCanvasPointerUp: pointerTools.handlePointerUp,
    handleCanvasWheel: pointerTools.handleWheel,
    handleWindowDragEnter,
    handleWindowDragOver,
    handleWindowDragLeave,
    handleWindowDrop,
    handleKeyDown,
    handleWorkspaceControlChange,
  };
}

function setWorkspace(workspace: WorkspaceId = "create"): void {
  state.activeWorkspace = workspace || "create";
  applyWorkspaceDom(domeForgeDom, state.activeWorkspace);
  updateWorkflowStatus();
  scheduleWorkspaceAutosave("workspace", 350);
}

function handleWindowDragEnter(event: DragEvent): void {
  event.preventDefault();
  state.dragDepth += 1;
  dropOverlay.classList.add("visible");
}

function handleWindowDragOver(event: DragEvent): void {
  event.preventDefault();
}

function handleWindowDragLeave() {
  state.dragDepth = Math.max(0, state.dragDepth - 1);
  if (state.dragDepth === 0) {
    dropOverlay.classList.remove("visible");
  }
}

async function handleWindowDrop(event: DragEvent): Promise<void> {
  event.preventDefault();
  state.dragDepth = 0;
  dropOverlay.classList.remove("visible");
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    await mediaController.loadMediaFileSafely(file);
  }
}

function handleKeyDown(event: KeyboardEvent): void {
  if (isTypingTarget(event.target)) return;
  if (event.code === "Space") {
    event.preventDefault();
    videoTransport.toggleVideo();
  } else if (event.code === "ArrowLeft") {
    event.preventDefault();
    videoTransport.stepVideo(-1);
  } else if (event.code === "ArrowRight") {
    event.preventDefault();
    videoTransport.stepVideo(1);
  } else if (event.code === "KeyR") {
    viewController.resetCamera();
  } else if (event.code === "KeyH") {
    state.panelHidden = !state.panelHidden;
    sidePanel.classList.toggle("hidden", state.panelHidden);
    scheduleWorkspaceAutosave("panel", 250);
  } else if (/^Digit[1-5]$/.test(event.code)) {
    const modes = ["inside", "theater", "orbit", "flat", "split"];
    viewController.setViewMode(modes[Number(event.code.slice(-1)) - 1]);
  }
}

function scheduleWorkspaceAutosave(reason = "auto", delay = WORKSPACE_AUTOSAVE_DELAY_MS) {
  workspaceSession.scheduleAutosave(reason, delay, saveWorkspaceSnapshotNow);
}

async function saveWorkspaceSnapshotNow(reason = "manual") {
  if (workspaceSession.isHydrating()) return null;
  if (reason === "manual") {
    sessionReadout.textContent = "Saving session";
  }

  try {
    const snapshot = (await workspaceSession.saveSnapshot(
      reason,
      (snapshotReason) => buildWorkspaceSnapshot(snapshotReason, workspaceSnapshotContext()),
      {
        onStateChange: () => updateWorkspaceUi({ preserveText: reason === "manual" }),
        scheduleQueuedSave: saveWorkspaceSnapshotNow,
      },
    )) as WorkspaceSnapshot | null;
    if (!snapshot) return null;
    const verified = (await workspaceSession.loadSnapshot()) as WorkspaceSnapshot | null;
    state.workspaceSavedAt = snapshot.savedAt;
    if (reason === "manual") {
      sessionReadout.textContent = `Saved ${formatVersionDate(snapshot.savedAt)} · ${workspaceSaveSummary(verified || snapshot)}`;
    }
    updateWorkspaceUi({ preserveText: reason === "manual" });
    return snapshot;
  } catch (error) {
    console.error(error);
    sessionReadout.textContent = errorMessage(error) || "Could not save session";
    return null;
  } finally {
    updateWorkspaceUi({ preserveText: true });
  }
}

async function exportWorkspaceState() {
  try {
    sessionReadout.textContent = "Exporting full state";
    const snapshot = await buildWorkspaceSnapshot("full-state-export", workspaceSnapshotContext());
    const portable = await makePortableWorkspaceSnapshot(snapshot);
    const blob = new Blob([JSON.stringify(portable, null, 2)], { type: "application/json" });
    downloadBlob(blob, `zenith-full-state-${Date.now()}.json`);
    sessionReadout.textContent = workspaceSaveSummary(snapshot);
  } catch (error) {
    console.error(error);
    sessionReadout.textContent = errorMessage(error) || "Could not export full state";
  }
}

async function restoreWorkspaceAutosave({ silent = false } = {}) {
  try {
    const snapshot = (await workspaceSession.loadSnapshot()) as WorkspaceSnapshot | null;
    if (!snapshot) {
      state.workspaceSavedAt = null;
      updateWorkspaceUi();
      if (!silent) sessionReadout.textContent = "No saved session";
      return false;
    }
    await workspaceSession.withHydration(() => hydrateWorkspaceSnapshot(snapshot, workspaceSnapshotContext()));
    state.workspaceSavedAt = snapshot.savedAt || null;
    updateWorkspaceUi();
    if (!silent) {
      sessionReadout.textContent = `Restored ${formatVersionDate(snapshot.savedAt)}`;
    }
    return true;
  } catch (error) {
    console.error(error);
    if (!silent) {
      sessionReadout.textContent = errorMessage(error) || "Could not restore session";
    }
    updateWorkspaceUi({ preserveText: !silent });
    return false;
  }
}

async function clearWorkspaceAutosave() {
  try {
    await workspaceSession.deleteSnapshot();
    state.workspaceSavedAt = null;
    updateWorkspaceUi();
    sessionReadout.textContent = "Cleared saved session";
  } catch (error) {
    console.error(error);
    sessionReadout.textContent = errorMessage(error) || "Could not clear session";
  }
}

function handleWorkspaceControlChange(event: Event): void {
  const target = event.target;
  if (
    workspaceSession.isHydrating() ||
    !(
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    )
  ) {
    return;
  }
  if (target.type === "file") return;
  if (target.id === "versionSelect") return;
  scheduleWorkspaceAutosave("controls");
}

function workspaceSnapshotContext() {
  return {
    state,
    controls,
    video,
    sidePanel,
    runwayOperations,
    actions: {
      ensurePlatePlacements: plateController.ensurePlatePlacements,
      stopVideoFrameLoop: videoTransport.stopFrameLoop,
      setVideoControlsEnabled: videoTransport.setControlsEnabled,
      uploadCanvasAsSource: mediaController.uploadCanvasAsSource,
      saveVersionsToStorage: versionController.saveVersionsToStorage,
      renderRunwayResults: inpaintController.renderRunwayResults,
      renderSeedanceResults: depthMotionController.renderSeedanceResults,
      setViewMode: viewController.setViewMode,
      setWorkspace,
      updatePlateSelect: plateController.updatePlateSelect,
      updatePatchControlsFromActive: plateController.updatePatchControlsFromActive,
      updatePlateLayoutUi: plateController.updatePlateLayoutUi,
      updateVersionUi: versionController.updateVersionUi,
      updateInpaintUiState: inpaintController.updateInpaintUiState,
      updateDepthMotionUiState: depthMotionController.updateDepthMotionUiState,
      updateMediaReadouts: mediaController.updateMediaReadouts,
      updateTransport: videoTransport.updateTransport,
      schedulePlatePreview: plateController.schedulePlatePreview,
    },
  };
}

function updateWorkspaceUi({ preserveText = false }: { preserveText?: boolean } = {}): void {
  const hasSaved = Boolean(state.workspaceSavedAt);
  const saveInFlight = workspaceSession.isSaveInFlight();
  saveWorkspace.disabled = saveInFlight;
  restoreWorkspace.disabled = !hasSaved || saveInFlight;
  clearWorkspace.disabled = !hasSaved || saveInFlight;
  if (!preserveText) {
    sessionReadout.textContent = hasSaved ? `Saved ${formatVersionDate(state.workspaceSavedAt)}` : "No saved session";
  }
  updateWorkflowStatus();
}

type WorkflowState = "waiting" | "ready" | "active" | "done" | "warning";

function updateWorkflowStatus(): void {
  const hasSource = Boolean(
    state.sourceCanvas || state.mediaKind === "video" || (state.sourceWidth && state.sourceHeight),
  );
  const hasPlates = state.plates.length > 0;
  const hasPlatePreview = Boolean(state.plateCompositeTexture);
  const hasCommittedPlateMap = Boolean(state.plateCompositeCanvas && !state.plateCompositeDirty);
  const hasInpaintOutput = state.runwayOutputs.length > 0;
  const hasDepthMap = Boolean(state.depthMapCanvas);
  const hasSeedanceOutput = state.seedanceOutputs.length > 0;

  setWorkflowStep("source", hasSource ? "Ready" : "Waiting", hasSource ? "done" : "waiting");
  setWorkflowStep(
    "plates",
    hasCommittedPlateMap
      ? "Committed"
      : state.plateCompositeDirty
        ? "Preview dirty"
        : hasPlatePreview
          ? "Preview"
          : hasPlates
            ? "Arrange"
            : "Load images",
    hasCommittedPlateMap ? "done" : hasPlates ? "active" : "waiting",
  );
  setWorkflowStep(
    "inpaint",
    hasInpaintOutput ? "Result ready" : hasCommittedPlateMap ? "Ready" : "Needs plate map",
    hasInpaintOutput ? "done" : hasCommittedPlateMap ? "ready" : "waiting",
  );
  setWorkflowStep(
    "motion",
    hasSeedanceOutput ? "Video ready" : hasDepthMap ? "Depth ready" : hasSource ? "Needs depth" : "Needs source",
    hasSeedanceOutput ? "done" : hasDepthMap ? "ready" : "waiting",
  );
  setWorkflowStep(
    "export",
    hasSeedanceOutput ? "Video ready" : hasSource ? "Image/capture" : "Waiting",
    hasSeedanceOutput ? "done" : hasSource ? "ready" : "waiting",
  );

  seedanceStillReference.textContent = hasSource ? `${state.sourceName || "Current source"} still` : "Needs source";
  seedanceMotionReference.textContent = hasDepthMap ? "2.5D MP4 guide" : "Needs depth map";
  imageSeedanceReference.textContent = hasSource ? `${state.sourceName || "Current source"} still` : "Needs source";
}

function setWorkflowStep(step: string, text: string, status: WorkflowState): void {
  const item = workflowSteps.find((element) => element.dataset.flowStep === step);
  if (item) item.dataset.state = status;
  const label = workflowLabelForStep(step);
  if (label) label.textContent = text;
}

function workflowLabelForStep(step: string): HTMLElement | null {
  if (step === "source") return flowSourceState;
  if (step === "plates") return flowPlateState;
  if (step === "inpaint") return flowInpaintState;
  if (step === "motion") return flowMotionState;
  if (step === "export") return flowExportState;
  return null;
}

function workspaceSaveSummary(snapshot: WorkspaceSnapshot | null): string {
  const inpaintOutputs = snapshot?.runway?.outputs || [];
  const seedanceOutputs = snapshot?.seedance?.outputs || [];
  const embeddedInpaints = inpaintOutputs.filter((output: RunwayOutput) => output.dataUri).length;
  const embeddedVideos = seedanceOutputs.filter((output: SeedanceOutput) => output.dataUri).length;
  const linkedVideos = seedanceOutputs.length - embeddedVideos;
  const videoText =
    linkedVideos > 0
      ? `${embeddedVideos}/${seedanceOutputs.length} videos embedded`
      : `${embeddedVideos} videos embedded`;
  return `${embeddedInpaints} inpaint images, ${videoText}`;
}

async function makePortableWorkspaceSnapshot(snapshot: WorkspaceSnapshot): Promise<PortableWorkspaceSnapshot> {
  const portable = structuredClone(snapshot) as PortableWorkspaceSnapshot;
  portable.schema = "zenith.full-workspace-state";
  portable.exportedAt = new Date().toISOString();
  portable.media.sourceCanvas = await blobToDataUrlOrValue(snapshot.media?.sourceCanvas);
  portable.canvases.plateComposite = await blobToDataUrlOrValue(snapshot.canvases?.plateComposite);
  portable.depthMotion.depthMap = await blobToDataUrlOrValue(snapshot.depthMotion?.depthMap);
  portable.plates = await Promise.all(
    (snapshot.plates || []).map(async (plate) => ({
      ...plate,
      image: await blobToDataUrlOrValue(plate.image),
    })),
  );
  return portable;
}

async function blobToDataUrlOrValue(value: Blob | string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (typeof value === "string") return value;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not serialize workspace media."));
    reader.readAsDataURL(value);
  });
}

function getCssLayout(width: number, height: number): CssLayout {
  return renderer.getCssLayout(width, height);
}

function buildHudOptions(width: number, height: number, dpr: number, layout: CssLayout): HudOptions {
  if (state.plates.length >= 1) plateController.ensurePlatePlacements();

  return {
    dpr,
    width,
    height,
    layout,
    viewMode: state.viewMode,
    activeWorkspace: state.activeWorkspace,
    viewLabel: VIEW_LABELS[state.viewMode as keyof typeof VIEW_LABELS] || state.viewMode,
    showLabels: controls.showLabels.checked,
    showSourceCircle: controls.showSourceCircle.checked,
    showZenith: controls.showZenith.checked,
    radiusScale: Number(controls.radiusScale.value),
    flatRotationRadians: (Number(controls.rotation.value) * Math.PI) / 180,
    domeTiltRadians: (Number(controls.domeTilt.value) * Math.PI) / 180,
    mirror: controls.mirror.checked,
    fovDegrees: Number(controls.fov.value),
    domeViewMatrix: state.viewMode === "flat" ? null : viewCamera.currentDomeViewMatrix(),
    compassYaw: viewCamera.currentCompassYaw(),
    platesLength: state.plates.length,
    plateCount: plateController.resolvedPlateCount(),
    editPlacement: controls.editPlacement.checked,
    activePlateIndex: state.activePlateIndex,
    plates: state.plates,
    platePlacements: state.platePlacements,
    plateFit: controls.plateFit.value,
  };
}

function setGpuState(text: string, isError = false): void {
  gpuState.textContent = text;
  gpuState.classList.toggle("error", Boolean(isError));
}

function isTypingTarget(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName);
}

init().catch((error) => {
  console.error(error);
  setGpuState("Failed", true);
});

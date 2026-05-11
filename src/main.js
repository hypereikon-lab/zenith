import {
  DEFAULT_DEPTH_PROMPT,
  DEFAULT_INPAINT_PROMPT,
  PROJECTION_MODE,
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

const domeForgeDom = queryZenithDom();
const {
  canvas,
  demoCursor,
  gpuState,
  commitPlateMap,
  exportPlateMap,
  platesReadout,
  patchEditor,
  patchTransform,
  autoArrangePatches,
  resetPatch,
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
  imageSeedancePromptPreview,
  imageSeedancePromptState,
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
let plateController;
let versionController;
let pointerTools;
let inpaintController;
let depthMotionController;
let viewController;
let mediaController;
let viewCaptureController;
let demoTourController;
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
viewController = createViewController({
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
  projectionMode: PROJECTION_MODE,
  actions: {
    setGpuState,
    updateMediaReadouts: () => mediaController.updateMediaReadouts(),
    drawHud: drawZenithHud,
    buildHudOptions,
  },
});
mediaController = createMediaController({
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
inpaintController = createInpaintController({
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
depthMotionController = createDepthMotionController({
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
plateController = createPlateController({
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
versionController = createVersionController({
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
    resolvedPlateCount: plateController.resolvedPlateCount,
    scheduleWorkspaceAutosave,
    updatePlateSelect: plateController.updatePlateSelect,
    updatePatchControlsFromActive: plateController.updatePatchControlsFromActive,
    updatePlateLayoutUi: plateController.updatePlateLayoutUi,
  },
});
pointerTools = createPointerToolController({
  canvas,
  state,
  controls,
  getCssLayout,
  activeDomeCamera: viewCamera.activeDomeCamera,
  actions: {
    ensurePlatePlacements: plateController.ensurePlatePlacements,
    resolvedPlateCount: plateController.resolvedPlateCount,
    updatePatchControlsFromActive: plateController.updatePatchControlsFromActive,
    updatePlateSelect: plateController.updatePlateSelect,
    renderPlatePreviewNow: plateController.renderPlatePreviewNow,
    scheduleWorkspaceAutosave,
  },
});
viewCaptureController = createViewCaptureController({
  renderer,
  elements: {
    captureSquareFrame,
    recordCanvas,
    captureReadout,
  },
});
demoTourController = createDemoTourController({
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
    setPulseButtonText: (text) => {
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
  viewController.updateUiState();
  depthMotionController.updateDepthMotionUiState();
  inpaintController.checkRunwayStatus().finally(() => depthMotionController.updateDepthMotionUiState());
  setGpuState("Ready", false);
  renderer.startFrameLoop();
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
    platesReadout.textContent = error.message || "Could not load default plate references";
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
    const snapshot = await workspaceSession.loadSnapshot();
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
    refreshDepthMotionPreview: depthMotionController.scheduleDepthGpuPreviewRefresh,
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

function setWorkspace(workspace) {
  state.activeWorkspace = workspace || "create";
  applyWorkspaceDom(domeForgeDom, state.activeWorkspace);
  scheduleWorkspaceAutosave("workspace", 350);
}

function handleWindowDragEnter(event) {
  event.preventDefault();
  state.dragDepth += 1;
  dropOverlay.classList.add("visible");
}

function handleWindowDragOver(event) {
  event.preventDefault();
}

function handleWindowDragLeave() {
  state.dragDepth = Math.max(0, state.dragDepth - 1);
  if (state.dragDepth === 0) {
    dropOverlay.classList.remove("visible");
  }
}

async function handleWindowDrop(event) {
  event.preventDefault();
  state.dragDepth = 0;
  dropOverlay.classList.remove("visible");
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    await mediaController.loadMediaFileSafely(file);
  }
}

function handleKeyDown(event) {
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
    const snapshot = await workspaceSession.saveSnapshot(
      reason,
      (snapshotReason) => buildWorkspaceSnapshot(snapshotReason, workspaceSnapshotContext()),
      {
        onStateChange: () => updateWorkspaceUi({ preserveText: reason === "manual" }),
        scheduleQueuedSave: saveWorkspaceSnapshotNow,
      },
    );
    if (!snapshot) return null;
    const verified = await workspaceSession.loadSnapshot();
    state.workspaceSavedAt = snapshot.savedAt;
    if (reason === "manual") {
      sessionReadout.textContent = `Saved ${formatVersionDate(snapshot.savedAt)} · ${workspaceSaveSummary(verified || snapshot)}`;
    }
    updateWorkspaceUi({ preserveText: reason === "manual" });
    return snapshot;
  } catch (error) {
    console.error(error);
    sessionReadout.textContent = error.message || "Could not save session";
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
    sessionReadout.textContent = workspaceSaveSummary(portable);
  } catch (error) {
    console.error(error);
    sessionReadout.textContent = error.message || "Could not export full state";
  }
}

async function restoreWorkspaceAutosave({ silent = false } = {}) {
  try {
    const snapshot = await workspaceSession.loadSnapshot();
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
      sessionReadout.textContent = error.message || "Could not restore session";
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
    sessionReadout.textContent = error.message || "Could not clear session";
  }
}

function handleWorkspaceControlChange(event) {
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

function updateWorkspaceUi({ preserveText = false } = {}) {
  const hasSaved = Boolean(state.workspaceSavedAt);
  const saveInFlight = workspaceSession.isSaveInFlight();
  saveWorkspace.disabled = saveInFlight;
  restoreWorkspace.disabled = !hasSaved || saveInFlight;
  clearWorkspace.disabled = !hasSaved || saveInFlight;
  if (!preserveText) {
    sessionReadout.textContent = hasSaved ? `Saved ${formatVersionDate(state.workspaceSavedAt)}` : "No saved session";
  }
}

function workspaceSaveSummary(snapshot) {
  const inpaintOutputs = snapshot?.runway?.outputs || [];
  const seedanceOutputs = snapshot?.seedance?.outputs || [];
  const embeddedInpaints = inpaintOutputs.filter((output) => output.dataUri).length;
  const embeddedVideos = seedanceOutputs.filter((output) => output.dataUri).length;
  const linkedVideos = seedanceOutputs.length - embeddedVideos;
  const videoText = linkedVideos > 0
    ? `${embeddedVideos}/${seedanceOutputs.length} videos embedded`
    : `${embeddedVideos} videos embedded`;
  return `${embeddedInpaints} inpaint images, ${videoText}`;
}

async function makePortableWorkspaceSnapshot(snapshot) {
  const portable = structuredClone(snapshot);
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

function blobToDataUrlOrValue(value) {
  if (!value || typeof value === "string") return value || null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Could not serialize workspace media."));
    reader.readAsDataURL(value);
  });
}

function getCssLayout(width, height) {
  return renderer.getCssLayout(width, height);
}

function buildHudOptions(width, height, dpr, layout) {
  if (state.plates.length >= 1) plateController.ensurePlatePlacements();

  return {
    dpr,
    width,
    height,
    layout,
    viewMode: state.viewMode,
    activeWorkspace: state.activeWorkspace,
    viewLabel: VIEW_LABELS[state.viewMode],
    showLabels: controls.showLabels.checked,
    showSourceCircle: controls.showSourceCircle.checked,
    showZenith: controls.showZenith.checked,
    radiusScale: Number(controls.radiusScale.value),
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

function setGpuState(text, isError) {
  gpuState.textContent = text;
  gpuState.classList.toggle("error", Boolean(isError));
}

function isTypingTarget(target) {
  return ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target?.tagName);
}

init().catch((error) => {
  console.error(error);
  setGpuState("Failed", true);
});

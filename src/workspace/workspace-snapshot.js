import {
  canvasBlobOrNull,
  canvasFromBlobOrNull,
  makeCanvasThumbnail,
} from "../media/canvas-utils.js";
import { PLATE_PLACEMENT_MODEL_VERSION, normalizePlatePlacement } from "../plates/plate-placement.js";
import { clamp } from "../projection.js";
import { cloneJson } from "./version-utils.js";
import { WORKSPACE_AUTOSAVE_ID } from "./session-repository.js";

export async function createWorkspaceSnapshot(reason, context) {
  const { state, controls, actions } = context;
  actions.ensurePlatePlacements();

  const savedAt = new Date().toISOString();
  const [sourceCanvas, plateComposite, depthMap, plates] = await Promise.all([
    canvasBlobOrNull(state.sourceCanvas),
    canvasBlobOrNull(state.plateCompositeCanvas),
    canvasBlobOrNull(state.depthMapCanvas),
    Promise.all(state.plates.map(serializeWorkspacePlate)),
  ]);

  return {
    id: WORKSPACE_AUTOSAVE_ID,
    version: 1,
    reason,
    savedAt,
    ui: {
      viewMode: state.viewMode,
      activeWorkspace: state.activeWorkspace,
      panelHidden: state.panelHidden,
      camera: cloneJson(state.camera),
      activePlateIndex: state.activePlateIndex,
    },
    media: {
      kind: state.mediaKind,
      name: state.sourceName,
      width: state.sourceWidth,
      height: state.sourceHeight,
      duration: state.mediaDuration,
      fps: state.mediaFps,
      sourceCanvas,
    },
    controls: collectControlSnapshot(controls),
    plates,
    plate: {
      placementModelVersion: PLATE_PLACEMENT_MODEL_VERSION,
      platePlacements: state.platePlacements.map((placement, index) =>
        normalizePlatePlacement(placement, state.plates[index]),
      ),
      activePlateIndex: state.activePlateIndex,
    },
    canvases: {
      plateComposite,
    },
    runway: {
      outputs: state.runwayOutputs.map((output) => ({
        url: output.url || "",
        dataUri: output.dataUri || "",
        contentType: output.contentType || "",
      })),
      activeIndex: state.activeRunwayOutputIndex,
    },
    seedance: {
      outputs: (state.seedanceOutputs || []).map((output) => ({
        url: output.url || "",
        dataUri: output.dataUri || "",
        contentType: output.contentType || "",
        name: output.name || "",
        model: output.model || "",
        duration: output.duration || 0,
        workflow: output.workflow || "",
        prompt: output.prompt || "",
      })),
      activeIndex: state.activeSeedanceOutputIndex || 0,
    },
    depthMotion: {
      depthMap,
      depthMapName: state.depthMapName || "",
    },
    versions: cloneJson(state.versions),
    thumbnails: {
      source: state.sourceCanvas ? makeCanvasThumbnail(state.sourceCanvas, 128) : null,
      plate: state.plateCompositeCanvas ? makeCanvasThumbnail(state.plateCompositeCanvas, 128) : null,
    },
  };
}

export async function applyWorkspaceSnapshot(snapshot, context) {
  const { state, controls, video, sidePanel, runwayOperations, actions } = context;
  runwayOperations.abortAll("Workspace snapshot changed.");

  actions.stopVideoFrameLoop();
  if (state.sourceUrl) {
    URL.revokeObjectURL(state.sourceUrl);
    state.sourceUrl = null;
  }
  video.pause();
  video.removeAttribute("src");
  video.load();
  actions.setVideoControlsEnabled(false);

  applyControlSnapshot(controls, snapshot.controls || {});
  state.panelHidden = Boolean(snapshot.ui?.panelHidden);
  sidePanel.classList.toggle("hidden", state.panelHidden);
  state.camera = {
    ...state.camera,
    ...(snapshot.ui?.camera || {}),
  };
  state.activePlateIndex = Math.max(
    0,
    Math.round(snapshot.plate?.activePlateIndex ?? snapshot.ui?.activePlateIndex ?? 0),
  );
  state.plates = await Promise.all((snapshot.plates || []).map(deserializeWorkspacePlate));
  state.platePlacements = cloneJson(snapshot.plate?.platePlacements || []).map((placement, index) =>
    normalizePlatePlacement(placement, state.plates[index]),
  );
  const placementModelStale =
    state.plates.length >= 1 && Number(snapshot.plate?.placementModelVersion) !== PLATE_PLACEMENT_MODEL_VERSION;
  const sourceName = snapshot.media?.name || "";
  const sourceIsRestoredPlateSketch = isPlateSketchSourceName(sourceName);
  const sourceIsRestoredPlatePreview = isPlateSketchPreviewSourceName(sourceName);
  state.plateCompositeCanvas = await canvasFromBlobOrNull(snapshot.canvases?.plateComposite);
  const shouldRegeneratePlatePreview =
    state.plates.length >= 1 && (sourceIsRestoredPlatePreview || (placementModelStale && sourceIsRestoredPlateSketch));
  state.plateCompositeDirty = shouldRegeneratePlatePreview;
  state.inpaintWhiteCanvas = null;
  state.inpaintMaskCanvas = null;
  state.runwayOutputs = (snapshot.runway?.outputs || []).filter((output) => output.dataUri || output.url);
  state.activeRunwayOutputIndex = clamp(
    Math.round(snapshot.runway?.activeIndex) || 0,
    0,
    Math.max(0, state.runwayOutputs.length - 1),
  );
  state.seedanceOutputs = (snapshot.seedance?.outputs || []).filter((output) => output.dataUri || output.url);
  state.activeSeedanceOutputIndex = clamp(
    Math.round(snapshot.seedance?.activeIndex) || 0,
    0,
    Math.max(0, state.seedanceOutputs.length - 1),
  );

  const sourceCanvas = await canvasFromBlobOrNull(snapshot.media?.sourceCanvas);
  let restoredSource = false;
  if (sourceCanvas && !shouldRegeneratePlatePreview) {
    actions.uploadCanvasAsSource(sourceCanvas, snapshot.media?.name || "Restored source");
    restoredSource = true;
  } else if (state.plateCompositeCanvas && !shouldRegeneratePlatePreview) {
    actions.uploadCanvasAsSource(state.plateCompositeCanvas, snapshot.media?.name || "Restored plate sketch");
    restoredSource = true;
  }
  if (restoredSource) {
    state.sourceName = snapshot.media?.name || state.sourceName;
    state.sourceWidth = snapshot.media?.width || state.sourceWidth;
    state.sourceHeight = snapshot.media?.height || state.sourceHeight;
    state.mediaFps = snapshot.media?.fps || state.mediaFps;
    state.mediaDuration = snapshot.media?.duration || state.mediaDuration;
  }

  state.depthMapCanvas = await canvasFromBlobOrNull(snapshot.depthMotion?.depthMap);
  state.depthMapName = state.depthMapCanvas ? snapshot.depthMotion?.depthMapName || "Restored depth map" : "";
  state.depthMotionPreviewCanvas = null;
  state.depthPreviewActive = false;
  state.depthPreviewWidth = 0;
  state.depthPreviewHeight = 0;
  state.depthPreviewName = "";
  state.depthPreviewSourceKind = "";

  if (Array.isArray(snapshot.versions)) {
    state.versions = snapshot.versions.filter((version) => version?.id);
    actions.saveVersionsToStorage();
  }

  actions.renderRunwayResults();
  actions.renderSeedanceResults();
  actions.setViewMode(snapshot.ui?.viewMode || state.viewMode || "inside");
  actions.setWorkspace?.(snapshot.ui?.activeWorkspace || state.activeWorkspace || "create");
  actions.updatePlateSelect();
  actions.updatePatchControlsFromActive();
  actions.updatePlateLayoutUi();
  actions.updateVersionUi();
  actions.updateInpaintUiState();
  actions.updateDepthMotionUiState();
  actions.updateMediaReadouts();
  actions.updateTransport();
  if (shouldRegeneratePlatePreview) {
    actions.schedulePlatePreview?.(0);
  }
}

export function collectControlSnapshot(controls) {
  return Object.fromEntries(
    Object.entries(controls).map(([key, control]) => [
      key,
      control.type === "checkbox" ? Boolean(control.checked) : control.value,
    ]),
  );
}

export function applyControlSnapshot(controls, snapshot) {
  for (const [key, value] of Object.entries(snapshot || {})) {
    const control = controls[key];
    if (!control || value === undefined || value === null) continue;
    if (control.type === "checkbox") {
      control.checked = Boolean(value);
    } else {
      control.value = String(value);
    }
  }
}

async function serializeWorkspacePlate(plate) {
  return {
    name: plate.name,
    width: plate.width,
    height: plate.height,
    aspect: plate.aspect,
    image: await canvasBlobOrNull(plate.canvas),
  };
}

async function deserializeWorkspacePlate(snapshot) {
  const restoredCanvas = await canvasFromBlobOrNull(snapshot.image);
  if (!restoredCanvas) {
    return {
      name: snapshot.name || "Restored plate",
      width: 1,
      height: 1,
      aspect: 1,
      canvas: null,
    };
  }
  return {
    name: snapshot.name || "Restored plate",
    width: restoredCanvas.width,
    height: restoredCanvas.height,
    aspect: restoredCanvas.width / restoredCanvas.height,
    canvas: restoredCanvas,
  };
}

function isPlateSketchSourceName(name) {
  return /^Plate sketch\b/.test(name) || /^Restored plate sketch\b/.test(name);
}

function isPlateSketchPreviewSourceName(name) {
  return /^Plate sketch GPU preview\b/.test(name) || /^Restored plate sketch GPU preview\b/.test(name);
}

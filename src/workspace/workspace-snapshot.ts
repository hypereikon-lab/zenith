import {
  canvasBlobOrNull,
  canvasFromBlobOrNull,
  makeCanvasThumbnail,
} from "../media/canvas-utils.js";
import { PLATE_PLACEMENT_MODEL_VERSION, normalizePlatePlacement } from "../plates/plate-placement.js";
import { clamp } from "../projection.js";
import { cloneJson } from "./version-utils.js";
import { WORKSPACE_AUTOSAVE_ID } from "./session-repository.js";
import type { RunwayOutput, SeedanceOutput, VersionSnapshot, ZenithState } from "../app/types.js";
import type { PlatePlacementInput } from "../plates/plate-placement.js";
import type { ZenithControls } from "../ui/dom.js";

type SnapshotControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type SnapshotControls = Record<string, SnapshotControl>;
type WorkspacePlateSnapshot = {
  name?: string;
  width?: number;
  height?: number;
  aspect?: number;
  image?: Blob | string | null;
};
type WorkspaceSnapshotContext = {
  state: ZenithState;
  controls: ZenithControls;
  video: HTMLVideoElement;
  sidePanel: HTMLElement;
  runwayOperations: { abortAll: (message: string) => void };
  actions: {
    ensurePlatePlacements: () => void;
    stopVideoFrameLoop: () => void;
    setVideoControlsEnabled: (enabled: boolean) => void;
    uploadCanvasAsSource: (canvas: HTMLCanvasElement, name: string) => void;
    saveVersionsToStorage: () => void;
    renderRunwayResults: () => void;
    renderSeedanceResults: () => void;
    setViewMode: (mode: string) => void;
    setWorkspace?: (workspace: string) => void;
    updatePlateSelect: () => void;
    updatePatchControlsFromActive: () => void;
    updatePlateLayoutUi: () => void;
    updateVersionUi: () => void;
    updateInpaintUiState: () => void;
    updateDepthMotionUiState: () => void;
    updateMediaReadouts: () => void;
    updateTransport: () => void;
    schedulePlatePreview?: (delay: number) => void;
  };
};
type WorkspaceSnapshotData = {
  id?: string;
  version?: number;
  reason?: string;
  savedAt?: string;
  ui?: {
    viewMode?: string;
    activeWorkspace?: string;
    panelHidden?: boolean;
    camera?: Partial<ZenithState["camera"]>;
    activePlateIndex?: number;
  };
  media?: {
    kind?: string;
    name?: string;
    width?: number;
    height?: number;
    duration?: number;
    fps?: number;
    sourceCanvas?: Blob | string | null;
  };
  controls?: Record<string, unknown>;
  plates?: WorkspacePlateSnapshot[];
  plate?: {
    placementModelVersion?: number;
    platePlacements?: PlatePlacementInput[];
    activePlateIndex?: number;
  };
  canvases?: { plateComposite?: Blob | string | null };
  runway?: { outputs?: RunwayOutput[]; activeIndex?: number };
  seedance?: { outputs?: SeedanceOutput[]; activeIndex?: number };
  depthMotion?: {
    depthMap?: Blob | string | null;
    depthMapName?: string;
    finalState?: Blob | string | null;
    finalStateName?: string;
    finalStateFingerprint?: string;
    reconstructedFinalState?: Blob | string | null;
    reconstructedFinalStateName?: string;
    reconstructedFinalStateFingerprint?: string;
  };
  versions?: VersionSnapshot[];
};
type WorkspacePlate = {
  name: string;
  width: number;
  height: number;
  aspect: number;
  canvas: HTMLCanvasElement | null;
};

export async function createWorkspaceSnapshot(reason: string, context: WorkspaceSnapshotContext) {
  const { state, controls, actions } = context;
  actions.ensurePlatePlacements();

  const savedAt = new Date().toISOString();
  const [sourceCanvas, plateComposite, depthMap, depthFinalState, depthFinalReconstructed, plates] = await Promise.all([
    canvasBlobOrNull(state.sourceCanvas),
    canvasBlobOrNull(state.plateCompositeCanvas),
    canvasBlobOrNull(state.depthMapCanvas),
    canvasBlobOrNull(state.depthFinalStateCanvas),
    canvasBlobOrNull(state.depthFinalReconstructedCanvas),
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
      platePlacements: state.platePlacements.map((placement, index: number) =>
        normalizePlatePlacement(placement, state.plates[index]),
      ),
      activePlateIndex: state.activePlateIndex,
    },
    canvases: {
      plateComposite,
    },
    runway: {
      outputs: state.runwayOutputs.map((output: RunwayOutput) => ({
        url: output.url || "",
        dataUri: output.dataUri || "",
        contentType: output.contentType || "",
      })),
      activeIndex: state.activeRunwayOutputIndex,
    },
    seedance: {
      outputs: (state.seedanceOutputs || []).map((output: SeedanceOutput) => ({
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
      finalState: depthFinalState,
      finalStateName: state.depthFinalStateName || "",
      finalStateFingerprint: state.depthFinalStateFingerprint || "",
      reconstructedFinalState: depthFinalReconstructed,
      reconstructedFinalStateName: state.depthFinalReconstructedName || "",
      reconstructedFinalStateFingerprint: state.depthFinalReconstructedFingerprint || "",
    },
    versions: cloneJson(state.versions),
    thumbnails: {
      source: state.sourceCanvas ? makeCanvasThumbnail(state.sourceCanvas, 128) : null,
      plate: state.plateCompositeCanvas ? makeCanvasThumbnail(state.plateCompositeCanvas, 128) : null,
    },
  };
}

export async function applyWorkspaceSnapshot(snapshot: WorkspaceSnapshotData, context: WorkspaceSnapshotContext): Promise<void> {
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
  state.platePlacements = cloneJson(snapshot.plate?.platePlacements || []).map((placement, index: number) =>
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
  state.runwayOutputs = (snapshot.runway?.outputs || []).filter((output: RunwayOutput) => output.dataUri || output.url);
  state.activeRunwayOutputIndex = clamp(
    Math.round(snapshot.runway?.activeIndex) || 0,
    0,
    Math.max(0, state.runwayOutputs.length - 1),
  );
  state.seedanceOutputs = (snapshot.seedance?.outputs || []).filter(
    (output: SeedanceOutput) => output.dataUri || output.url,
  );
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
  state.depthFinalStateCanvas = await canvasFromBlobOrNull(snapshot.depthMotion?.finalState);
  state.depthFinalStateName = state.depthFinalStateCanvas
    ? snapshot.depthMotion?.finalStateName || "Restored final state"
    : "";
  state.depthFinalStateFingerprint = state.depthFinalStateCanvas
    ? snapshot.depthMotion?.finalStateFingerprint || ""
    : "";
  state.depthFinalReconstructedCanvas = await canvasFromBlobOrNull(snapshot.depthMotion?.reconstructedFinalState);
  state.depthFinalReconstructedName = state.depthFinalReconstructedCanvas
    ? snapshot.depthMotion?.reconstructedFinalStateName || "Restored reconstructed final state"
    : "";
  state.depthFinalReconstructedFingerprint = state.depthFinalReconstructedCanvas
    ? snapshot.depthMotion?.reconstructedFinalStateFingerprint || ""
    : "";
  state.depthMotionPreviewCanvas = null;
  state.depthPreviewActive = false;
  state.depthPreviewWidth = 0;
  state.depthPreviewHeight = 0;
  state.depthPreviewName = "";
  state.depthPreviewSourceKind = "";

  if (Array.isArray(snapshot.versions)) {
    state.versions = snapshot.versions.filter((version: VersionSnapshot) => version?.id);
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

export function collectControlSnapshot(controls: SnapshotControls) {
  return Object.fromEntries(
    Object.entries(controls).map(([key, control]) => [
      key,
      isCheckboxControl(control) ? Boolean(control.checked) : control.value,
    ]),
  );
}

export function applyControlSnapshot(controls: SnapshotControls, snapshot: Record<string, unknown>) {
  for (const [key, value] of Object.entries(snapshot || {})) {
    const control = controls[key];
    if (!control || value === undefined || value === null) continue;
    if (isCheckboxControl(control)) {
      control.checked = Boolean(value);
    } else {
      control.value = String(value);
    }
  }
}

async function serializeWorkspacePlate(plate: WorkspacePlate) {
  return {
    name: plate.name,
    width: plate.width,
    height: plate.height,
    aspect: plate.aspect,
    image: await canvasBlobOrNull(plate.canvas),
  };
}

async function deserializeWorkspacePlate(snapshot: WorkspacePlateSnapshot): Promise<WorkspacePlate> {
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

function isCheckboxControl(control: SnapshotControl): control is HTMLInputElement {
  return control instanceof HTMLInputElement && control.type === "checkbox";
}

function isPlateSketchSourceName(name: string): boolean {
  return /^Plate sketch\b/.test(name) || /^Restored plate sketch\b/.test(name);
}

function isPlateSketchPreviewSourceName(name: string): boolean {
  return /^Plate sketch GPU preview\b/.test(name) || /^Restored plate sketch GPU preview\b/.test(name);
}

import { DEFAULT_CAMERA, DEFAULT_VIEW_MODE } from "./default-profile.js";
import type { ViewMode, ZenithState } from "./types.js";

export const VIEW_LABELS = {
  inside: "Center POV",
  theater: "Theater interior",
  orbit: "Orbit",
  flat: "Flat domemaster",
  split: "Flat + projected",
};

export const VERSION_STORAGE_KEY = "fulldome-viewer-versions-v1";
export const DEFAULT_INPAINT_PROMPT = `Use @PlateSketch as an exact square domemaster guide. It is an equidistant 180 fulldome map with the zenith at the center and the horizon at the outer circle. Preserve the existing plate content, orientation, scale, and fisheye geometry. Treat pure white areas inside the circle, between plates, and in the center gap as missing pixels to fill, not objects. Complete them as a coherent continuation of the scene. No visible white patches, mask edges, checkerboards, dividers, radial spokes, central holes, or repair boundaries. Output a clean opaque square domemaster image.`;
export const DEFAULT_DEPTH_PROMPT = `Generate a metric depth map visualization where depth values are represented on a grayscale gradient from black (nearest objects) to white (farthest objects). Use precise linear interpolation across the depth range. Render as a clean, high-contrast grayscale image with smooth tonal transitions. No color, no overlays, no labels. Pure depth-to-brightness mapping where each shade of gray corresponds to a specific distance value in the scene. Preserve the square 180-degree domemaster fisheye layout exactly, including zenith center, circular horizon, and pure black outside the projection circle.`;
export const DEFAULT_SEEDANCE_PROMPT = `Use the input video as a rough fulldome domemaster motion guide. Preserve the circular fisheye composition, camera timing, parallax direction, scene identity, and pitch-black area outside the projection circle. Convert the depth-projected guide into coherent natural motion without adding text, borders, rectangular framing, UI marks, or visible mask artifacts.`;

export function createInitialState(): ZenithState {
  return {
    viewMode: DEFAULT_VIEW_MODE as ViewMode,
    activeWorkspace: "create",
    mediaKind: "image",
    sourceUrl: null,
    sourceName: "Procedural 180 map",
    sourceWidth: 2048,
    sourceHeight: 2048,
    sourceCanvas: null,
    mediaDuration: 0,
    mediaFps: 24,
    lastFrameMediaTime: null,
    pointer: {
      active: false,
      mode: null,
      x: 0,
      y: 0,
    },
    camera: { ...DEFAULT_CAMERA },
    timelineSeeking: false,
    pendingVideoUpload: false,
    videoFrameCallbackId: null,
    dragDepth: 0,
    panelHidden: false,
    fps: 0,
    fpsSampleTime: performance.now(),
    fpsFrameCount: 0,
    plates: [],
    platePlacements: [],
    activePlateIndex: 0,
    plateCompositeCanvas: null,
    plateCompositeDirty: false,
    plateCompositeTexture: null,
    inpaintWhiteCanvas: null,
    inpaintMaskCanvas: null,
    runwayOutputs: [],
    activeRunwayOutputIndex: 0,
    seedanceOutputs: [],
    activeSeedanceOutputIndex: 0,
    runwayConfigured: null,
    depthMapCanvas: null,
    depthMapName: "",
    depthMapModel: "",
    depthMapPrompt: "",
    depthMotionPreviewCanvas: null,
    depthFinalStateCanvas: null,
    depthFinalStateName: "",
    depthFinalStateFingerprint: "",
    depthFinalReconstructedCanvas: null,
    depthFinalReconstructedName: "",
    depthFinalReconstructedFingerprint: "",
    depthPreviewActive: false,
    depthPreviewWidth: 0,
    depthPreviewHeight: 0,
    depthPreviewName: "",
    depthPreviewSourceKind: "",
    versions: [],
    workspaceSavedAt: null,
  };
}

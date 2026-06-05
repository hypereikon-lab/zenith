import { DEFAULT_CAMERA, DEFAULT_VIEW_MODE } from "./default-profile.js";
import type { SourceProjectionMode, ViewMode, ZenithState } from "./types.js";

export const VIEW_LABELS = {
  inside: "Center POV",
  theater: "Theater interior",
  orbit: "Orbit",
  flat: "Flat domemaster",
  split: "Flat + projected",
  cave: "CAVE room",
};

export const VERSION_STORAGE_KEY = "fulldome-viewer-versions-v1";
const INPAINT_GUIDE_PROMPT = `Treat pure green areas inside the projection circle as missing pixels to fill, not objects. The black rings and spokes are construction guides for fisheye continuity; remove them from the final image. Keep the pure black area outside the circular projection black.`;
const NADIR_INPAINT_GUIDE_PROMPT = `This is a bottom-facing nadir fisheye repair guide, not a zenith dome view. The center of the circle is the floor, ground, or lower surface directly below the viewer. Do not put sky, clouds, sun, ceiling, treetops, or overhead canopy in the center. Treat pure green areas inside the projection circle as missing pixels to fill, not objects. The black rings and spokes are construction guides for fisheye continuity; remove them from the final image. Keep the pure black area outside the circular projection black.`;
export const DEFAULT_INPAINT_PROMPT = `Use @PlateSketch as an exact square domemaster guide. It is an equidistant 180 fulldome map with the zenith at the center and the horizon at the outer circle. Preserve the existing plate content, orientation, scale, and fisheye geometry. ${INPAINT_GUIDE_PROMPT} Complete missing regions as a coherent continuation of the scene. No visible green patches, mask edges, checkerboards, dividers, radial spokes, central holes, or repair boundaries. Output a clean opaque square domemaster image.`;
export const INPAINT_PROJECTION_PROMPTS = {
  "zenith-180": DEFAULT_INPAINT_PROMPT,
  "zenith-270": `Use @PlateSketch as an exact square domemaster guide. It is an equidistant 270 fulldome map with the zenith at the center, the horizon at two-thirds of the projection radius, and the outer circle extending 45 degrees below the horizon. Preserve the existing plate content, orientation, scale, and fisheye geometry. ${INPAINT_GUIDE_PROMPT} Complete missing regions as a coherent continuation of the scene. No visible green patches, mask edges, checkerboards, dividers, radial spokes, central holes, or repair boundaries. Output a clean opaque square zenith 270 domemaster image.`,
  "nadir-180": `Use @PlateSketch as a square bottom-facing equidistant 180 fisheye repair guide. ${NADIR_INPAINT_GUIDE_PROMPT} Visual harness: center disk means floor or ground continuation; middle annulus means lower scene surfaces and objects rising away from the floor; outer circle means horizon-level surroundings. Preserve the existing plate content, orientation, scale, and fisheye geometry. Complete missing regions as one coherent lower-facing environment. Sky-like material is allowed only near the horizon if the existing plates already show it there. No visible green patches, mask edges, checkerboards, dividers, radial spokes, central holes, sky-filled center, or repair boundaries. Output a clean opaque square nadir fisheye image.`,
  "nadir-270": `Use @PlateSketch as a square bottom-facing equidistant 270 fisheye repair guide. ${NADIR_INPAINT_GUIDE_PROMPT} Visual harness: center disk means floor or ground continuation; middle annulus means lower scene surfaces and objects rising away from the floor; the horizon sits at two-thirds of the projection radius; the outer annulus beyond that horizon means upper wall, upper vegetation, architecture, or sky only when supported by the existing plates. Preserve the existing plate content, orientation, scale, and fisheye geometry. Complete missing regions as one coherent lower-facing environment. Never invert the map into a zenith view, and never make the center a sky opening. No visible green patches, mask edges, checkerboards, dividers, radial spokes, central holes, sky-filled center, or repair boundaries. Output a clean opaque square nadir 270 fisheye image.`,
} as const;

const OBSOLETE_GENERATED_INPAINT_PROMPT_MARKERS = [
  "visual continuity reference",
  "intended for CAVE",
  "Infer the lower hemisphere",
  "Infer the lower world",
  "including upper sky/ceiling directions",
  "do not stretch sky texture into the floor",
  "smeared projection damage",
  "No visible white patches, mask edges, checkerboards, dividers, radial spokes, central holes, or repair boundaries.",
  "Faint projection rings and spokes",
  "No visible white patches, mask edges, checkerboards, dividers, central holes, or repair boundaries.",
  "equidistant 180 fulldome map with the nadir at the center",
  "equidistant 270 fulldome map with the nadir at the center",
];

export function inpaintPromptForProjection(mode: SourceProjectionMode): string {
  return INPAINT_PROJECTION_PROMPTS[mode] || DEFAULT_INPAINT_PROMPT;
}

export function shouldReplaceWithProjectionInpaintPrompt(prompt: string): boolean {
  const currentPrompt = prompt.trim();
  if (!currentPrompt) return true;
  if ((Object.values(INPAINT_PROJECTION_PROMPTS) as readonly string[]).includes(currentPrompt)) return true;
  return (
    currentPrompt.startsWith("Use @PlateSketch") &&
    OBSOLETE_GENERATED_INPAINT_PROMPT_MARKERS.some((marker) => currentPrompt.includes(marker))
  );
}
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

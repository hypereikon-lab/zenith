import { DEFAULT_CAMERA, DEFAULT_VIEW_MODE } from "./default-profile.js";
import { CAVE_HANDOFF_GUIDE, caveGuideHorizonBand, caveGuidePromptClause } from "../geometry/cave-handoff-guide.js";
import { domeGuidePromptClause } from "../geometry/dome-handoff-guide.js";
import { normalizeSourceInnerGuideSplit } from "../geometry/source-guide-semantics.js";
import type { SourceProjectionMode, ViewMode, ZenithState } from "./types.js";

export const VIEW_LABELS = {
  inside: "Center POV",
  theater: "Theater interior",
  orbit: "Orbit",
  flat: "Flat domemaster",
  split: "Flat + projected",
  cave: "CAVE room",
};

const INPAINT_GUIDE_PROMPT = `Treat colored guide fill inside the projection circle as missing pixels to fill, not objects. The black rings, spokes, horizon, and source-circle marks are construction guides for fisheye continuity; remove them from the final image. Keep the pure black area outside the circular projection black.`;
const NADIR_INPAINT_GUIDE_PROMPT = `This is a bottom-facing nadir fisheye repair guide, not a zenith dome view. The center of the circle is the floor, ground, or lower surface directly below the viewer. Do not put sky, clouds, sun, ceiling, treetops, or overhead canopy in the center. ${INPAINT_GUIDE_PROMPT}`;
export const DEFAULT_INPAINT_PROMPT = zenith180InpaintPrompt();
export const INPAINT_PROJECTION_PROMPTS = {
  "zenith-180": DEFAULT_INPAINT_PROMPT,
  "zenith-230": zenith230InpaintPrompt(),
  "nadir-180": nadir180InpaintPrompt(),
  "cave-270": cave270InpaintPrompt(),
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
  "exact square domemaster composition handoff for inpaint",
  "exact square CAVE 270 source-map guide",
  "black square bands and spokes",
  "coherent continuation of the same flat source texture",
  "Do not create visible room corners",
  "square CAVE 270 continuity-carrier map",
  "Output a clean opaque square CAVE 270 source-map image",
];

export function inpaintPromptForProjection(
  mode: SourceProjectionMode,
  domeGuideSemanticSplit?: number | string | null,
  domeGuideHorizonSplit?: number | string | null,
): string {
  if (mode === "zenith-230") return zenith230InpaintPrompt(domeGuideSemanticSplit, domeGuideHorizonSplit);
  if (mode === "nadir-180") return nadir180InpaintPrompt(domeGuideSemanticSplit);
  if (mode === "cave-270") return cave270InpaintPrompt(domeGuideSemanticSplit, domeGuideHorizonSplit);
  return zenith180InpaintPrompt(domeGuideSemanticSplit);
}

export function shouldReplaceWithProjectionInpaintPrompt(prompt: string): boolean {
  const currentPrompt = prompt.trim();
  if (!currentPrompt) return true;
  if ((Object.values(INPAINT_PROJECTION_PROMPTS) as readonly string[]).includes(currentPrompt)) return true;
  if (
    currentPrompt.startsWith("Use @plate_sketch as an exact square domemaster guide.") &&
    currentPrompt.includes("Visual harness:") &&
    currentPrompt.includes("Treat colored guide fill inside the projection circle as missing pixels")
  ) {
    return true;
  }
  if (
    currentPrompt.startsWith("Use @plate_sketch as a square bottom-facing equidistant 180 fisheye repair guide.") &&
    currentPrompt.includes("Visual harness:") &&
    currentPrompt.includes("Treat colored guide fill inside the projection circle as missing pixels")
  ) {
    return true;
  }
  if (
    currentPrompt.startsWith(`Use @plate_sketch as a ${CAVE_HANDOFF_GUIDE.promptTerms.carrierName} for inpainting`) &&
    currentPrompt.includes("Visual harness:")
  ) {
    return true;
  }
  if (
    currentPrompt.startsWith("Repair @plate_sketch as a square projection-source map.") &&
    currentPrompt.includes("warped source texture for an immersive projection surface") &&
    currentPrompt.includes("Scaffold meaning:")
  ) {
    return true;
  }
  if (
    currentPrompt.startsWith("Use @PlateSketch as an exact square domemaster guide") ||
    currentPrompt.startsWith("Use @PlateSketch as a square bottom-facing")
  ) {
    return true;
  }
  return (
    (currentPrompt.startsWith("Use @PlateSketch") || currentPrompt.startsWith("Use @plate_sketch")) &&
    OBSOLETE_GENERATED_INPAINT_PROMPT_MARKERS.some((marker) => currentPrompt.includes(marker))
  );
}

function zenith180InpaintPrompt(domeGuideSemanticSplit?: number | string | null): string {
  return `Use @plate_sketch as an exact square domemaster guide. It is an equidistant 180 fulldome map with the zenith at the center and the horizon at the outer circle. Preserve the existing plate content, orientation, scale, and fisheye geometry. ${domeGuidePromptClause("zenith-180", domeGuideSemanticSplit)} ${INPAINT_GUIDE_PROMPT} Complete missing regions as a coherent continuation of the scene. No visible cyan/blue guide patches, green patches, mask edges, checkerboards, dividers, radial spokes, central holes, or repair boundaries. Output a clean opaque square domemaster image.`;
}

function zenith230InpaintPrompt(
  domeGuideSemanticSplit?: number | string | null,
  domeGuideHorizonSplit?: number | string | null,
): string {
  return `Use @plate_sketch as an exact square domemaster guide. It is an equidistant 230 fulldome map with the zenith at the center, the physical horizon direction remapped to the editable source-map horizon carrier, and the outer circle extending 25 degrees below the horizon. Preserve the existing plate content, orientation, scale, and fisheye geometry. ${domeGuidePromptClause("zenith-230", domeGuideSemanticSplit, domeGuideHorizonSplit)} ${INPAINT_GUIDE_PROMPT} Complete missing regions as a coherent continuation of the scene across the horizon transition. No visible cyan/blue guide patches, green patches, mask edges, checkerboards, dividers, radial spokes, central holes, or repair boundaries. Output a clean opaque square zenith 230 domemaster image.`;
}

function nadir180InpaintPrompt(domeGuideSemanticSplit?: number | string | null): string {
  return `Use @plate_sketch as a square bottom-facing equidistant 180 fisheye repair guide. ${NADIR_INPAINT_GUIDE_PROMPT} ${domeGuidePromptClause("nadir-180", domeGuideSemanticSplit)} Preserve the existing plate content, orientation, scale, and fisheye geometry. Complete missing regions as one coherent lower-facing environment. Sky-like material is allowed only near the horizon rim if the existing plates already show it there. No visible cyan/blue guide patches, green patches, mask edges, checkerboards, dividers, radial spokes, central holes, sky-filled center, or repair boundaries. Output a clean opaque square nadir fisheye image.`;
}

function cave270InpaintPrompt(
  domeGuideSemanticSplit?: number | string | null,
  domeGuideHorizonSplit?: number | string | null,
): string {
  const splitPercent = Math.round(normalizeSourceInnerGuideSplit(domeGuideSemanticSplit) * 100);
  const horizonPercent = Math.round(caveGuideHorizonBand(domeGuideSemanticSplit, domeGuideHorizonSplit) * 100);
  return `Repair @plate_sketch as a square projection-source map. This is a warped source texture for an immersive projection surface, not a camera image.

Geometric meaning of the map:
- the center region represents floor-source content directly under the viewer and currently occupies ${splitPercent}% of the source-map radius
- moving outward from the center means moving from floor surface into vertical perimeter surfaces
- the wall carrier has an eye-level/horizon breakpoint at ${horizonPercent}% of the source-map radius
- the outer square boundary represents the upper edge of the perimeter surface
- angular direction around the center corresponds to direction around the square perimeter
- the image is intentionally warped as a source map

Scaffold meaning:
- neon green center = missing floor image data
- cyan/blue outer regions = missing perimeter/vertical surface image data
- black square seam = removable floor-to-wall transition guide
- black rings = removable height/distance guides
- black rays = removable direction guides
- black outer marks = removable registration guides
${caveGuidePromptClause(domeGuideSemanticSplit, domeGuideHorizonSplit)}

Keep all real artwork pixels: their local placement, distortion, color, scale, texture, botanical forms, luminous graphics, atmosphere, reflections, and lighting. Use the visible artwork as the only visual evidence for botanical forms, translucent atmosphere, luminous interface marks, texture density, color, and material behavior.

Replace every scaffold region with coherent continuation of that artwork. The floor should transition naturally into the perimeter surfaces, and the floor-to-wall transition must become invisible finished image content. Remove all scaffold marks completely.

Do not output a room render, perspective view, cube map, hallway, panels, visible wall corners, visible floor edge, panorama, fisheye circle, dome bubble, or normal photograph.

Before output, verify: no green, no cyan/blue, no black guide lines, no visible floor-wall seam, no wall-corner outlines, no pasted plate edges, no generic fog.

Output one clean opaque square warped projection-source texture only.`;
}
export const DEFAULT_DEPTH_PROMPT = `Generate a metric depth map visualization where depth values are represented on a grayscale gradient from black (nearest objects) to white (farthest objects). Use precise linear interpolation across the depth range. Render as a clean, high-contrast grayscale image with smooth tonal transitions. No color, no overlays, no labels. Pure depth-to-brightness mapping where each shade of gray corresponds to a specific distance value in the scene. Preserve the square 180-degree domemaster fisheye layout exactly, including zenith center, circular horizon, and pure black outside the projection circle.`;
export const DEFAULT_SEEDANCE_PROMPT = `Use the input video as a rough fulldome domemaster motion guide. Preserve the circular fisheye composition, camera timing, parallax direction, scene identity, and pitch-black area outside the projection circle. Convert the depth-projected guide into coherent natural motion without adding text, borders, rectangular framing, UI marks, or visible mask artifacts.`;

export function createInitialState(): ZenithState {
  return {
    viewMode: DEFAULT_VIEW_MODE as ViewMode,
    activeWorkspace: "source",
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
  };
}

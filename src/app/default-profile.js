import defaultDepthMotionConfig from "../../docs/default-depth-motion-config.json" with { type: "json" };

const viewer = defaultDepthMotionConfig.viewer || {};
const viewerControls = viewer.controls || {};
const plateSketch = defaultDepthMotionConfig.plateSketch || {};
const plateControls = plateSketch.controls || {};
const inpaintControls = defaultDepthMotionConfig.inpaint?.controls || {};
const depthMotionControls = defaultDepthMotionConfig.depthMotion?.controls || {};
const seedance = defaultDepthMotionConfig.seedance || {};

export const DEFAULT_VIEW_MODE = String(viewer.viewMode || "flat");

export const DEFAULT_CAMERA = {
  insideYaw: numberOr(viewer.camera?.insideYaw, 0),
  insidePitch: numberOr(viewer.camera?.insidePitch, 0.48),
  theaterYaw: numberOr(viewer.camera?.theaterYaw, 0),
  orbitYaw: numberOr(viewer.camera?.orbitYaw, -0.72),
  orbitPitch: numberOr(viewer.camera?.orbitPitch, 0.5),
  orbitDistance: numberOr(viewer.camera?.orbitDistance, 3),
};

export const DEFAULT_ACTIVE_PLATE_INDEX = Math.max(0, Math.round(numberOr(plateSketch.activePlateIndex, 0)));

export const DEFAULT_PLATE_PLACEMENTS = Array.isArray(plateSketch.placements)
  ? plateSketch.placements.map((placement) => ({
      azimuth: numberOr(placement.azimuth, 0),
      radius: numberOr(placement.radius, 0.35),
      scale: numberOr(placement.scale ?? placement.width, 0.72),
      spin: numberOr(placement.spin, 0),
      opacity: numberOr(placement.opacity, 1),
      flipX: Boolean(placement.flipX),
      flipY: Boolean(placement.flipY),
    }))
  : [];

export const DEFAULT_PLATE_REFERENCES = Array.isArray(plateSketch.plates)
  ? plateSketch.plates
      .map((plate) => String(plate.name || "").trim())
      .filter(Boolean)
      .map((name) => ({
        name,
        url: `/default-plates/${encodeURIComponent(name)}`,
      }))
  : [];

export const DEFAULT_CONTROL_VALUES = {
  projectionMode: stringOr(viewerControls.projectionMode, "equidistant"),
  fov: numberOr(viewerControls.fov, 92),
  renderScale: numberOr(viewerControls.renderScale, 1),
  meshQuality: numberOr(viewerControls.meshQuality, 1),
  radiusScale: numberOr(viewerControls.radiusScale, 1),
  rotation: numberOr(viewerControls.rotation, 0),
  domeTilt: numberOr(viewerControls.domeTilt, 0),
  theaterEyeDrop: numberOr(viewerControls.theaterEyeDrop, 0.34),
  theaterSeatBack: numberOr(viewerControls.theaterSeatBack, 0.58),
  theaterPitch: numberOr(viewerControls.theaterPitch, 28),
  customCurve: numberOr(viewerControls.customCurve, 1),
  shellShade: numberOr(viewerControls.shellShade, 0.34),
  floorOpacity: numberOr(viewerControls.floorOpacity, 0.5),
  exposure: numberOr(viewerControls.exposure, 1),
  overlayOpacity: numberOr(viewerControls.overlayOpacity, 0.24),
  mirror: Boolean(viewerControls.mirror),
  showRings: booleanOr(viewerControls.showRings, true),
  showSpokes: booleanOr(viewerControls.showSpokes, true),
  showHorizon: booleanOr(viewerControls.showHorizon, true),
  showLabels: booleanOr(viewerControls.showLabels, true),
  showSourceCircle: booleanOr(viewerControls.showSourceCircle, true),
  showZenith: booleanOr(viewerControls.showZenith, true),
  plateFit: stringOr(plateControls.plateFit, "contain"),
  plateFeather: numberOr(plateControls.plateFeather, 0),
  editPlacement: Boolean(plateControls.editPlacement),
  runwayQuality: stringOr(inpaintControls.runwayQuality, "high"),
  runwayOutputCount: numberOr(inpaintControls.runwayOutputCount, 1),
  seedancePromptMode: stringOr(seedance.promptMode, "auto"),
  imageSeedancePromptMode: stringOr(seedance.imageToVideo?.promptMode, "auto"),
  imageSeedanceRatio: stringOr(seedance.imageToVideo?.ratio, "640:640"),
  depthPolarity: stringOr(depthMotionControls.depthPolarity, "brightFar"),
  depthGuideMode: stringOr(depthMotionControls.depthGuideMode, "depthShaded"),
  depthSketchSize: stringOr(depthMotionControls.depthSketchSize, "720"),
  depthNear: numberOr(depthMotionControls.depthNear, 1),
  depthFar: numberOr(depthMotionControls.depthFar, 12),
  depthSketchDuration: numberOr(depthMotionControls.depthSketchDuration, 6),
  depthSketchFps: numberOr(depthMotionControls.depthSketchFps, 12),
  depthMotionGain: numberOr(depthMotionControls.depthMotionGain, 3.45),
  depthContrast: numberOr(depthMotionControls.depthContrast, 0.5),
  depthGuideNoise: numberOr(depthMotionControls.depthGuideNoise, 0.025),
  depthSketchYaw: numberOr(depthMotionControls.depthSketchYaw, 1.6),
  depthSketchPitch: numberOr(depthMotionControls.depthSketchPitch, 0.4),
  depthSketchRoll: numberOr(depthMotionControls.depthSketchRoll, 0),
  depthSketchTruck: numberOr(depthMotionControls.depthSketchTruck, 0.26),
  depthSketchLift: numberOr(depthMotionControls.depthSketchLift, -0.04),
  depthSketchPush: numberOr(depthMotionControls.depthSketchPush, -0.12),
  depthSketchGapFill: numberOr(depthMotionControls.depthSketchGapFill, 0),
};

export function applyDefaultControlValues(controls) {
  for (const [key, value] of Object.entries(DEFAULT_CONTROL_VALUES)) {
    const control = controls[key];
    if (!control) continue;
    if (control.type === "checkbox") {
      control.checked = Boolean(value);
    } else {
      control.value = String(value);
    }
  }
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function stringOr(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function booleanOr(value, fallback) {
  return value === undefined || value === null ? fallback : Boolean(value);
}

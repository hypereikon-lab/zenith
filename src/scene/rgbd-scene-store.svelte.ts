import { defaultRgbdCameraPath } from "./camera-path.js";
import type {
  DepthAlignmentResult,
  FeatureAnchorReport,
  RgbdCameraPath,
  RgbdDepthArtifact,
  RgbdFusedView,
  RgbdProxyArtifact,
  RgbdReconstructionArtifact,
  RgbdSceneMap,
} from "./rgbd-scene-types.js";

export type RgbdLabStep = "scene" | "path" | "proxy" | "reconstruct" | "depth" | "align" | "fuse" | "render";

export type RgbdLabJob = {
  id: string;
  label: string;
  stage: string;
  progress: number | null;
  busy: boolean;
};

export type RgbdPendingPaidAction = {
  id: "reconstruct-proxy-view" | "generate-proxy-depth";
  label: string;
  body: string;
} | null;

export type RgbdCanvasHandleSet = {
  sourceCanvas?: HTMLCanvasElement | null;
  depthCanvas?: HTMLCanvasElement | null;
  proxyRgbCanvas?: HTMLCanvasElement | null;
  proxyDepthCanvas?: HTMLCanvasElement | null;
  knownMaskCanvas?: HTMLCanvasElement | null;
  disocclusionMaskCanvas?: HTMLCanvasElement | null;
  confidenceCanvas?: HTMLCanvasElement | null;
  reconstructionCanvas?: HTMLCanvasElement | null;
  generatedDepthCanvas?: HTMLCanvasElement | null;
  alignedDepthCanvas?: HTMLCanvasElement | null;
};

export const rgbdLab = $state({
  selectedStep: "scene" as RgbdLabStep,
  selectedKeyframeId: "keyframe-expand",
  scene: null as RgbdSceneMap | null,
  cameraPath: defaultRgbdCameraPath() as RgbdCameraPath,
  proxy: null as RgbdProxyArtifact | null,
  reconstruction: null as RgbdReconstructionArtifact | null,
  depth: null as RgbdDepthArtifact | null,
  alignment: null as DepthAlignmentResult | null,
  featureReport: null as FeatureAnchorReport | null,
  fusedView: null as RgbdFusedView | null,
  renderTarget: "rectangular" as "rectangular" | "domemaster" | "cave-270" | "video-handoff",
  proxySize: {
    width: 1280,
    height: 720,
  },
  promptDrafts: {
    reconstruct:
      "Reconstruct this RGBD proxy camera view as a clean continuation of the same immersive scene. Preserve all known pixels, object identities, lighting, material behavior, and camera perspective from the proxy. Use the known-pixel mask as locked structure and reconstruct only the black/empty/disoccluded regions as newly revealed world content. Do not change the camera angle, do not flatten it into a panorama, do not add text, UI, borders, or diagram marks. Fill holes with coherent geometry that could exist behind the currently visible flowers, holographic overlays, sky, floor, walls, or dome/CAVE surface.",
    depth:
      "Generate a clean grayscale relative depth map for this reconstructed RGBD proxy view. Use black for nearest visible surfaces and white for farthest visible surfaces. Preserve the rectangular camera view exactly. Do not add color, labels, outlines, UI, text, or decorative marks. This depth map is a relative dense prior that will be aligned against existing RGBD geometry, so maintain smooth, coherent object ordering and consistent depth boundaries.",
  },
  jobs: [] as RgbdLabJob[],
  pendingPaidAction: null as RgbdPendingPaidAction,
  errors: [] as { id: string; message: string; createdAt: string }[],
  notes: [
    "The source map is treated as one projection of an evolving RGBD scene, not as the whole world.",
    "GPT/Gemini-generated regions remain lower-confidence until reinforced by later views.",
  ],
});

export const rgbdCanvasHandles = $state.raw<RgbdCanvasHandleSet>({});

const selectedKeyframeValue = $derived.by(
  () => rgbdLab.cameraPath.keyframes.find((keyframe) => keyframe.id === rgbdLab.selectedKeyframeId) || rgbdLab.cameraPath.keyframes[0],
);

const sceneReadyValue = $derived.by(() => Boolean(rgbdLab.scene?.seed));

const canRenderProxyValue = $derived.by(() => sceneReadyValue && Boolean(selectedKeyframeValue));

const canAlignDepthValue = $derived.by(() => Boolean(rgbdLab.proxy && rgbdLab.reconstruction && rgbdLab.depth));

const canFuseValue = $derived.by(() => Boolean(rgbdLab.scene && rgbdLab.proxy && rgbdLab.reconstruction && rgbdLab.depth && rgbdLab.alignment));

export function getSelectedRgbdKeyframe() {
  return selectedKeyframeValue;
}

export function sceneIsReady() {
  return sceneReadyValue;
}

export function canRenderRgbdProxy() {
  return canRenderProxyValue;
}

export function canAlignRgbdDepth() {
  return canAlignDepthValue;
}

export function canFuseRgbdView() {
  return canFuseValue;
}

export function setRgbdStep(step: RgbdLabStep): void {
  rgbdLab.selectedStep = step;
}

export function startRgbdJob(id: string, label: string, stage = "Starting"): void {
  rgbdLab.jobs.unshift({ id, label, stage, progress: 0.01, busy: true });
}

export function updateRgbdJob(id: string, stage: string, progress: number | null = null): void {
  const job = rgbdLab.jobs.find((item) => item.id === id && item.busy);
  if (!job) return;
  job.stage = stage;
  job.progress = progress;
}

export function finishRgbdJob(id: string, stage = "Done"): void {
  const job = rgbdLab.jobs.find((item) => item.id === id && item.busy);
  if (!job) return;
  job.stage = stage;
  job.progress = 1;
  job.busy = false;
}

export function recordRgbdError(message: string): void {
  rgbdLab.errors.unshift({ id: `rgbd-error-${Date.now()}`, message, createdAt: new Date().toISOString() });
  rgbdLab.errors = rgbdLab.errors.slice(0, 5);
}

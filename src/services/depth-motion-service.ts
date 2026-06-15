import { canvasToBlob, loadCanvasFromImageSource } from "../media/canvas-utils.js";
import { encodeCanvasSequenceMp4 } from "../media/webcodecs-mp4.js";
import {
  createDepthProjectionProfile,
  normalizeDepthMotionSettings,
  type DepthGuideMode,
  type DepthMotionInput,
  type DepthMotionSettings,
  type DepthPolarity,
} from "../sketch/depth-parallax-renderer.js";
import { createDepthWebGpuPreviewRenderer } from "../sketch/depth-webgpu-renderer.js";
import { clamp } from "../projection.js";

export type DepthMotionWorkbenchConfig = {
  duration: number;
  fps: number;
  size: number;
  radiusScale: number;
  yaw: number;
  pitch: number;
  roll: number;
  truck: number;
  lift: number;
  push: number;
  depthGain: number;
  nearMeters: number;
  farMeters: number;
  depthContrast: number;
  gapFillPasses: number;
  polarity: DepthPolarity;
  guideMode: DepthGuideMode;
  emptyBackground: "black" | "greenDome";
};

export type DepthMotionRenderOptions = {
  sourceCanvas: HTMLCanvasElement;
  depthCanvas: HTMLCanvasElement;
  config: DepthMotionWorkbenchConfig;
  onProgress?: (stage: string, progress: number) => void;
};

export type DepthMotionProxyResult = {
  blob: Blob;
  url: string;
  settings: DepthMotionSettings & { size: number; duration: number; fps: number; frameCount: number };
};

export type DisplacedEndpointResult = {
  blob: Blob;
  url: string;
  canvas: HTMLCanvasElement;
  settings: DepthMotionSettings & { size: number };
};

export async function imageArtifactUrlToCanvas(url: string): Promise<HTMLCanvasElement> {
  return loadCanvasFromImageSource(url);
}

export async function renderDepthMotionProxy({
  sourceCanvas,
  depthCanvas,
  config,
  onProgress = () => {},
}: DepthMotionRenderOptions): Promise<DepthMotionProxyResult> {
  assertDepthMotionRuntime({ needsVideoEncoder: true });
  const { renderer, outputCanvas, profile, settings, size } = createExportRenderer({
    config,
  });
  const duration = clamp(Number(config.duration) || 5, 1, 15);
  const fps = Math.round(clamp(Number(config.fps) || 24, 6, 30));
  const frameCount = Math.max(2, Math.round(duration * fps));
  const blob = await encodeCanvasSequenceMp4({
    width: size,
    height: size,
    fps,
    frameCount,
    renderFrame: async (progress) => {
      await renderer.render({
        sourceCanvas,
        depthCanvas,
        profile,
        settings,
        progress,
        waitForCompletion: true,
        emptyBackground: config.emptyBackground,
      });
      return outputCanvas;
    },
    onProgress,
  });
  return {
    blob,
    url: URL.createObjectURL(blob),
    settings: { ...settings, size, duration, fps, frameCount },
  };
}

export async function renderDisplacedEndpoint({
  sourceCanvas,
  depthCanvas,
  config,
  onProgress = () => {},
}: DepthMotionRenderOptions): Promise<DisplacedEndpointResult> {
  assertDepthMotionRuntime();
  const { renderer, outputCanvas, profile, settings, size } = createExportRenderer({
    config,
  });
  onProgress("Rendering endpoint", 0.18);
  await renderer.render({
    sourceCanvas,
    depthCanvas,
    profile,
    settings: { ...settings, guideMode: "source", guideNoise: 0 },
    progress: 1,
    waitForCompletion: true,
    emptyBackground: config.emptyBackground,
  });
  onProgress("Serializing PNG", 0.82);
  const blob = await canvasToBlob(outputCanvas, "image/png");
  return {
    blob,
    url: URL.createObjectURL(blob),
    canvas: outputCanvas,
    settings: { ...settings, size },
  };
}

export function depthMotionConfigToSettings(config: DepthMotionWorkbenchConfig): DepthMotionSettings & { size: number } {
  const size = Math.round(clamp(Number(config.size) || 1024, 256, 1536));
  return {
    ...normalizeDepthMotionSettings(toDepthMotionInput(config)),
    size,
  };
}

export function exportableDepthMotionConfig(config: DepthMotionWorkbenchConfig) {
  const settings = depthMotionConfigToSettings(config);
  return {
    version: 1,
    engine: "zenith-webgpu-depth-motion",
    output: {
      duration: clamp(Number(config.duration) || 5, 1, 15),
      fps: Math.round(clamp(Number(config.fps) || 24, 6, 30)),
      size: settings.size,
      emptyBackground: config.emptyBackground,
      radiusScale: clamp(Number(config.radiusScale) || 1, 0.25, 2),
    },
    settings,
  };
}

function createExportRenderer({
  config,
}: Required<Pick<DepthMotionRenderOptions, "config">>) {
  const size = Math.round(clamp(Number(config.size) || 1024, 256, 1536));
  const profile = createDepthProjectionProfile({
    size,
    radiusScale: clamp(Number(config.radiusScale) || 1, 0.25, 2),
  });
  const settings = normalizeDepthMotionSettings(toDepthMotionInput(config));
  const outputCanvas = document.createElement("canvas");
  const renderer = createDepthWebGpuPreviewRenderer({ canvas: outputCanvas });
  return { renderer, outputCanvas, profile, settings, size };
}

function toDepthMotionInput(config: DepthMotionWorkbenchConfig): DepthMotionInput {
  return {
    nearMeters: config.nearMeters,
    farMeters: config.farMeters,
    polarity: config.polarity,
    yawDegrees: config.yaw,
    pitchDegrees: config.pitch,
    rollDegrees: config.roll,
    truckMeters: config.truck,
    liftMeters: config.lift,
    pushMeters: config.push,
    motionGain: config.depthGain,
    depthContrast: config.depthContrast,
    guideMode: config.guideMode,
    guideNoise: 0,
    gapFillPasses: config.gapFillPasses,
  };
}

function assertDepthMotionRuntime({ needsVideoEncoder = false }: { needsVideoEncoder?: boolean } = {}): void {
  if (typeof document === "undefined" || typeof navigator === "undefined") {
    throw new Error("Depth motion rendering must run in a browser.");
  }
  if (!navigator.gpu) {
    throw new Error("WebGPU is required for the real 2.5D depth-motion engine.");
  }
  if (needsVideoEncoder && (!("VideoEncoder" in globalThis) || !("VideoFrame" in globalThis))) {
    throw new Error("WebCodecs MP4 encoding is required to export the real Motion Draft video.");
  }
}

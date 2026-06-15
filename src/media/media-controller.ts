import { cloneCanvas, imageBitmapToCanvas } from "./canvas-utils.js";
import { createDefaultMap } from "./default-map.js";
import { formatMediaTime } from "./video-transport.js";
import type { ScheduleWorkspaceAutosave, SetGpuState, ZenithState } from "../app/types.js";
import type { PipelineReadouts } from "../app/pipeline-state.svelte.js";

type UploadOptions = { preserveDepthPreview?: boolean };
type DisplayTextureOptions = { sourceCanvas?: HTMLCanvasElement | null };
type RestoreOptions = { preservePreviewState?: boolean };
type MediaUploadSource = ImageBitmap | HTMLCanvasElement | HTMLVideoElement;
type MediaControllerOptions = {
  state: ZenithState;
  elements: {
    playbackRate: HTMLSelectElement | HTMLInputElement;
  };
  video: HTMLVideoElement;
  videoTransport: {
    stopFrameLoop: () => void;
    startFrameLoop: () => void;
    waitForMetadata: () => Promise<void>;
    setControlsEnabled: (enabled: boolean) => void;
    updateTransport: () => void;
  };
  renderer: {
    createMediaTexture: (width: number, height: number) => void;
    uploadMediaSource: (source: MediaUploadSource, width: number, height: number, options?: UploadOptions) => void;
    bindExternalSourceTexture: (texture: GPUTexture) => void;
    restoreOwnedSourceTexture: () => void;
    resetVideoUploadState: () => void;
  };
  runwayOperations: {
    abortAll: (message: string) => void;
  };
  actions: {
    clearDepthMapState?: (message: string) => void;
    setGpuState: SetGpuState;
    setReadouts: (readouts: Partial<PipelineReadouts>) => void;
    scheduleWorkspaceAutosave: ScheduleWorkspaceAutosave;
  };
};

export function createMediaController({
  state,
  elements,
  video,
  videoTransport,
  renderer,
  runwayOperations,
  actions,
}: MediaControllerOptions) {
  async function loadDefaultTexture() {
    const defaultMap = createDefaultMap(2048);
    const bitmap = await createImageBitmap(defaultMap);
    uploadMediaSource(bitmap, bitmap.width, bitmap.height);
    state.mediaKind = "image";
    state.sourceWidth = bitmap.width;
    state.sourceHeight = bitmap.height;
    state.sourceName = "Procedural 180 map";
    state.sourceCanvas = cloneCanvas(defaultMap);
    updateMediaReadouts();
  }

  async function loadMediaFileSafely(file: File): Promise<void> {
    runwayOperations.abortAll("Media source changed.");
    try {
      await loadMediaFile(file);
      actions.clearDepthMapState?.("Depth map cleared after source change");
      actions.setGpuState("Ready", false);
      actions.scheduleWorkspaceAutosave("media", 200);
    } catch (error) {
      console.error(error);
      actions.setGpuState("Media failed", true);
      actions.setReadouts({ source: `Could not load ${file.name}` });
    }
  }

  async function loadMediaFile(file: File): Promise<void> {
    videoTransport.stopFrameLoop();
    if (state.sourceUrl) {
      URL.revokeObjectURL(state.sourceUrl);
      state.sourceUrl = null;
    }

    if (file.type.startsWith("video/")) {
      video.pause();
      renderer.resetVideoUploadState();
      state.pendingVideoUpload = true;
      state.lastFrameMediaTime = null;
      state.sourceUrl = URL.createObjectURL(file);
      video.preload = "auto";
      video.src = state.sourceUrl;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.playbackRate = Number(elements.playbackRate.value);
      video.load();
      await videoTransport.waitForMetadata();
      createMediaTexture(video.videoWidth, video.videoHeight);
      state.sourceWidth = video.videoWidth;
      state.sourceHeight = video.videoHeight;
      state.sourceName = file.name;
      state.mediaDuration = Number.isFinite(video.duration) ? video.duration : 0;
      state.mediaKind = "video";
      state.sourceCanvas = null;
      videoTransport.startFrameLoop();
      videoTransport.setControlsEnabled(true);
      updateMediaReadouts();
      videoTransport.updateTransport();
    } else {
      video.pause();
      video.removeAttribute("src");
      video.load();
      renderer.resetVideoUploadState();
      const bitmap = await createImageBitmap(file);
      const imageCanvas = imageBitmapToCanvas(bitmap);
      uploadMediaSource(bitmap, bitmap.width, bitmap.height);
      state.mediaKind = "image";
      state.sourceWidth = bitmap.width;
      state.sourceHeight = bitmap.height;
      state.sourceName = file.name;
      state.sourceCanvas = imageCanvas;
      state.mediaDuration = 0;
      videoTransport.setControlsEnabled(false);
      updateMediaReadouts();
      videoTransport.updateTransport();
    }
  }

  function createMediaTexture(width: number, height: number): void {
    renderer.createMediaTexture(width, height);
  }

  function uploadMediaSource(source: MediaUploadSource, width: number, height: number, options: UploadOptions = {}): void {
    if (!options.preserveDepthPreview) {
      clearDepthPreviewSource({ restore: false });
    }
    renderer.uploadMediaSource(source, width, height);
  }

  function displayDepthPreviewTexture(texture: GPUTexture, width: number, height: number, name = "Depth GPU preview"): void {
    state.depthPreviewActive = true;
    state.depthPreviewWidth = width;
    state.depthPreviewHeight = height;
    state.depthPreviewName = name;
    state.depthPreviewSourceKind = "texture";
    renderer.bindExternalSourceTexture(texture);
    updateMediaReadouts();
  }

  function displayTextureAsSource(
    texture: GPUTexture,
    width: number,
    height: number,
    name: string,
    options: DisplayTextureOptions = {},
  ): void {
    clearDepthPreviewSource({ restore: false });
    renderer.bindExternalSourceTexture(texture);
    state.mediaKind = "image";
    state.sourceWidth = width;
    state.sourceHeight = height;
    state.sourceName = name;
    state.sourceCanvas = options.sourceCanvas || null;
    state.mediaDuration = 0;
    videoTransport.setControlsEnabled(false);
    updateMediaReadouts();
    videoTransport.updateTransport();
  }

  function displayDepthPreviewCanvas(canvas: HTMLCanvasElement, name = "Depth motion frame"): void {
    state.depthPreviewActive = true;
    state.depthPreviewWidth = canvas.width;
    state.depthPreviewHeight = canvas.height;
    state.depthPreviewName = name;
    state.depthPreviewSourceKind = "canvas";
    renderer.uploadMediaSource(canvas, canvas.width, canvas.height);
    updateMediaReadouts();
  }

  function displayTemporaryCanvas(canvas: HTMLCanvasElement, name = "Temporary preview"): void {
    state.depthPreviewActive = true;
    state.depthPreviewWidth = canvas.width;
    state.depthPreviewHeight = canvas.height;
    state.depthPreviewName = name;
    state.depthPreviewSourceKind = "canvas";
    renderer.uploadMediaSource(canvas, canvas.width, canvas.height, { preserveDepthPreview: true });
    updateMediaReadouts();
  }

  function clearDepthPreviewSource({ restore = true }: { restore?: boolean } = {}): void {
    if (!state.depthPreviewActive && !state.depthPreviewSourceKind) return;
    state.depthPreviewActive = false;
    state.depthPreviewWidth = 0;
    state.depthPreviewHeight = 0;
    state.depthPreviewName = "";
    state.depthPreviewSourceKind = "";
    if (restore) {
      restoreMediaTexture({ preservePreviewState: true });
    } else {
      renderer.restoreOwnedSourceTexture();
      updateMediaReadouts();
    }
  }

  function restoreMediaTexture(options: RestoreOptions = {}): void {
    if (!options.preservePreviewState) {
      state.depthPreviewActive = false;
      state.depthPreviewWidth = 0;
      state.depthPreviewHeight = 0;
      state.depthPreviewName = "";
      state.depthPreviewSourceKind = "";
    }

    if (state.sourceCanvas) {
      renderer.uploadMediaSource(state.sourceCanvas, state.sourceWidth, state.sourceHeight);
    } else if (state.mediaKind === "video" && video.videoWidth > 0 && video.videoHeight > 0) {
      renderer.createMediaTexture(video.videoWidth, video.videoHeight);
      renderer.resetVideoUploadState();
      state.pendingVideoUpload = true;
    } else {
      renderer.restoreOwnedSourceTexture();
    }
    updateMediaReadouts();
  }

  function uploadCanvasAsSource(canvas: HTMLCanvasElement, name: string): void {
    uploadMediaSource(canvas, canvas.width, canvas.height);
    state.mediaKind = "image";
    state.sourceWidth = canvas.width;
    state.sourceHeight = canvas.height;
    state.sourceName = name;
    state.sourceCanvas = cloneCanvas(canvas);
    state.mediaDuration = 0;
    actions.clearDepthMapState?.("Depth map cleared after source change");
    updateMediaReadouts();
    videoTransport.updateTransport();
    actions.scheduleWorkspaceAutosave("source", 300);
  }

  function updateMediaReadouts(): void {
    if (state.depthPreviewActive) {
      const width = state.depthPreviewWidth || state.sourceWidth;
      const height = state.depthPreviewHeight || state.sourceHeight;
      actions.setReadouts({
        source: state.depthPreviewName || "Depth motion preview",
        media: `${width} x ${height} depth motion`,
        upload: state.depthPreviewSourceKind === "texture" ? "Depth GPU texture" : "Depth preview frame",
      });
      return;
    }
    const source = state.sourceName;
    if (state.mediaKind === "video") {
      const duration = state.mediaDuration ? `, ${formatMediaTime(state.mediaDuration)}` : "";
      actions.setReadouts({
        source,
        media: `${state.sourceWidth} x ${state.sourceHeight} video${duration}`,
        upload: "Pending direct WebGPU video frame",
      });
    } else {
      actions.setReadouts({
        source,
        media: `${state.sourceWidth} x ${state.sourceHeight} image`,
        upload: "Image texture",
      });
    }
  }

  return {
    loadDefaultTexture,
    loadMediaFileSafely,
    loadMediaFile,
    createMediaTexture,
    uploadMediaSource,
    uploadCanvasAsSource,
    displayTextureAsSource,
    displayDepthPreviewTexture,
    displayDepthPreviewCanvas,
    displayTemporaryCanvas,
    clearDepthPreviewSource,
    restoreMediaTexture,
    updateMediaReadouts,
  };
}

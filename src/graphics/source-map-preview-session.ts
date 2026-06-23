import { sourceProjectionLabel } from "../geometry/source-projection.js";
import { plateEditorViewLabel, type PlateEditorCamera, type PlateEditorViewMode } from "../plates/plate-editor-view.js";
import { createSourceMapPreviewRenderer, type SourceMapPreviewRenderer } from "./source-map-preview-renderer.js";
import type { ArtifactMedia } from "../artifacts/artifact-types.js";
import type { SourceProjectionMode } from "../geometry/source-projection.js";

export type SourceMapPreviewImageSize = { width: number; height: number };
export type SourceMapPreviewVideoClock = { videoTime: number; videoDuration: number };
export type SourceMapPreviewSessionUpdate = {
  status?: string;
  imageSize?: SourceMapPreviewImageSize;
  videoClock?: SourceMapPreviewVideoClock;
};

export type SourceMapPreviewSessionRenderInput = {
  mediaUrl: string;
  mediaKind: ArtifactMedia["kind"];
  sourceVideo: HTMLVideoElement | null;
  projectionProfile: SourceProjectionMode;
  viewerMode: "domemaster" | "dome-check" | "rim-check";
  selectedViewMode: PlateEditorViewMode;
  camera: Partial<PlateEditorCamera>;
  domeGuideSemanticSplit: number;
  domeGuideHorizonSplit: number;
  showCaveMask: boolean;
  invertCaveMask: boolean;
  width: number;
  height: number;
  label: string;
};

type SourceMapPreviewSessionOptions = {
  createRenderer?: (canvas: HTMLCanvasElement) => Promise<SourceMapPreviewRenderer>;
  fetchSource?: typeof fetch;
  createBitmap?: typeof createImageBitmap;
  requestAnimationFrame?: typeof requestAnimationFrame;
  cancelAnimationFrame?: typeof cancelAnimationFrame;
};

export type SourceMapPreviewSession = {
  renderMedia: (
    input: SourceMapPreviewSessionRenderInput,
    emit?: (update: SourceMapPreviewSessionUpdate) => void,
  ) => Promise<SourceMapPreviewSessionUpdate | null>;
  startVideoRenderLoop: (video: HTMLVideoElement, renderFrame: () => void) => void;
  stopVideoRenderLoop: () => void;
  updateVideoClock: (video: HTMLVideoElement | null) => SourceMapPreviewVideoClock | null;
  destroy: () => void;
};

export function createSourceMapPreviewSession(
  canvas: HTMLCanvasElement,
  {
    createRenderer = createSourceMapPreviewRenderer,
    fetchSource = defaultFetchSource,
    createBitmap = defaultCreateBitmap,
    requestAnimationFrame: scheduleFrame = defaultRequestAnimationFrame,
    cancelAnimationFrame: cancelFrame = defaultCancelAnimationFrame,
  }: SourceMapPreviewSessionOptions = {},
): SourceMapPreviewSession {
  let renderer: SourceMapPreviewRenderer | null = null;
  let rendererPromise: Promise<SourceMapPreviewRenderer> | null = null;
  let imageBitmap: ImageBitmap | null = null;
  let loadedSourceKey = "";
  let imageSize: SourceMapPreviewImageSize = { width: 0, height: 0 };
  let renderSerial = 0;
  let videoFrameRequest: number | null = null;
  let videoFrameCallbackId: number | null = null;
  let activeVideoElement: HTMLVideoElement | null = null;
  let destroyed = false;

  async function ensureRenderer(): Promise<SourceMapPreviewRenderer> {
    if (renderer) return renderer;
    if (!rendererPromise) {
      rendererPromise = createRenderer(canvas).then((created) => {
        if (destroyed) {
          created.destroy();
          return created;
        }
        renderer = created;
        return created;
      });
    }
    return rendererPromise;
  }

  async function renderMedia(
    input: SourceMapPreviewSessionRenderInput,
    emit: (update: SourceMapPreviewSessionUpdate) => void = () => {},
  ): Promise<SourceMapPreviewSessionUpdate | null> {
    if (destroyed) return null;
    const serial = ++renderSerial;
    const mediaUrl = input.mediaUrl || "";
    if ((input.mediaKind !== "image" && input.mediaKind !== "video") || !mediaUrl) {
      loadedSourceKey = "";
      closeImageBitmap();
      stopVideoRenderLoop();
      const update = { status: "No media loaded." };
      emit(update);
      return update;
    }

    try {
      const gpu = await ensureRenderer();
      if (destroyed || serial !== renderSerial) return null;

      if (input.mediaKind === "video") {
        closeImageBitmap();
        return renderVideoFrame(gpu, input, mediaUrl, emit);
      }

      const update = await renderImage(gpu, input, mediaUrl, serial, emit);
      if (update) emit(update);
      return update;
    } catch (error) {
      console.error(error);
      const update = { status: error instanceof Error ? error.message : "Could not render Media Preview." };
      emit(update);
      return update;
    }
  }

  function renderVideoFrame(
    gpu: SourceMapPreviewRenderer,
    input: SourceMapPreviewSessionRenderInput,
    mediaUrl: string,
    emit: (update: SourceMapPreviewSessionUpdate) => void,
  ): SourceMapPreviewSessionUpdate {
    const video = input.sourceVideo;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      loadedSourceKey = `video:${mediaUrl}`;
      const update = {
        status: "Loading MP4 frame for WebGPU projection preview...",
        imageSize,
      };
      emit(update);
      return update;
    }

    gpu.setSourceImage(video);
    imageSize = { width: video.videoWidth, height: video.videoHeight };
    loadedSourceKey = `video:${mediaUrl}`;
    gpu.render(renderOptions(input));
    const update = {
      status: `${input.label} MP4 mapped as ${sourceProjectionLabel(input.projectionProfile)} / ${plateEditorViewLabel(input.selectedViewMode)}${
        imageSize.width > 0 ? ` (${imageSize.width} x ${imageSize.height})` : ""
      }.`,
      imageSize,
      videoClock: videoClock(video),
    };
    emit(update);
    return update;
  }

  async function renderImage(
    gpu: SourceMapPreviewRenderer,
    input: SourceMapPreviewSessionRenderInput,
    mediaUrl: string,
    serial: number,
    emit: (update: SourceMapPreviewSessionUpdate) => void,
  ): Promise<SourceMapPreviewSessionUpdate | null> {
    if (loadedSourceKey !== `image:${mediaUrl}`) {
      stopVideoRenderLoop();
      emit({ status: "Loading image into WebGPU Media Preview..." });
      const response = await fetchSource(mediaUrl);
      if (!response.ok) throw new Error("Could not load Media Preview image.");
      const bitmap = await createBitmap(await response.blob(), { imageOrientation: "from-image" });
      if (serial !== renderSerial) {
        bitmap.close();
        return null;
      }
      closeImageBitmap();
      imageBitmap = bitmap;
      imageSize = { width: bitmap.width, height: bitmap.height };
      gpu.setSourceImage(bitmap);
      loadedSourceKey = `image:${mediaUrl}`;
    }

    gpu.render(renderOptions(input));
    return {
      status: `${input.label} mapped as ${sourceProjectionLabel(input.projectionProfile)} / ${plateEditorViewLabel(input.selectedViewMode)}${
        imageSize.width > 0 ? ` (${imageSize.width} x ${imageSize.height})` : ""
      }.`,
      imageSize,
    };
  }

  function renderOptions(input: SourceMapPreviewSessionRenderInput) {
    return {
      width: input.width,
      height: input.height,
      sourceProjectionMode: input.projectionProfile,
      projectionViewMode: input.selectedViewMode,
      projectionCamera: input.camera,
      showProjectionGuides: input.viewerMode !== "domemaster",
      domeGuideSemanticSplit: input.domeGuideSemanticSplit,
      domeGuideHorizonSplit: input.domeGuideHorizonSplit,
      showCaveMask: input.showCaveMask,
      invertCaveMask: input.invertCaveMask,
    };
  }

  function startVideoRenderLoop(video: HTMLVideoElement, renderFrame: () => void): void {
    activeVideoElement = video;
    const videoFrameElement = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: FrameRequestCallback) => number;
      cancelVideoFrameCallback?: (handle: number) => void;
    };
    if (typeof videoFrameElement.requestVideoFrameCallback === "function") {
      if (videoFrameCallbackId !== null) return;
      const tick = () => {
        videoFrameCallbackId = null;
        if (video.paused || video.ended) return;
        renderFrame();
        videoFrameCallbackId = videoFrameElement.requestVideoFrameCallback!(tick);
      };
      videoFrameCallbackId = videoFrameElement.requestVideoFrameCallback(tick);
      return;
    }

    if (videoFrameRequest !== null) return;
    const tick = () => {
      videoFrameRequest = null;
      if (video.paused || video.ended) return;
      renderFrame();
      videoFrameRequest = scheduleFrame(tick);
    };
    videoFrameRequest = scheduleFrame(tick);
  }

  function stopVideoRenderLoop(): void {
    const video = activeVideoElement as
      | (HTMLVideoElement & {
          cancelVideoFrameCallback?: (handle: number) => void;
        })
      | null;
    if (videoFrameCallbackId !== null && typeof video?.cancelVideoFrameCallback === "function") {
      video.cancelVideoFrameCallback(videoFrameCallbackId);
      videoFrameCallbackId = null;
    }
    if (videoFrameRequest !== null) {
      cancelFrame(videoFrameRequest);
      videoFrameRequest = null;
    }
  }

  function updateVideoClock(video: HTMLVideoElement | null): SourceMapPreviewVideoClock | null {
    return video ? videoClock(video) : null;
  }

  function destroy(): void {
    destroyed = true;
    renderSerial += 1;
    stopVideoRenderLoop();
    closeImageBitmap();
    renderer?.destroy();
    renderer = null;
    rendererPromise = null;
  }

  function closeImageBitmap(): void {
    imageBitmap?.close();
    imageBitmap = null;
  }

  return {
    renderMedia,
    startVideoRenderLoop,
    stopVideoRenderLoop,
    updateVideoClock,
    destroy,
  };
}

function videoClock(video: HTMLVideoElement): SourceMapPreviewVideoClock {
  return {
    videoTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
    videoDuration: Number.isFinite(video.duration) ? video.duration : 0,
  };
}

const defaultFetchSource: typeof fetch = (...args) => {
  if (typeof globalThis.fetch !== "function") {
    return Promise.reject(new Error("Fetch is not available for Media Preview."));
  }
  return globalThis.fetch(...args);
};

const defaultCreateBitmap = ((...args: unknown[]) => {
  if (typeof globalThis.createImageBitmap !== "function") {
    return Promise.reject(new Error("createImageBitmap is not available for Media Preview."));
  }
  return (globalThis.createImageBitmap as (...bitmapArgs: unknown[]) => Promise<ImageBitmap>)(...args);
}) as typeof createImageBitmap;

const defaultRequestAnimationFrame: typeof requestAnimationFrame = (callback) => {
  if (typeof globalThis.requestAnimationFrame !== "function") {
    throw new Error("requestAnimationFrame is not available for Media Preview.");
  }
  return globalThis.requestAnimationFrame(callback);
};

const defaultCancelAnimationFrame: typeof cancelAnimationFrame = (handle) => {
  if (typeof globalThis.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(handle);
  }
};

import { cloneCanvas, imageBitmapToCanvas } from "./canvas-utils.js";
import { createDefaultMap } from "./default-map.js";
import { formatMediaTime } from "./video-transport.js";

export function createMediaController({ state, elements, video, videoTransport, renderer, runwayOperations, actions }) {
  const { sourceReadout, mediaReadout, uploadReadout } = elements;

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

  async function loadMediaFileSafely(file) {
    runwayOperations.abortAll("Media source changed.");
    try {
      await loadMediaFile(file);
      actions.clearDepthMapState?.("Depth map cleared after source change");
      actions.setGpuState("Ready", false);
      actions.scheduleWorkspaceAutosave("media", 200);
    } catch (error) {
      console.error(error);
      actions.setGpuState("Media failed", true);
      sourceReadout.textContent = `Could not load ${file.name}`;
    }
  }

  async function loadMediaFile(file) {
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

  function createMediaTexture(width, height) {
    renderer.createMediaTexture(width, height);
  }

  function uploadMediaSource(source, width, height, options = {}) {
    if (!options.preserveDepthPreview) {
      clearDepthPreviewSource({ restore: false });
    }
    renderer.uploadMediaSource(source, width, height);
  }

  function displayDepthPreviewTexture(texture, width, height, name = "Depth GPU preview") {
    state.depthPreviewActive = true;
    state.depthPreviewWidth = width;
    state.depthPreviewHeight = height;
    state.depthPreviewName = name;
    state.depthPreviewSourceKind = "texture";
    renderer.bindExternalSourceTexture(texture);
    updateMediaReadouts();
  }

  function displayTextureAsSource(texture, width, height, name, options = {}) {
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

  function displayDepthPreviewCanvas(canvas, name = "Depth motion frame") {
    state.depthPreviewActive = true;
    state.depthPreviewWidth = canvas.width;
    state.depthPreviewHeight = canvas.height;
    state.depthPreviewName = name;
    state.depthPreviewSourceKind = "canvas";
    renderer.uploadMediaSource(canvas, canvas.width, canvas.height);
    updateMediaReadouts();
  }

  function displayTemporaryCanvas(canvas, name = "Temporary preview") {
    state.depthPreviewActive = true;
    state.depthPreviewWidth = canvas.width;
    state.depthPreviewHeight = canvas.height;
    state.depthPreviewName = name;
    state.depthPreviewSourceKind = "canvas";
    renderer.uploadMediaSource(canvas, canvas.width, canvas.height, { preserveDepthPreview: true });
    updateMediaReadouts();
  }

  function clearDepthPreviewSource({ restore = true } = {}) {
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

  function restoreMediaTexture(options = {}) {
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

  function uploadCanvasAsSource(canvas, name) {
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

  function updateMediaReadouts() {
    if (state.depthPreviewActive) {
      const width = state.depthPreviewWidth || state.sourceWidth;
      const height = state.depthPreviewHeight || state.sourceHeight;
      sourceReadout.textContent = state.depthPreviewName || "Depth motion preview";
      mediaReadout.textContent = `${width} x ${height} depth motion`;
      uploadReadout.textContent = state.depthPreviewSourceKind === "texture" ? "Depth GPU texture" : "Depth preview frame";
      return;
    }
    sourceReadout.textContent = state.sourceName;
    if (state.mediaKind === "video") {
      const duration = state.mediaDuration ? `, ${formatMediaTime(state.mediaDuration)}` : "";
      mediaReadout.textContent = `${state.sourceWidth} x ${state.sourceHeight} video${duration}`;
      uploadReadout.textContent = renderer.getVideoUploadMode() === "canvas" ? "Canvas video frame" : "Pending video frame";
    } else {
      mediaReadout.textContent = `${state.sourceWidth} x ${state.sourceHeight} image`;
      uploadReadout.textContent = "Image texture";
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

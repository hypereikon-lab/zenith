<script lang="ts">
  import { onMount } from "svelte";
  import { workbench } from "../artifacts/artifact-store.svelte.js";
  import {
    eulerDegreesFromQuaternion,
    quaternionFromEulerDegrees,
  } from "../geometry/camera-rig.js";
  import {
    applyProjectionCameraPointerDrag,
    applyProjectionCameraWheel,
    nudgeProjectionCamera,
    projectionCameraControlHelp,
  } from "../geometry/projection-camera-controls.js";
  import { sourceProjectionLabel } from "../geometry/source-projection.js";
  import { createSourceMapPreviewRenderer } from "../graphics/source-map-preview-renderer.js";
  import {
    PLATE_EDITOR_VIEW_MODES,
    defaultPlateEditorCamera,
    plateEditorViewDisabledReason,
    plateEditorViewLabel,
  } from "../plates/plate-editor-view.js";
  import { clamp } from "../projection.js";
  import type { ArtifactMedia } from "../artifacts/artifact-types.js";
  import type { ProjectionCameraDragModifiers } from "../geometry/projection-camera-controls.js";
  import type { SourceMapPreviewRenderer } from "../graphics/source-map-preview-renderer.js";
  import type { PlateEditorViewMode } from "../plates/plate-editor-view.js";

  const PREVIEW_SIZE = 960;

  let { media, label = "Media Preview" }: { media: ArtifactMedia; label?: string } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let videoElement = $state.raw<HTMLVideoElement | null>(null);
  let renderer = $state.raw<SourceMapPreviewRenderer | null>(null);
  let rendererPromise: Promise<SourceMapPreviewRenderer> | null = null;
  let imageBitmap = $state.raw<ImageBitmap | null>(null);
  let loadedSourceKey = "";
  let imageSize = $state({ width: 0, height: 0 });
  let viewMode = $state<PlateEditorViewMode>("source-map");
  let viewCamera = $state(defaultPlateEditorCamera(workbench.projectionProfile));
  let status = $state("Drop or import an image to inspect it through projection geometry.");
  let videoPlaying = $state(false);
  let videoTime = $state(0);
  let videoDuration = $state(0);
  let previousProjectionProfile = workbench.projectionProfile;
  let renderSerial = 0;
  let videoFrameRequest: number | null = null;
  let activeCameraDrag = $state<{
    pointerId: number;
    startClient: { x: number; y: number };
    startCamera: typeof viewCamera;
    modifiers: ProjectionCameraDragModifiers;
    started: boolean;
  } | null>(null);
  let viewCameraEuler = $derived(eulerDegreesFromQuaternion(viewCamera.orientation));

  onMount(() => {
    if (canvas) {
      void ensureRenderer().catch((error) => {
        status = error instanceof Error ? error.message : "Could not initialize Media Preview renderer.";
      });
    }
    return () => {
      stopVideoRenderLoop();
      renderer?.destroy();
      imageBitmap?.close();
    };
  });

  $effect(() => {
    const projectionProfile = workbench.projectionProfile;
    const viewerMode = workbench.viewerMode;
    const mediaUrl = media.url || "";
    const mediaKind = media.kind;
    const innerGuideSplit = workbench.domeGuideSemanticSplit;
    const horizonGuideSplit = workbench.domeGuideHorizonSplit;
    const sourceVideo = videoElement;
    const selectedViewMode = effectiveViewMode();
    const camera = viewCamera;
    if (projectionProfile !== previousProjectionProfile) {
      previousProjectionProfile = projectionProfile;
      viewCamera = defaultPlateEditorCamera(projectionProfile);
    }
    void renderMedia(
      mediaUrl,
      mediaKind,
      sourceVideo,
      projectionProfile,
      viewerMode,
      selectedViewMode,
      camera,
      innerGuideSplit,
      horizonGuideSplit,
    );
  });

  async function ensureRenderer(): Promise<SourceMapPreviewRenderer> {
    if (renderer) return renderer;
    if (!canvas) throw new Error("Media Preview WebGPU canvas is not mounted.");
    if (!rendererPromise) {
      rendererPromise = createSourceMapPreviewRenderer(canvas).then((created) => {
        renderer = created;
        return created;
      });
    }
    return rendererPromise;
  }

  async function renderMedia(
    mediaUrl: string,
    mediaKind: ArtifactMedia["kind"],
    sourceVideo: HTMLVideoElement | null,
    projectionProfile: typeof workbench.projectionProfile,
    viewerMode: typeof workbench.viewerMode,
    selectedViewMode: PlateEditorViewMode,
    camera: typeof viewCamera,
    innerGuideSplit: number,
    horizonGuideSplit: number,
  ) {
    const serial = ++renderSerial;
    if (!canvas) return;
    if ((mediaKind !== "image" && mediaKind !== "video") || !mediaUrl) {
      loadedSourceKey = "";
      imageBitmap?.close();
      imageBitmap = null;
      stopVideoRenderLoop();
      status = "No media loaded.";
      return;
    }
    try {
      const gpu = await ensureRenderer();
      if (serial !== renderSerial) return;

      if (mediaKind === "video") {
        imageBitmap?.close();
        imageBitmap = null;
        if (!sourceVideo || sourceVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !sourceVideo.videoWidth || !sourceVideo.videoHeight) {
          loadedSourceKey = `video:${mediaUrl}`;
          status = "Loading MP4 frame for WebGPU projection preview...";
          return;
        }
        gpu.setSourceImage(sourceVideo);
        imageSize = { width: sourceVideo.videoWidth, height: sourceVideo.videoHeight };
        loadedSourceKey = `video:${mediaUrl}`;
        gpu.render({
          width: PREVIEW_SIZE,
          height: PREVIEW_SIZE,
          sourceProjectionMode: projectionProfile,
          projectionViewMode: selectedViewMode,
          projectionCamera: camera,
          showProjectionGuides: viewerMode !== "domemaster",
          domeGuideSemanticSplit: innerGuideSplit,
          domeGuideHorizonSplit: horizonGuideSplit,
        });
        updateVideoClock();
        status = `${label} MP4 mapped as ${sourceProjectionLabel(projectionProfile)} / ${plateEditorViewLabel(selectedViewMode)}${
          imageSize.width > 0 ? ` (${imageSize.width} x ${imageSize.height})` : ""
        }.`;
        return;
      }

      if (loadedSourceKey !== `image:${mediaUrl}`) {
        stopVideoRenderLoop();
        status = "Loading image into WebGPU Media Preview...";
        const response = await fetch(mediaUrl);
        if (!response.ok) throw new Error("Could not load Media Preview image.");
        const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: "from-image" });
        if (serial !== renderSerial) {
          bitmap.close();
          return;
        }
        imageBitmap?.close();
        imageBitmap = bitmap;
        imageSize = { width: bitmap.width, height: bitmap.height };
        gpu.setSourceImage(bitmap);
        loadedSourceKey = `image:${mediaUrl}`;
      }
      gpu.render({
        width: PREVIEW_SIZE,
        height: PREVIEW_SIZE,
        sourceProjectionMode: projectionProfile,
        projectionViewMode: selectedViewMode,
        projectionCamera: camera,
        showProjectionGuides: viewerMode !== "domemaster",
        domeGuideSemanticSplit: innerGuideSplit,
        domeGuideHorizonSplit: horizonGuideSplit,
      });
      status = `${label} mapped as ${sourceProjectionLabel(projectionProfile)} / ${plateEditorViewLabel(selectedViewMode)}${
        imageSize.width > 0 ? ` (${imageSize.width} x ${imageSize.height})` : ""
      }.`;
    } catch (error) {
      console.error(error);
      status = error instanceof Error ? error.message : "Could not render Media Preview.";
    }
  }

  function effectiveViewMode(): PlateEditorViewMode {
    return plateEditorViewDisabledReason(viewMode, workbench.projectionProfile) ? "source-map" : viewMode;
  }

  function setViewMode(mode: PlateEditorViewMode) {
    if (plateEditorViewDisabledReason(mode, workbench.projectionProfile)) return;
    viewMode = mode;
  }

  function setViewerMode(mode: typeof workbench.viewerMode) {
    workbench.viewerMode = mode;
  }

  function updateViewCamera(patch: Partial<typeof viewCamera>) {
    viewCamera = { ...viewCamera, ...patch };
  }

  function handlePointerDown(event: PointerEvent) {
    if (!canvas || effectiveViewMode() === "source-map" || !hasProjectableMedia()) return;
    const point = pointerToCanvasPoint(event);
    if (!point) return;
    event.preventDefault();
    activeCameraDrag = {
      pointerId: event.pointerId,
      startClient: point,
      startCamera: { ...viewCamera, position: [...viewCamera.position], orientation: [...viewCamera.orientation], pivot: viewCamera.pivot ? [...viewCamera.pivot] : null },
      modifiers: cameraDragModifiers(event),
      started: false,
    };
    canvas.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent) {
    if (!activeCameraDrag || event.pointerId !== activeCameraDrag.pointerId) return;
    const point = pointerToCanvasPoint(event);
    if (!point) return;
    const dx = point.x - activeCameraDrag.startClient.x;
    const dy = point.y - activeCameraDrag.startClient.y;
    if (!activeCameraDrag.started && Math.hypot(dx, dy) < 3) return;
    activeCameraDrag.started = true;
    viewCamera = applyProjectionCameraPointerDrag({
      viewMode: effectiveViewMode(),
      startCamera: activeCameraDrag.startCamera,
      startPoint: activeCameraDrag.startClient,
      currentPoint: point,
      viewport: previewViewport(),
      modifiers: activeCameraDrag.modifiers,
    });
  }

  function handlePointerUp(event: PointerEvent) {
    if (!activeCameraDrag || event.pointerId !== activeCameraDrag.pointerId) return;
    activeCameraDrag = null;
    canvas?.releasePointerCapture(event.pointerId);
  }

  function handleWheel(event: WheelEvent) {
    const mode = effectiveViewMode();
    if (mode === "source-map" || !hasProjectableMedia()) return;
    event.preventDefault();
    viewCamera = applyProjectionCameraWheel({
      viewMode: mode,
      camera: viewCamera,
      deltaY: event.deltaY,
      modifiers: cameraDragModifiers(event),
    });
  }

  function pointerToCanvasPoint(event: PointerEvent): { x: number; y: number } | null {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(rect.width, 1)) * PREVIEW_SIZE,
      y: ((event.clientY - rect.top) / Math.max(rect.height, 1)) * PREVIEW_SIZE,
    };
  }

  function hasProjectableMedia(): boolean {
    return media.kind === "image" || media.kind === "video";
  }

  function renderCurrentMedia() {
    void renderMedia(
      media.url || "",
      media.kind,
      videoElement,
      workbench.projectionProfile,
      workbench.viewerMode,
      effectiveViewMode(),
      viewCamera,
      workbench.domeGuideSemanticSplit,
      workbench.domeGuideHorizonSplit,
    );
  }

  function updateCameraPosition(axis: 0 | 1 | 2, value: number) {
    const position = [...viewCamera.position] as [number, number, number];
    position[axis] = value;
    updateViewCamera({ position });
  }

  function updateCameraEuler(axis: "yawDegrees" | "pitchDegrees" | "rollDegrees", value: number) {
    const next = { ...viewCameraEuler, [axis]: value };
    updateViewCamera({ orientation: quaternionFromEulerDegrees(next.yawDegrees, next.pitchDegrees, next.rollDegrees) });
  }

  function nudgeCamera(truck: number, lift: number, push: number) {
    viewCamera = nudgeProjectionCamera(viewCamera, effectiveViewMode(), truck, lift, push);
  }

  function previewViewport(): { width: number; height: number } {
    return { width: PREVIEW_SIZE, height: PREVIEW_SIZE };
  }

  function cameraDragModifiers(event: MouseEvent): ProjectionCameraDragModifiers {
    return {
      button: event.button,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    };
  }

  async function toggleVideoPlayback() {
    const video = videoElement;
    if (!video) return;
    if (video.paused) {
      await video.play();
      videoPlaying = true;
      startVideoRenderLoop();
    } else {
      video.pause();
      videoPlaying = false;
      stopVideoRenderLoop();
      renderCurrentMedia();
    }
  }

  function restartVideo() {
    const video = videoElement;
    if (!video) return;
    video.currentTime = 0;
    updateVideoClock();
    renderCurrentMedia();
  }

  function seekVideo(event: Event) {
    const video = videoElement;
    if (!video) return;
    video.currentTime = Number((event.currentTarget as HTMLInputElement).value) || 0;
    updateVideoClock();
    renderCurrentMedia();
  }

  function handleVideoReady() {
    updateVideoClock();
    renderCurrentMedia();
  }

  function handleVideoPlay() {
    videoPlaying = true;
    startVideoRenderLoop();
  }

  function handleVideoPause() {
    videoPlaying = false;
    stopVideoRenderLoop();
    renderCurrentMedia();
  }

  function updateVideoClock() {
    const video = videoElement;
    if (!video) return;
    videoTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    videoDuration = Number.isFinite(video.duration) ? video.duration : 0;
  }

  function startVideoRenderLoop() {
    if (videoFrameRequest !== null) return;
    const tick = () => {
      videoFrameRequest = null;
      const video = videoElement;
      if (!video || video.paused || video.ended) return;
      renderCurrentMedia();
      videoFrameRequest = requestAnimationFrame(tick);
    };
    videoFrameRequest = requestAnimationFrame(tick);
  }

  function stopVideoRenderLoop() {
    if (videoFrameRequest === null) return;
    cancelAnimationFrame(videoFrameRequest);
    videoFrameRequest = null;
  }

  function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const wholeSeconds = Math.floor(seconds % 60);
    return `${minutes}:${wholeSeconds.toString().padStart(2, "0")}`;
  }
</script>

<section class="source-map-viewer" aria-label={`${label} geometry viewer`}>
  <div class="source-map-canvas-wrap">
    {#if media.kind === "video" && media.url}
      <video
        bind:this={videoElement}
        class="source-map-video-source"
        src={media.url}
        muted
        loop
        playsinline
        preload="auto"
        aria-label={media.alt || label}
        onloadedmetadata={handleVideoReady}
        onloadeddata={handleVideoReady}
        oncanplay={handleVideoReady}
        ontimeupdate={updateVideoClock}
        onseeked={handleVideoReady}
        onplay={handleVideoPlay}
        onpause={handleVideoPause}
        onended={handleVideoPause}
      ></video>
    {/if}
    <canvas
      bind:this={canvas}
      class="source-map-preview-canvas"
      class:interactive={effectiveViewMode() !== "source-map" && hasProjectableMedia()}
      class:dragging={Boolean(activeCameraDrag)}
      aria-label={`${label} mapped through projection geometry`}
      title={effectiveViewMode() === "source-map" ? "Switch to Dome Orbit, Dome POV, or CAVE Room to drag the view." : projectionCameraControlHelp(effectiveViewMode())}
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointercancel={handlePointerUp}
      onwheel={handleWheel}
      oncontextmenu={(event) => event.preventDefault()}
    ></canvas>
  </div>

  <div class="source-map-tools">
    {#if media.kind === "video" && media.url}
      <div class="video-projection-controls" aria-label={`${label} MP4 transport`}>
        <button type="button" class="secondary-action" onclick={toggleVideoPlayback} aria-label={videoPlaying ? "Pause projected MP4 preview" : "Play projected MP4 preview"}>
          {videoPlaying ? "Pause" : "Play"}
        </button>
        <button type="button" class="secondary-action" onclick={restartVideo} aria-label="Restart projected MP4 preview">
          Restart
        </button>
        <label for="source-map-video-time">
          <span>Time {formatTime(videoTime)} / {formatTime(videoDuration)}</span>
          <input
            id="source-map-video-time"
            type="range"
            min="0"
            max={Math.max(videoDuration, 0.01)}
            step="0.01"
            value={videoTime}
            disabled={videoDuration <= 0}
            oninput={seekVideo}
          />
        </label>
      </div>
    {/if}

    <div class="viewer-mode-group source-map-surface-mode" aria-label={`${label} projection surface`}>
      {#each PLATE_EDITOR_VIEW_MODES as mode}
        {@const disabledReason = plateEditorViewDisabledReason(mode, workbench.projectionProfile)}
        <button
          type="button"
          class:selected={effectiveViewMode() === mode}
          aria-pressed={effectiveViewMode() === mode ? "true" : "false"}
          disabled={Boolean(disabledReason)}
          title={disabledReason || `${plateEditorViewLabel(mode)} preview surface`}
          onclick={() => setViewMode(mode)}
        >
          {plateEditorViewLabel(mode)}
        </button>
      {/each}
    </div>

    <div class="viewer-mode-group" aria-label={`${label} guide overlay`}>
      <button
        type="button"
        class:selected={workbench.viewerMode === "domemaster"}
        aria-pressed={workbench.viewerMode === "domemaster" ? "true" : "false"}
        onclick={() => setViewerMode("domemaster")}
      >
        Clean
      </button>
      <button
        type="button"
        class:selected={workbench.viewerMode === "dome-check"}
        aria-pressed={workbench.viewerMode === "dome-check" ? "true" : "false"}
        onclick={() => setViewerMode("dome-check")}
      >
        Guides
      </button>
      <button
        type="button"
        class:selected={workbench.viewerMode === "rim-check"}
        aria-pressed={workbench.viewerMode === "rim-check" ? "true" : "false"}
        onclick={() => setViewerMode("rim-check")}
      >
        Edge Check
      </button>
    </div>

    {#if effectiveViewMode() !== "source-map"}
      <div class="motion-controls projection-camera-controls" aria-label={`${label} projection camera controls`}>
        <label for="source-map-camera-x">
          <span>Camera X {viewCamera.position[0].toFixed(2)}m</span>
          <input
            id="source-map-camera-x"
            type="range"
            min="-8"
            max="8"
            step="0.01"
            value={viewCamera.position[0]}
            oninput={(event) => updateCameraPosition(0, Number((event.currentTarget as HTMLInputElement).value))}
          />
        </label>
        <label for="source-map-camera-y">
          <span>Camera Y {viewCamera.position[1].toFixed(2)}m</span>
          <input
            id="source-map-camera-y"
            type="range"
            min="-8"
            max="8"
            step="0.01"
            value={viewCamera.position[1]}
            oninput={(event) => updateCameraPosition(1, Number((event.currentTarget as HTMLInputElement).value))}
          />
        </label>
        <label for="source-map-camera-z">
          <span>Camera Z {viewCamera.position[2].toFixed(2)}m</span>
          <input
            id="source-map-camera-z"
            type="range"
            min="-8"
            max="8"
            step="0.01"
            value={viewCamera.position[2]}
            oninput={(event) => updateCameraPosition(2, Number((event.currentTarget as HTMLInputElement).value))}
          />
        </label>
        <label for="source-map-view-yaw">
          <span>Yaw {viewCameraEuler.yawDegrees.toFixed(1)} deg</span>
          <input
            id="source-map-view-yaw"
            type="range"
            min="-180"
            max="180"
            step="0.1"
            value={viewCameraEuler.yawDegrees}
            oninput={(event) => updateCameraEuler("yawDegrees", Number((event.currentTarget as HTMLInputElement).value))}
          />
        </label>
        <label for="source-map-view-pitch">
          <span>Pitch {viewCameraEuler.pitchDegrees.toFixed(1)} deg</span>
          <input
            id="source-map-view-pitch"
            type="range"
            min="-180"
            max="180"
            step="0.1"
            value={viewCameraEuler.pitchDegrees}
            oninput={(event) => updateCameraEuler("pitchDegrees", Number((event.currentTarget as HTMLInputElement).value))}
          />
        </label>
        <label for="source-map-view-roll">
          <span>Roll {viewCameraEuler.rollDegrees.toFixed(1)} deg</span>
          <input
            id="source-map-view-roll"
            type="range"
            min="-180"
            max="180"
            step="0.1"
            value={viewCameraEuler.rollDegrees}
            oninput={(event) => updateCameraEuler("rollDegrees", Number((event.currentTarget as HTMLInputElement).value))}
          />
        </label>
        <label for="source-map-view-fov">
          <span>View FOV {Math.round(viewCamera.fovDegrees)} deg</span>
          <input
            id="source-map-view-fov"
            type="range"
            min="42"
            max="128"
            step="1"
            value={viewCamera.fovDegrees}
            oninput={(event) => updateViewCamera({ fovDegrees: clamp(Number((event.currentTarget as HTMLInputElement).value), 42, 128) })}
          />
        </label>
        <div class="camera-nudge-grid" aria-label={`${label} local camera movement`}>
          <button type="button" class="secondary-action compact-action" onclick={() => nudgeCamera(-0.2, 0, 0)}>Truck left</button>
          <button type="button" class="secondary-action compact-action" onclick={() => nudgeCamera(0.2, 0, 0)}>Truck right</button>
          <button type="button" class="secondary-action compact-action" onclick={() => nudgeCamera(0, 0.2, 0)}>Lift up</button>
          <button type="button" class="secondary-action compact-action" onclick={() => nudgeCamera(0, -0.2, 0)}>Lift down</button>
          <button type="button" class="secondary-action compact-action" onclick={() => nudgeCamera(0, 0, 0.2)}>Push forward</button>
          <button type="button" class="secondary-action compact-action" onclick={() => nudgeCamera(0, 0, -0.2)}>Pull back</button>
        </div>
      </div>
    {/if}

    <output class="source-map-status">{status}</output>
  </div>
</section>

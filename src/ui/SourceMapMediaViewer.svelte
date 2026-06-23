<script lang="ts">
  import { onMount } from "svelte";
  import {
    changeViewerMode,
    setDomeGuideHorizonSplit,
    setDomeGuideSemanticSplit,
  } from "../app/workbench-view-commands.js";
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
  import { createSourceMapPreviewSession } from "../graphics/source-map-preview-session.js";
  import {
    PLATE_EDITOR_VIEW_MODES,
    defaultPlateEditorCamera,
    plateEditorViewDisabledReason,
  } from "../plates/plate-editor-view.js";
  import { clamp } from "../projection.js";
  import { sourceGuideBreakpoints, sourceGuideZones } from "../geometry/source-guide-semantics.js";
  import type { SourceGuideBreakpoint } from "../geometry/source-guide-semantics.js";
  import type { ArtifactMedia } from "../artifacts/artifact-types.js";
  import type { ProjectionCameraDragModifiers } from "../geometry/projection-camera-controls.js";
  import type { SourceMapPreviewSession, SourceMapPreviewSessionUpdate } from "../graphics/source-map-preview-session.js";
  import type { PlateEditorViewMode } from "../plates/plate-editor-view.js";
  import CameraControlsPanel from "./CameraControlsPanel.svelte";

  const PREVIEW_SIZE = 960;

  let { media, label = "Media Preview" }: { media: ArtifactMedia; label?: string } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let videoElement = $state.raw<HTMLVideoElement | null>(null);
  let previewSession = $state.raw<SourceMapPreviewSession | null>(null);
  let imageSize = $state({ width: 0, height: 0 });
  let viewMode = $state<PlateEditorViewMode>("source-map");
  let showCaveMask = $state<boolean>(false);
  let invertCaveMask = $state<boolean>(false);
  let viewCamera = $state(defaultPlateEditorCamera(workbench.projectionProfile));
  let status = $state("Drop or import an image to inspect it through projection geometry.");
  let videoPlaying = $state(false);
  let videoTime = $state(0);
  let videoDuration = $state(0);
  let previousProjectionProfile = workbench.projectionProfile;
  let activeCameraDrag = $state<{
    pointerId: number;
    startClient: { x: number; y: number };
    startCamera: typeof viewCamera;
    modifiers: ProjectionCameraDragModifiers;
    started: boolean;
  } | null>(null);
  let viewCameraEuler = $derived(eulerDegreesFromQuaternion(viewCamera.orientation));

  let activeGuideBreakpointDrag = $state<GuideBreakpointDrag | null>(null);
  let guideBreakpoints = $derived(
    sourceGuideBreakpoints(workbench.projectionProfile, workbench.domeGuideSemanticSplit, workbench.domeGuideHorizonSplit),
  );
  let guideZones = $derived(
    sourceGuideZones(workbench.projectionProfile, workbench.domeGuideSemanticSplit, workbench.domeGuideHorizonSplit),
  );

  type GuideBreakpointId = SourceGuideBreakpoint["id"];
  type GuideBreakpointDrag = {
    id: GuideBreakpointId;
    railRect: DOMRect;
  };

  onMount(() => {
    if (canvas) {
      previewSession = createSourceMapPreviewSession(canvas);
      renderCurrentMedia();
    }
    return () => {
      previewSession?.destroy();
    };
  });

  let canvasWidth = $state(960);
  let canvasHeight = $state(960);

  $effect(() => {
    if (!canvas) return;
    const updateSize = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(rect.width * pixelRatio));
      const h = Math.max(1, Math.round(rect.height * pixelRatio));
      if (canvasWidth !== w || canvasHeight !== h) {
        canvasWidth = w;
        canvasHeight = h;
      }
    };
    updateSize();

    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(canvas);

    window.addEventListener("resize", updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  });

  $effect(() => {
    const projectionProfile = workbench.projectionProfile;
    workbench.viewerMode;
    media.url;
    media.kind;
    workbench.domeGuideSemanticSplit;
    workbench.domeGuideHorizonSplit;
    videoElement;
    viewMode;
    viewCamera;
    showCaveMask;
    invertCaveMask;
    canvasWidth;
    canvasHeight;
    if (projectionProfile !== previousProjectionProfile) {
      previousProjectionProfile = projectionProfile;
      viewCamera = defaultPlateEditorCamera(projectionProfile);
    }
    renderCurrentMedia();
  });

  function effectiveViewMode(): PlateEditorViewMode {
    return plateEditorViewDisabledReason(viewMode, workbench.projectionProfile) ? "source-map" : viewMode;
  }

  function applySessionUpdate(update: SourceMapPreviewSessionUpdate | null) {
    if (!update) return;
    if (update.status) status = update.status;
    if (update.imageSize) imageSize = update.imageSize;
    if (update.videoClock) {
      videoTime = update.videoClock.videoTime;
      videoDuration = update.videoClock.videoDuration;
    }
  }

  function setViewerMode(mode: typeof workbench.viewerMode) {
    changeViewerMode(mode);
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
    void previewSession?.renderMedia(
      {
        mediaUrl: media.url || "",
        mediaKind: media.kind,
        sourceVideo: videoElement,
        projectionProfile: workbench.projectionProfile,
        viewerMode: workbench.viewerMode,
        selectedViewMode: effectiveViewMode(),
        camera: viewCamera,
        domeGuideSemanticSplit: workbench.domeGuideSemanticSplit,
        domeGuideHorizonSplit: workbench.domeGuideHorizonSplit,
        showCaveMask,
        invertCaveMask,
        width: canvasWidth,
        height: canvasHeight,
        label,
      },
      applySessionUpdate,
    );
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
    applySessionUpdate({ videoClock: previewSession?.updateVideoClock(videoElement) ?? undefined });
  }

  function startVideoRenderLoop() {
    const video = videoElement;
    if (!video || !previewSession) return;
    previewSession.startVideoRenderLoop(video, () => {
      updateVideoClock();
      renderCurrentMedia();
    });
  }

  function stopVideoRenderLoop() {
    previewSession?.stopVideoRenderLoop();
  }

  function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const wholeSeconds = Math.floor(seconds % 60);
    return `${minutes}:${wholeSeconds.toString().padStart(2, "0")}`;
  }

  function handleGuideRailPointerDown(event: PointerEvent) {
    const breakpoint = nearestEditableBreakpoint(pointerRadiusOnRail(event, event.currentTarget.getBoundingClientRect()));
    if (!breakpoint) return;
    startGuideBreakpointDrag(event, breakpoint.id, event.currentTarget);
  }

  function handleGuideBreakpointPointerDown(event: PointerEvent, breakpointId: GuideBreakpointId) {
    event.stopPropagation();
    const rail = event.currentTarget.closest(".guide-breakpoint-rail");
    if (!rail) return;
    startGuideBreakpointDrag(event, breakpointId, rail);
  }

  function startGuideBreakpointDrag(event: PointerEvent, breakpointId: GuideBreakpointId, rail: HTMLElement) {
    activeGuideBreakpointDrag = {
      id: breakpointId,
      railRect: rail.getBoundingClientRect(),
    };
    updateGuideBreakpointFromPointer(event, activeGuideBreakpointDrag);
  }

  function handleGuideBreakpointPointerMove(event: PointerEvent) {
    const drag = activeGuideBreakpointDrag;
    if (!drag) return;
    updateGuideBreakpointFromPointer(event, drag);
  }

  function handleGuideBreakpointPointerUp(event: PointerEvent) {
    const drag = activeGuideBreakpointDrag;
    if (!drag) return;
    activeGuideBreakpointDrag = null;
  }

  function handleGuideBreakpointKeydown(event: KeyboardEvent, breakpointId: GuideBreakpointId) {
    let delta = 0;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      delta = -0.01;
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      delta = 0.01;
    } else if (event.key === "Home") {
      setGuideBreakpointRadius(breakpointId, 0);
      return;
    } else if (event.key === "End") {
      setGuideBreakpointRadius(breakpointId, 1);
      return;
    } else {
      return;
    }
    const current = guideBreakpoints.find((breakpoint) => breakpoint.id === breakpointId)?.radius ?? 0;
    setGuideBreakpointRadius(breakpointId, current + delta);
  }

  function updateGuideBreakpointFromPointer(event: PointerEvent, drag: GuideBreakpointDrag) {
    setGuideBreakpointRadius(drag.id, pointerRadiusOnRail(event, drag.railRect));
  }

  function pointerRadiusOnRail(event: PointerEvent, railRect: DOMRect): number {
    return clamp((event.clientX - railRect.left) / Math.max(railRect.width, 1), 0, 1);
  }

  function nearestEditableBreakpoint(radius: number): SourceGuideBreakpoint | null {
    const editable = guideBreakpoints.filter((breakpoint) => breakpoint.editable);
    if (editable.length === 0) return null;
    return editable.reduce((nearest, breakpoint) =>
      Math.abs(breakpoint.radius - radius) < Math.abs(nearest.radius - radius) ? breakpoint : nearest,
    );
  }

  function setGuideBreakpointRadius(breakpointId: GuideBreakpointId, radius: number) {
    if (breakpointId === "inner-split") {
      setDomeGuideSemanticSplit(radius);
    } else if (breakpointId === "carrier-horizon" || breakpointId === "physical-horizon") {
      setDomeGuideHorizonSplit(radius);
    }
  }

  function guideBreakpointSummary(): string {
    return guideBreakpoints.map((breakpoint) => `${breakpoint.label} ${formatPercent(breakpoint.radius)}`).join(" · ");
  }

  function guideZoneSummary(): string {
    return guideZones.map((zone) => `${zone.label}`).join(" · ");
  }

  function formatPercent(value: number): string {
    return `${Math.round(value * 100)}%`;
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
    {#if effectiveViewMode() !== "source-map" && hasProjectableMedia()}
      <div class="viewer-hud-hint">
        <span>🖱️ Drag to Rotate</span>
        <span>Shift+Drag to Pan</span>
        <span>Scroll to Zoom</span>
      </div>
    {/if}
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

    <div class="projection-guide-controls" aria-label="Projection handoff guide controls">
      <div class="guide-breakpoint-control">
        <span class="guide-breakpoint-title">Source-map breakpoints</span>
        <span class="guide-breakpoint-summary">{guideZoneSummary()}</span>
        <span class="guide-breakpoint-rail-wrap">
          <span
            class="guide-breakpoint-rail"
            role="group"
            aria-label="Source-map breakpoint rail"
            onpointerdown={handleGuideRailPointerDown}
            onpointermove={handleGuideBreakpointPointerMove}
            onpointerup={handleGuideBreakpointPointerUp}
            onpointercancel={handleGuideBreakpointPointerUp}
          >
            {#each guideZones as zone}
              <span
                class={`guide-breakpoint-zone ${zone.tone}`}
                style={`left: ${zone.startRadius * 100}%; width: ${(zone.endRadius - zone.startRadius) * 100}%`}
              ></span>
            {/each}
            {#each guideBreakpoints as breakpoint}
              {#if breakpoint.editable}
                <button
                  type="button"
                  class:editable={breakpoint.editable}
                  class:horizon={breakpoint.role === "horizon"}
                  class="guide-breakpoint-marker"
                  style={`left: ${breakpoint.radius * 100}%`}
                  title={`${breakpoint.label} ${formatPercent(breakpoint.radius)}`}
                  aria-label={`${breakpoint.label} breakpoint at ${formatPercent(breakpoint.radius)}`}
                  onpointerdown={(event) => handleGuideBreakpointPointerDown(event, breakpoint.id)}
                  onkeydown={(event) => handleGuideBreakpointKeydown(event, breakpoint.id)}
                ></button>
              {:else}
                <span
                  class:horizon={breakpoint.role === "horizon"}
                  class="guide-breakpoint-marker"
                  style={`left: ${breakpoint.radius * 100}%`}
                  title={`${breakpoint.label} ${formatPercent(breakpoint.radius)}`}
                ></span>
              {/if}
            {/each}
          </span>
        </span>
        <span class="guide-breakpoint-values">
          {#each guideBreakpoints as breakpoint}
            <span class:fixed={!breakpoint.editable}>
              {breakpoint.label} {formatPercent(breakpoint.radius)}
            </span>
          {/each}
        </span>
      </div>
    </div>

    <CameraControlsPanel
      bind:viewMode
      bind:viewCamera
      bind:showCaveMask
      bind:invertCaveMask
      projectionProfile={workbench.projectionProfile}
      onNudge={(truck, lift, push) => {
        viewCamera = nudgeProjectionCamera(viewCamera, effectiveViewMode(), truck, lift, push);
      }}
    />

    <output class="source-map-status">{status}</output>
  </div>
</section>

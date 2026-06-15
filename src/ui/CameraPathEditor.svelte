<script lang="ts">
  import {
    eulerDegreesFromQuaternion,
    lookAtPivot,
    normalizeQuaternion,
    orbitCameraAroundPivot,
    quaternionFromEulerDegrees,
    rotateCameraLocal,
    translateCameraLocal,
  } from "../geometry/camera-rig.js";
  import { getSelectedRgbdKeyframe, rgbdLab } from "../scene/rgbd-scene-store.svelte.js";
  import { defaultRgbdCameraPose, normalizeRgbdCameraPose, rgbdCameraDiagnostics } from "../scene/camera-path.js";
  import { cameraPoseAtTime } from "../scene/camera-path-interpolation.js";
  import {
    applyCameraGizmoDrag,
    applyCameraGizmoWheel,
    buildCameraGizmoModel,
    defaultCameraGizmoView,
    fitCameraGizmoViewToPath,
    hitTestCameraGizmo,
    nudgePoseFromGizmoKeyboard,
    orbitAuthorView,
  } from "../scene/camera-gizmo.js";
  import { renderCameraGizmoCanvas, renderCameraPreviewCanvas } from "../graphics/camera-gizmo-renderer.js";
  import type { Vec3 } from "../projection.js";
  import type { Quaternion } from "../geometry/camera-rig.js";
  import type { CameraGizmoDragMode, CameraGizmoViewState, CameraGizmoViewport } from "../scene/camera-gizmo.js";
  import type { RgbdCameraKeyframe } from "../scene/rgbd-scene-types.js";

  let selectedKeyframe = $derived(getSelectedRgbdKeyframe());
  let previewTimeSeconds = $state(0);
  let lastPreviewSelectionId = $state<string | null>(null);
  let interpolatedPreview = $derived(cameraPoseAtTime(rgbdLab.cameraPath, previewTimeSeconds));
  let selectedEuler = $derived(eulerDegreesFromQuaternion(selectedKeyframe?.pose.orientation || [0, 0, 0, 1]));
  let interpolatedEuler = $derived(eulerDegreesFromQuaternion(interpolatedPreview.orientation));
  let diagnostics = $derived(rgbdCameraDiagnostics(selectedKeyframe?.pose || defaultRgbdCameraPose()));
  let moveStepMeters = $state(0.25);
  let turnStepDegrees = $state(5);
  let gizmoTool = $state<CameraGizmoDragMode>("move-camera");
  let gizmoView = $state<CameraGizmoViewState>(defaultCameraGizmoView());
  let authorCanvas = $state.raw<HTMLCanvasElement | null>(null);
  let cameraPreviewCanvas = $state.raw<HTMLCanvasElement | null>(null);
  let viewportTick = $state(0);
  let isPlayingPath = $state(false);
  let dragState = $state.raw<{
    pointerId: number;
    keyframeId: string;
    mode: CameraGizmoDragMode | "orbit-author";
    startPoint: { x: number; y: number };
    startPose: ReturnType<typeof defaultRgbdCameraPose>;
    startView: CameraGizmoViewState;
  } | null>(null);
  const selectedProxyImageUrl = $derived(
    rgbdLab.proxy?.keyframeId === selectedKeyframe?.id && rgbdLab.proxy.rgb.kind === "image" ? rgbdLab.proxy.rgb.url || null : null,
  );
  const activeToolLabel = $derived(toolLabel(gizmoTool));

  function addKeyframe() {
    const timeSeconds = Math.min(rgbdLab.cameraPath.durationSeconds, (selectedKeyframe?.timeSeconds || 0) + 1);
    const keyframe: RgbdCameraKeyframe = {
      id: `keyframe-${Date.now()}`,
      label: `Expansion ${rgbdLab.cameraPath.keyframes.length}`,
      timeSeconds,
      pose: normalizeRgbdCameraPose(selectedKeyframe?.pose || {}),
      note: "New RGBD expansion camera keyframe.",
    };
    rgbdLab.cameraPath.keyframes.push(keyframe);
    selectKeyframe(keyframe.id);
  }

  function removeSelectedKeyframe() {
    if (rgbdLab.cameraPath.keyframes.length <= 1) return;
    rgbdLab.cameraPath.keyframes = rgbdLab.cameraPath.keyframes.filter((keyframe) => keyframe.id !== rgbdLab.selectedKeyframeId);
    selectKeyframe(rgbdLab.cameraPath.keyframes[0].id);
  }

  function selectKeyframe(id: string) {
    rgbdLab.selectedKeyframeId = id;
    const keyframe = rgbdLab.cameraPath.keyframes.find((item) => item.id === id);
    if (keyframe) previewTimeSeconds = keyframe.timeSeconds;
  }

  function updatePosePosition(axis: 0 | 1 | 2, value: number) {
    if (!selectedKeyframe) return;
    const position = [...selectedKeyframe.pose.position] as Vec3;
    position[axis] = value;
    selectedKeyframe.pose = normalizeRgbdCameraPose({ ...selectedKeyframe.pose, position });
  }

  function updatePosePivot(axis: 0 | 1 | 2, value: number) {
    if (!selectedKeyframe) return;
    const pivot = [...(selectedKeyframe.pose.pivot || [0, 0, 1])] as Vec3;
    pivot[axis] = value;
    selectedKeyframe.pose = normalizeRgbdCameraPose({ ...selectedKeyframe.pose, pivot });
  }

  function updatePoseEuler(axis: "yawDegrees" | "pitchDegrees" | "rollDegrees", value: number) {
    if (!selectedKeyframe) return;
    const next = { ...selectedEuler, [axis]: value };
    selectedKeyframe.pose = normalizeRgbdCameraPose({
      ...selectedKeyframe.pose,
      orientation: quaternionFromEulerDegrees(next.yawDegrees, next.pitchDegrees, next.rollDegrees),
    });
  }

  function updateQuaternionComponent(axis: 0 | 1 | 2 | 3, value: number) {
    if (!selectedKeyframe) return;
    const orientation = [...selectedKeyframe.pose.orientation] as Quaternion;
    orientation[axis] = value;
    selectedKeyframe.pose = normalizeRgbdCameraPose({
      ...selectedKeyframe.pose,
      orientation: normalizeQuaternion(orientation),
    });
  }

  function updatePoseFov(value: number) {
    if (!selectedKeyframe) return;
    selectedKeyframe.pose = normalizeRgbdCameraPose({ ...selectedKeyframe.pose, fovDegrees: value });
  }

  function updatePoseClip(which: "nearMeters" | "farMeters", value: number) {
    if (!selectedKeyframe) return;
    selectedKeyframe.pose = normalizeRgbdCameraPose({ ...selectedKeyframe.pose, [which]: value });
  }

  function updatePoseMode(mode: string) {
    if (!selectedKeyframe) return;
    selectedKeyframe.pose = normalizeRgbdCameraPose({ ...selectedKeyframe.pose, mode });
  }

  function moveLocal(truck: number, lift: number, push: number) {
    if (!selectedKeyframe) return;
    selectedKeyframe.pose = translateCameraLocal(selectedKeyframe.pose, truck, lift, push);
  }

  function rotateLocal(yaw: number, pitch: number, roll: number) {
    if (!selectedKeyframe) return;
    selectedKeyframe.pose = rotateCameraLocal(selectedKeyframe.pose, yaw, pitch, roll);
  }

  function orbitAroundPivot(yaw: number, pitch: number) {
    if (!selectedKeyframe) return;
    selectedKeyframe.pose = orbitCameraAroundPivot(selectedKeyframe.pose, yaw, pitch);
  }

  function lockLookAtPivot() {
    if (!selectedKeyframe) return;
    selectedKeyframe.pose = lookAtPivot(selectedKeyframe.pose);
  }

  function fitAuthorView() {
    gizmoView = fitCameraGizmoViewToPath(rgbdLab.cameraPath, rgbdLab.scene);
  }

  function resetAuthorView() {
    gizmoView = defaultCameraGizmoView();
  }

  function usePreviewPoseForSelected() {
    if (!selectedKeyframe) return;
    selectedKeyframe.pose = normalizeRgbdCameraPose(interpolatedPreview);
    selectedKeyframe.timeSeconds = previewTimeSeconds;
  }

  function togglePathPlayback() {
    isPlayingPath = !isPlayingPath;
  }

  function authorViewport(): CameraGizmoViewport {
    if (!authorCanvas) return { width: 1, height: 1, pixelRatio: 1 };
    return resizeCanvasToDisplaySize(authorCanvas);
  }

  function previewViewport(): CameraGizmoViewport {
    if (!cameraPreviewCanvas) return { width: 1, height: 1, pixelRatio: 1 };
    return resizeCanvasToDisplaySize(cameraPreviewCanvas);
  }

  function drawAuthorCanvas() {
    if (!authorCanvas) return;
    const viewport = authorViewport();
    const context = authorCanvas.getContext("2d");
    if (!context) return;
    renderCameraGizmoCanvas(
      context,
      buildCameraGizmoModel(rgbdLab.cameraPath, rgbdLab.selectedKeyframeId, gizmoView, viewport, rgbdLab.scene),
      { activeToolLabel },
    );
  }

  function drawPreviewCanvas() {
    if (!cameraPreviewCanvas) return;
    const viewport = previewViewport();
    const context = cameraPreviewCanvas.getContext("2d");
    if (!context) return;
    renderCameraPreviewCanvas(context, viewport, diagnostics, Boolean(selectedProxyImageUrl));
  }

  function handleAuthorPointerDown(event: PointerEvent) {
    if (!authorCanvas || !selectedKeyframe) return;
    const viewport = authorViewport();
    const point = canvasPoint(event, authorCanvas);
    const model = buildCameraGizmoModel(rgbdLab.cameraPath, rgbdLab.selectedKeyframeId, gizmoView, viewport, rgbdLab.scene);
    const hit = hitTestCameraGizmo(point, model);
    const targetKeyframe = hit.keyframeId
      ? rgbdLab.cameraPath.keyframes.find((keyframe) => keyframe.id === hit.keyframeId) || selectedKeyframe
      : selectedKeyframe;
    if (hit.keyframeId) selectKeyframe(hit.keyframeId);
    const mode = hit.kind === "empty" && gizmoTool !== "pan-view" ? "orbit-author" : hit.kind === "pivot" ? "move-pivot" : gizmoTool;
    dragState = {
      pointerId: event.pointerId,
      keyframeId: targetKeyframe.id,
      mode,
      startPoint: point,
      startPose: normalizeRgbdCameraPose(targetKeyframe.pose),
      startView: { ...gizmoView, target: [...gizmoView.target] },
    };
    authorCanvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handleAuthorPointerMove(event: PointerEvent) {
    if (!authorCanvas || !dragState) return;
    const point = canvasPoint(event, authorCanvas);
    const delta = {
      x: point.x - dragState.startPoint.x,
      y: point.y - dragState.startPoint.y,
    };
    if (dragState.mode === "orbit-author") {
      gizmoView = orbitAuthorView(dragState.startView, delta);
      return;
    }
    const targetKeyframe = rgbdLab.cameraPath.keyframes.find((keyframe) => keyframe.id === dragState?.keyframeId);
    if (!targetKeyframe) return;
    const result = applyCameraGizmoDrag({
      pose: dragState.startPose,
      mode: dragState.mode,
      delta,
      view: dragState.startView,
      viewport: authorViewport(),
    });
    targetKeyframe.pose = result.pose;
    gizmoView = result.view;
  }

  function handleAuthorPointerUp(event: PointerEvent) {
    if (authorCanvas && dragState?.pointerId === event.pointerId) {
      authorCanvas.releasePointerCapture(event.pointerId);
    }
    dragState = null;
  }

  function handleAuthorWheel(event: WheelEvent) {
    gizmoView = applyCameraGizmoWheel(gizmoView, event.deltaY);
    event.preventDefault();
  }

  function handleAuthorKeydown(event: KeyboardEvent) {
    if (!selectedKeyframe) return;
    const before = selectedKeyframe.pose;
    const after = nudgePoseFromGizmoKeyboard(before, event.key, moveStepMeters, turnStepDegrees);
    if (after !== before) {
      selectedKeyframe.pose = after;
      event.preventDefault();
    }
  }

  function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement): CameraGizmoViewport {
    const rect = canvas.getBoundingClientRect();
    const pixelRatio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const width = Math.max(1, Math.round(rect.width * pixelRatio));
    const height = Math.max(1, Math.round(rect.height * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return { width, height, pixelRatio };
  }

  function canvasPoint(event: PointerEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function toolLabel(tool: CameraGizmoDragMode): string {
    if (tool === "move-camera") return "Move camera";
    if (tool === "move-pivot") return "Move pivot";
    if (tool === "rotate-camera") return "Rotate camera";
    if (tool === "orbit-pivot") return "Orbit pivot";
    if (tool === "roll-camera") return "Roll camera";
    if (tool === "pan-view") return "Pan author view";
    return "Select";
  }

  $effect(() => {
    if (!authorCanvas) return;
    const observer = new ResizeObserver(() => {
      viewportTick += 1;
    });
    observer.observe(authorCanvas);
    return () => observer.disconnect();
  });

  $effect(() => {
    if (!cameraPreviewCanvas) return;
    const observer = new ResizeObserver(() => {
      viewportTick += 1;
    });
    observer.observe(cameraPreviewCanvas);
    return () => observer.disconnect();
  });

  $effect(() => {
    viewportTick;
    rgbdLab.cameraPath;
    rgbdLab.selectedKeyframeId;
    rgbdLab.scene;
    gizmoView;
    gizmoTool;
    drawAuthorCanvas();
  });

  $effect(() => {
    viewportTick;
    diagnostics;
    selectedProxyImageUrl;
    drawPreviewCanvas();
  });

  $effect(() => {
    const selectedId = selectedKeyframe?.id || null;
    if (selectedId && selectedId !== lastPreviewSelectionId) {
      previewTimeSeconds = selectedKeyframe?.timeSeconds || 0;
      lastPreviewSelectionId = selectedId;
    }
  });

  $effect(() => {
    if (!isPlayingPath) return;
    let animationFrame = 0;
    let lastTime = performance.now();
    let localPreviewTime = previewTimeSeconds;
    const tick = (now: number) => {
      const deltaSeconds = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      localPreviewTime = (localPreviewTime + deltaSeconds) % Math.max(0.001, rgbdLab.cameraPath.durationSeconds);
      previewTimeSeconds = localPreviewTime;
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  });
</script>

<article class="rgbd-panel">
  <div class="panel-heading">
    <p class="eyebrow">6DoF Camera Path</p>
    <h3>Author expansion camera rigs</h3>
    <p>Camera poses are stored as position + quaternion orientation. Euler controls are only an editing/readout layer.</p>
  </div>

  <section class="camera-viewport-workbench" aria-label="Full viewport camera gizmo and trajectory visualizer">
    <div class="camera-viewport-toolbar" aria-label="Camera gizmo tools">
      {#each ["move-camera", "move-pivot", "rotate-camera", "orbit-pivot", "roll-camera", "pan-view"] as tool}
        <button
          type="button"
          class:selected={gizmoTool === tool}
          aria-pressed={gizmoTool === tool ? "true" : "false"}
          onclick={() => (gizmoTool = tool as CameraGizmoDragMode)}
        >
          {toolLabel(tool as CameraGizmoDragMode)}
        </button>
      {/each}
      <button type="button" class="secondary-action compact-action" onclick={fitAuthorView}>Fit Path</button>
      <button type="button" class="secondary-action compact-action" onclick={resetAuthorView}>Reset View</button>
    </div>

    <div class="camera-dual-viewport">
      <figure class="camera-author-surface">
        <canvas
          bind:this={authorCanvas}
          aria-label="Interactive 3D author view showing camera keyframes, frustums, path samples, dome and CAVE guides"
          tabindex="0"
          onpointerdown={handleAuthorPointerDown}
          onpointermove={handleAuthorPointerMove}
          onpointerup={handleAuthorPointerUp}
          onpointercancel={handleAuthorPointerUp}
          onwheel={handleAuthorWheel}
          onkeydown={handleAuthorKeydown}
        ></canvas>
        <figcaption>
          Author View · drag handles to edit camera/pivot, drag empty space to orbit the author view, wheel to zoom
        </figcaption>
      </figure>

      <figure class="camera-preview-surface">
        {#if selectedProxyImageUrl}
          <img src={selectedProxyImageUrl} alt="Rendered RGBD proxy for the selected camera keyframe" />
        {/if}
        <canvas
          bind:this={cameraPreviewCanvas}
          aria-label="Selected camera view frame with proxy-safe guides and disocclusion diagnostics"
        ></canvas>
        <figcaption>
          Camera View · selected rig frame, proxy overlay, center guides, and expansion risk
        </figcaption>
      </figure>
    </div>

    <div class="camera-playback-strip" aria-label="Camera path playback and sampled trajectory controls">
      <label for="rgbd-preview-time">
        <span>Preview time {previewTimeSeconds.toFixed(2)}s</span>
        <input id="rgbd-preview-time" type="range" min="0" max={rgbdLab.cameraPath.durationSeconds} step="0.01" bind:value={previewTimeSeconds} />
      </label>
      <button type="button" class="secondary-action compact-action" aria-pressed={isPlayingPath ? "true" : "false"} onclick={togglePathPlayback}>
        {isPlayingPath ? "Pause Path" : "Play Path"}
      </button>
      <button type="button" class="secondary-action compact-action" onclick={usePreviewPoseForSelected}>Set Selected To Preview</button>
      <label for="rgbd-show-dome-guide">
        <input id="rgbd-show-dome-guide" type="checkbox" bind:checked={gizmoView.showDomeGuide} />
        <span>Dome guide</span>
      </label>
      <label for="rgbd-show-cave-guide">
        <input id="rgbd-show-cave-guide" type="checkbox" bind:checked={gizmoView.showCaveGuide} />
        <span>CAVE guide</span>
      </label>
    </div>
  </section>

  <div class="camera-path-layout">
    <section class="keyframe-list" aria-label="Camera path keyframes">
      {#each rgbdLab.cameraPath.keyframes as keyframe}
        <button
          type="button"
          class:selected={rgbdLab.selectedKeyframeId === keyframe.id}
          aria-pressed={rgbdLab.selectedKeyframeId === keyframe.id ? "true" : "false"}
          onclick={() => selectKeyframe(keyframe.id)}
        >
          <strong>{keyframe.label}</strong>
          <span>{keyframe.timeSeconds.toFixed(2)}s</span>
        </button>
      {/each}
      <div class="inline-actions">
        <button type="button" class="secondary-action compact-action" onclick={addKeyframe}>Add Keyframe</button>
        <button type="button" class="secondary-action compact-action" disabled={rgbdLab.cameraPath.keyframes.length <= 1} onclick={removeSelectedKeyframe}>
          Remove
        </button>
      </div>
    </section>

    {#if selectedKeyframe}
      <section class="camera-controls" aria-label="Selected 6DoF camera keyframe controls">
        <label for="rgbd-path-duration">
          <span>Path duration {rgbdLab.cameraPath.durationSeconds.toFixed(2)}s</span>
          <input id="rgbd-path-duration" type="number" min="0.25" max="120" step="0.25" bind:value={rgbdLab.cameraPath.durationSeconds} />
        </label>
        <label for="rgbd-keyframe-label">
          <span>Keyframe label</span>
          <input id="rgbd-keyframe-label" type="text" bind:value={selectedKeyframe.label} />
        </label>
        <label for="rgbd-keyframe-time">
          <span>Time {selectedKeyframe.timeSeconds.toFixed(2)}s</span>
          <input id="rgbd-keyframe-time" type="range" min="0" max={rgbdLab.cameraPath.durationSeconds} step="0.01" bind:value={selectedKeyframe.timeSeconds} />
        </label>
        <label for="rgbd-camera-mode">
          <span>Camera mode</span>
          <select id="rgbd-camera-mode" value={selectedKeyframe.pose.mode} onchange={(event) => updatePoseMode((event.currentTarget as HTMLSelectElement).value)}>
            <option value="inside">Inside POV</option>
            <option value="orbit">Orbit / inspect</option>
            <option value="fly">Free fly</option>
          </select>
        </label>

        <label for="rgbd-camera-x">
          <span>World X {selectedKeyframe.pose.position[0].toFixed(2)}m</span>
          <input id="rgbd-camera-x" type="range" min="-12" max="12" step="0.01" value={selectedKeyframe.pose.position[0]} oninput={(event) => updatePosePosition(0, Number((event.currentTarget as HTMLInputElement).value))} />
        </label>
        <label for="rgbd-camera-y">
          <span>World Y {selectedKeyframe.pose.position[1].toFixed(2)}m</span>
          <input id="rgbd-camera-y" type="range" min="-12" max="12" step="0.01" value={selectedKeyframe.pose.position[1]} oninput={(event) => updatePosePosition(1, Number((event.currentTarget as HTMLInputElement).value))} />
        </label>
        <label for="rgbd-camera-z">
          <span>World Z {selectedKeyframe.pose.position[2].toFixed(2)}m</span>
          <input id="rgbd-camera-z" type="range" min="-12" max="12" step="0.01" value={selectedKeyframe.pose.position[2]} oninput={(event) => updatePosePosition(2, Number((event.currentTarget as HTMLInputElement).value))} />
        </label>

        <label for="rgbd-camera-yaw">
          <span>Yaw readout {selectedEuler.yawDegrees.toFixed(1)} deg</span>
          <input id="rgbd-camera-yaw" type="range" min="-180" max="180" step="0.1" value={selectedEuler.yawDegrees} oninput={(event) => updatePoseEuler("yawDegrees", Number((event.currentTarget as HTMLInputElement).value))} />
        </label>
        <label for="rgbd-camera-pitch">
          <span>Pitch readout {selectedEuler.pitchDegrees.toFixed(1)} deg</span>
          <input id="rgbd-camera-pitch" type="range" min="-180" max="180" step="0.1" value={selectedEuler.pitchDegrees} oninput={(event) => updatePoseEuler("pitchDegrees", Number((event.currentTarget as HTMLInputElement).value))} />
        </label>
        <label for="rgbd-camera-roll">
          <span>Roll readout {selectedEuler.rollDegrees.toFixed(1)} deg</span>
          <input id="rgbd-camera-roll" type="range" min="-180" max="180" step="0.1" value={selectedEuler.rollDegrees} oninput={(event) => updatePoseEuler("rollDegrees", Number((event.currentTarget as HTMLInputElement).value))} />
        </label>

        <fieldset class="quaternion-fields">
          <legend>Quaternion orientation</legend>
          {#each selectedKeyframe.pose.orientation as component, index}
            <label for={`rgbd-camera-q-${index}`}>
              <span>q{index === 0 ? "x" : index === 1 ? "y" : index === 2 ? "z" : "w"} {component.toFixed(4)}</span>
              <input id={`rgbd-camera-q-${index}`} type="number" min="-1" max="1" step="0.0001" value={component} oninput={(event) => updateQuaternionComponent(index as 0 | 1 | 2 | 3, Number((event.currentTarget as HTMLInputElement).value))} />
            </label>
          {/each}
        </fieldset>

        <label for="rgbd-camera-fov">
          <span>FOV {selectedKeyframe.pose.fovDegrees.toFixed(1)} deg</span>
          <input id="rgbd-camera-fov" type="range" min="8" max="170" step="0.1" value={selectedKeyframe.pose.fovDegrees} oninput={(event) => updatePoseFov(Number((event.currentTarget as HTMLInputElement).value))} />
        </label>
        <label for="rgbd-camera-near">
          <span>Near clip {(selectedKeyframe.pose.nearMeters || 0.01).toFixed(3)}m</span>
          <input id="rgbd-camera-near" type="number" min="0.001" max="10" step="0.001" value={selectedKeyframe.pose.nearMeters || 0.01} oninput={(event) => updatePoseClip("nearMeters", Number((event.currentTarget as HTMLInputElement).value))} />
        </label>
        <label for="rgbd-camera-far">
          <span>Far clip {(selectedKeyframe.pose.farMeters || 80).toFixed(1)}m</span>
          <input id="rgbd-camera-far" type="number" min="1" max="1000" step="1" value={selectedKeyframe.pose.farMeters || 80} oninput={(event) => updatePoseClip("farMeters", Number((event.currentTarget as HTMLInputElement).value))} />
        </label>

        <label for="rgbd-camera-pivot-x">
          <span>Pivot X {(selectedKeyframe.pose.pivot?.[0] ?? 0).toFixed(2)}m</span>
          <input id="rgbd-camera-pivot-x" type="range" min="-12" max="12" step="0.01" value={selectedKeyframe.pose.pivot?.[0] ?? 0} oninput={(event) => updatePosePivot(0, Number((event.currentTarget as HTMLInputElement).value))} />
        </label>
        <label for="rgbd-camera-pivot-y">
          <span>Pivot Y {(selectedKeyframe.pose.pivot?.[1] ?? 0).toFixed(2)}m</span>
          <input id="rgbd-camera-pivot-y" type="range" min="-12" max="12" step="0.01" value={selectedKeyframe.pose.pivot?.[1] ?? 0} oninput={(event) => updatePosePivot(1, Number((event.currentTarget as HTMLInputElement).value))} />
        </label>
        <label for="rgbd-camera-pivot-z">
          <span>Pivot Z {(selectedKeyframe.pose.pivot?.[2] ?? 1).toFixed(2)}m</span>
          <input id="rgbd-camera-pivot-z" type="range" min="-12" max="12" step="0.01" value={selectedKeyframe.pose.pivot?.[2] ?? 1} oninput={(event) => updatePosePivot(2, Number((event.currentTarget as HTMLInputElement).value))} />
        </label>

        <div class="camera-step-controls" aria-label="Camera operation step sizes">
          <label for="rgbd-camera-move-step">
            <span>Move step {moveStepMeters.toFixed(2)}m</span>
            <input id="rgbd-camera-move-step" type="range" min="0.01" max="2" step="0.01" bind:value={moveStepMeters} />
          </label>
          <label for="rgbd-camera-turn-step">
            <span>Turn step {turnStepDegrees.toFixed(1)} deg</span>
            <input id="rgbd-camera-turn-step" type="range" min="0.1" max="30" step="0.1" bind:value={turnStepDegrees} />
          </label>
        </div>

        <div class="camera-nudge-grid" aria-label="6DoF local camera operations">
          <button type="button" class="secondary-action compact-action" onclick={() => moveLocal(-moveStepMeters, 0, 0)}>Truck left</button>
          <button type="button" class="secondary-action compact-action" onclick={() => moveLocal(moveStepMeters, 0, 0)}>Truck right</button>
          <button type="button" class="secondary-action compact-action" onclick={() => moveLocal(0, moveStepMeters, 0)}>Lift up</button>
          <button type="button" class="secondary-action compact-action" onclick={() => moveLocal(0, -moveStepMeters, 0)}>Lift down</button>
          <button type="button" class="secondary-action compact-action" onclick={() => moveLocal(0, 0, moveStepMeters)}>Push forward</button>
          <button type="button" class="secondary-action compact-action" onclick={() => moveLocal(0, 0, -moveStepMeters)}>Pull back</button>
          <button type="button" class="secondary-action compact-action" onclick={() => rotateLocal(-turnStepDegrees, 0, 0)}>Yaw left</button>
          <button type="button" class="secondary-action compact-action" onclick={() => rotateLocal(turnStepDegrees, 0, 0)}>Yaw right</button>
          <button type="button" class="secondary-action compact-action" onclick={() => rotateLocal(0, turnStepDegrees, 0)}>Pitch up</button>
          <button type="button" class="secondary-action compact-action" onclick={() => rotateLocal(0, -turnStepDegrees, 0)}>Pitch down</button>
          <button type="button" class="secondary-action compact-action" onclick={() => rotateLocal(0, 0, -turnStepDegrees)}>Roll left</button>
          <button type="button" class="secondary-action compact-action" onclick={() => rotateLocal(0, 0, turnStepDegrees)}>Roll right</button>
          <button type="button" class="secondary-action compact-action" onclick={() => orbitAroundPivot(-turnStepDegrees, 0)}>Orbit left</button>
          <button type="button" class="secondary-action compact-action" onclick={() => orbitAroundPivot(turnStepDegrees, 0)}>Orbit right</button>
          <button type="button" class="secondary-action compact-action" onclick={() => orbitAroundPivot(0, turnStepDegrees)}>Orbit up</button>
          <button type="button" class="secondary-action compact-action" onclick={() => orbitAroundPivot(0, -turnStepDegrees)}>Orbit down</button>
          <button type="button" class="secondary-action compact-action" onclick={lockLookAtPivot}>Look at pivot</button>
        </div>

        <label for="rgbd-keyframe-note">
          <span>Keyframe note</span>
          <textarea id="rgbd-keyframe-note" rows="3" bind:value={selectedKeyframe.note}></textarea>
        </label>
      </section>
    {/if}
  </div>

  <dl class="rgbd-detail-list">
    <div><dt>Interpolated yaw</dt><dd>{interpolatedEuler.yawDegrees.toFixed(1)} deg</dd></div>
    <div><dt>Interpolated pitch</dt><dd>{interpolatedEuler.pitchDegrees.toFixed(1)} deg</dd></div>
    <div><dt>Interpolated FOV</dt><dd>{interpolatedPreview.fovDegrees.toFixed(1)} deg</dd></div>
    <div><dt>Position</dt><dd>{interpolatedPreview.position.map((value) => value.toFixed(2)).join(", ")}m</dd></div>
    <div><dt>Quaternion</dt><dd>{interpolatedPreview.orientation.map((value) => value.toFixed(3)).join(", ")}</dd></div>
    <div><dt>Travel</dt><dd>{diagnostics.travelMeters.toFixed(2)}m</dd></div>
    <div><dt>Angular change</dt><dd>{diagnostics.angularChangeDegrees.toFixed(1)} deg</dd></div>
    <div><dt>Disocclusion risk</dt><dd>{diagnostics.risk} · {(diagnostics.expectedDisocclusion * 100).toFixed(0)}%</dd></div>
  </dl>
</article>

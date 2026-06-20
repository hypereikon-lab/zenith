<script lang="ts">
  import {
    eulerDegreesFromQuaternion,
    quaternionFromEulerDegrees,
    quaternionFromLookAt,
    lookAtPivot,
  } from "../geometry/camera-rig.js";
  import {
    PLATE_EDITOR_VIEW_MODES,
    defaultPlateEditorCamera,
    plateEditorViewDisabledReason,
    plateEditorViewLabel,
  } from "../plates/plate-editor-view.js";
  import { nudgeProjectionCamera } from "../geometry/projection-camera-controls.js";
  import type { PlateEditorViewMode, PlateEditorCamera } from "../plates/plate-editor-view.js";
  import type { SourceProjectionMode } from "../geometry/source-projection.js";

  let {
    viewMode = $bindable(),
    viewCamera = $bindable(),
    showCaveMask = $bindable(false),
    invertCaveMask = $bindable(false),
    projectionProfile,
    onNudge,
  }: {
    viewMode: PlateEditorViewMode;
    viewCamera: PlateEditorCamera;
    showCaveMask?: boolean;
    invertCaveMask?: boolean;
    projectionProfile: SourceProjectionMode;
    onNudge?: (truck: number, lift: number, push: number) => void;
  } = $props();

  let viewCameraEuler = $derived(eulerDegreesFromQuaternion(viewCamera.orientation));
  let advancedOpen = $state(false);

  function applyCameraPreset(preset: "reset" | "zenith" | "horizon" | "front" | "back") {
    const defaultCamera = defaultPlateEditorCamera(projectionProfile);
    const pivot = defaultCamera.pivot || [0, 0, 0];
    const distance = projectionProfile === "cave-270" ? 4.4 : 2.45;

    if (preset === "reset") {
      viewCamera = defaultCamera;
      return;
    }

    let yaw = 0;
    let pitch = 0;

    if (preset === "zenith") {
      yaw = 0;
      pitch = 89.9 * Math.PI / 180;
    } else if (preset === "horizon") {
      yaw = 0;
      pitch = 0;
    } else if (preset === "front") {
      yaw = 0;
      pitch = 12 * Math.PI / 180;
    } else if (preset === "back") {
      yaw = Math.PI;
      pitch = 12 * Math.PI / 180;
    }

    const position: [number, number, number] = [
      pivot[0] + distance * Math.cos(pitch) * Math.sin(yaw),
      pivot[1] + distance * Math.sin(pitch),
      pivot[2] + distance * Math.cos(pitch) * Math.cos(yaw),
    ];

    viewCamera = {
      ...defaultCamera,
      position,
      orientation: quaternionFromLookAt(position, pivot),
      pivot,
    };
  }

  function setViewMode(mode: PlateEditorViewMode) {
    if (plateEditorViewDisabledReason(mode, projectionProfile)) return;
    viewMode = mode;
  }

  function updateCameraPosition(axis: 0 | 1 | 2, value: number) {
    const position = [...viewCamera.position] as [number, number, number];
    position[axis] = value;
    viewCamera = { ...viewCamera, position };
  }

  function updateCameraEuler(axis: "yawDegrees" | "pitchDegrees" | "rollDegrees", value: number) {
    const next = { ...viewCameraEuler, [axis]: value };
    viewCamera = { ...viewCamera, orientation: quaternionFromEulerDegrees(next.yawDegrees, next.pitchDegrees, next.rollDegrees) };
  }

  function updateCameraPivot(axis: 0 | 1 | 2, value: number) {
    const pivot = viewCamera.pivot ? [...viewCamera.pivot] as [number, number, number] : [0, 0, 0] as [number, number, number];
    pivot[axis] = value;
    viewCamera = { ...viewCamera, pivot };
  }

  function relockToPivot() {
    viewCamera = lookAtPivot(viewCamera);
  }

  function handleNudge(truck: number, lift: number, push: number) {
    if (onNudge) {
      onNudge(truck, lift, push);
    } else {
      viewCamera = nudgeProjectionCamera(viewCamera, viewMode, truck, lift, push);
    }
  }

  function getModeIcon(mode: PlateEditorViewMode) {
    if (mode === "source-map") return "🗺️";
    if (mode === "dome-orbit") return "🪐";
    if (mode === "dome-pov") return "👁️";
    if (mode === "cave-room") return "🧊";
    return "👁️";
  }
</script>

<div class="camera-controls-panel" aria-label="Camera Controls">
  <div class="camera-mode-segment">
    {#each PLATE_EDITOR_VIEW_MODES as mode}
      {@const disabledReason = plateEditorViewDisabledReason(mode, projectionProfile)}
      <button
        type="button"
        class="mode-btn"
        class:selected={viewMode === mode}
        aria-pressed={viewMode === mode ? "true" : "false"}
        disabled={Boolean(disabledReason)}
        title={disabledReason || `${plateEditorViewLabel(mode)} preview surface`}
        onclick={() => setViewMode(mode)}
      >
        <span class="mode-icon">{getModeIcon(mode)}</span>
        <span class="mode-label">{plateEditorViewLabel(mode)}</span>
      </button>
    {/each}
  </div>

  {#if viewMode !== "source-map"}
    <div class="camera-inspector-body">
      <div class="camera-presets-grid">
        <button type="button" class="preset-btn" title="Reset View" onclick={() => applyCameraPreset("reset")}>
          <span class="preset-icon">🔄</span>
          <span class="preset-label">Reset</span>
        </button>
        <button type="button" class="preset-btn" title="Zenith Look" onclick={() => applyCameraPreset("zenith")}>
          <span class="preset-icon">🔭</span>
          <span class="preset-label">Zenith</span>
        </button>
        <button type="button" class="preset-btn" title="Horizon Look" onclick={() => applyCameraPreset("horizon")}>
          <span class="preset-icon">🌅</span>
          <span class="preset-label">Horizon</span>
        </button>
        <button type="button" class="preset-btn" title="Facing Front" onclick={() => applyCameraPreset("front")}>
          <span class="preset-icon">🧍</span>
          <span class="preset-label">Front</span>
        </button>
      </div>

      {#if viewMode === "cave-room" || viewMode === "dome-orbit" || viewMode === "dome-pov"}
        <div class="camera-settings-row">
          <label class="setting-toggle">
            <input type="checkbox" bind:checked={showCaveMask} />
            <span class="toggle-label">🔍 CAVE/Dome Lattice Mask (Overlap opacity)</span>
          </label>
        </div>
        {#if showCaveMask}
          <div class="camera-settings-row" style="margin-left: 20px;">
            <label class="setting-toggle">
              <input type="checkbox" bind:checked={invertCaveMask} />
              <span class="toggle-label">🔄 Invert Lattice Mask</span>
            </label>
          </div>
        {/if}
      {/if}

      <div class="camera-transform-section">
        <button type="button" class="transform-toggle" onclick={() => advancedOpen = !advancedOpen}>
          <span>{advancedOpen ? "▼" : "▶"} Transforms & Nudge</span>
        </button>
        {#if advancedOpen}
          <div class="transform-grid">
            <div class="transform-row">
              <span class="transform-label">Pos</span>
              <input type="number" step="0.1" title="X Position" value={Number(viewCamera.position[0].toFixed(2))} onchange={(e) => updateCameraPosition(0, Number(e.currentTarget.value))} />
              <input type="number" step="0.1" title="Y Position" value={Number(viewCamera.position[1].toFixed(2))} onchange={(e) => updateCameraPosition(1, Number(e.currentTarget.value))} />
              <input type="number" step="0.1" title="Z Position" value={Number(viewCamera.position[2].toFixed(2))} onchange={(e) => updateCameraPosition(2, Number(e.currentTarget.value))} />
            </div>
            <div class="transform-row">
              <span class="transform-label">Rot</span>
              <input type="number" step="1" title="Yaw" value={Math.round(viewCameraEuler.yawDegrees)} onchange={(e) => updateCameraEuler("yawDegrees", Number(e.currentTarget.value))} />
              <input type="number" step="1" title="Pitch" value={Math.round(viewCameraEuler.pitchDegrees)} onchange={(e) => updateCameraEuler("pitchDegrees", Number(e.currentTarget.value))} />
              <input type="number" step="1" title="Roll" value={Math.round(viewCameraEuler.rollDegrees)} onchange={(e) => updateCameraEuler("rollDegrees", Number(e.currentTarget.value))} />
            </div>
            <div class="transform-row">
              <span class="transform-label">Pvt</span>
              <input type="number" step="0.1" title="Pivot X" value={Number((viewCamera.pivot?.[0] ?? 0).toFixed(2))} onchange={(e) => updateCameraPivot(0, Number(e.currentTarget.value))} />
              <input type="number" step="0.1" title="Pivot Y" value={Number((viewCamera.pivot?.[1] ?? 0).toFixed(2))} onchange={(e) => updateCameraPivot(1, Number(e.currentTarget.value))} />
              <input type="number" step="0.1" title="Pivot Z" value={Number((viewCamera.pivot?.[2] ?? 0).toFixed(2))} onchange={(e) => updateCameraPivot(2, Number(e.currentTarget.value))} />
            </div>
            <div class="nudge-pad">
              <button type="button" class="nudge-btn" title="Truck Left" onclick={() => handleNudge(-0.2, 0, 0)}>←</button>
              <button type="button" class="nudge-btn" title="Lift Up" onclick={() => handleNudge(0, 0.2, 0)}>↑</button>
              <button type="button" class="nudge-btn" title="Truck Right" onclick={() => handleNudge(0.2, 0, 0)}>→</button>
              <button type="button" class="nudge-btn" title="Push Forward" onclick={() => handleNudge(0, 0, 0.2)}>⇡</button>
              <button type="button" class="nudge-btn" title="Lift Down" onclick={() => handleNudge(0, -0.2, 0)}>↓</button>
              <button type="button" class="nudge-btn" title="Pull Back" onclick={() => handleNudge(0, 0, -0.2)}>⇣</button>
            </div>
            <button type="button" class="secondary-action compact-action relock-btn" onclick={relockToPivot}>Look at Pivot</button>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

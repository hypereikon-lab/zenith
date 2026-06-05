import { downloadBlob } from "../media/canvas-utils.js";
import { normalizeSourceProjectionMode, sourceProjectionLabel } from "../geometry/source-projection.js";
import type { ScheduleWorkspaceAutosave, ViewMode, ZenithState } from "./types.js";
import type { SourceProjectionMode } from "../geometry/source-projection.js";
import type { ZenithControls } from "../ui/dom.js";

type ViewControllerOptions = {
  state: ZenithState;
  controls: ZenithControls;
  elements: {
    viewButtons: HTMLButtonElement[];
    viewReadout: HTMLElement;
  };
  viewLabels: Record<string, string>;
  actions: {
    scheduleWorkspaceAutosave: ScheduleWorkspaceAutosave;
  };
};

export function createViewController({ state, controls, elements, viewLabels, actions }: ViewControllerOptions) {
  const { viewButtons, viewReadout } = elements;
  const allowedModes = new Set(Object.keys(viewLabels));

  function setViewMode(mode: string): void {
    state.viewMode = (allowedModes.has(mode) ? mode : "flat") as ViewMode;
    if (state.viewMode === "cave") {
      alignCameraForCave();
    }
    viewButtons.forEach((button: HTMLButtonElement) => {
      button.classList.toggle("active", button.dataset.view === state.viewMode);
    });
    updateUiState();
    actions.scheduleWorkspaceAutosave("view", 350);
  }

  function updateUiState() {
    updateViewButtonLabels();
    viewReadout.textContent = currentViewLabel();
  }

  function currentViewLabel(): string {
    return `${viewLabelForMode(state.viewMode)} - ${sourceProjectionLabel(sourceProjectionMode())}`;
  }

  function viewLabelForMode(mode: string): string {
    const nadir = isNadirProjection();
    if (mode === "inside") return nadir ? "Nadir POV" : viewLabels.inside;
    if (mode === "theater") return viewLabels.theater;
    if (mode === "orbit") return nadir ? "Lower orbit" : viewLabels.orbit;
    if (mode === "flat") return nadir ? "Flat nadir map" : viewLabels.flat;
    if (mode === "split") return nadir ? "Flat + lower projection" : viewLabels.split;
    if (mode === "cave") return nadir ? "CAVE from nadir map" : "CAVE projection preview";
    return viewLabels[mode] || mode;
  }

  function updateViewButtonLabels(): void {
    const labels: Record<string, string> = isNadirProjection()
      ? {
          inside: "Nadir",
          theater: "Theater",
          orbit: "Lower orbit",
          flat: "Flat",
          split: "Split",
          cave: "CAVE",
        }
      : {
          inside: "Center",
          theater: "Theater",
          orbit: "Orbit",
          flat: "Flat",
          split: "Split",
          cave: "CAVE",
        };
    viewButtons.forEach((button) => {
      const mode = button.dataset.view || "";
      button.textContent = labels[mode] || button.textContent;
    });
  }

  function lookAtPreset(preset: "zenith" | "nadir" | "north" | "horizon" | string): void {
    if (preset === "zenith") {
      if (sourceProjectionMode().startsWith("nadir")) {
        lookAtNadir();
      } else {
        lookAtZenith();
      }
    } else if (preset === "nadir") {
      lookAtNadir();
    } else if (preset === "north") {
      state.camera.insideYaw = 0;
      state.camera.theaterYaw = 0;
      state.camera.orbitYaw = 0;
      if (isNadirProjection()) {
        state.camera.insidePitch = -0.06;
        controls.theaterPitch.value = "-8";
        state.camera.orbitPitch = -0.18;
      } else {
        state.camera.insidePitch = 0.28;
        controls.theaterPitch.value = "28";
        state.camera.orbitPitch = 0.42;
      }
    } else if (preset === "horizon") {
      const sign = projectionVerticalSign();
      state.camera.insidePitch = 0.02 * sign;
      controls.theaterPitch.value = String(10 * sign);
      state.camera.orbitPitch = 0.2 * sign;
    }
    actions.scheduleWorkspaceAutosave("camera", 250);
  }

  function lookAtZenith(): void {
    state.camera.insidePitch = 1.38;
    controls.theaterPitch.value = "58";
    state.camera.orbitPitch = 1.08;
  }

  function lookAtNadir(): void {
    state.camera.insidePitch = -1.38;
    controls.theaterPitch.value = "-58";
    state.camera.orbitPitch = -1.08;
  }

  function alignCameraToProjection(): void {
    const sign = projectionVerticalSign();
    state.camera.insidePitch = withProjectionSign(state.camera.insidePitch, 0.48, sign);
    state.camera.orbitPitch = withProjectionSign(state.camera.orbitPitch, 0.5, sign);
    controls.theaterPitch.value = String(withProjectionSign(Number(controls.theaterPitch.value), 28, sign));
    if (state.viewMode === "cave") {
      alignCameraForCave();
    }
    updateUiState();
  }

  function alignCameraForCave(): void {
    state.camera.orbitPitch = Math.max(Math.abs(state.camera.orbitPitch || 0), 0.72);
    state.camera.orbitDistance = Math.max(Number(state.camera.orbitDistance) || 0, 4.4);
  }

  function sourceProjectionMode(): SourceProjectionMode {
    return normalizeSourceProjectionMode(controls.sourceProjection.value);
  }

  function isNadirProjection(): boolean {
    return sourceProjectionMode().startsWith("nadir");
  }

  function projectionVerticalSign(): 1 | -1 {
    return isNadirProjection() ? -1 : 1;
  }

  function withProjectionSign(value: number, fallback: number, sign: 1 | -1): number {
    const magnitude = Math.abs(Number.isFinite(value) && value !== 0 ? value : fallback);
    return magnitude * sign;
  }

  function resetCamera() {
    const sign = projectionVerticalSign();
    state.camera.insideYaw = 0;
    state.camera.insidePitch = 0.48 * sign;
    state.camera.theaterYaw = 0;
    state.camera.orbitYaw = -0.72;
    state.camera.orbitPitch = 0.5 * sign;
    state.camera.orbitDistance = 3.0;
    controls.fov.value = "92";
    controls.theaterEyeDrop.value = "0.34";
    controls.theaterSeatBack.value = "0.58";
    controls.theaterPitch.value = String(28 * sign);
    actions.scheduleWorkspaceAutosave("camera", 250);
  }

  function exportPreset() {
    const preset = {
      version: 1,
      viewMode: state.viewMode,
      controls: {
        fov: Number(controls.fov.value),
        renderScale: Number(controls.renderScale.value),
        meshQuality: Number(controls.meshQuality.value),
        radiusScale: Number(controls.radiusScale.value),
        rotation: Number(controls.rotation.value),
        domeTilt: Number(controls.domeTilt.value),
        theaterEyeDrop: Number(controls.theaterEyeDrop.value),
        theaterSeatBack: Number(controls.theaterSeatBack.value),
        theaterPitch: Number(controls.theaterPitch.value),
        shellShade: Number(controls.shellShade.value),
        floorOpacity: Number(controls.floorOpacity.value),
        exposure: Number(controls.exposure.value),
        overlayOpacity: Number(controls.overlayOpacity.value),
        sourceProjection: controls.sourceProjection.value,
        mirror: controls.mirror.checked,
        showRings: controls.showRings.checked,
        showSpokes: controls.showSpokes.checked,
        showHorizon: controls.showHorizon.checked,
        showLabels: controls.showLabels.checked,
        showSourceCircle: controls.showSourceCircle.checked,
        showZenith: controls.showZenith.checked,
        plateFit: controls.plateFit.value,
        plateFeather: Number(controls.plateFeather.value),
      },
      camera: state.camera,
      plateTransforms: {
        activePlateIndex: state.activePlateIndex,
        patches: state.platePlacements,
      },
      media: {
        name: state.sourceName,
        kind: state.mediaKind,
        width: state.sourceWidth,
        height: state.sourceHeight,
        duration: state.mediaDuration,
        fpsEstimate: state.mediaFps,
      },
    };
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" });
    downloadBlob(blob, `fulldome-viewer-preset-${Date.now()}.json`);
  }

  return {
    setViewMode,
    updateUiState,
    currentViewLabel,
    lookAtPreset,
    alignCameraToProjection,
    resetCamera,
    exportPreset,
  };
}

import { downloadBlob } from "../media/canvas-utils.js";
import type { ScheduleWorkspaceAutosave, ViewMode, ZenithState } from "./types.js";
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
    viewButtons.forEach((button: HTMLButtonElement) => {
      button.classList.toggle("active", button.dataset.view === mode);
    });
    updateUiState();
    actions.scheduleWorkspaceAutosave("view", 350);
  }

  function updateUiState() {
    viewReadout.textContent = viewLabels[state.viewMode] || state.viewMode;
  }

  function lookAtPreset(preset: "zenith" | "north" | "horizon" | string): void {
    if (preset === "zenith") {
      state.camera.insidePitch = 1.38;
      controls.theaterPitch.value = "58";
      state.camera.orbitPitch = 1.08;
    } else if (preset === "north") {
      state.camera.insideYaw = 0;
      state.camera.insidePitch = 0.28;
      state.camera.theaterYaw = 0;
      controls.theaterPitch.value = "28";
      state.camera.orbitYaw = 0;
      state.camera.orbitPitch = 0.42;
    } else if (preset === "horizon") {
      state.camera.insidePitch = 0.02;
      controls.theaterPitch.value = "10";
      state.camera.orbitPitch = 0.2;
    }
    actions.scheduleWorkspaceAutosave("camera", 250);
  }

  function resetCamera() {
    state.camera.insideYaw = 0;
    state.camera.insidePitch = 0.48;
    state.camera.theaterYaw = 0;
    state.camera.orbitYaw = -0.72;
    state.camera.orbitPitch = 0.5;
    state.camera.orbitDistance = 3.0;
    controls.fov.value = "92";
    controls.theaterEyeDrop.value = "0.34";
    controls.theaterSeatBack.value = "0.58";
    controls.theaterPitch.value = "28";
    actions.scheduleWorkspaceAutosave("camera", 250);
  }

  function exportPreset() {
    const preset = {
      version: 1,
      viewMode: state.viewMode,
      projectionMode: controls.projectionMode.value,
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
        customCurve: Number(controls.customCurve.value),
        shellShade: Number(controls.shellShade.value),
        floorOpacity: Number(controls.floorOpacity.value),
        exposure: Number(controls.exposure.value),
        overlayOpacity: Number(controls.overlayOpacity.value),
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
    lookAtPreset,
    resetCamera,
    exportPreset,
  };
}

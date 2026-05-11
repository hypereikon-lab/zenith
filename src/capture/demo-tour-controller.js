import { clamp } from "../projection.js";
import { loadCanvasFromImageSource } from "../media/canvas-utils.js";

const VIEW_SECONDS = 6;
const VIEW_DURATION_MS = VIEW_SECONDS * 1000;
const PLATE_COMPOSE_SECONDS = 10;
const PLATE_COMPOSE_DURATION_MS = PLATE_COMPOSE_SECONDS * 1000;
const INPAINT_TRANSITION_SECONDS = 8;
const INPAINT_TRANSITION_DURATION_MS = INPAINT_TRANSITION_SECONDS * 1000;
const TOUR_STEPS = ["flat", "orbit", "theater", "inside"];

export function createDemoTourController({ state, controls, video, elements, actions }) {
  const { demoPlateCompose, demoViewTour, demoInpaintPulse, demoCursor, captureReadout } = elements;
  let frameId = 0;
  let startedAt = 0;
  let previousState = null;
  let activeStepIndex = -1;
  let composeFrameId = 0;
  let composeStartedAt = 0;
  let composePreviousState = null;
  let composeTargetPlacements = [];
  let composeStartPlacements = [];
  let pulseFrameId = 0;
  let pulseStartedAt = 0;
  let pulseCanvas = null;
  let pulseContext = null;
  let pulseAfterCanvas = null;

  function playViewTour() {
    if (frameId) {
      stopViewTour({ completed: true });
      return;
    }
    if (pulseFrameId) stopInpaintPulse();
    previousState = {
      viewMode: state.viewMode,
      autoRotate: controls.autoRotate.checked,
      rotation: controls.rotation.value,
      theaterPitch: controls.theaterPitch.value,
      camera: { ...state.camera },
      videoPaused: video.paused,
      videoTime: video.currentTime || 0,
    };
    controls.autoRotate.checked = false;
    startedAt = performance.now();
    activeStepIndex = -1;
    demoCursor.hidden = false;
    demoViewTour.textContent = "Stop tour";
    captureReadout.textContent = "Playing view tour: 6s per view";
    frameId = requestAnimationFrame(tick);
  }

  function playPlateComposeDemo() {
    if (composeFrameId) {
      stopPlateComposeDemo();
      return;
    }
    if (!state.plates?.length || !state.platePlacements?.length) {
      captureReadout.textContent = "Load plates before mock compose";
      return;
    }
    if (frameId) stopViewTour();
    if (pulseFrameId) stopInpaintPulse();

    composePreviousState = {
      viewMode: state.viewMode,
      workspace: state.activeWorkspace,
      activePlateIndex: state.activePlateIndex,
      editPlacement: controls.editPlacement.checked,
      sourceCanvas: state.sourceCanvas,
      sourceWidth: state.sourceWidth,
      sourceHeight: state.sourceHeight,
      sourceName: state.sourceName,
      sourceKind: state.mediaKind,
      mediaDuration: state.mediaDuration,
      plateCompositeCanvas: state.plateCompositeCanvas,
      plateCompositeDirty: state.plateCompositeDirty,
      placements: structuredClone(state.platePlacements),
    };
    composeTargetPlacements = structuredClone(state.platePlacements);
    composeStartPlacements = composeTargetPlacements.map((placement, index) => stagedPlatePlacement(placement, index, composeTargetPlacements.length));
    state.activePlateIndex = 0;
    controls.editPlacement.checked = true;
    actions.setWorkspace?.("create");
    actions.setViewMode("flat");
    demoPlateCompose.textContent = "Stop compose";
    captureReadout.textContent = "Mock composing plate positions";
    demoCursor.hidden = false;
    composeStartedAt = performance.now();
    composeFrameId = requestAnimationFrame(tickPlateCompose);
  }

  function stopPlateComposeDemo(options = {}) {
    cancelAnimationFrame(composeFrameId);
    composeFrameId = 0;
    demoCursor.hidden = true;
    demoPlateCompose.textContent = "Mock compose";
    if (composePreviousState) {
      state.platePlacements = structuredClone(composePreviousState.placements);
      state.activePlateIndex = composePreviousState.activePlateIndex;
      controls.editPlacement.checked = composePreviousState.editPlacement;
      actions.setViewMode(composePreviousState.viewMode);
      actions.setWorkspace?.(composePreviousState.workspace);
      state.plateCompositeCanvas = composePreviousState.plateCompositeCanvas;
      state.plateCompositeDirty = composePreviousState.plateCompositeDirty;
      state.sourceCanvas = composePreviousState.sourceCanvas;
      state.sourceWidth = composePreviousState.sourceWidth;
      state.sourceHeight = composePreviousState.sourceHeight;
      state.sourceName = composePreviousState.sourceName;
      state.mediaKind = composePreviousState.sourceKind;
      state.mediaDuration = composePreviousState.mediaDuration;
      actions.restoreMediaTexture?.();
      actions.updateMediaReadouts?.();
      actions.updatePatchControlsFromActive?.();
      actions.updatePlateSelect?.();
      composePreviousState = null;
    }
    composeTargetPlacements = [];
    composeStartPlacements = [];
    captureReadout.textContent = "Mock compose ready";
    if (options.completed) {
      actions.onPlateComposeComplete?.();
    }
  }

  function stopViewTour(options = {}) {
    cancelAnimationFrame(frameId);
    frameId = 0;
    activeStepIndex = -1;
    demoCursor.hidden = true;
    demoViewTour.textContent = "6s per view";
    if (previousState) {
      state.camera = { ...state.camera, ...previousState.camera };
      controls.autoRotate.checked = previousState.autoRotate;
      controls.rotation.value = previousState.rotation;
      controls.theaterPitch.value = previousState.theaterPitch;
      actions.setViewMode(previousState.viewMode);
      restoreVideo();
      previousState = null;
    }
    captureReadout.textContent = "View tour ready";
    if (options.completed) {
      actions.onViewTourComplete?.();
    }
  }

  async function playInpaintPulse() {
    if (pulseFrameId) {
      stopInpaintPulse();
      return;
    }
    if (frameId) stopViewTour();
    const afterCanvas = await resolveInpaintPulseAfterCanvas();
    if (!state.plateCompositeCanvas || !afterCanvas) {
      captureReadout.textContent = "Need plate sketch and inpainted source";
      return;
    }
    pulseAfterCanvas = afterCanvas;
    pulseCanvas = document.createElement("canvas");
    pulseCanvas.width = state.plateCompositeCanvas.width;
    pulseCanvas.height = state.plateCompositeCanvas.height;
    pulseContext = pulseCanvas.getContext("2d", { alpha: false });
    pulseStartedAt = performance.now();
    captureReadout.textContent = "Transitioning plates to inpaint";
    demoInpaintPulse.textContent = "Stop transition";
    pulseFrameId = requestAnimationFrame(tickInpaintPulse);
  }

  function stopInpaintPulse() {
    cancelAnimationFrame(pulseFrameId);
    pulseFrameId = 0;
    pulseCanvas = null;
    pulseContext = null;
    pulseAfterCanvas = null;
    actions.restoreMediaTexture?.();
    demoInpaintPulse.textContent = "Before/after transition";
    captureReadout.textContent = "Before/after transition ready";
  }

  function tick(now) {
    const elapsed = now - startedAt;
    const stepIndex = Math.min(TOUR_STEPS.length - 1, Math.floor(elapsed / VIEW_DURATION_MS));
    const localProgress = clamp((elapsed - stepIndex * VIEW_DURATION_MS) / VIEW_DURATION_MS, 0, 1);
    if (stepIndex !== activeStepIndex) {
      activeStepIndex = stepIndex;
      actions.setViewMode(TOUR_STEPS[stepIndex]);
      restartVideoSegment();
      captureReadout.textContent = `Tour ${TOUR_STEPS[stepIndex]} (${VIEW_SECONDS}s)`;
    }
    applyFakeDrag(TOUR_STEPS[stepIndex], localProgress, now);
    if (elapsed >= VIEW_DURATION_MS * TOUR_STEPS.length) {
      stopViewTour();
      return;
    }
    frameId = requestAnimationFrame(tick);
  }

  function tickPlateCompose(now) {
    const elapsed = now - composeStartedAt;
    const progress = clamp(elapsed / PLATE_COMPOSE_DURATION_MS, 0, 1);
    const plateCount = composeTargetPlacements.length;
    state.platePlacements = composeTargetPlacements.map((target, index) => {
      const phase = clamp((progress - index * 0.11) / 0.68, 0, 1);
      const eased = smootherstep(phase);
      const hover = Math.sin(progress * Math.PI * 2 + index * 1.7);
      return {
        ...target,
        azimuth: lerpAngle(composeStartPlacements[index].azimuth, target.azimuth, eased) + hover * (1 - eased) * 5,
        radius: lerp(composeStartPlacements[index].radius, target.radius, eased),
        scale: lerp(composeStartPlacements[index].scale, target.scale, eased),
        spin: lerpAngle(composeStartPlacements[index].spin, target.spin, eased) + hover * (1 - eased) * 8,
      };
    });
    state.activePlateIndex = Math.min(plateCount - 1, Math.floor(progress * plateCount));
    moveDemoCursorForPlate(progress, state.activePlateIndex, plateCount);
    actions.updatePatchControlsFromActive?.();
    actions.updatePlateSelect?.();
    actions.renderPlatePreviewNow?.();
    captureReadout.textContent = `Mock compose ${(progress * PLATE_COMPOSE_SECONDS).toFixed(1)}s`;
    if (progress >= 1) {
      stopPlateComposeDemo({ completed: true });
      return;
    }
    composeFrameId = requestAnimationFrame(tickPlateCompose);
  }

  function applyFakeDrag(view, progress, now) {
    const gesture = gesturePoint(progress, now);
    demoCursor.style.left = `${gesture.x}%`;
    demoCursor.style.top = `${gesture.y}%`;
    demoCursor.style.transform = `translate(-50%, -50%) scale(${gesture.scale})`;

    const phase = Math.sin(progress * Math.PI * 2);
    if (view === "flat") {
      controls.rotation.value = String(wrapDegrees(Number(previousState.rotation) + progress * 42));
      return;
    }
    if (view === "orbit") {
      state.camera.orbitYaw = previousState.camera.orbitYaw + progress * 1.15;
      state.camera.orbitPitch = clamp(previousState.camera.orbitPitch + phase * 0.18 - Math.cos(progress * Math.PI) * 0.1, -0.34, 1.28);
      return;
    }
    if (view === "theater") {
      state.camera.theaterYaw = previousState.camera.theaterYaw + progress * 1.25 + phase * 0.18;
      controls.theaterPitch.value = String(clamp(Number(previousState.theaterPitch) + phase * 18 - Math.cos(progress * Math.PI) * 16, -12, 68));
      return;
    }
    state.camera.insideYaw = previousState.camera.insideYaw + progress * 1.45 + phase * 0.2;
    state.camera.insidePitch = clamp(previousState.camera.insidePitch + phase * 0.28 - Math.cos(progress * Math.PI) * 0.22, -0.58, 1.42);
  }

  function tickInpaintPulse(now) {
    const progress = ((now - pulseStartedAt) % INPAINT_TRANSITION_DURATION_MS) / INPAINT_TRANSITION_DURATION_MS;
    const blend = transitionBlend(progress);
    pulseContext.fillStyle = "#000";
    pulseContext.fillRect(0, 0, pulseCanvas.width, pulseCanvas.height);
    pulseContext.globalAlpha = 1;
    pulseContext.drawImage(state.plateCompositeCanvas, 0, 0, pulseCanvas.width, pulseCanvas.height);
    pulseContext.globalAlpha = blend;
    pulseContext.drawImage(pulseAfterCanvas, 0, 0, pulseCanvas.width, pulseCanvas.height);
    pulseContext.globalAlpha = 1;
    actions.displayTemporaryCanvas?.(pulseCanvas, "Plate sketch / inpaint pulse");
    pulseFrameId = requestAnimationFrame(tickInpaintPulse);
  }

  async function resolveInpaintPulseAfterCanvas() {
    const output = activeRunwayOutput();
    const source = output?.dataUri || output?.url;
    if (source) {
      try {
        return await loadCanvasFromImageSource(source);
      } catch (error) {
        console.warn("Could not load active inpaint output for before/after pulse.", error);
      }
    }
    return state.sourceCanvas;
  }

  function activeRunwayOutput() {
    if (!state.runwayOutputs?.length) return null;
    const index = clamp(Math.round(state.activeRunwayOutputIndex) || 0, 0, state.runwayOutputs.length - 1);
    return state.runwayOutputs[index] || null;
  }

  function transitionBlend(progress) {
    const reveal = smoothstep(0.54, 0.76, progress);
    const reset = smoothstep(0.9, 0.99, progress);
    return reveal * (1 - reset);
  }

  function restartVideoSegment() {
    if (state.mediaKind !== "video") return;
    try {
      video.pause();
      video.currentTime = 0;
      state.pendingVideoUpload = true;
      video.play().catch((error) => {
        console.warn("Could not autoplay video during demo tour.", error);
      });
      actions.updateTransport?.();
    } catch (error) {
      console.warn("Could not restart video during demo tour.", error);
    }
  }

  function restoreVideo() {
    if (state.mediaKind !== "video") return;
    try {
      video.pause();
      video.currentTime = previousState.videoTime;
      state.pendingVideoUpload = true;
      if (!previousState.videoPaused) {
        video.play().catch((error) => console.warn("Could not restore video playback.", error));
      }
      actions.updateTransport?.();
    } catch (error) {
      console.warn("Could not restore video state after demo tour.", error);
    }
  }

  return {
    playPlateComposeDemo,
    stopPlateComposeDemo,
    playViewTour,
    stopViewTour,
    playInpaintPulse,
    stopInpaintPulse,
  };
}

function gesturePoint(progress, now) {
  const loop = progress * Math.PI * 2;
  return {
    x: 50 + Math.sin(loop * 0.85) * 24 + Math.sin(now * 0.006) * 2,
    y: 52 + Math.cos(loop * 1.05) * 16,
    scale: 1 + Math.sin(loop * 2.2) * 0.08,
  };
}

function stagedPlatePlacement(target, index, count) {
  const spread = count <= 1 ? 0 : (index / (count - 1) - 0.5) * 34;
  return {
    ...target,
    azimuth: wrapDegrees(-spread),
    radius: 0.12 + index * 0.025,
    scale: Math.max(0.16, target.scale * 0.42),
    spin: wrapDegrees(target.spin - 28 + index * 19),
  };
}

function moveDemoCursorForPlate(progress, index, count) {
  const local = (progress * Math.max(1, count) + index * 0.13) % 1;
  const angle = local * Math.PI * 2;
  const x = 50 + Math.sin(angle + index) * 20;
  const y = 53 + Math.cos(angle * 0.8 + index * 0.7) * 15;
  const scale = 1 + Math.sin(angle * 2.1) * 0.08;
  const cursor = document.querySelector("#demoCursor");
  if (!cursor) return;
  cursor.style.left = `${x}%`;
  cursor.style.top = `${y}%`;
  cursor.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpAngle(a, b, t) {
  return wrapDegrees(a + wrapDegrees(b - a) * t);
}

function smootherstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function wrapDegrees(value) {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

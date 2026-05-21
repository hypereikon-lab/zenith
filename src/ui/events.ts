import type { ZenithDom } from "./dom.js";

type ZenithEventActions = {
  resize: () => void;
  loadMediaFile: (file: File) => Promise<void>;
  loadPlateFiles: (files: File[]) => Promise<void>;
  commitPlateSketch: () => Promise<void>;
  exportPlateMap: () => Promise<void>;
  runRunwayInpaint: () => Promise<void>;
  useActiveRunwayOutput: () => Promise<void>;
  exportActiveRunwayOutput: () => Promise<void>;
  runRunwayDepthMap: () => Promise<void>;
  previewDepthMotion: () => Promise<void> | void;
  exportDepthMotion: () => Promise<void>;
  planSeedancePrompt: () => Promise<void>;
  sendDepthMotionToSeedance: () => Promise<void>;
  showActiveSeedanceOutput: () => Promise<unknown>;
  exportActiveSeedanceOutput: () => Promise<void>;
  copyDepthMotionConfig: () => Promise<void> | void;
  exportDepthMotionConfig: () => void;
  planImageSeedancePrompt: () => Promise<void>;
  sendImageToSeedance: () => Promise<void>;
  applyDepthMotionPreset: () => void;
  handleDepthMotionControlInput: () => void;
  setWorkspace: (workspace?: string) => void;
  saveWorkspaceSnapshot: (reason?: string) => Promise<unknown>;
  exportWorkspaceState: () => Promise<void>;
  restoreWorkspaceAutosave: (options?: { silent?: boolean }) => Promise<boolean>;
  clearWorkspaceAutosave: () => Promise<void>;
  saveCurrentVersion: () => Promise<void>;
  applySelectedVersion: () => Promise<void>;
  deleteSelectedVersion: () => void;
  exportSelectedVersion: () => void;
  updateVersionUi: () => void;
  importVersionFile: () => Promise<void>;
  handlePlacementEditChange: () => Promise<void>;
  handleActivePlateChange: () => void;
  handlePatchTransformInput: () => void;
  handleAutoArrangePatches: () => void;
  handleResetPatch: () => void;
  handleResetPatchWarp: () => void;
  handleFlipPatchX: () => void;
  handleFlipPatchY: () => void;
  handlePlateCountFitChange: () => void;
  handlePlatePreviewControlInput: () => void;
  setViewMode: (mode?: string) => void;
  lookAtPreset: (preset: string) => void;
  captureFrame: () => Promise<void>;
  captureSquareFrame: () => Promise<void>;
  toggleCanvasRecording: () => Promise<void>;
  playPlateComposeDemo: () => void;
  playViewTour: () => void;
  playInpaintPulse: () => void;
  exportPreset: () => void;
  toggleVideo: () => void;
  stepVideo: (direction: number) => void;
  handlePlaybackRateChange: () => void;
  handleMeshQualityInput: () => void;
  handleTimelinePointerDown: () => void;
  handleTimelineInput: () => void;
  handleTimelinePointerUp: () => void;
  handleTimelineChange: () => void;
  updateTransport: () => void;
  handleVideoSeeked: () => void;
  handleCanvasPointerDown: (event: PointerEvent) => void;
  handleCanvasPointerMove: (event: PointerEvent) => void;
  handleCanvasPointerUp: (event: PointerEvent) => void;
  handleCanvasWheel: (event: WheelEvent) => void;
  handleWindowDragEnter: (event: DragEvent) => void;
  handleWindowDragOver: (event: DragEvent) => void;
  handleWindowDragLeave: () => void;
  handleWindowDrop: (event: DragEvent) => Promise<void>;
  handleKeyDown: (event: KeyboardEvent) => void;
  handleWorkspaceControlChange: (event: Event) => void;
};

export function bindZenithEvents(dom: ZenithDom, actions: ZenithEventActions): void {
  const { controls } = dom;
  bindAutosizingTextareas([controls.runwayPrompt, controls.depthPrompt]);

  window.addEventListener("resize", actions.resize);

  dom.workspaceTabs.forEach((button: HTMLButtonElement) => {
    button.addEventListener("click", () => actions.setWorkspace(button.dataset.workspaceTab));
  });
  applyWorkspaceDom(dom, "create");

  dom.mediaInput.addEventListener("change", async () => {
    const file = dom.mediaInput.files?.[0];
    if (!file) return;
    await actions.loadMediaFile(file);
  });
  dom.platesInput.addEventListener("change", async () => {
    await actions.loadPlateFiles(Array.from(dom.platesInput.files || []));
  });
  dom.commitPlateMap.addEventListener("click", actions.commitPlateSketch);
  dom.exportPlateMap.addEventListener("click", actions.exportPlateMap);

  dom.runwayInpaint.addEventListener("click", actions.runRunwayInpaint);
  dom.useRunwayOutput.addEventListener("click", actions.useActiveRunwayOutput);
  dom.exportRunwayOutput.addEventListener("click", actions.exportActiveRunwayOutput);
  dom.runwayDepthMap.addEventListener("click", actions.runRunwayDepthMap);
  dom.previewDepthMotion.addEventListener("click", actions.previewDepthMotion);
  dom.exportDepthMotion.addEventListener("click", actions.exportDepthMotion);
  dom.codexSeedancePrompt.addEventListener("click", actions.planSeedancePrompt);
  dom.runwaySeedance.addEventListener("click", actions.sendDepthMotionToSeedance);
  dom.showSeedanceOutput.addEventListener("click", actions.showActiveSeedanceOutput);
  dom.exportSeedanceOutput.addEventListener("click", actions.exportActiveSeedanceOutput);
  dom.copyDepthMotionConfig.addEventListener("click", actions.copyDepthMotionConfig);
  dom.exportDepthMotionConfig.addEventListener("click", actions.exportDepthMotionConfig);
  dom.codexImageSeedancePrompt.addEventListener("click", actions.planImageSeedancePrompt);
  dom.runwayImageSeedance.addEventListener("click", actions.sendImageToSeedance);
  controls.depthMotionPreset.addEventListener("change", actions.applyDepthMotionPreset);
  [
    controls.depthPolarity,
    controls.depthGuideMode,
    controls.seedancePromptMode,
    controls.imageSeedancePromptMode,
    controls.imageSeedanceRatio,
    controls.depthSketchSize,
    controls.depthNear,
    controls.depthFar,
    controls.depthMotionGain,
    controls.depthContrast,
    controls.depthGuideNoise,
    controls.depthSketchYaw,
    controls.depthSketchPitch,
    controls.depthSketchRoll,
    controls.depthSketchTruck,
    controls.depthSketchLift,
    controls.depthSketchPush,
    controls.depthSketchGapFill,
  ].forEach((control) => {
    control.addEventListener("input", actions.handleDepthMotionControlInput);
    control.addEventListener("change", actions.handleDepthMotionControlInput);
  });

  dom.saveWorkspace.addEventListener("click", () => actions.saveWorkspaceSnapshot("manual"));
  dom.exportWorkspaceState.addEventListener("click", actions.exportWorkspaceState);
  dom.restoreWorkspace.addEventListener("click", () => actions.restoreWorkspaceAutosave({ silent: false }));
  dom.clearWorkspace.addEventListener("click", actions.clearWorkspaceAutosave);
  dom.saveVersion.addEventListener("click", actions.saveCurrentVersion);
  dom.applyVersion.addEventListener("click", actions.applySelectedVersion);
  dom.deleteVersion.addEventListener("click", actions.deleteSelectedVersion);
  dom.exportVersion.addEventListener("click", actions.exportSelectedVersion);
  dom.versionSelect.addEventListener("change", actions.updateVersionUi);
  dom.importVersion.addEventListener("change", actions.importVersionFile);

  controls.editPlacement.addEventListener("change", actions.handlePlacementEditChange);
  controls.activePlate.addEventListener("change", actions.handleActivePlateChange);
  [controls.patchAzimuth, controls.patchRadius, controls.patchSpin, controls.patchOpacity].forEach((control) => {
    control.addEventListener("input", actions.handlePatchTransformInput);
  });
  dom.autoArrangePatches.addEventListener("click", actions.handleAutoArrangePatches);
  dom.resetPatch.addEventListener("click", actions.handleResetPatch);
  dom.resetPatchWarp.addEventListener("click", actions.handleResetPatchWarp);
  dom.flipPatchX.addEventListener("click", actions.handleFlipPatchX);
  dom.flipPatchY.addEventListener("click", actions.handleFlipPatchY);
  [controls.plateCount, controls.plateFit].forEach((control) => {
    control.addEventListener("change", actions.handlePlateCountFitChange);
  });
  controls.projectionMode.addEventListener("change", actions.handlePlatePreviewControlInput);
  [controls.plateFeather, controls.customCurve].forEach((control) => {
    control.addEventListener("input", actions.handlePlatePreviewControlInput);
  });

  dom.viewButtons.forEach((button: HTMLButtonElement) => {
    button.addEventListener("click", () => actions.setViewMode(button.dataset.view));
  });
  dom.lookZenith.addEventListener("click", () => actions.lookAtPreset("zenith"));
  dom.lookNorth.addEventListener("click", () => actions.lookAtPreset("north"));
  dom.lookHorizon.addEventListener("click", () => actions.lookAtPreset("horizon"));
  dom.captureFrameButton.addEventListener("click", actions.captureFrame);
  dom.captureSquareFrame.addEventListener("click", actions.captureSquareFrame);
  dom.recordCanvas.addEventListener("click", actions.toggleCanvasRecording);
  dom.demoPlateCompose.addEventListener("click", actions.playPlateComposeDemo);
  dom.demoViewTour.addEventListener("click", actions.playViewTour);
  dom.demoInpaintPulse.addEventListener("click", actions.playInpaintPulse);
  dom.exportPresetButton.addEventListener("click", actions.exportPreset);

  dom.playToggle.addEventListener("click", actions.toggleVideo);
  dom.stepBack.addEventListener("click", () => actions.stepVideo(-1));
  dom.stepForward.addEventListener("click", () => actions.stepVideo(1));
  dom.playbackRate.addEventListener("change", actions.handlePlaybackRateChange);
  controls.renderScale.addEventListener("input", actions.resize);
  controls.meshQuality.addEventListener("input", actions.handleMeshQualityInput);

  dom.timeline.addEventListener("pointerdown", actions.handleTimelinePointerDown);
  dom.timeline.addEventListener("input", actions.handleTimelineInput);
  dom.timeline.addEventListener("pointerup", actions.handleTimelinePointerUp);
  dom.timeline.addEventListener("change", actions.handleTimelineChange);

  dom.video.addEventListener("pause", actions.updateTransport);
  dom.video.addEventListener("play", actions.updateTransport);
  dom.video.addEventListener("ended", actions.updateTransport);
  dom.video.addEventListener("seeked", actions.handleVideoSeeked);
  dom.video.addEventListener("loadedmetadata", actions.updateTransport);

  dom.canvas.addEventListener("pointerdown", actions.handleCanvasPointerDown);
  dom.canvas.addEventListener("pointermove", actions.handleCanvasPointerMove);
  dom.canvas.addEventListener("pointerup", actions.handleCanvasPointerUp);
  dom.canvas.addEventListener("wheel", actions.handleCanvasWheel, { passive: false });

  window.addEventListener("dragenter", actions.handleWindowDragEnter);
  window.addEventListener("dragover", actions.handleWindowDragOver);
  window.addEventListener("dragleave", actions.handleWindowDragLeave);
  window.addEventListener("drop", actions.handleWindowDrop);
  window.addEventListener("keydown", actions.handleKeyDown);

  document.addEventListener("input", actions.handleWorkspaceControlChange, true);
  document.addEventListener("change", actions.handleWorkspaceControlChange, true);
}

function bindAutosizingTextareas(textareas: HTMLTextAreaElement[]): void {
  textareas.filter(Boolean).forEach((textarea: HTMLTextAreaElement) => {
    const resize = () => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight + 2}px`;
    };
    textarea.addEventListener("input", resize);
    textarea.addEventListener("change", resize);
    requestAnimationFrame(resize);
  });
}

export function applyWorkspaceDom(dom: ZenithDom, workspace?: string): void {
  const activeWorkspace = workspace || "create";
  dom.workspaceTabs.forEach((button: HTMLButtonElement) => {
    const active = button.dataset.workspaceTab === activeWorkspace;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  dom.workspaceSections.forEach((section: HTMLElement) => {
    section.classList.toggle("workspace-section-hidden", section.dataset.workspace !== activeWorkspace);
  });
}

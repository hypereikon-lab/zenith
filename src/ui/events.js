export function bindZenithEvents(dom, actions) {
  const { controls } = dom;
  bindAutosizingTextareas([controls.runwayPrompt, controls.depthPrompt]);

  window.addEventListener("resize", actions.resize);

  dom.workspaceTabs.forEach((button) => {
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
    control.addEventListener("input", actions.refreshDepthMotionPreview);
    control.addEventListener("change", actions.refreshDepthMotionPreview);
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
  [
    controls.patchAzimuth,
    controls.patchRadius,
    controls.patchSpin,
    controls.patchOpacity,
  ].forEach((control) => {
    control.addEventListener("input", actions.handlePatchTransformInput);
  });
  dom.autoArrangePatches.addEventListener("click", actions.handleAutoArrangePatches);
  dom.resetPatch.addEventListener("click", actions.handleResetPatch);
  dom.flipPatchX.addEventListener("click", actions.handleFlipPatchX);
  dom.flipPatchY.addEventListener("click", actions.handleFlipPatchY);
  [controls.plateCount, controls.plateFit].forEach((control) => {
    control.addEventListener("change", actions.handlePlateCountFitChange);
  });
  [controls.plateFeather].forEach((control) => {
    control.addEventListener("input", actions.handlePlatePreviewControlInput);
  });

  dom.viewButtons.forEach((button) => {
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

function bindAutosizingTextareas(textareas) {
  textareas.filter(Boolean).forEach((textarea) => {
    const resize = () => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight + 2}px`;
    };
    textarea.addEventListener("input", resize);
    textarea.addEventListener("change", resize);
    requestAnimationFrame(resize);
  });
}

export function applyWorkspaceDom(dom, workspace) {
  const activeWorkspace = workspace || "create";
  dom.workspaceTabs.forEach((button) => {
    const active = button.dataset.workspaceTab === activeWorkspace;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  dom.workspaceSections.forEach((section) => {
    section.classList.toggle("workspace-section-hidden", section.dataset.workspace !== activeWorkspace);
  });
}

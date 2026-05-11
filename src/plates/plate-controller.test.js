import { describe, expect, test } from "vitest";
import { createPlateController } from "./plate-controller.js";

describe("plate controller edit gate", () => {
  test("disables placement controls until edit placement is checked", () => {
    const { controller, controls, elements } = buildPlateControllerHarness();

    controller.updatePlateLayoutUi();

    expect(controls.editPlacement.disabled).toBe(false);
    expect(controls.activePlate.disabled).toBe(true);
    expect(controls.patchAzimuth.disabled).toBe(true);
    expect(controls.patchRadius.disabled).toBe(true);
    expect(elements.autoArrangePatches.disabled).toBe(true);
    expect(elements.resetPatch.disabled).toBe(true);
    expect(elements.flipPatchX.disabled).toBe(true);
    expect(elements.flipPatchY.disabled).toBe(true);
    expect(elements.commitPlateMap.disabled).toBe(false);
    expect(elements.patchEditor.hidden).toBe(true);

    controls.editPlacement.checked = true;
    controller.updatePlateLayoutUi();

    expect(controls.activePlate.disabled).toBe(true);
    expect(controls.patchAzimuth.disabled).toBe(false);
    expect(controls.patchRadius.disabled).toBe(false);
    expect(elements.autoArrangePatches.disabled).toBe(false);
    expect(elements.resetPatch.disabled).toBe(false);
    expect(elements.flipPatchX.disabled).toBe(false);
    expect(elements.flipPatchY.disabled).toBe(false);
    expect(elements.patchEditor.hidden).toBe(false);
  });

  test("ignores placement slider input while edit placement is unchecked", () => {
    const { controller, state, controls } = buildPlateControllerHarness();

    controls.patchAzimuth.value = "72";
    controls.patchRadius.value = "0.8";
    controller.handlePatchTransformInput();

    expect(state.platePlacements[0].azimuth).toBe(0);
    expect(state.platePlacements[0].radius).toBe(0.35);
  });

  test("flips the active plate only while edit placement is checked", () => {
    const { controller, state, controls } = buildPlateControllerHarness();

    controller.handleFlipPatchX();
    expect(state.platePlacements[0].flipX).toBe(false);

    controls.editPlacement.checked = true;
    controller.handleFlipPatchX();
    controller.handleFlipPatchY();

    expect(state.platePlacements[0].flipX).toBe(true);
    expect(state.platePlacements[0].flipY).toBe(true);
  });

  test("commits the plate map when leaving edit placement", async () => {
    const { controller, controls, calls } = buildPlateControllerHarness();
    controls.editPlacement.checked = false;

    await controller.handlePlacementEditChange();

    expect(calls.renderPlateComposite).toBe(1);
    expect(calls.readTextureToCanvas).toBe(1);
  });
});

function buildPlateControllerHarness() {
  const calls = {
    renderPlateComposite: 0,
    readTextureToCanvas: 0,
  };
  const state = {
    plates: [{ name: "plate.png", width: 100, height: 100, aspect: 1 }],
    platePlacements: [
      {
        azimuth: 0,
        radius: 0.35,
        scale: 0.8,
        spin: 0,
        opacity: 1,
        flipX: false,
        flipY: false,
      },
    ],
    activePlateIndex: 0,
    plateCompositeCanvas: null,
    sourceUrl: null,
  };
  const controls = {
    plateCount: control("auto"),
    plateFit: control("contain"),
    editPlacement: checkbox(false),
    activePlate: control("0"),
    patchAzimuth: control("0"),
    patchRadius: control("0.35"),
    patchSpin: control("0"),
    patchOpacity: control("1"),
    plateFeather: control("0.025"),
  };
  const elements = {
    commitPlateMap: button(),
    exportPlateMap: button(),
    platesReadout: { textContent: "" },
    patchEditor: panel(),
    patchTransform: panel(),
    autoArrangePatches: button(),
    resetPatch: button(),
    flipPatchX: button(),
    flipPatchY: button(),
  };
  const controller = createPlateController({
    state,
    controls,
    elements,
    video: videoStub(),
    videoTransport: {
      stopFrameLoop() {},
      setControlsEnabled() {},
    },
    renderer: {
      renderPlateComposite() {
        calls.renderPlateComposite += 1;
        return {};
      },
      async readTextureToCanvas() {
        calls.readTextureToCanvas += 1;
        return canvasStub();
      },
    },
    actions: {
      abortInpaint() {},
      clearInpaintState() {},
      setGpuState() {},
      setViewMode() {},
      uploadCanvasAsSource() {},
      updateInpaintUiState() {},
      updateVersionUi() {},
      scheduleWorkspaceAutosave() {},
      displayTextureAsSource() {},
    },
  });
  return { controller, state, controls, elements, calls };
}

function control(value) {
  return {
    value,
    disabled: false,
    replaceChildren() {},
    append() {},
  };
}

function checkbox(checked) {
  return {
    checked,
    disabled: false,
  };
}

function button() {
  return { disabled: false };
}

function panel() {
  return {
    hidden: false,
    classList: {
      toggle() {},
    },
  };
}

function canvasStub() {
  return {
    toBlob(callback) {
      callback(new Blob());
    },
  };
}

function videoStub() {
  return {
    pause() {},
    removeAttribute() {},
    load() {},
  };
}

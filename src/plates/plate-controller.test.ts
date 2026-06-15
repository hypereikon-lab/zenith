import { afterEach, describe, expect, test, vi } from "vitest";
import { downloadBlob } from "../media/canvas-utils.js";
import { normalizePlatePlacement } from "./plate-placement.js";
import { createPlateController } from "./plate-controller.js";
import type { PlateRenderOptions } from "./plate-gpu-compositor.js";

vi.mock("../media/canvas-utils.js", () => ({
  downloadBlob: vi.fn(),
}));

describe("plate controller edit gate", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.mocked(downloadBlob).mockClear();
  });

  test("disables placement controls until edit placement is checked", () => {
    const { controller, controls, elements } = buildPlateControllerHarness();

    controller.updatePlateLayoutUi();

    expect(controls.editPlacement.disabled).toBe(false);
    expect(controls.activePlate.disabled).toBe(true);
    expect(controls.patchAzimuth.disabled).toBe(true);
    expect(controls.patchRadius.disabled).toBe(true);
    expect(elements.autoArrangePatches.disabled).toBe(true);
    expect(elements.resetPatch.disabled).toBe(true);
    expect(elements.resetPatchWarp.disabled).toBe(true);
    expect(elements.flipPatchX.disabled).toBe(true);
    expect(elements.flipPatchY.disabled).toBe(true);
    expect(controls.plateCornerMode.disabled).toBe(true);
    expect(elements.commitPlateMap.disabled).toBe(false);
    expect(elements.patchEditor.hidden).toBe(true);

    controls.editPlacement.checked = true;
    controller.updatePlateLayoutUi();

    expect(controls.activePlate.disabled).toBe(true);
    expect(controls.patchAzimuth.disabled).toBe(false);
    expect(controls.patchRadius.disabled).toBe(false);
    expect(elements.autoArrangePatches.disabled).toBe(false);
    expect(elements.resetPatch.disabled).toBe(false);
    expect(elements.resetPatchWarp.disabled).toBe(false);
    expect(elements.flipPatchX.disabled).toBe(false);
    expect(elements.flipPatchY.disabled).toBe(false);
    expect(controls.plateCornerMode.disabled).toBe(false);
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

  test("resets active plate warp only while edit placement is checked", () => {
    const { controller, state, controls } = buildPlateControllerHarness();
    state.platePlacements[0].cornerOffsets.ne = { x: 0.24, y: -0.16 };

    controller.handleResetPatchWarp();
    expect(state.platePlacements[0].cornerOffsets.ne).toEqual({ x: 0.24, y: -0.16 });

    controls.editPlacement.checked = true;
    controller.handleResetPatchWarp();

    expect(state.platePlacements[0].scale).toBe(0.8);
    expect(state.platePlacements[0].cornerOffsets).toEqual({
      nw: { x: 0, y: 0 },
      ne: { x: 0, y: 0 },
      se: { x: 0, y: 0 },
      sw: { x: 0, y: 0 },
    });
  });

  test("commits the plate map when leaving edit placement", async () => {
    const { controller, controls, calls } = buildPlateControllerHarness();
    controls.editPlacement.checked = false;

    await controller.handlePlacementEditChange();

    expect(calls.renderPlateComposite).toBe(1);
    expect(calls.readTextureToCanvas).toBe(1);
  });

  test("plate preview controls debounce generated plate maps", () => {
    vi.useFakeTimers();
    const { controller, calls } = buildPlateControllerHarness();

    controller.handlePlatePreviewControlInput();
    expect(calls.renderPlateComposite).toBe(0);
    vi.advanceTimersByTime(141);

    expect(calls.renderPlateComposite).toBe(1);
  });

  test("plate preview controls do not overwrite a non-plate source with a plate preview", () => {
    vi.useFakeTimers();
    const { controller, state, calls } = buildPlateControllerHarness();
    state.sourceName = "fulldome-inpaint-result.png";

    controller.handlePlatePreviewControlInput();
    vi.advanceTimersByTime(200);

    expect(calls.renderPlateComposite).toBe(0);
    expect(calls.lastRenderOptions).toBeNull();
  });

  test("exports the same guide-backed plate handoff used for inpaint", async () => {
    vi.stubGlobal("document", {
      createElement: (tagName: string) => {
        if (tagName !== "canvas") throw new Error(`Unexpected element: ${tagName}`);
        return new FakeCanvas();
      },
    });
    const { controller, state, controls } = buildPlateControllerHarness();
    const pixels = new Uint8ClampedArray(100 * 100 * 4);
    state.plateCompositeCanvas = new FakeCanvas(100, 100, pixels, true) as unknown as HTMLCanvasElement;
    controls.sourceProjection.value = "zenith-180";

    await controller.exportPlateMapImage();

    expect(downloadBlob).toHaveBeenCalledOnce();
    expect(FakeCanvas.lastToBlobPixel(50, 50)).toEqual([0, 222, 255, 255]);
    expect(FakeCanvas.lastToBlobPixel(0, 0)).toEqual([0, 0, 0, 255]);
    expect(FakeCanvas.lastToBlobPixel(50, 35)).toEqual([0, 222, 255, 255]);
    expect(FakeCanvas.lastToBlobPixel(50, 25)).toEqual([0, 0, 0, 255]);
  });
});

function buildPlateControllerHarness() {
  const calls = {
    renderPlateComposite: 0,
    readTextureToCanvas: 0,
    lastRenderOptions: null as null | PlateRenderOptions,
  };
  const state = {
    plates: [{ name: "plate.png", width: 100, height: 100, aspect: 1, canvas: {} as HTMLCanvasElement }],
    platePlacements: [
      normalizePlatePlacement({
        azimuth: 0,
        radius: 0.35,
        scale: 0.8,
        spin: 0,
        opacity: 1,
        flipX: false,
        flipY: false,
      }),
    ],
    activePlateIndex: 0,
    plateCompositeCanvas: null as HTMLCanvasElement | null,
    sourceUrl: null as string | null,
    sourceName: "Plate sketch (1 images)",
  };
  const controls = {
    plateCount: control("auto"),
    plateFit: control("contain"),
    sourceProjection: control("zenith-180"),
    editPlacement: checkbox(false),
    activePlate: control("0"),
    plateCornerMode: control("scale"),
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
    resetPatchWarp: button(),
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
      renderPlateComposite(options) {
        calls.renderPlateComposite += 1;
        calls.lastRenderOptions = options;
        return {} as GPUTexture;
      },
      async readTextureToCanvas() {
        calls.readTextureToCanvas += 1;
        return canvasStub() as HTMLCanvasElement;
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

function control(value: string) {
  return {
    value,
    disabled: false,
    replaceChildren() {},
    append() {},
  };
}

function checkbox(checked: boolean) {
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
    toBlob(callback: BlobCallback) {
      callback(new Blob());
    },
  };
}

type FakeImageData = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

class FakeCanvas {
  static lastToBlobPixels: Uint8ClampedArray | null = null;
  static lastToBlobWidth = 0;

  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  throwOnToBlob: boolean;

  constructor(width = 0, height = 0, pixels: Uint8ClampedArray = new Uint8ClampedArray(), throwOnToBlob = false) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8ClampedArray(pixels);
    this.throwOnToBlob = throwOnToBlob;
  }

  static lastToBlobPixel(x: number, y: number): [number, number, number, number] {
    if (!FakeCanvas.lastToBlobPixels) throw new Error("No fake canvas was exported.");
    const index = (y * FakeCanvas.lastToBlobWidth + x) * 4;
    return [
      FakeCanvas.lastToBlobPixels[index],
      FakeCanvas.lastToBlobPixels[index + 1],
      FakeCanvas.lastToBlobPixels[index + 2],
      FakeCanvas.lastToBlobPixels[index + 3],
    ];
  }

  getContext() {
    return {
      getImageData: (_x: number, _y: number, width: number, height: number): FakeImageData => ({
        width,
        height,
        data: new Uint8ClampedArray(this.pixels),
      }),
      createImageData: (width: number, height: number): FakeImageData => ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
      }),
      putImageData: (image: FakeImageData) => {
        this.width = image.width;
        this.height = image.height;
        this.pixels = new Uint8ClampedArray(image.data);
      },
    };
  }

  toBlob(callback: BlobCallback) {
    if (this.throwOnToBlob) throw new Error("Export used the raw plate composite instead of the inpaint handoff.");
    FakeCanvas.lastToBlobPixels = new Uint8ClampedArray(this.pixels);
    FakeCanvas.lastToBlobWidth = this.width;
    callback(new Blob());
  }
}

function videoStub() {
  return {
    pause() {},
    removeAttribute() {},
    load() {},
  };
}

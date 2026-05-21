import { DEFAULT_ACTIVE_PLATE_INDEX, DEFAULT_PLATE_PLACEMENTS } from "../app/default-profile.js";
import { downloadBlob } from "../media/canvas-utils.js";
import { clamp } from "../projection.js";
import { PLATE_CORNERS, normalizePlatePlacement } from "./plate-placement.js";
import type { PlateSource, ScheduleWorkspaceAutosave, SetGpuState } from "../app/types.js";
import type {
  PlateCornerOffsets,
  PlatePlacementInput,
  PlateLike,
  NormalizedPlatePlacement,
} from "./plate-placement.js";
import type { PlateRenderOptions } from "./plate-gpu-compositor.js";

const PLATE_COMPOSITE_SIZE = 2048;

type PlateControllerOptions = {
  state: {
    plates: PlateSource[];
    platePlacements: NormalizedPlatePlacement[];
    activePlateIndex: number;
    viewMode?: string;
    plateCompositeCanvas: HTMLCanvasElement | null;
    plateCompositeDirty?: boolean;
    plateCompositeTexture?: GPUTexture | null;
    sourceUrl: string | null;
  };
  controls: {
    plateCount: {
      value: string;
      disabled: boolean;
      replaceChildren: () => void;
      append: (option: HTMLOptionElement) => void;
    };
    plateFit: { value: string; disabled: boolean };
    editPlacement: { checked: boolean; disabled: boolean };
    activePlate: {
      value: string;
      disabled: boolean;
      replaceChildren: () => void;
      append: (option: HTMLOptionElement) => void;
    };
    plateCornerMode: { value: string; disabled: boolean };
    patchAzimuth: { value: string; disabled: boolean };
    patchRadius: { value: string; disabled: boolean };
    patchSpin: { value: string; disabled: boolean };
    patchOpacity: { value: string; disabled: boolean };
    plateFeather: { value: string; disabled: boolean };
    projectionMode?: { value: string };
    customCurve?: { value: string };
  };
  elements: {
    commitPlateMap: { disabled: boolean };
    exportPlateMap: { disabled: boolean };
    platesReadout: { textContent: string | null };
    patchEditor: { hidden: boolean | string; classList: { toggle: (token: string, force?: boolean) => unknown } };
    patchTransform: { hidden: boolean | string; classList: { toggle: (token: string, force?: boolean) => unknown } };
    autoArrangePatches: { disabled: boolean };
    resetPatch: { disabled: boolean };
    resetPatchWarp: { disabled: boolean };
    flipPatchX: { disabled: boolean };
    flipPatchY: { disabled: boolean };
  };
  video: Pick<HTMLVideoElement, "pause" | "removeAttribute" | "load">;
  videoTransport: {
    stopFrameLoop: () => void;
    setControlsEnabled: (enabled: boolean) => void;
  };
  renderer: {
    renderPlateComposite: (options: PlateRenderOptions) => GPUTexture;
    readTextureToCanvas: (texture: GPUTexture, width: number, height: number) => Promise<HTMLCanvasElement>;
  };
  actions: {
    abortInpaint: (message: string) => void;
    clearInpaintState: () => void;
    setGpuState: SetGpuState;
    setViewMode: (mode: string) => void;
    uploadCanvasAsSource: (canvas: HTMLCanvasElement, name: string) => void;
    displayTextureAsSource: (
      texture: GPUTexture,
      width: number,
      height: number,
      name: string,
      options?: { sourceCanvas?: HTMLCanvasElement | null },
    ) => void;
    updateInpaintUiState: () => void;
    updateVersionUi: () => void;
    scheduleWorkspaceAutosave: ScheduleWorkspaceAutosave;
  };
};

export function createPlateController({
  state,
  controls,
  elements,
  video,
  videoTransport,
  renderer,
  actions,
}: PlateControllerOptions) {
  const {
    commitPlateMap,
    exportPlateMap,
    platesReadout,
    patchEditor,
    patchTransform,
    autoArrangePatches,
    resetPatch,
    resetPatchWarp,
    flipPatchX,
    flipPatchY,
  } = elements;
  let platePreviewTimer: ReturnType<typeof setTimeout> | null = null;

  async function exportPlateMapImage() {
    if (!state.plateCompositeCanvas || state.plateCompositeDirty) {
      await commitPlateSketchSafely();
    }
    if (state.plateCompositeCanvas) {
      state.plateCompositeCanvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, `fulldome-plate-sketch-${Date.now()}.png`);
      }, "image/png");
    }
  }

  async function handlePlacementEditChange() {
    updatePlateLayoutUi();
    if (!controls.editPlacement.checked && hasEnoughPlatesForLayout()) {
      await commitPlateSketchSafely();
    }
  }

  function handleActivePlateChange() {
    state.activePlateIndex = Number(controls.activePlate.value) || 0;
    updatePatchControlsFromActive();
  }

  function handlePatchTransformInput() {
    if (!canEditPlacement()) return;
    updateActivePlacementFromControls();
    updatePatchControlsFromActive();
    if (hasEnoughPlatesForLayout()) schedulePlatePreview(70);
  }

  function handleAutoArrangePatches() {
    if (!canEditPlacement()) return;
    autoArrangePlatePlacements(true);
    updatePlateSelect();
    updatePatchControlsFromActive();
    if (hasEnoughPlatesForLayout()) schedulePlatePreview(0);
  }

  function handleResetPatch() {
    if (!canEditPlacement()) return;
    resetActivePlatePlacement();
    updatePatchControlsFromActive();
    if (hasEnoughPlatesForLayout()) schedulePlatePreview(0);
  }

  function handleResetPatchWarp() {
    if (!canEditPlacement()) return;
    ensurePlatePlacements();
    const placement = state.platePlacements[state.activePlateIndex];
    if (!placement) return;
    placement.cornerOffsets = emptyPlateCornerOffsets();
    updatePatchControlsFromActive();
    if (hasEnoughPlatesForLayout()) schedulePlatePreview(0);
    actions.scheduleWorkspaceAutosave("plate-warp-reset", 250);
  }

  function handleFlipPatchX() {
    flipActivePlate("flipX");
  }

  function handleFlipPatchY() {
    flipActivePlate("flipY");
  }

  function flipActivePlate(axis: "flipX" | "flipY"): void {
    if (!canEditPlacement()) return;
    ensurePlatePlacements();
    const placement = state.platePlacements[state.activePlateIndex];
    if (!placement) return;
    placement[axis] = !placement[axis];
    if (hasEnoughPlatesForLayout()) schedulePlatePreview(0);
    actions.scheduleWorkspaceAutosave("plate-flip", 250);
  }

  function handlePlateCountFitChange() {
    ensurePlatePlacements();
    updatePlateSelect();
    updatePatchControlsFromActive();
    if (hasEnoughPlatesForLayout()) schedulePlatePreview(0);
  }

  function handlePlatePreviewControlInput() {
    if (hasEnoughPlatesForLayout()) schedulePlatePreview(140);
  }

  async function loadPlateFiles(files: File[]): Promise<void> {
    actions.abortInpaint("Plate inputs changed.");
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    state.plates = [];
    state.platePlacements = [];
    state.activePlateIndex = 0;
    state.plateCompositeCanvas = null;
    state.plateCompositeDirty = false;
    state.plateCompositeTexture = null;
    actions.clearInpaintState();
    exportPlateMap.disabled = true;
    syncPlateCountOptions();

    if (imageFiles.length === 0) {
      platesReadout.textContent = "None loaded";
      commitPlateMap.disabled = true;
      updatePlateLayoutUi();
      actions.updateVersionUi();
      actions.updateInpaintUiState();
      return;
    }

    actions.setGpuState("Loading plates", false);
    state.plates = await Promise.all(imageFiles.map(loadPlateSource));
    syncPlateCountOptions();
    autoArrangePlatePlacements(false);
    updatePlateSelect();
    updatePatchControlsFromActive();
    const names = state.plates.map((plate) => plate.name).join(", ");
    platesReadout.textContent = `${state.plates.length} loaded: ${names}`;
    commitPlateMap.disabled = !hasEnoughPlatesForLayout();
    updatePlateLayoutUi();
    actions.updateVersionUi();
    actions.updateInpaintUiState();
    actions.scheduleWorkspaceAutosave("plates", 250);

    if (hasEnoughPlatesForLayout()) {
      await commitPlateSketchSafely();
    } else {
      actions.setGpuState("Ready", false);
    }
  }

  async function loadPlateSource(file: File) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const maxSide = 2048;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, width, height);
    return {
      name: file.name,
      width,
      height,
      aspect: width / height,
      canvas,
    };
  }

  function ensurePlatePlacements(): void {
    if (state.plates.length < 1) return;
    const plateCount = resolvedPlateCount();
    if (state.platePlacements.length !== plateCount) {
      autoArrangePlatePlacements(false);
      return;
    }
    state.platePlacements = state.platePlacements.map((placement, index) =>
      normalizePlatePlacement(placement, state.plates[index]),
    );
  }

  function autoArrangePlatePlacements(force: boolean): void {
    if (state.plates.length < 1) {
      state.platePlacements = [];
      state.activePlateIndex = 0;
      return;
    }
    const plateCount = resolvedPlateCount();
    if (!force && state.platePlacements.length === plateCount) return;
    state.platePlacements = state.plates
      .slice(0, plateCount)
      .map((plate, index) => normalizePlatePlacement(defaultPlatePlacement(index, plateCount, plate), plate));
    state.activePlateIndex = shouldUseDefaultPlateProfile(plateCount)
      ? DEFAULT_ACTIVE_PLATE_INDEX
      : clamp(state.activePlateIndex, 0, Math.max(0, plateCount - 1));
  }

  function defaultPlatePlacement(
    index: number,
    plateCount: number,
    _plate: PlateLike,
  ): PlatePlacementInput | NormalizedPlatePlacement {
    if (shouldUseDefaultPlateProfile(plateCount) && DEFAULT_PLATE_PLACEMENTS[index]) {
      return { ...DEFAULT_PLATE_PLACEMENTS[index] };
    }
    const goldenAngle = 137.507764;
    const azimuth = ((index * goldenAngle + 540) % 360) - 180;
    const radius =
      plateCount === 1 ? 0.35 : clamp(0.16 + 0.78 * Math.sqrt(index / Math.max(1, plateCount - 1)), 0, 0.94);
    const scale = clamp(1.18 / Math.sqrt(Math.max(1, plateCount)), 0.22, 0.92);
    return {
      azimuth,
      radius,
      scale,
      spin: 0,
      opacity: 1,
      flipX: false,
      flipY: false,
    };
  }

  function shouldUseDefaultPlateProfile(plateCount: number): boolean {
    return plateCount === DEFAULT_PLATE_PLACEMENTS.length;
  }

  function resetActivePlatePlacement() {
    const plateCount = resolvedPlateCount();
    const index = clamp(state.activePlateIndex, 0, Math.max(0, plateCount - 1));
    const plate = state.plates[index];
    if (!plate) return;
    state.platePlacements[index] = normalizePlatePlacement(defaultPlatePlacement(index, plateCount, plate), plate);
  }

  function emptyPlateCornerOffsets(): PlateCornerOffsets {
    return PLATE_CORNERS.reduce((offsets, corner) => {
      offsets[corner] = { x: 0, y: 0 };
      return offsets;
    }, {} as PlateCornerOffsets);
  }

  function syncPlateCountOptions() {
    const previous = controls.plateCount.value || "auto";
    controls.plateCount.replaceChildren();
    const auto = document.createElement("option");
    auto.value = "auto";
    auto.textContent = state.plates.length > 0 ? `All loaded (${state.plates.length})` : "All loaded";
    controls.plateCount.append(auto);
    for (let count = 1; count <= state.plates.length; count += 1) {
      const option = document.createElement("option");
      option.value = String(count);
      option.textContent = `${count} image${count === 1 ? "" : "s"}`;
      controls.plateCount.append(option);
    }
    controls.plateCount.value =
      previous === "auto" || Number(previous) > state.plates.length || Number(previous) < 1 ? "auto" : previous;
  }

  function updatePlateSelect() {
    syncPlateCountOptions();
    const plateCount = state.plates.length > 0 ? resolvedPlateCount() : state.plates.length;
    controls.activePlate.replaceChildren();
    for (let index = 0; index < plateCount; index += 1) {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `Plate ${index + 1}`;
      controls.activePlate.append(option);
    }
    state.activePlateIndex = clamp(state.activePlateIndex, 0, Math.max(0, plateCount - 1));
    controls.activePlate.value = String(state.activePlateIndex);
    updatePlateLayoutUi();
  }

  function updatePatchControlsFromActive() {
    ensurePlatePlacements();
    const placement = state.platePlacements[state.activePlateIndex];
    if (!placement) return;
    controls.patchAzimuth.value = String(placement.azimuth);
    controls.patchRadius.value = String(placement.radius);
    controls.patchSpin.value = String(placement.spin);
    controls.patchOpacity.value = String(placement.opacity);
  }

  function updateActivePlacementFromControls() {
    ensurePlatePlacements();
    const placement = state.platePlacements[state.activePlateIndex];
    if (!placement) return;
    placement.azimuth = Number(controls.patchAzimuth.value);
    placement.radius = Number(controls.patchRadius.value);
    placement.spin = Number(controls.patchSpin.value);
    placement.opacity = Number(controls.patchOpacity.value);
  }

  function updatePlateLayoutUi() {
    const editable = hasEnoughPlatesForLayout();
    const editing = editable && controls.editPlacement.checked;
    controls.editPlacement.disabled = !editable;
    patchEditor.hidden = !editing;
    patchEditor.classList.toggle("visible", editing);
    patchTransform.hidden = true;
    patchTransform.classList.toggle("transform-group-hidden", true);
    controls.activePlate.disabled = true;
    autoArrangePatches.disabled = !editing;
    resetPatch.disabled = !editing;
    resetPatchWarp.disabled = !editing;
    controls.plateCornerMode.disabled = !editing;
    if (flipPatchX) flipPatchX.disabled = !editing;
    if (flipPatchY) flipPatchY.disabled = !editing;
    [controls.patchAzimuth, controls.patchRadius, controls.patchSpin, controls.patchOpacity].forEach((control) => {
      control.disabled = !editing;
    });
    commitPlateMap.disabled = !editable;
  }

  async function commitPlateSketchSafely() {
    try {
      if (platePreviewTimer) {
        clearTimeout(platePreviewTimer);
        platePreviewTimer = null;
      }
      await commitPlateSketch();
      actions.setGpuState("Ready", false);
    } catch (error) {
      console.error(error);
      actions.setGpuState("Plate GPU commit failed", true);
    }
  }

  function schedulePlatePreview(delay: number): void {
    markPlateCompositeDirty();
    scheduleGpuPlatePreview(delay);
  }

  function markPlateCompositeDirty() {
    if (state.plateCompositeDirty) return;
    state.plateCompositeDirty = true;
    actions.clearInpaintState();
    actions.updateVersionUi();
    actions.updateInpaintUiState();
  }

  function scheduleGpuPlatePreview(delay: number): void {
    if (platePreviewTimer) {
      clearTimeout(platePreviewTimer);
    }
    platePreviewTimer = setTimeout(() => {
      platePreviewTimer = null;
      try {
        renderPlateSketchGpu();
      } catch (error) {
        console.error("Plate GPU preview failed.", error);
        actions.setGpuState("Plate GPU preview failed", true);
      }
    }, delay);
  }

  function renderPlateSketchGpu() {
    const plateCount = resolvedPlateCount();
    if (plateCount < 1 || state.plates.length < plateCount) return false;
    ensurePlatePlacements();

    const texture = renderer.renderPlateComposite({
      plates: state.plates,
      plateCount,
      plateFit: controls.plateFit.value,
      plateFeather: Number(controls.plateFeather.value),
      projectionMode: controls.projectionMode?.value,
      customCurve: controls.customCurve?.value,
      platePlacements: state.platePlacements,
      size: PLATE_COMPOSITE_SIZE,
    });

    state.plateCompositeTexture = texture;
    state.plateCompositeDirty = true;
    actions.displayTextureAsSource(
      texture,
      PLATE_COMPOSITE_SIZE,
      PLATE_COMPOSITE_SIZE,
      `Plate sketch GPU preview (${plateCount} images)`,
    );
    platesReadout.textContent = `${plateCount} plates, GPU preview`;
    exportPlateMap.disabled = false;
    actions.updateVersionUi();
    actions.updateInpaintUiState();
    return true;
  }

  async function commitPlateSketch() {
    const plateCount = resolvedPlateCount();
    if (plateCount < 1) {
      throw new Error("Load at least one image.");
    }
    if (state.plates.length < plateCount) {
      throw new Error(`Need ${plateCount} images, but only ${state.plates.length} are loaded.`);
    }

    stopExternalMediaForPlateMap();
    ensurePlatePlacements();
    const texture = renderer.renderPlateComposite({
      plates: state.plates,
      plateCount,
      plateFit: controls.plateFit.value,
      plateFeather: Number(controls.plateFeather.value),
      projectionMode: controls.projectionMode?.value,
      customCurve: controls.customCurve?.value,
      platePlacements: state.platePlacements,
      size: PLATE_COMPOSITE_SIZE,
    });
    const canvas = await renderer.readTextureToCanvas(texture, PLATE_COMPOSITE_SIZE, PLATE_COMPOSITE_SIZE);
    state.plateCompositeTexture = texture;
    state.plateCompositeCanvas = canvas;
    state.plateCompositeDirty = false;
    actions.clearInpaintState();
    actions.displayTextureAsSource(
      texture,
      PLATE_COMPOSITE_SIZE,
      PLATE_COMPOSITE_SIZE,
      `Plate sketch (${plateCount} images)`,
      {
        sourceCanvas: canvas,
      },
    );
    platesReadout.textContent = `${plateCount} plates, GPU committed, ${PLATE_COMPOSITE_SIZE} x ${PLATE_COMPOSITE_SIZE}`;
    exportPlateMap.disabled = false;
    actions.updateVersionUi();
    actions.updateInpaintUiState();
    actions.scheduleWorkspaceAutosave("plate-commit", 250);
  }

  function stopExternalMediaForPlateMap() {
    videoTransport.stopFrameLoop();
    if (state.sourceUrl) {
      URL.revokeObjectURL(state.sourceUrl);
      state.sourceUrl = null;
    }
    video.pause();
    video.removeAttribute("src");
    video.load();
    videoTransport.setControlsEnabled(false);
  }

  function resolvedPlateCount() {
    const loaded = state.plates.length;
    if (loaded === 0) return 0;
    if (controls.plateCount.value === "auto") {
      return loaded;
    }
    const requested = Math.round(Number(controls.plateCount.value));
    return clamp(Number.isFinite(requested) ? requested : loaded, 1, loaded);
  }

  function hasEnoughPlatesForLayout() {
    return state.plates.length >= 1 && resolvedPlateCount() >= 1;
  }

  function canEditPlacement() {
    return hasEnoughPlatesForLayout() && controls.editPlacement.checked;
  }

  return {
    loadPlateFiles,
    exportPlateMapImage,
    handlePlacementEditChange,
    handleActivePlateChange,
    handlePatchTransformInput,
    handleAutoArrangePatches,
    handleResetPatch,
    handleResetPatchWarp,
    handleFlipPatchX,
    handleFlipPatchY,
    handlePlateCountFitChange,
    handlePlatePreviewControlInput,
    commitPlateSketchSafely,
    renderPlatePreviewNow: renderPlateSketchGpu,
    updatePlateSelect,
    ensurePlatePlacements,
    updatePatchControlsFromActive,
    updatePlateLayoutUi,
    schedulePlatePreview,
    resolvedPlateCount,
    hasEnoughPlatesForLayout,
  };
}

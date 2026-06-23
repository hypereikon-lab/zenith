import { plateEditorViewLabel, type PlateEditorCamera, type PlateEditorViewMode } from "./plate-editor-view.js";
import { createPlateSketchGpuRenderer } from "./plate-sketch-gpu-renderer.js";
import type { PlateSketchGpuRenderer, PlateSketchRenderOptions } from "./plate-sketch-gpu-renderer.js";
import type { SourceProjectionMode } from "../geometry/source-projection.js";
import type { NormalizedPlatePlacement } from "./plate-placement.js";
import type { PlateSketchImage } from "./plate-sketch-sources.js";

export type PlateSketchPreviewInput = {
  plates: PlateSketchImage[];
  placements: NormalizedPlatePlacement[];
  canvasWidth: number;
  plateFit: string;
  plateFeather: number;
  domeGuideSemanticSplit: number;
  domeGuideHorizonSplit: number;
  sourceProjectionMode: SourceProjectionMode;
  viewerMode: "domemaster" | "dome-check" | "rim-check";
  projectionViewMode: PlateEditorViewMode;
  projectionCamera: Partial<PlateEditorCamera>;
  showCaveMask: boolean;
  invertCaveMask: boolean;
};

type PlateSketchPreviewSessionOptions = {
  createRenderer?: (canvas: HTMLCanvasElement) => Promise<PlateSketchGpuRenderer>;
  requestAnimationFrame?: typeof requestAnimationFrame;
  cancelAnimationFrame?: typeof cancelAnimationFrame;
};

export type PlateSketchPreviewSession = {
  renderPreview: (input: PlateSketchPreviewInput) => Promise<string | null>;
  scheduleRenderPreview: (render: () => void) => void;
  renderHandoffCanvas: (input: PlateSketchPreviewInput, size: number) => Promise<HTMLCanvasElement>;
  destroy: () => void;
};

export function createPlateSketchPreviewSession(
  canvas: HTMLCanvasElement,
  {
    createRenderer = createPlateSketchGpuRenderer,
    requestAnimationFrame: scheduleFrame = defaultRequestAnimationFrame,
    cancelAnimationFrame: cancelFrame = defaultCancelAnimationFrame,
  }: PlateSketchPreviewSessionOptions = {},
): PlateSketchPreviewSession {
  let renderer: PlateSketchGpuRenderer | null = null;
  let rendererPromise: Promise<PlateSketchGpuRenderer> | null = null;
  let previewFrame: number | null = null;
  let destroyed = false;

  async function ensureRenderer(): Promise<PlateSketchGpuRenderer> {
    if (renderer) return renderer;
    if (!rendererPromise) {
      rendererPromise = createRenderer(canvas).then((created) => {
        if (destroyed) {
          created.destroy();
          return created;
        }
        renderer = created;
        return created;
      });
    }
    return rendererPromise;
  }

  async function renderPreview(input: PlateSketchPreviewInput): Promise<string | null> {
    if (destroyed || input.plates.length === 0 || input.placements.length === 0) return null;
    cancelScheduledPreview();
    const gpu = await ensureRenderer();
    if (destroyed) return null;
    const viewMode = input.projectionViewMode;
    gpu.renderPreview(buildPlateSketchRenderOptions(input, input.canvasWidth));
    return `${input.plates.length} plate${input.plates.length === 1 ? "" : "s"} previewed through WebGPU ${
      input.sourceProjectionMode
    } ${plateEditorViewLabel(viewMode)}.`;
  }

  function scheduleRenderPreview(render: () => void): void {
    if (destroyed || previewFrame !== null) return;
    previewFrame = scheduleFrame(() => {
      previewFrame = null;
      render();
    });
  }

  async function renderHandoffCanvas(input: PlateSketchPreviewInput, size: number): Promise<HTMLCanvasElement> {
    const gpu = await ensureRenderer();
    return gpu.renderToCanvas(buildPlateSketchHandoffOptions(input, size));
  }

  function destroy(): void {
    destroyed = true;
    cancelScheduledPreview();
    renderer?.destroy();
    renderer = null;
    rendererPromise = null;
  }

  function cancelScheduledPreview(): void {
    if (previewFrame !== null) {
      cancelFrame(previewFrame);
      previewFrame = null;
    }
  }

  return {
    renderPreview,
    scheduleRenderPreview,
    renderHandoffCanvas,
    destroy,
  };
}

export function buildPlateSketchRenderOptions(input: PlateSketchPreviewInput, size: number): PlateSketchRenderOptions {
  return {
    ...buildPlateSketchHandoffOptions(input, size),
    projectionViewMode: input.projectionViewMode,
    projectionCamera: input.projectionCamera,
    showProjectionGuides: input.viewerMode !== "domemaster",
    showCaveMask: input.showCaveMask,
    invertCaveMask: input.invertCaveMask,
  };
}

export function buildPlateSketchHandoffOptions(input: PlateSketchPreviewInput, size: number): PlateSketchRenderOptions {
  return {
    plates: input.plates,
    platePlacements: input.placements,
    plateCount: input.plates.length,
    size,
    plateFit: input.plateFit,
    plateFeather: input.plateFeather,
    domeGuideSemanticSplit: input.domeGuideSemanticSplit,
    domeGuideHorizonSplit: input.domeGuideHorizonSplit,
    sourceProjectionMode: input.sourceProjectionMode,
    guideMode: "inpaint-handoff",
  };
}

const defaultRequestAnimationFrame: typeof requestAnimationFrame = (callback) => {
  if (typeof globalThis.requestAnimationFrame !== "function") {
    throw new Error("requestAnimationFrame is not available for Plate Sketch preview.");
  }
  return globalThis.requestAnimationFrame(callback);
};

const defaultCancelAnimationFrame: typeof cancelAnimationFrame = (handle) => {
  if (typeof globalThis.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(handle);
  }
};

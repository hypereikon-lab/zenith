import { describe, expect, test, vi } from "vitest";
import {
  buildPlateSketchHandoffOptions,
  buildPlateSketchRenderOptions,
  createPlateSketchPreviewSession,
  type PlateSketchPreviewInput,
} from "./plate-sketch-preview-session.js";
import { normalizePlatePlacement } from "./plate-placement.js";
import type { PlateSketchGpuRenderer } from "./plate-sketch-gpu-renderer.js";
import type { PlateSketchImage } from "./plate-sketch-sources.js";

const canvas = {} as HTMLCanvasElement;

describe("plate sketch preview session", () => {
  test("builds preview and handoff options from explicit editor state", () => {
    const input = previewInput();

    expect(buildPlateSketchHandoffOptions(input, 2048)).toMatchObject({
      plates: input.plates,
      platePlacements: input.placements,
      plateCount: 1,
      size: 2048,
      plateFit: "contain",
      plateFeather: 0.02,
      domeGuideSemanticSplit: 0.5,
      domeGuideHorizonSplit: 0.68,
      sourceProjectionMode: "zenith-180",
      guideMode: "inpaint-handoff",
    });
    expect(buildPlateSketchRenderOptions(input, 768)).toMatchObject({
      size: 768,
      projectionViewMode: "dome-orbit",
      projectionCamera: input.projectionCamera,
      showProjectionGuides: true,
      showCaveMask: false,
      invertCaveMask: false,
    });
  });

  test("schedules at most one preview frame and can cancel it by rendering immediately", async () => {
    const renderer = fakeRenderer();
    const callbacks: FrameRequestCallback[] = [];
    const cancelAnimationFrame = vi.fn();
    const session = createPlateSketchPreviewSession(canvas, {
      createRenderer: async () => renderer,
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        callbacks.push(callback);
        return callbacks.length;
      }) as typeof requestAnimationFrame,
      cancelAnimationFrame: cancelAnimationFrame as typeof cancelAnimationFrame,
    });
    const render = vi.fn();

    session.scheduleRenderPreview(render);
    session.scheduleRenderPreview(render);

    expect(callbacks).toHaveLength(1);
    await session.renderPreview(previewInput());

    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(renderer.renderPreview).toHaveBeenCalledTimes(1);
  });

  test("renders previews and handoff canvases through one lazy renderer", async () => {
    const outputCanvas = {} as HTMLCanvasElement;
    const renderer = fakeRenderer(outputCanvas);
    const createRenderer = vi.fn(async () => renderer);
    const session = createPlateSketchPreviewSession(canvas, { createRenderer });

    const status = await session.renderPreview(previewInput());
    const handoff = await session.renderHandoffCanvas(previewInput(), 2048);

    expect(status).toBe("1 plate previewed through WebGPU zenith-180 Dome Orbit.");
    expect(handoff).toBe(outputCanvas);
    expect(createRenderer).toHaveBeenCalledTimes(1);
    expect(renderer.renderPreview).toHaveBeenCalledWith(
      expect.objectContaining({ size: 768, projectionViewMode: "dome-orbit" }),
    );
    expect(renderer.renderToCanvas).toHaveBeenCalledWith(
      expect.objectContaining({ size: 2048, guideMode: "inpaint-handoff" }),
    );
  });

  test("destroys a renderer that resolves after session teardown", async () => {
    const renderer = fakeRenderer();
    const rendererCreate = deferred<PlateSketchGpuRenderer>();
    const session = createPlateSketchPreviewSession(canvas, {
      createRenderer: () => rendererCreate.promise,
    });
    const render = session.renderPreview(previewInput());

    session.destroy();
    rendererCreate.resolve(renderer);
    await render;

    expect(renderer.destroy).toHaveBeenCalledTimes(1);
    expect(renderer.renderPreview).not.toHaveBeenCalled();
  });

  test("does not render a handoff canvas through a renderer that resolves after teardown", async () => {
    const renderer = fakeRenderer();
    const rendererCreate = deferred<PlateSketchGpuRenderer>();
    const session = createPlateSketchPreviewSession(canvas, {
      createRenderer: () => rendererCreate.promise,
    });
    const handoff = session.renderHandoffCanvas(previewInput(), 2048);

    session.destroy();
    rendererCreate.resolve(renderer);

    await expect(handoff).rejects.toThrow("Plate Sketch preview session has been destroyed.");
    expect(renderer.destroy).toHaveBeenCalledTimes(1);
    expect(renderer.renderToCanvas).not.toHaveBeenCalled();
  });
});

function previewInput(): PlateSketchPreviewInput {
  return {
    plates: [fakePlate()],
    placements: [normalizePlatePlacement({ scale: 0.7 }, { aspect: 1 })],
    canvasWidth: 768,
    plateFit: "contain",
    plateFeather: 0.02,
    domeGuideSemanticSplit: 0.5,
    domeGuideHorizonSplit: 0.68,
    sourceProjectionMode: "zenith-180",
    viewerMode: "dome-check",
    projectionViewMode: "dome-orbit",
    projectionCamera: {},
    showCaveMask: false,
    invertCaveMask: false,
  };
}

function fakePlate(): PlateSketchImage {
  return {
    name: "plate.png",
    width: 100,
    height: 100,
    aspect: 1,
    canvas: {} as HTMLCanvasElement,
  };
}

function fakeRenderer(outputCanvas = {} as HTMLCanvasElement): PlateSketchGpuRenderer {
  return {
    renderPreview: vi.fn(),
    renderToCanvas: vi.fn(() => Promise.resolve(outputCanvas)),
    destroy: vi.fn(),
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

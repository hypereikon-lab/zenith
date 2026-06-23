import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createSourceMapPreviewSession,
  type SourceMapPreviewSessionRenderInput,
} from "./source-map-preview-session.js";
import type { SourceMapPreviewRenderer } from "./source-map-preview-renderer.js";

type FakeBitmap = ImageBitmap & { close: ReturnType<typeof vi.fn> };

const canvas = {} as HTMLCanvasElement;

beforeEach(() => {
  vi.stubGlobal("HTMLMediaElement", { HAVE_CURRENT_DATA: 2 });
});

describe("source map preview session", () => {
  test("closes a stale late bitmap and renders the newest image request", async () => {
    const renderer = fakeRenderer();
    const firstFetch = deferred<Response>();
    const secondFetch = deferred<Response>();
    const firstBitmap = fakeBitmap(320, 180);
    const secondBitmap = fakeBitmap(640, 360);
    const fetchSource = vi.fn((url: string) => (url.endsWith("first.png") ? firstFetch.promise : secondFetch.promise));
    const createBitmap = vi.fn((blob: Blob) => Promise.resolve(blob.size === 1 ? firstBitmap : secondBitmap));
    const session = createSourceMapPreviewSession(canvas, {
      createRenderer: async () => renderer,
      fetchSource: fetchSource as typeof fetch,
      createBitmap: createBitmap as typeof createImageBitmap,
    });
    const firstRender = session.renderMedia(renderInput({ mediaUrl: "/first.png" }));
    await waitForCall(fetchSource);
    const secondRender = session.renderMedia(renderInput({ mediaUrl: "/second.png" }));

    secondFetch.resolve(responseWithBlobSize(2));
    await secondRender;
    firstFetch.resolve(responseWithBlobSize(1));
    await firstRender;

    expect(secondBitmap.close).not.toHaveBeenCalled();
    expect(firstBitmap.close).toHaveBeenCalledTimes(1);
    expect(renderer.setSourceImage).toHaveBeenCalledTimes(1);
    expect(renderer.setSourceImage).toHaveBeenCalledWith(secondBitmap);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.render).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 960,
        height: 960,
        sourceProjectionMode: "zenith-180",
        projectionViewMode: "dome-orbit",
        showProjectionGuides: true,
      }),
    );
  });

  test("clears image and video runtime state when media becomes unsupported", async () => {
    const renderer = fakeRenderer();
    const bitmap = fakeBitmap(800, 400);
    const cancelAnimationFrame = vi.fn();
    const session = createSourceMapPreviewSession(canvas, {
      createRenderer: async () => renderer,
      fetchSource: vi.fn(() => Promise.resolve(responseWithBlobSize(3))) as typeof fetch,
      createBitmap: vi.fn(() => Promise.resolve(bitmap)) as typeof createImageBitmap,
      requestAnimationFrame: vi.fn(() => 42) as typeof requestAnimationFrame,
      cancelAnimationFrame: cancelAnimationFrame as typeof cancelAnimationFrame,
    });
    const video = { paused: false, ended: false } as HTMLVideoElement;
    session.startVideoRenderLoop(video, vi.fn());

    await session.renderMedia(renderInput({ mediaKind: "image", mediaUrl: "/image.png" }));
    const update = await session.renderMedia(renderInput({ mediaKind: "canvas", mediaUrl: "" }));

    expect(update).toEqual({ status: "No media loaded." });
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
  });

  test("uses requestVideoFrameCallback when available and cancels it on stop", () => {
    const renderer = fakeRenderer();
    const callbackIds: FrameRequestCallback[] = [];
    const video = {
      paused: false,
      ended: false,
      requestVideoFrameCallback: vi.fn((callback: FrameRequestCallback) => {
        callbackIds.push(callback);
        return callbackIds.length;
      }),
      cancelVideoFrameCallback: vi.fn(),
    } as unknown as HTMLVideoElement;
    const renderFrame = vi.fn();
    const session = createSourceMapPreviewSession(canvas, {
      createRenderer: async () => renderer,
    });

    session.startVideoRenderLoop(video, renderFrame);
    session.startVideoRenderLoop(video, renderFrame);
    expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(1);

    callbackIds[0](0);
    expect(renderFrame).toHaveBeenCalledTimes(1);
    expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(2);

    session.stopVideoRenderLoop();
    expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(2);
  });

  test("renders ready video frames and returns clock state", async () => {
    const renderer = fakeRenderer();
    const video = {
      readyState: 2,
      videoWidth: 1920,
      videoHeight: 1080,
      currentTime: 1.25,
      duration: 5,
    } as HTMLVideoElement;
    const session = createSourceMapPreviewSession(canvas, {
      createRenderer: async () => renderer,
    });

    const update = await session.renderMedia(
      renderInput({ mediaKind: "video", mediaUrl: "/clip.mp4", sourceVideo: video }),
    );

    expect(renderer.setSourceImage).toHaveBeenCalledWith(video);
    expect(renderer.render).toHaveBeenCalledWith(
      expect.objectContaining({
        projectionViewMode: "dome-orbit",
        sourceProjectionMode: "zenith-180",
      }),
    );
    expect(update).toMatchObject({
      imageSize: { width: 1920, height: 1080 },
      videoClock: { videoTime: 1.25, videoDuration: 5 },
    });
    expect(update?.status).toContain("Media Preview MP4 mapped as");
  });

  test("destroys a renderer that resolves after session teardown", async () => {
    const renderer = fakeRenderer();
    const rendererCreate = deferred<SourceMapPreviewRenderer>();
    const session = createSourceMapPreviewSession(canvas, {
      createRenderer: () => rendererCreate.promise,
      fetchSource: vi.fn(() => Promise.resolve(responseWithBlobSize(1))) as typeof fetch,
      createBitmap: vi.fn(() => Promise.resolve(fakeBitmap(100, 100))) as typeof createImageBitmap,
    });
    const render = session.renderMedia(renderInput());

    session.destroy();
    rendererCreate.resolve(renderer);
    await render;

    expect(renderer.destroy).toHaveBeenCalledTimes(1);
    expect(renderer.setSourceImage).not.toHaveBeenCalled();
    expect(renderer.render).not.toHaveBeenCalled();
  });
});

function renderInput(overrides: Partial<SourceMapPreviewSessionRenderInput> = {}): SourceMapPreviewSessionRenderInput {
  return {
    mediaUrl: "/image.png",
    mediaKind: "image",
    sourceVideo: null,
    projectionProfile: "zenith-180",
    viewerMode: "dome-check",
    selectedViewMode: "dome-orbit",
    camera: {},
    domeGuideSemanticSplit: 0.5,
    domeGuideHorizonSplit: 0.68,
    showCaveMask: false,
    invertCaveMask: false,
    width: 960,
    height: 960,
    label: "Media Preview",
    ...overrides,
  };
}

function fakeRenderer(): SourceMapPreviewRenderer {
  return {
    setSourceImage: vi.fn(),
    render: vi.fn(),
    destroy: vi.fn(),
  };
}

function fakeBitmap(width: number, height: number): FakeBitmap {
  return {
    width,
    height,
    close: vi.fn(),
  } as FakeBitmap;
}

function responseWithBlobSize(size: number): Response {
  return {
    ok: true,
    blob: () => Promise.resolve(new Blob([new Uint8Array(size)])),
  } as Response;
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

async function waitForCall(fn: ReturnType<typeof vi.fn>): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (fn.mock.calls.length > 0) return;
    await Promise.resolve();
  }
  throw new Error("Expected fake dependency to be called.");
}

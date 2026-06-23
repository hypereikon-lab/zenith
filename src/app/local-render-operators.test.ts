import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  getArtifactMediaHandle,
  setArtifactMediaHandle,
  workbench,
} from "../artifacts/artifact-store.svelte.js";
import type { OperatorId } from "../artifacts/artifact-types.js";
import { downloadBlob } from "../media/canvas-utils.js";
import {
  exportableDepthMotionConfig,
  imageArtifactUrlToCanvas,
  renderDepthMotionProxy,
  renderDisplacedEndpoint,
} from "../services/depth-motion-service.js";
import {
  PROJECT_ARTIFACT_INPUTS_BY_ID,
  PROJECT_ARTIFACT_STAGE_BY_ID,
  PROJECT_ARTIFACT_SLOT_IDS,
  type ProjectSnapshotV1,
} from "../lib/shared/contracts/projects.js";
import { restoreProjectSnapshot } from "./project-persistence.js";
import { executeLocalRenderOperator } from "./local-render-operators.js";

vi.mock("../media/canvas-utils.js", () => ({
  downloadBlob: vi.fn(),
}));

vi.mock("../services/depth-motion-service.js", () => ({
  exportableDepthMotionConfig: vi.fn((config: Record<string, unknown>) => ({
    version: 1,
    engine: "mock-depth-motion",
    output: {
      duration: config.duration,
      fps: config.fps,
      size: config.size,
      emptyBackground: config.emptyBackground,
      radiusScale: config.radiusScale,
    },
    settings: {
      yaw: config.yaw,
      pitch: config.pitch,
      roll: config.roll,
      push: config.push,
    },
  })),
  imageArtifactUrlToCanvas: vi.fn(),
  renderDepthMotionProxy: vi.fn(),
  renderDisplacedEndpoint: vi.fn(),
}));

type ProjectArtifactSlotId = (typeof PROJECT_ARTIFACT_SLOT_IDS)[number];

const FIXED_TIME = new Date("2026-06-20T12:00:00.000Z").getTime();

describe("local render operators", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_TIME));
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    restoreProjectSnapshot(localRenderSnapshot());
    workbench.jobs = [];
    workbench.errors = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("creates a local motion draft from start image and depth canvases", async () => {
    const sourceCanvas = fakeCanvas("source");
    const depthCanvas = fakeCanvas("depth");
    const motionBlob = new Blob(["motion"], { type: "video/mp4" });
    vi.mocked(imageArtifactUrlToCanvas).mockResolvedValueOnce(sourceCanvas).mockResolvedValueOnce(depthCanvas);
    vi.mocked(renderDepthMotionProxy).mockImplementationOnce(async ({ onProgress }) => {
      onProgress?.("Encoding MP4", 0.42);
      expect(workbench.jobs[0]).toMatchObject({
        operatorId: "preview-motion-draft",
        stage: "Encoding MP4",
        progress: 0.42,
        busy: true,
      });
      return {
        blob: motionBlob,
        url: "blob:http://127.0.0.1/motion-draft",
        settings: {
          size: 1024,
          duration: 5,
          fps: 12,
          frameCount: 60,
        },
      } as Awaited<ReturnType<typeof renderDepthMotionProxy>>;
    });

    await executeLocalRenderOperator("preview-motion-draft");

    expect(imageArtifactUrlToCanvas).toHaveBeenCalledTimes(2);
    expect(imageArtifactUrlToCanvas).toHaveBeenNthCalledWith(1, "data:image/png;base64,START");
    expect(imageArtifactUrlToCanvas).toHaveBeenNthCalledWith(2, "data:image/png;base64,STARTDEPTH");
    expect(renderDepthMotionProxy).toHaveBeenCalledWith({
      sourceCanvas,
      depthCanvas,
      config: workbench.motionConfig,
      onProgress: expect.any(Function),
    });
    expect(workbench.artifacts["motion-draft"]).toMatchObject({
      status: "ready",
      stale: false,
      summary: "Real local WebGPU 2.5D motion proxy ready. This is still a guide, not final production quality.",
      operatorId: "preview-motion-draft",
      media: {
        kind: "video",
        url: "blob:http://127.0.0.1/motion-draft",
        name: "Local 2.5D motion proxy 1024px 12fps",
        mime: "video/mp4",
        alt: "Real local 2.5D depth-motion guide/proxy video",
        blob: null,
        file: null,
        canvas: null,
      },
      warnings: ["Motion Draft is a spatial guide/proxy, not a final production render."],
    });
    expect(workbench.artifacts["motion-draft"].results[0]).toMatchObject({
      label: "2.5D proxy 60 frames",
      operatorId: "preview-motion-draft",
      selected: true,
    });
    expect(getArtifactMediaHandle("motion-draft")).toEqual({ blob: motionBlob, file: null, canvas: null });
    expect(workbench.jobs[0]).toMatchObject({
      operatorId: "preview-motion-draft",
      stage: "Complete",
      progress: 1,
      busy: false,
    });
    expect(workbench.selectedArtifactId).toBe("motion-draft");
    expect(workbench.selectedStageId).toBe("motion");
  });

  test("captures a displaced endpoint with runtime canvas kept in the media handle", async () => {
    const sourceCanvas = fakeCanvas("source");
    const depthCanvas = fakeCanvas("depth");
    const endpointCanvas = fakeCanvas("endpoint");
    const endpointBlob = new Blob(["endpoint"], { type: "image/png" });
    vi.mocked(imageArtifactUrlToCanvas).mockResolvedValueOnce(sourceCanvas).mockResolvedValueOnce(depthCanvas);
    vi.mocked(renderDisplacedEndpoint).mockImplementationOnce(async ({ onProgress }) => {
      onProgress?.("Serializing PNG", 0.82);
      expect(workbench.jobs[0]).toMatchObject({
        operatorId: "capture-displaced-endpoint",
        stage: "Serializing PNG",
        progress: 0.82,
        busy: true,
      });
      return {
        blob: endpointBlob,
        url: "blob:http://127.0.0.1/displaced-endpoint",
        canvas: endpointCanvas,
        settings: {
          size: 1024,
        },
      } as Awaited<ReturnType<typeof renderDisplacedEndpoint>>;
    });

    await executeLocalRenderOperator("capture-displaced-endpoint");

    expect(renderDisplacedEndpoint).toHaveBeenCalledWith({
      sourceCanvas,
      depthCanvas,
      config: workbench.motionConfig,
      onProgress: expect.any(Function),
    });
    expect(workbench.artifacts["displaced-endpoint"]).toMatchObject({
      status: "ready",
      stale: false,
      operatorId: "capture-displaced-endpoint",
      media: {
        kind: "image",
        url: "blob:http://127.0.0.1/displaced-endpoint",
        name: "Displaced endpoint 1024px",
        mime: "image/png",
        alt: "Captured final frame from the real local 2.5D depth-motion engine",
        blob: null,
        file: null,
        canvas: null,
      },
      warnings: ["Endpoint is structurally useful but should be reconstructed before video generation."],
    });
    expect(workbench.artifacts["displaced-endpoint"].results[0]).toMatchObject({
      label: "Captured 2.5D endpoint",
      operatorId: "capture-displaced-endpoint",
      selected: true,
    });
    expect(getArtifactMediaHandle("displaced-endpoint")).toEqual({
      blob: endpointBlob,
      file: null,
      canvas: endpointCanvas,
    });
    expect(workbench.artifacts["end-state"]).toMatchObject({
      status: "stale",
      stale: true,
    });
    expect(workbench.artifacts["end-state"].warnings).toContain("Input artifact changed after this result was produced.");
    expect(workbench.jobs[0]).toMatchObject({
      operatorId: "capture-displaced-endpoint",
      stage: "Complete",
      progress: 1,
      busy: false,
    });
    expect(workbench.selectedArtifactId).toBe("displaced-endpoint");
  });

  test("downloads render-owned artifact media without mutating jobs", async () => {
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(new Response(new Blob(["download"], { type: "application/octet-stream" }))),
    );

    const cases: { operatorId: OperatorId; url: string; filename: string }[] = [
      {
        operatorId: "export-motion-proxy",
        url: "data:video/mp4;base64,MOTION",
        filename: `zenith-motion-draft-${FIXED_TIME}.mp4`,
      },
      {
        operatorId: "export-start-depth",
        url: "data:image/png;base64,STARTDEPTH",
        filename: `zenith-start-depth-${FIXED_TIME}.png`,
      },
      {
        operatorId: "export-end-depth",
        url: "data:image/png;base64,ENDDEPTH",
        filename: `zenith-end-depth-${FIXED_TIME}.png`,
      },
    ];

    for (const item of cases) {
      vi.mocked(downloadBlob).mockClear();
      vi.mocked(fetch).mockClear();

      await executeLocalRenderOperator(item.operatorId);

      expect(fetch).toHaveBeenCalledWith(item.url);
      const [blob, filename] = vi.mocked(downloadBlob).mock.calls[0] as [Blob, string];
      expect(await blob.text()).toBe("download");
      expect(filename).toBe(item.filename);
      expect(workbench.jobs).toHaveLength(0);
    }
  });

  test("downloads the current motion configuration as JSON", async () => {
    await executeLocalRenderOperator("export-motion-config");

    expect(exportableDepthMotionConfig).toHaveBeenCalledWith(workbench.motionConfig);
    expect(fetch).not.toHaveBeenCalled();
    expect(renderDepthMotionProxy).not.toHaveBeenCalled();
    expect(renderDisplacedEndpoint).not.toHaveBeenCalled();
    expect(downloadBlob).toHaveBeenCalledTimes(1);

    const [blob, filename] = vi.mocked(downloadBlob).mock.calls[0] as [Blob, string];
    expect(filename).toBe(`zenith-depth-motion-config-${FIXED_TIME}.json`);
    expect(JSON.parse(await blob.text())).toEqual(exportableDepthMotionConfig(workbench.motionConfig));
  });

  test("rejects invalid render inputs before rendering", async () => {
    workbench.artifacts["start-depth"].media = { kind: "none", blob: null, file: null, canvas: null };

    await expect(executeLocalRenderOperator("preview-motion-draft")).rejects.toThrow(
      /Fixture start-depth must be an image artifact/,
    );

    expect(renderDepthMotionProxy).not.toHaveBeenCalled();
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  test("rejects image artifacts with no readable media before rendering", async () => {
    workbench.artifacts["start-depth"].media = {
      kind: "image",
      name: "missing-url.png",
      mime: "image/png",
      alt: "Missing URL",
      blob: null,
      file: null,
      canvas: null,
    };
    setArtifactMediaHandle("start-depth", { blob: null, file: null, canvas: null });

    await expect(executeLocalRenderOperator("capture-displaced-endpoint")).rejects.toThrow(
      /Fixture start-depth has no readable media/,
    );

    expect(renderDisplacedEndpoint).not.toHaveBeenCalled();
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  test("rejects missing or unreachable download media before download side effects", async () => {
    workbench.artifacts["motion-draft"].media = { kind: "none", blob: null, file: null, canvas: null };

    await expect(executeLocalRenderOperator("export-motion-proxy")).rejects.toThrow(/No media available to download/);

    expect(fetch).not.toHaveBeenCalled();
    expect(downloadBlob).not.toHaveBeenCalled();

    workbench.artifacts["motion-draft"].media = videoMedia("data:video/mp4;base64,MOTION", "motion-draft.mp4");
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 404 }));

    await expect(executeLocalRenderOperator("export-motion-proxy")).rejects.toThrow(/Could not fetch artifact media/);

    expect(downloadBlob).not.toHaveBeenCalled();
  });

  test("rejects unsupported operator ids without side effects", async () => {
    await expect(executeLocalRenderOperator("save-project")).rejects.toThrow(
      /Local render operator save-project is not implemented/,
    );

    expect(renderDepthMotionProxy).not.toHaveBeenCalled();
    expect(renderDisplacedEndpoint).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(workbench.jobs).toHaveLength(0);
  });
});

function fakeCanvas(name: string): HTMLCanvasElement {
  return {
    width: 4,
    height: 4,
    toDataURL: () => `data:image/png;base64,${name.toUpperCase()}`,
  } as HTMLCanvasElement;
}

function localRenderSnapshot(): ProjectSnapshotV1 {
  return {
    version: 1,
    createdAt: "2026-06-20T23:30:00.000Z",
    selectedArtifactId: "motion-draft",
    selectedStageId: "motion",
    projectionProfile: "zenith-180",
    domeGuideSemanticSplit: 1 / 3,
    domeGuideHorizonSplit: 0.58,
    viewerMode: "domemaster",
    artifacts: Object.fromEntries(PROJECT_ARTIFACT_SLOT_IDS.map((id) => [id, artifact(id)])) as ProjectSnapshotV1["artifacts"],
    prompts: {
      repair: "Repair prompt",
      startDepth: "Start depth prompt",
      reconstruct: "Reconstruct prompt",
      endDepth: "End depth prompt",
      video: "Video prompt",
    },
    motionConfig: {
      duration: 5,
      fps: 12,
      size: 1024,
      radiusScale: 1,
      yaw: 16,
      pitch: -4,
      roll: 0,
      truck: 0,
      lift: 0,
      push: 0.28,
      depthGain: 0.42,
      nearMeters: 1,
      farMeters: 24,
      depthContrast: 1,
      gapFillPasses: 2,
      polarity: "brightFar",
      guideMode: "source",
      emptyBackground: "greenDome",
    },
    qcItems: [
      {
        id: "projection-profile",
        label: "Projection profile",
        description: "Correct projection selected.",
        checked: false,
      },
    ],
  };
}

function artifact(id: ProjectArtifactSlotId): ProjectSnapshotV1["artifacts"][ProjectArtifactSlotId] {
  const media = mediaForArtifact(id);
  return {
    id,
    type: id,
    stage: PROJECT_ARTIFACT_STAGE_BY_ID[id],
    label: `Fixture ${id}`,
    summary: `Fixture summary for ${id}`,
    status: media.kind === "none" ? "missing" : "ready",
    inputs: [...PROJECT_ARTIFACT_INPUTS_BY_ID[id]],
    projectionProfile: "zenith-180",
    media,
    results: media.kind === "none" ? [] : [resultFor(id, media)],
    createdAt: "2026-06-20T23:30:00.000Z",
    updatedAt: "2026-06-20T23:30:00.000Z",
    warnings: [],
    qcNotes: [],
    stale: false,
  };
}

function resultFor(
  id: ProjectArtifactSlotId,
  media: ProjectSnapshotV1["artifacts"][ProjectArtifactSlotId]["media"],
): ProjectSnapshotV1["artifacts"][ProjectArtifactSlotId]["results"][number] {
  return {
    id: `${id}-existing-result`,
    label: `Existing ${id} result`,
    createdAt: "2026-06-20T23:30:00.000Z",
    media,
    operatorId: existingOperatorFor(id),
    selected: true,
  };
}

function existingOperatorFor(id: ProjectArtifactSlotId): OperatorId {
  switch (id) {
    case "start-state":
      return "repair-start-state";
    case "start-depth":
      return "generate-start-depth";
    case "motion-draft":
      return "preview-motion-draft";
    case "displaced-endpoint":
      return "capture-displaced-endpoint";
    case "end-state":
      return "reconstruct-end-state";
    case "end-depth":
      return "generate-end-depth";
    case "video-take":
      return "generate-video-take";
    case "plate-sketch":
    case "deliverables":
      return "import-plate-sketch";
  }
}

function mediaForArtifact(id: ProjectArtifactSlotId): ProjectSnapshotV1["artifacts"][ProjectArtifactSlotId]["media"] {
  switch (id) {
    case "plate-sketch":
      return imageMedia("data:image/png;base64,PLATE", "plate-sketch.png");
    case "start-state":
      return imageMedia("data:image/png;base64,START", "start-state.png");
    case "start-depth":
      return imageMedia("data:image/png;base64,STARTDEPTH", "start-depth.png");
    case "motion-draft":
      return videoMedia("data:video/mp4;base64,MOTION", "motion-draft.mp4");
    case "displaced-endpoint":
      return imageMedia("data:image/png;base64,ENDPOINT", "displaced-endpoint.png");
    case "end-state":
      return imageMedia("data:image/png;base64,END", "end-state.png");
    case "end-depth":
      return imageMedia("data:image/png;base64,ENDDEPTH", "end-depth.png");
    case "video-take":
      return videoMedia("data:video/mp4;base64,VIDEOTAKE", "video-take.mp4");
    case "deliverables":
      return { kind: "none" };
  }
}

function imageMedia(
  url: string,
  name: string,
): ProjectSnapshotV1["artifacts"][ProjectArtifactSlotId]["media"] {
  return {
    kind: "image",
    url,
    name,
    mime: "image/png",
    alt: name,
  };
}

function videoMedia(
  url: string,
  name: string,
): ProjectSnapshotV1["artifacts"][ProjectArtifactSlotId]["media"] {
  return {
    kind: "video",
    url,
    name,
    mime: "video/mp4",
    alt: name,
  };
}

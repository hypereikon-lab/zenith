import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ArtifactSlotId, OperatorId } from "../artifacts/artifact-types.js";
import { workbench } from "../artifacts/artifact-store.svelte.js";
import {
  requestRunwayDepthMap,
  requestRunwayInpaint,
  requestRunwaySeedanceVideo,
  type RunwayStreamResult,
} from "../runway/client.js";
import { PROJECT_ARTIFACT_SLOT_IDS, type ProjectSnapshotV1 } from "../lib/shared/contracts/projects.js";
import { restoreProjectSnapshot } from "./project-persistence.js";
import { executeOperator } from "./workbench-commands.js";
import { executePaidOperator } from "./paid-operator-execution.js";

vi.mock("../runway/client.js", () => ({
  requestRunwayDepthMap: vi.fn(),
  requestRunwayInpaint: vi.fn(),
  requestRunwaySeedanceVideo: vi.fn(),
}));

type ProjectArtifactSlotId = (typeof PROJECT_ARTIFACT_SLOT_IDS)[number];
type PaidHelper = "inpaint" | "depth" | "seedance";
type PaidScenario = {
  operatorId: OperatorId;
  helper: PaidHelper;
  expectedPayload: Record<string, unknown>;
  artifactId: ArtifactSlotId;
  mediaKind: "image" | "video";
  prompt: string;
  label: string;
  model: string;
  outputName: string;
  outputContentType: string;
  outputDataUri: string;
};

const PROMPTS = {
  repair: "Repair prompt",
  startDepth: "Start depth prompt",
  reconstruct: "Reconstruct prompt",
  endDepth: "End depth prompt",
  video: "Video prompt",
};

const STAGE_BY_ARTIFACT: Record<ProjectArtifactSlotId, ProjectSnapshotV1["selectedStageId"]> = {
  "plate-sketch": "start",
  "start-state": "start",
  "start-depth": "start",
  "motion-draft": "motion",
  "displaced-endpoint": "motion",
  "end-state": "end",
  "end-depth": "end",
  "video-take": "video",
  deliverables: "deliver",
};

const INPUTS_BY_ARTIFACT: Record<ProjectArtifactSlotId, ProjectArtifactSlotId[]> = {
  "plate-sketch": [],
  "start-state": ["plate-sketch"],
  "start-depth": ["start-state"],
  "motion-draft": ["start-state", "start-depth"],
  "displaced-endpoint": ["start-state", "start-depth", "motion-draft"],
  "end-state": ["start-state", "displaced-endpoint"],
  "end-depth": ["end-state"],
  "video-take": ["start-state", "end-state", "motion-draft"],
  deliverables: ["video-take"],
};

const PAID_SCENARIOS: PaidScenario[] = [
  {
    operatorId: "repair-start-state",
    helper: "inpaint",
    expectedPayload: {
      imageDataUrl: "data:image/png;base64,PLATE",
      model: "gpt_image_2",
      ratio: "1920:1920",
      prompt: PROMPTS.repair,
      quality: "high",
      outputCount: 1,
      referenceImageTag: "plate_sketch",
      sourceImageTag: "source",
    },
    artifactId: "start-state",
    mediaKind: "image",
    prompt: PROMPTS.repair,
    label: "Repaired Start State",
    model: "gpt-image",
    outputName: "repaired-start.png",
    outputContentType: "image/png",
    outputDataUri: "data:image/png;base64,REPAIRED",
  },
  {
    operatorId: "generate-start-depth",
    helper: "depth",
    expectedPayload: {
      imageDataUrl: "data:image/png;base64,START",
      ratio: "2048:2048",
      prompt: PROMPTS.startDepth,
      outputCount: 1,
    },
    artifactId: "start-depth",
    mediaKind: "image",
    prompt: PROMPTS.startDepth,
    label: "Start Depth",
    model: "depth",
    outputName: "start-depth.png",
    outputContentType: "image/png",
    outputDataUri: "data:image/png;base64,STARTDEPTHOUT",
  },
  {
    operatorId: "reconstruct-end-state",
    helper: "inpaint",
    expectedPayload: {
      imageDataUrl: "data:image/png;base64,ENDPOINT",
      sourceImageDataUrl: "data:image/png;base64,START",
      sourceFilename: "zenith-start-state-reference.png",
      model: "gpt_image_2",
      ratio: "1920:1920",
      prompt: PROMPTS.reconstruct,
      quality: "high",
      outputCount: 1,
      referenceImageTag: "displaced_endpoint",
      sourceImageTag: "start_state",
    },
    artifactId: "end-state",
    mediaKind: "image",
    prompt: PROMPTS.reconstruct,
    label: "Reconstructed End State",
    model: "gpt-image",
    outputName: "reconstructed-end.png",
    outputContentType: "image/png",
    outputDataUri: "data:image/png;base64,RECONSTRUCTED",
  },
  {
    operatorId: "generate-end-depth",
    helper: "depth",
    expectedPayload: {
      imageDataUrl: "data:image/png;base64,END",
      ratio: "2048:2048",
      prompt: PROMPTS.endDepth,
      outputCount: 1,
    },
    artifactId: "end-depth",
    mediaKind: "image",
    prompt: PROMPTS.endDepth,
    label: "End Depth",
    model: "depth",
    outputName: "end-depth.png",
    outputContentType: "image/png",
    outputDataUri: "data:image/png;base64,ENDDEPTHOUT",
  },
  {
    operatorId: "generate-video-take",
    helper: "seedance",
    expectedPayload: {
      imageDataUrl: "data:image/png;base64,START",
      finalImageDataUrl: "data:image/png;base64,END",
      videoDataUrl: "data:video/mp4;base64,MOTION",
      imageFilename: "zenith-image-1-start-state.png",
      finalFilename: "zenith-image-2-end-state.png",
      filename: "zenith-video-1-motion-draft.mp4",
      prompt: PROMPTS.video,
      ratio: "960:960",
      duration: 8,
    },
    artifactId: "video-take",
    mediaKind: "video",
    prompt: PROMPTS.video,
    label: "Generated Video Take",
    model: "seedance",
    outputName: "video-take.mp4",
    outputContentType: "video/mp4",
    outputDataUri: "data:video/mp4;base64,VIDEOTAKE",
  },
];

describe("paid operator execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreProjectSnapshot(paidOperatorSnapshot());
    workbench.jobs = [];
    workbench.errors = [];
    workbench.pendingPaidAction = null;
  });

  for (const scenario of PAID_SCENARIOS) {
    test(`executes ${scenario.operatorId} with current payload and result behavior`, async () => {
      const requestMock = vi.mocked(helperFor(scenario.helper));
      requestMock.mockResolvedValueOnce({
        model: scenario.model,
        outputs: [
          {
            dataUri: scenario.outputDataUri,
            contentType: scenario.outputContentType,
            name: scenario.outputName,
          },
        ],
      });

      await executePaidOperator(scenario.operatorId);

      expect(requestMock).toHaveBeenCalledTimes(1);
      expect(requestMock).toHaveBeenCalledWith(scenario.expectedPayload, { onProgress: expect.any(Function) });
      expectOnlyHelperCalled(scenario.helper);
      expectAppliedResult(scenario);
    });
  }

  test("updates job progress during a paid stream and completes the job after success", async () => {
    let onProgress: (stage: string, progress: number) => void = () => undefined;
    let resolveResult: (result: RunwayStreamResult) => void = () => undefined;
    vi.mocked(requestRunwayInpaint).mockImplementationOnce((_payload, options) => {
      onProgress = options?.onProgress ?? onProgress;
      return new Promise<RunwayStreamResult>((resolve) => {
        resolveResult = resolve;
      });
    });

    const execution = executePaidOperator("repair-start-state");

    expect(workbench.jobs[0]).toMatchObject({
      operatorId: "repair-start-state",
      stage: "Starting",
      progress: 0.01,
      busy: true,
    });
    await Promise.resolve();
    expect(requestRunwayInpaint).toHaveBeenCalledTimes(1);

    onProgress("Uploading", 0.42);
    expect(workbench.jobs[0]).toMatchObject({
      operatorId: "repair-start-state",
      stage: "Uploading",
      progress: 0.42,
      busy: true,
    });

    resolveResult({
      model: "progress-model",
      outputs: [{ dataUri: "data:image/png;base64,PROGRESS", contentType: "image/png", name: "progress.png" }],
    });
    await execution;

    expect(workbench.jobs[0]).toMatchObject({
      operatorId: "repair-start-state",
      stage: "Complete",
      progress: 1,
      busy: false,
    });
  });

  test("records public command errors and fails the job for empty paid outputs", async () => {
    vi.mocked(requestRunwayDepthMap).mockResolvedValueOnce({ model: "empty-depth", outputs: [] });

    await executeOperator("generate-start-depth", { confirmed: true });

    expect(workbench.errors[0]).toMatchObject({
      message: "API returned no image output.",
      scope: "generate-start-depth",
    });
    expect(workbench.jobs[0]).toMatchObject({
      operatorId: "generate-start-depth",
      stage: "Failed",
      progress: 1,
      busy: false,
    });
  });

  test("rejects missing artifact media before calling the paid client", async () => {
    workbench.artifacts["plate-sketch"].media = { kind: "none", blob: null, file: null, canvas: null };

    await expect(executePaidOperator("repair-start-state")).rejects.toThrow(/Artifact has no media/);

    expectNoRunwayCalls();
  });

  test("rejects non-paid operator input without calling the paid client", async () => {
    await expect(executePaidOperator("save-project")).rejects.toThrow(/not a paid API operator/);

    expectNoRunwayCalls();
    expect(workbench.jobs).toHaveLength(0);
  });
});

function helperFor(helper: PaidHelper): typeof requestRunwayDepthMap {
  switch (helper) {
    case "inpaint":
      return requestRunwayInpaint;
    case "depth":
      return requestRunwayDepthMap;
    case "seedance":
      return requestRunwaySeedanceVideo;
  }
}

function expectOnlyHelperCalled(helper: PaidHelper): void {
  expect(requestRunwayInpaint).toHaveBeenCalledTimes(helper === "inpaint" ? 1 : 0);
  expect(requestRunwayDepthMap).toHaveBeenCalledTimes(helper === "depth" ? 1 : 0);
  expect(requestRunwaySeedanceVideo).toHaveBeenCalledTimes(helper === "seedance" ? 1 : 0);
}

function expectNoRunwayCalls(): void {
  expect(requestRunwayInpaint).not.toHaveBeenCalled();
  expect(requestRunwayDepthMap).not.toHaveBeenCalled();
  expect(requestRunwaySeedanceVideo).not.toHaveBeenCalled();
}

function expectAppliedResult(scenario: PaidScenario): void {
  const artifact = workbench.artifacts[scenario.artifactId];
  const expectedMedia = {
    kind: scenario.mediaKind,
    url: scenario.outputDataUri,
    name: scenario.outputName,
    mime: scenario.outputContentType,
    alt: scenario.label,
    blob: null as null,
    file: null as null,
    canvas: null as null,
  };

  expect(artifact).toMatchObject({
    status: "ready",
    stale: false,
    summary: `${scenario.label} ready from ${scenario.model}.`,
    operatorId: scenario.operatorId,
    prompt: scenario.prompt,
    media: expectedMedia,
    warnings: [],
  });
  expect(artifact.results[0]).toMatchObject({
    label: scenario.label,
    media: expectedMedia,
    prompt: scenario.prompt,
    operatorId: scenario.operatorId,
    selected: true,
  });
  expect(workbench.jobs[0]).toMatchObject({
    operatorId: scenario.operatorId,
    stage: "Complete",
    progress: 1,
    busy: false,
  });
  expect(workbench.selectedArtifactId).toBe(scenario.artifactId);
  expect(workbench.selectedStageId).toBe(artifact.stage);
}

function paidOperatorSnapshot(): ProjectSnapshotV1 {
  return {
    version: 1,
    createdAt: "2026-06-20T23:00:00.000Z",
    selectedArtifactId: "plate-sketch",
    selectedStageId: "start",
    projectionProfile: "zenith-180",
    domeGuideSemanticSplit: 1 / 3,
    domeGuideHorizonSplit: 0.58,
    viewerMode: "domemaster",
    artifacts: Object.fromEntries(PROJECT_ARTIFACT_SLOT_IDS.map((id) => [id, artifact(id)])) as ProjectSnapshotV1["artifacts"],
    prompts: PROMPTS,
    motionConfig: {
      duration: 8,
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
    stage: STAGE_BY_ARTIFACT[id],
    label: `Fixture ${id}`,
    summary: `Fixture summary for ${id}`,
    status: media.kind === "none" ? "missing" : "ready",
    inputs: INPUTS_BY_ARTIFACT[id],
    projectionProfile: "zenith-180",
    media,
    results: [],
    createdAt: "2026-06-20T23:00:00.000Z",
    updatedAt: "2026-06-20T23:00:00.000Z",
    warnings: [],
    qcNotes: [],
    stale: false,
  };
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
    case "deliverables":
      return { kind: "none" };
  }
}

function imageMedia(url: string, name: string): ProjectSnapshotV1["artifacts"][ProjectArtifactSlotId]["media"] {
  return {
    kind: "image",
    url,
    name,
    mime: "image/png",
    alt: name,
  };
}

function videoMedia(url: string, name: string): ProjectSnapshotV1["artifacts"][ProjectArtifactSlotId]["media"] {
  return {
    kind: "video",
    url,
    name,
    mime: "video/mp4",
    alt: name,
  };
}

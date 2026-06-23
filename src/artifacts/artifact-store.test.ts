import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  PROJECT_ARTIFACT_INPUTS_BY_ID,
  PROJECT_ARTIFACT_SLOT_IDS,
  PROJECT_ARTIFACT_STAGE_BY_ID,
  type ProjectSnapshotV1,
} from "../lib/shared/contracts/projects.js";
import type { ArtifactMedia } from "./artifact-types.js";
import {
  getArtifactMediaHandle,
  replaceArtifactMedia,
  selectArtifactResult,
  setArtifactMediaHandle,
  updateArtifact,
  workbench,
} from "./artifact-store.svelte.js";
import { restoreProjectSnapshot } from "../app/project-persistence.js";

type ProjectArtifactSlotId = (typeof PROJECT_ARTIFACT_SLOT_IDS)[number];

describe("artifact store ownership", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    restoreProjectSnapshot(readyProjectSnapshot());
  });

  test("marks every transitive downstream artifact stale when an input changes", () => {
    updateArtifact("plate-sketch", { summary: "Plate sketch changed." });

    expect(workbench.artifacts["plate-sketch"]).toMatchObject({
      status: "ready",
      stale: false,
      summary: "Plate sketch changed.",
    });

    for (const artifactId of PROJECT_ARTIFACT_SLOT_IDS.filter((id) => id !== "plate-sketch")) {
      expect(workbench.artifacts[artifactId]).toMatchObject({
        status: "stale",
        stale: true,
      });
      expect(workbench.artifacts[artifactId].warnings).toContain(
        "Input artifact changed after this result was produced.",
      );
    }
  });

  test("marks only topology descendants stale for a middle artifact change", () => {
    updateArtifact("start-depth", { summary: "Depth changed." });

    const staleArtifacts = [
      "motion-draft",
      "displaced-endpoint",
      "end-state",
      "end-depth",
      "video-take",
      "deliverables",
    ] as const;
    const freshArtifacts = ["plate-sketch", "start-state"] as const;

    for (const artifactId of staleArtifacts) {
      expect(workbench.artifacts[artifactId]).toMatchObject({
        status: "stale",
        stale: true,
      });
    }
    for (const artifactId of freshArtifacts) {
      expect(workbench.artifacts[artifactId]).toMatchObject({
        status: "ready",
        stale: false,
      });
    }
  });

  test("does not promote missing descendants to stale", () => {
    workbench.artifacts["motion-draft"].status = "missing";
    workbench.artifacts["motion-draft"].stale = false;

    updateArtifact("start-depth", { summary: "Depth changed." });

    expect(workbench.artifacts["motion-draft"]).toMatchObject({
      status: "missing",
      stale: false,
    });
    expect(workbench.artifacts["displaced-endpoint"]).toMatchObject({
      status: "stale",
      stale: true,
    });
  });

  test("marks warning descendants stale because warning artifacts can satisfy inputs", () => {
    workbench.artifacts["motion-draft"].status = "warning";
    workbench.artifacts["motion-draft"].warnings = ["Review local parallax before paid generation."];
    workbench.artifacts["motion-draft"].stale = false;

    updateArtifact("start-depth", { summary: "Depth changed." });

    expect(workbench.artifacts["motion-draft"]).toMatchObject({
      status: "stale",
      stale: true,
    });
    expect(workbench.artifacts["motion-draft"].warnings).toEqual([
      "Review local parallax before paid generation.",
      "Input artifact changed after this result was produced.",
    ]);
  });

  test("replaces artifact media and revokes previous object URLs no longer referenced", () => {
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    workbench.artifacts["start-state"].media = imageMedia("blob:http://127.0.0.1/old-start", "old-start.png");
    workbench.artifacts["start-state"].results = [];

    const media = imageMedia("blob:http://127.0.0.1/new-start", "new-start.png");
    replaceArtifactMedia("start-state", {
      patch: {
        status: "ready",
        stale: false,
        summary: "New start state.",
        media,
        warnings: [],
      },
      handle: { blob: new Blob(["new"], { type: "image/png" }), file: null, canvas: null },
      result: {
        label: "New Start",
        media,
      },
    });

    expect(workbench.artifacts["start-state"].media.url).toBe("blob:http://127.0.0.1/new-start");
    expect(workbench.artifacts["start-state"].results[0]).toMatchObject({
      label: "New Start",
      selected: true,
      media: { url: "blob:http://127.0.0.1/new-start" },
    });
    expect(revokeSpy).toHaveBeenCalledWith("blob:http://127.0.0.1/old-start");
    expect(revokeSpy).not.toHaveBeenCalledWith("blob:http://127.0.0.1/new-start");
  });

  test("does not revoke old object URLs still referenced by result history", () => {
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const oldMedia = imageMedia("blob:http://127.0.0.1/old-result", "old-result.png");
    workbench.artifacts["start-state"].media = oldMedia;
    workbench.artifacts["start-state"].results = [
      {
        id: "old-result",
        label: "Old Result",
        createdAt: "2026-06-23T12:00:00.000Z",
        media: oldMedia,
        selected: true,
      },
    ];

    const media = imageMedia("blob:http://127.0.0.1/new-result", "new-result.png");
    replaceArtifactMedia("start-state", {
      patch: {
        status: "ready",
        stale: false,
        summary: "New start state.",
        media,
        warnings: [],
      },
      handle: { blob: null, file: null, canvas: null },
      result: {
        label: "New Result",
        media,
      },
    });

    expect(revokeSpy).not.toHaveBeenCalledWith("blob:http://127.0.0.1/old-result");
    expect(workbench.artifacts["start-state"].results.map((result) => result.media.url)).toContain(
      "blob:http://127.0.0.1/old-result",
    );
  });

  test("selects historical artifact results and marks transitive descendants stale", () => {
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const currentMedia = imageMedia("blob:http://127.0.0.1/current-start", "current-start.png");
    const historicalMedia = imageMedia("blob:http://127.0.0.1/historical-start", "historical-start.png");
    const staleHandle = new Blob(["stale"], { type: "image/png" });
    workbench.artifacts["start-state"].media = currentMedia;
    workbench.artifacts["start-state"].prompt = "Current prompt";
    setArtifactMediaHandle("start-state", { blob: staleHandle, file: null, canvas: null });
    workbench.artifacts["start-state"].results = [
      {
        id: "current-result",
        label: "Current Result",
        createdAt: "2026-06-23T12:01:00.000Z",
        media: currentMedia,
        prompt: "Current prompt",
        selected: true,
      },
      {
        id: "historical-result",
        label: "Historical Result",
        createdAt: "2026-06-23T12:00:00.000Z",
        media: historicalMedia,
        prompt: "Historical prompt",
        selected: false,
      },
    ];

    selectArtifactResult("start-state", "historical-result");

    expect(workbench.artifacts["start-state"]).toMatchObject({
      status: "ready",
      stale: false,
      prompt: "Historical prompt",
      media: { url: "blob:http://127.0.0.1/historical-start" },
    });
    expect(workbench.artifacts["start-state"].results.map((result) => [result.id, result.selected])).toEqual([
      ["current-result", false],
      ["historical-result", true],
    ]);
    expect(getArtifactMediaHandle("start-state")).toEqual({ blob: null, file: null, canvas: null });
    expect(revokeSpy).not.toHaveBeenCalledWith("blob:http://127.0.0.1/current-start");
    expect(revokeSpy).not.toHaveBeenCalledWith("blob:http://127.0.0.1/historical-start");

    const staleArtifacts = [
      "start-depth",
      "motion-draft",
      "displaced-endpoint",
      "end-state",
      "end-depth",
      "video-take",
      "deliverables",
    ] as const;
    for (const artifactId of staleArtifacts) {
      expect(workbench.artifacts[artifactId]).toMatchObject({
        status: "stale",
        stale: true,
      });
      expect(workbench.artifacts[artifactId].warnings).toContain(
        "Input artifact changed after this result was produced.",
      );
    }
  });

  test("ignores unknown artifact result selections without mutating state", () => {
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const media = imageMedia("blob:http://127.0.0.1/current-start", "current-start.png");
    const currentHandle = new Blob(["current"], { type: "image/png" });
    workbench.artifacts["start-state"].media = media;
    workbench.artifacts["start-state"].prompt = "Current prompt";
    setArtifactMediaHandle("start-state", { blob: currentHandle, file: null, canvas: null });
    workbench.artifacts["start-state"].results = [
      {
        id: "current-result",
        label: "Current Result",
        createdAt: "2026-06-23T12:01:00.000Z",
        media,
        prompt: "Current prompt",
        selected: true,
      },
    ];

    selectArtifactResult("start-state", "missing-result");

    expect(workbench.artifacts["start-state"]).toMatchObject({
      status: "ready",
      stale: false,
      prompt: "Current prompt",
      media: { url: "blob:http://127.0.0.1/current-start" },
    });
    expect(workbench.artifacts["start-state"].results).toMatchObject([{ id: "current-result", selected: true }]);
    expect(workbench.artifacts["start-depth"]).toMatchObject({ status: "ready", stale: false });
    expect(getArtifactMediaHandle("start-state")?.blob).toBe(currentHandle);
    expect(revokeSpy).not.toHaveBeenCalled();
  });

  test("reselecting the active artifact result does not stale descendants or clear runtime handles", () => {
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const media = imageMedia("blob:http://127.0.0.1/current-start", "current-start.png");
    const currentHandle = new Blob(["current"], { type: "image/png" });
    workbench.artifacts["start-state"].media = media;
    setArtifactMediaHandle("start-state", { blob: currentHandle, file: null, canvas: null });
    workbench.artifacts["start-state"].results = [
      {
        id: "current-result",
        label: "Current Result",
        createdAt: "2026-06-23T12:01:00.000Z",
        media,
        selected: true,
      },
    ];

    selectArtifactResult("start-state", "current-result");

    expect(workbench.artifacts["start-state"]).toMatchObject({
      status: "ready",
      stale: false,
      media: { url: "blob:http://127.0.0.1/current-start" },
    });
    expect(workbench.artifacts["start-depth"]).toMatchObject({ status: "ready", stale: false });
    expect(getArtifactMediaHandle("start-state")?.blob).toBe(currentHandle);
    expect(revokeSpy).not.toHaveBeenCalled();
  });

  test("selecting a result revokes replaced object URLs no longer referenced", () => {
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    workbench.artifacts["start-state"].media = imageMedia(
      "blob:http://127.0.0.1/import-preview",
      "import-preview.png",
    );
    workbench.artifacts["start-state"].results = [
      {
        id: "kept-result",
        label: "Kept Result",
        createdAt: "2026-06-23T12:00:00.000Z",
        media: imageMedia("blob:http://127.0.0.1/kept-result", "kept-result.png"),
        selected: false,
      },
    ];

    selectArtifactResult("start-state", "kept-result");

    expect(revokeSpy).toHaveBeenCalledWith("blob:http://127.0.0.1/import-preview");
    expect(revokeSpy).not.toHaveBeenCalledWith("blob:http://127.0.0.1/kept-result");
  });
});

function readyProjectSnapshot(): ProjectSnapshotV1 {
  return {
    version: 1,
    createdAt: "2026-06-23T12:00:00.000Z",
    selectedArtifactId: "video-take",
    selectedStageId: "video",
    projectionProfile: "zenith-180",
    domeGuideSemanticSplit: 1 / 3,
    domeGuideHorizonSplit: 0.58,
    viewerMode: "domemaster",
    artifacts: Object.fromEntries(
      PROJECT_ARTIFACT_SLOT_IDS.map((id) => [id, artifact(id)]),
    ) as ProjectSnapshotV1["artifacts"],
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
  return {
    id,
    type: id,
    stage: PROJECT_ARTIFACT_STAGE_BY_ID[id],
    label: `Fixture ${id}`,
    summary: `Fixture ${id} summary.`,
    status: "ready",
    inputs: [...PROJECT_ARTIFACT_INPUTS_BY_ID[id]],
    projectionProfile: "zenith-180",
    media: { kind: "none" },
    results: [],
    createdAt: "2026-06-23T12:00:00.000Z",
    updatedAt: "2026-06-23T12:00:00.000Z",
    warnings: [],
    qcNotes: [],
    stale: false,
  };
}

function imageMedia(url: string, name: string): ArtifactMedia {
  return {
    kind: "image",
    url,
    name,
    mime: "image/png",
    alt: name,
    blob: null,
    file: null,
    canvas: null,
  };
}

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  getArtifactMediaHandle,
  getMediaPreviewHandle,
  setArtifactMediaHandle,
  setMediaPreviewHandle,
  workbench,
} from "../artifacts/artifact-store.svelte.js";
import {
  createProjectSnapshot,
  parseProjectSnapshotText,
  restoreProjectSnapshot,
  restoreProjectSnapshotText,
} from "./project-persistence.js";
import { PROJECT_ARTIFACT_SLOT_IDS, type ProjectSnapshotV1 } from "../lib/shared/contracts/projects.js";
import type { ArtifactSlotId } from "../artifacts/artifact-types.js";

type ProjectArtifactSlotId = (typeof PROJECT_ARTIFACT_SLOT_IDS)[number];

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

describe("project persistence", () => {
  beforeEach(() => {
    restoreProjectSnapshot(validProjectSnapshot());
  });

  test("parses valid snapshot text before restoration", () => {
    const snapshot = parseProjectSnapshotText(JSON.stringify(validProjectSnapshot()));

    expect(snapshot.version).toBe(1);
    expect(snapshot.selectedArtifactId).toBe("motion-draft");
  });

  test("serializes runtime media as JSON-safe project snapshot media", async () => {
    const canvas = { toDataURL: () => "data:image/png;base64,CANVAS" } as HTMLCanvasElement;
    workbench.artifacts["start-state"].media = {
      kind: "canvas",
      url: "blob:http://127.0.0.1/runtime-only",
      name: "runtime-start-state.png",
      mime: "image/png",
      alt: "Runtime start state",
      blob: new Blob(["runtime"], { type: "image/png" }),
      file: {} as File,
      canvas,
    };
    workbench.artifacts["motion-draft"].results[0].media = {
      kind: "video",
      url: "data:video/mp4;base64,RESULT",
      name: "runtime-result.mp4",
      mime: "video/mp4",
      alt: "Runtime result",
      blob: null,
      file: {} as File,
      canvas,
    };
    setArtifactMediaHandle("start-state", { blob: null, file: null, canvas });

    const snapshot = await createProjectSnapshot({ createdAt: "2026-06-20T22:00:00.000Z" });
    const json = JSON.stringify(snapshot);

    expect(snapshot.artifacts["start-state"].media).toMatchObject({
      kind: "image",
      url: "data:image/png;base64,CANVAS",
      name: "runtime-start-state.png",
      mime: "image/png",
      alt: "Runtime start state",
    });
    expect(snapshot.artifacts["motion-draft"].results[0].media).toMatchObject({
      kind: "video",
      url: "data:video/mp4;base64,RESULT",
      name: "runtime-result.mp4",
      mime: "video/mp4",
      alt: "Runtime result",
    });
    expect(json).not.toContain('"blob"');
    expect(json).not.toContain('"file"');
    expect(json).not.toContain('"canvas"');
    expect(json).not.toContain("blob:http://127.0.0.1/runtime-only");
    expect(hasOwn(snapshot.artifacts["start-state"], "operatorId")).toBe(false);
    expect(hasOwn(snapshot.artifacts["start-state"], "prompt")).toBe(false);
  });

  test("restores prompts, projection and view state, motion configuration, selection, artifacts, and QC state", () => {
    const snapshot = validProjectSnapshot({
      selectedArtifactId: "motion-draft",
      selectedStageId: "motion",
      projectionProfile: "cave-270",
      domeGuideSemanticSplit: 0.5,
      domeGuideHorizonSplit: 0.72,
      viewerMode: "rim-check",
      prompts: {
        repair: "restored repair prompt",
        startDepth: "restored start depth prompt",
        reconstruct: "restored reconstruct prompt",
        endDepth: "restored end depth prompt",
        video: "restored video prompt",
      },
      motionConfig: {
        duration: 7,
        fps: 18,
        size: 768,
        radiusScale: 1.1,
        yaw: 22,
        pitch: -6,
        roll: 3,
        truck: 0.2,
        lift: -0.1,
        push: 0.35,
        depthGain: 0.55,
        nearMeters: 0.8,
        farMeters: 32,
        depthContrast: 1.3,
        gapFillPasses: 3,
        polarity: "brightNear",
        guideMode: "depthShaded",
        emptyBackground: "black",
      },
      qcItems: [
        {
          id: "projection-profile",
          label: "Projection profile",
          description: "Correct projection selected.",
          checked: true,
        },
        {
          id: "video-playback",
          label: "Video playback check",
          description: "Final video plays cleanly.",
          checked: true,
        },
      ],
    });

    restoreProjectSnapshot(snapshot);

    expect(workbench.promptDrafts.video).toBe("restored video prompt");
    expect(workbench.promptDrafts.repair).toBe("restored repair prompt");
    expect(workbench.motionConfig.duration).toBe(7);
    expect(workbench.motionConfig.yaw).toBe(22);
    expect(workbench.motionConfig.polarity).toBe("brightNear");
    expect(workbench.viewerMode).toBe("rim-check");
    expect(workbench.projectionProfile).toBe("cave-270");
    expect(workbench.domeGuideSemanticSplit).toBe(0.5);
    expect(workbench.domeGuideHorizonSplit).toBe(0.72);
    expect(workbench.selectedArtifactId).toBe("motion-draft");
    expect(workbench.selectedStageId).toBe("motion");
    expect(workbench.qcItems.map((item) => [item.id, item.checked])).toEqual([
      ["projection-profile", true],
      ["video-playback", true],
    ]);
    expect(workbench.artifacts["motion-draft"].media).toMatchObject({
      kind: "video",
      url: "data:video/mp4;base64,VIDEO",
      blob: null,
      file: null,
      canvas: null,
    });
    expect(Object.values(workbench.artifacts).every((artifact) => artifact.projectionProfile === "cave-270")).toBe(
      true,
    );
    for (const id of PROJECT_ARTIFACT_SLOT_IDS) {
      expect(getArtifactMediaHandle(id as ArtifactSlotId)).toEqual({ blob: null, file: null, canvas: null });
    }
  });

  test("revokes replaced runtime object URLs only after a valid restore", () => {
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    workbench.artifacts["start-state"].media = {
      kind: "image",
      url: "blob:http://127.0.0.1/start-state",
      name: "start-state.png",
      mime: "image/png",
      alt: "Old start state",
      blob: null,
      file: null,
      canvas: null,
    };
    workbench.artifacts["start-state"].results = [
      {
        id: "old-result",
        label: "Old Result",
        createdAt: "2026-06-20T20:00:00.000Z",
        media: {
          kind: "image",
          url: "blob:http://127.0.0.1/start-result",
          name: "start-result.png",
          mime: "image/png",
          alt: "Old result",
          blob: null,
          file: null,
          canvas: null,
        },
      },
    ];
    workbench.mediaPreview.media = {
      kind: "image",
      url: "blob:http://127.0.0.1/media-preview",
      name: "preview.png",
      mime: "image/png",
      alt: "Old media preview",
      blob: null,
      file: null,
      canvas: null,
    };

    restoreProjectSnapshot(validProjectSnapshot());

    const revoked = revokeSpy.mock.calls.map(([url]) => url);
    expect(revoked).toEqual(
      expect.arrayContaining([
        "blob:http://127.0.0.1/start-state",
        "blob:http://127.0.0.1/start-result",
        "blob:http://127.0.0.1/media-preview",
      ]),
    );
    expect(workbench.mediaPreview.media.kind).toBe("none");
    revokeSpy.mockRestore();
  });

  test("rejects invalid import text without mutating live state or runtime media handles", () => {
    const sentinel = new Blob(["sentinel"], { type: "image/png" });
    setArtifactMediaHandle("start-state", { blob: sentinel, file: null, canvas: null });
    const before = liveStateFingerprint();

    expect(() => restoreProjectSnapshotText("{")).toThrow(/invalid JSON/);
    expect(liveStateFingerprint()).toBe(before);
    expect(getArtifactMediaHandle("start-state")?.blob).toBe(sentinel);

    expect(() =>
      restoreProjectSnapshotText(JSON.stringify({ ...validProjectSnapshot(), version: 2 })),
    ).toThrow(/Unsupported Zenith project snapshot version 2/);
    expect(liveStateFingerprint()).toBe(before);
    expect(getArtifactMediaHandle("start-state")?.blob).toBe(sentinel);

    const missingArtifact = JSON.parse(JSON.stringify(validProjectSnapshot())) as ProjectSnapshotV1;
    delete (missingArtifact.artifacts as Record<string, unknown>)["start-depth"];

    expect(() => restoreProjectSnapshotText(JSON.stringify(missingArtifact))).toThrow(/artifacts/);
    expect(liveStateFingerprint()).toBe(before);
    expect(getArtifactMediaHandle("start-state")?.blob).toBe(sentinel);
  });

  test("validates direct snapshot restore before mutating live state or revoking object URLs", () => {
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const sentinel = new Blob(["sentinel"], { type: "image/png" });
    const previewSentinel = new Blob(["preview-sentinel"], { type: "image/png" });
    setArtifactMediaHandle("start-state", { blob: sentinel, file: null, canvas: null });
    setMediaPreviewHandle({ blob: previewSentinel, file: null, canvas: null });
    workbench.artifacts["start-state"].media = {
      kind: "image",
      url: "blob:http://127.0.0.1/direct-start-state",
      name: "direct-start-state.png",
      mime: "image/png",
      alt: "Direct start state",
      blob: null,
      file: null,
      canvas: null,
    };
    workbench.mediaPreview.media = {
      kind: "image",
      url: "blob:http://127.0.0.1/direct-preview",
      name: "direct-preview.png",
      mime: "image/png",
      alt: "Direct preview",
      blob: null,
      file: null,
      canvas: null,
    };
    const before = liveStateFingerprint();
    const malformed = JSON.parse(JSON.stringify(validProjectSnapshot())) as Record<string, unknown>;
    ((malformed.artifacts as Record<string, Record<string, unknown>>).deliverables).results = null;

    expect(() => restoreProjectSnapshot(malformed)).toThrow(/artifacts\.deliverables\.results/);
    expect(liveStateFingerprint()).toBe(before);
    expect(getArtifactMediaHandle("start-state")?.blob).toBe(sentinel);
    expect(getMediaPreviewHandle().blob).toBe(previewSentinel);
    expect(workbench.artifacts["start-state"].media.url).toBe("blob:http://127.0.0.1/direct-start-state");
    expect(workbench.mediaPreview.media.url).toBe("blob:http://127.0.0.1/direct-preview");
    expect(revokeSpy).not.toHaveBeenCalled();
    revokeSpy.mockRestore();
  });
});

function validProjectSnapshot(overrides: Partial<ProjectSnapshotV1> = {}): ProjectSnapshotV1 {
  return {
    version: 1,
    createdAt: "2026-06-20T21:00:00.000Z",
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
    ...overrides,
  };
}

function artifact(id: ProjectArtifactSlotId): ProjectSnapshotV1["artifacts"][ProjectArtifactSlotId] {
  const media =
    id === "motion-draft"
      ? {
          kind: "video" as const,
          url: "data:video/mp4;base64,VIDEO",
          name: "motion-draft.mp4",
          mime: "video/mp4",
          alt: "Fixture motion draft",
        }
      : id === "plate-sketch"
        ? {
            kind: "image" as const,
            url: "data:image/png;base64,PLATE",
            name: "plate-sketch.png",
            mime: "image/png",
            alt: "Fixture plate sketch",
          }
        : { kind: "none" as const };

  return {
    id,
    type: id,
    stage: STAGE_BY_ARTIFACT[id],
    label: `Fixture ${id}`,
    summary: `Fixture summary for ${id}`,
    status: id === "plate-sketch" || id === "motion-draft" ? "ready" : "missing",
    inputs: INPUTS_BY_ARTIFACT[id],
    projectionProfile: "zenith-180",
    prompt: id === "motion-draft" ? "Motion artifact prompt" : undefined,
    config: { note: id, enabled: true },
    media,
    results:
      id === "motion-draft"
        ? [
            {
              id: "motion-draft-result",
              label: "Motion Draft Result",
              createdAt: "2026-06-20T21:00:00.000Z",
              media,
              prompt: "Motion result prompt",
              operatorId: "preview-motion-draft",
              selected: true,
            },
          ]
        : [],
    createdAt: "2026-06-20T21:00:00.000Z",
    updatedAt: "2026-06-20T21:00:00.000Z",
    warnings: [],
    qcNotes: [],
    stale: false,
  };
}

function liveStateFingerprint(): string {
  return JSON.stringify({
    selectedArtifactId: workbench.selectedArtifactId,
    selectedStageId: workbench.selectedStageId,
    projectionProfile: workbench.projectionProfile,
    domeGuideSemanticSplit: workbench.domeGuideSemanticSplit,
    domeGuideHorizonSplit: workbench.domeGuideHorizonSplit,
    viewerMode: workbench.viewerMode,
    prompts: workbench.promptDrafts,
    motionConfig: workbench.motionConfig,
    qcItems: workbench.qcItems,
    artifacts: workbench.artifacts,
  });
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

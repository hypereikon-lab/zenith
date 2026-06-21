import { describe, expect, test } from "vitest";
import {
  parseProjectSnapshot,
  PROJECT_ARTIFACT_SLOT_IDS,
  ProjectSnapshotParseError,
  ProjectSnapshotV1Schema,
} from "./projects.js";

type ProjectArtifactSlotId = (typeof PROJECT_ARTIFACT_SLOT_IDS)[number];

const STAGE_BY_ARTIFACT: Record<ProjectArtifactSlotId, string> = {
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

describe("ProjectSnapshotV1 contract", () => {
  test("accepts a valid current snapshot and strips legacy null runtime media fields", () => {
    const payload = validProjectSnapshotPayload();

    const parsed = parseProjectSnapshot(payload);

    expect(ProjectSnapshotV1Schema.safeParse(payload).success).toBe(true);
    expect(parsed.version).toBe(1);
    expect(Object.keys(parsed.artifacts)).toEqual([...PROJECT_ARTIFACT_SLOT_IDS]);
    expect(parsed.artifacts["plate-sketch"].media).toEqual({
      kind: "image",
      url: "data:image/png;base64,AAAA",
      name: "plate-sketch.png",
      mime: "image/png",
      alt: "Fixture plate sketch",
    });
    expect("blob" in parsed.artifacts["plate-sketch"].media).toBe(false);
    expect("file" in parsed.artifacts["plate-sketch"].media).toBe(false);
    expect("canvas" in parsed.artifacts["plate-sketch"].media).toBe(false);
  });

  test("rejects missing, malformed, and unsupported versions", () => {
    expect(() => parseProjectSnapshot({ ...validProjectSnapshotPayload(), version: 2 })).toThrow(
      /Unsupported Zenith project snapshot version 2/,
    );
    expect(() => parseProjectSnapshot({ ...validProjectSnapshotPayload(), version: "1" })).toThrow(
      /Unsupported Zenith project snapshot version 1/,
    );

    const missingVersion = validProjectSnapshotPayload();
    delete missingVersion.version;
    expect(() => parseProjectSnapshot(missingVersion)).toThrow(/version is required/);
    expect(() => parseProjectSnapshot("not an object")).toThrow(/must be a JSON object/);
  });

  test("requires every current artifact slot and rejects unknown slots", () => {
    const missingSlot = validProjectSnapshotPayload();
    delete (missingSlot.artifacts as Record<string, unknown>)["start-depth"];

    expect(() => parseProjectSnapshot(missingSlot)).toThrow(ProjectSnapshotParseError);
    expect(() => parseProjectSnapshot(missingSlot)).toThrow(/artifacts/);

    const unknownSlot = validProjectSnapshotPayload();
    (unknownSlot.artifacts as Record<string, unknown>)["future-asset"] = artifact("plate-sketch");

    expect(() => parseProjectSnapshot(unknownSlot)).toThrow(/artifacts/);
  });

  test("rejects artifact key mismatches and malformed artifact payloads", () => {
    const mismatched = validProjectSnapshotPayload();
    ((mismatched.artifacts as Record<string, Record<string, unknown>>)["start-state"]).id = "plate-sketch";

    expect(() => parseProjectSnapshot(mismatched)).toThrow(/artifact id must match/);

    const malformedResult = validProjectSnapshotPayload();
    ((malformedResult.artifacts as Record<string, Record<string, unknown>>)["plate-sketch"]).results = null;

    expect(() => parseProjectSnapshot(malformedResult)).toThrow(/artifacts\.plate-sketch\.results/);

    const malformedQc = validProjectSnapshotPayload();
    (malformedQc.qcItems as Record<string, unknown>[])[0].checked = "yes";

    expect(() => parseProjectSnapshot(malformedQc)).toThrow(/qcItems\.0\.checked/);
  });

  test("rejects semantically malformed artifact graph records", () => {
    const wrongStage = validProjectSnapshotPayload();
    ((wrongStage.artifacts as Record<string, Record<string, unknown>>)["plate-sketch"]).stage = "video";

    expect(() => parseProjectSnapshot(wrongStage)).toThrow(/artifact stage must be start/);

    const wrongInputs = validProjectSnapshotPayload();
    ((wrongInputs.artifacts as Record<string, Record<string, unknown>>)["motion-draft"]).inputs = ["plate-sketch"];

    expect(() => parseProjectSnapshot(wrongInputs)).toThrow(/artifact inputs must be \[start-state, start-depth\]/);
  });

  test("rejects runtime object URLs in portable media", () => {
    const payload = validProjectSnapshotPayload();
    const media = ((payload.artifacts as Record<string, Record<string, unknown>>)["plate-sketch"]).media as Record<
      string,
      unknown
    >;
    media.url = "blob:http://127.0.0.1/runtime-only";

    expect(() => parseProjectSnapshot(payload)).toThrow(/object URLs are runtime-only/);
  });

  test("rejects runtime media kinds and non-none media without portable URLs", () => {
    const canvasKind = validProjectSnapshotPayload();
    const canvasMedia = ((canvasKind.artifacts as Record<string, Record<string, unknown>>)["plate-sketch"])
      .media as Record<string, unknown>;
    canvasMedia.kind = "canvas";

    expect(() => parseProjectSnapshot(canvasKind)).toThrow(/artifacts\.plate-sketch\.media\.kind/);

    const audioKind = validProjectSnapshotPayload();
    const audioMedia = ((audioKind.artifacts as Record<string, Record<string, unknown>>)["plate-sketch"])
      .media as Record<string, unknown>;
    audioMedia.kind = "audio";

    expect(() => parseProjectSnapshot(audioKind)).toThrow(/artifacts\.plate-sketch\.media\.kind/);

    const missingImageUrl = validProjectSnapshotPayload();
    const imageMedia = ((missingImageUrl.artifacts as Record<string, Record<string, unknown>>)["plate-sketch"])
      .media as Record<string, unknown>;
    delete imageMedia.url;

    expect(() => parseProjectSnapshot(missingImageUrl)).toThrow(/image media requires a portable url/);

    const missingVideoUrl = validProjectSnapshotPayload();
    const videoMedia = ((missingVideoUrl.artifacts as Record<string, Record<string, unknown>>)["plate-sketch"])
      .media as Record<string, unknown>;
    videoMedia.kind = "video";
    delete videoMedia.url;

    expect(() => parseProjectSnapshot(missingVideoUrl)).toThrow(/video media requires a portable url/);
  });
});

function validProjectSnapshotPayload(): Record<string, unknown> {
  return {
    version: 1,
    createdAt: "2026-06-20T21:00:00.000Z",
    selectedArtifactId: "motion-draft",
    selectedStageId: "motion",
    projectionProfile: "cave-270",
    domeGuideSemanticSplit: 0.5,
    domeGuideHorizonSplit: 0.72,
    viewerMode: "rim-check",
    artifacts: Object.fromEntries(PROJECT_ARTIFACT_SLOT_IDS.map((id) => [id, artifact(id)])),
    prompts: {
      repair: "Repair prompt",
      startDepth: "Start depth prompt",
      reconstruct: "Reconstruct prompt",
      endDepth: "End depth prompt",
      video: "Video prompt",
    },
    motionConfig: {
      duration: 7,
      fps: 12,
      size: 1024,
      radiusScale: 1,
      yaw: 22,
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
      polarity: "brightNear",
      guideMode: "depthShaded",
      emptyBackground: "greenDome",
    },
    qcItems: [
      {
        id: "projection-profile",
        label: "Projection profile",
        description: "Correct projection selected.",
        checked: true,
      },
    ],
  };
}

function artifact(id: ProjectArtifactSlotId): Record<string, unknown> {
  const media: Record<string, unknown> =
    id === "plate-sketch"
      ? {
          kind: "image",
          url: "data:image/png;base64,AAAA",
          name: "plate-sketch.png",
          mime: "image/png",
          alt: "Fixture plate sketch",
          blob: null,
          file: null,
          canvas: null,
        }
      : { kind: "none", blob: null, file: null, canvas: null };

  return {
    id,
    type: id,
    stage: STAGE_BY_ARTIFACT[id],
    label: `Fixture ${id}`,
    summary: `Fixture summary for ${id}`,
    status: id === "plate-sketch" ? "ready" : "missing",
    inputs: INPUTS_BY_ARTIFACT[id],
    projectionProfile: "cave-270",
    prompt: id === "start-state" ? "artifact prompt" : undefined,
    config: { nested: { enabled: true, gain: 0.7, notes: ["portable"] } },
    media,
    results:
      id === "plate-sketch"
        ? [
            {
              id: "plate-sketch-result",
              label: "Plate sketch result",
              createdAt: "2026-06-20T21:00:00.000Z",
              media,
              operatorId: "import-plate-sketch",
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

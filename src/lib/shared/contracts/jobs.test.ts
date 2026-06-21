import { describe, expect, test } from "vitest";
import {
  parseCreateJobRequest,
  parseJob,
  parseJobEvent,
  parseJobResult,
  JobContractParseError,
} from "./jobs.js";

const PNG_DATA_URL = "data:image/png;base64,AAAA";

describe("JobV1 contract", () => {
  test("accepts valid create requests, jobs, events, and results", () => {
    expect(parseCreateJobRequest(validCreateRequest())).toEqual(validCreateRequest());
    expect(parseJob(validJob())).toEqual(validJob());
    expect(parseJobEvent(validProgressEvent())).toEqual(validProgressEvent());
    expect(parseJobEvent(validCompleteEvent())).toEqual(validCompleteEvent());
    expect(parseJobResult(validResult())).toEqual(validResult());
    expect(parseCreateJobRequest(validEndDepthCreateRequest())).toEqual(validEndDepthCreateRequest());
    expect(parseJob(validEndDepthJob())).toEqual(validEndDepthJob());
    expect(parseJobResult(validEndDepthResult())).toEqual(validEndDepthResult());
  });

  test("rejects missing, malformed, and unsupported versions", () => {
    const missingVersion = validCreateRequest() as Record<string, unknown>;
    delete missingVersion.version;

    expect(() => parseCreateJobRequest(missingVersion)).toThrow(/version is required/);
    expect(() => parseCreateJobRequest({ ...validCreateRequest(), version: 2 })).toThrow(
      /Unsupported Zenith job contract version 2/,
    );
    expect(() => parseJobEvent("not an object")).toThrow(/must be a JSON object/);
  });

  test("rejects unsupported operators and malformed input", () => {
    expect(() => parseCreateJobRequest({ ...validCreateRequest(), operatorId: "repair-start-state" })).toThrow(
      /operatorId/,
    );
    expect(() => parseCreateJobRequest({ ...validCreateRequest(), operatorId: "generate-video-take" })).toThrow(
      /operatorId/,
    );
    expect(() =>
      parseCreateJobRequest({
        ...validCreateRequest(),
        input: { ...validCreateRequest().input, imageDataUrl: "https://example.test/image.png" },
      }),
    ).toThrow(/Expected a base64 data URL/);
    expect(() =>
      parseCreateJobRequest({
        ...validCreateRequest(),
        input: { ...validCreateRequest().input, prompt: "   " },
      }),
    ).toThrow(/Prompt is required/);
    expect(() =>
      parseCreateJobRequest({
        ...validCreateRequest(),
        input: { ...validCreateRequest().input, outputCount: 2 },
      }),
    ).toThrow(/input.outputCount/);
    expect(() =>
      parseCreateJobRequest({
        ...validEndDepthCreateRequest(),
        outputArtifactIds: ["start-depth"],
      }),
    ).toThrow(/generate-end-depth jobs must use outputArtifactIds/);
  });

  test("rejects invalid job status and progress values", () => {
    expect(() => parseJob({ ...validJob(), status: "retrying" })).toThrow(/status/);
    expect(() => parseJob({ ...validJob(), progress: 1.1 })).toThrow(/progress/);
    expect(() => parseJobEvent({ ...validProgressEvent(), sequence: 0 })).toThrow(/sequence/);
    expect(() => parseJobEvent({ ...validProgressEvent(), progress: -0.1 })).toThrow(/progress/);
  });

  test("rejects runtime fields, object URLs, and malformed outputs", () => {
    expect(() =>
      parseJobResult({
        ...validResult(),
        outputs: [{ ...validResult().outputs[0], url: "blob:http://127.0.0.1/runtime-only" }],
      }),
    ).toThrow(/object URLs are runtime-only/);
    expect(() =>
      parseJobResult({
        ...validResult(),
        outputs: [{ kind: "image", contentType: "image/png" }],
      }),
    ).toThrow(/requires a portable dataUri or url/);
    expect(() =>
      parseJobEvent({
        ...validCompleteEvent(),
        result: {
          ...validResult(),
          outputs: [{ ...validResult().outputs[0], blob: null }],
        },
      }),
    ).toThrow(JobContractParseError);
    expect(() =>
      parseJob({
        ...validJob(),
        controller: {},
      }),
    ).toThrow(/Unrecognized key/);
    expect(() =>
      parseJobResult({
        ...validEndDepthResult(),
        outputArtifactId: "start-depth",
      }),
    ).toThrow(/generate-end-depth results must use outputArtifactId end-depth/);
    expect(() =>
      parseJobResult({
        ...validResult(),
        outputs: [],
      }),
    ).toThrow(/requires at least one output/);
    expect(() =>
      parseJob({
        ...validEndDepthJob(),
        inputArtifactIds: ["start-state"],
      }),
    ).toThrow(/generate-end-depth jobs must use inputArtifactIds/);
    expect(() =>
      parseJob({
        ...validEndDepthJob(),
        result: validResult(),
      }),
    ).toThrow(/Job result operatorId must match job operatorId generate-end-depth/);
  });
});

function validCreateRequest() {
  return {
    version: 1,
    operatorId: "generate-start-depth",
    input: {
      imageDataUrl: PNG_DATA_URL,
      prompt: "Generate a clean fulldome depth map.",
      ratio: "2048:2048",
      outputCount: 1,
    },
  } as const;
}

function validEndDepthCreateRequest() {
  return {
    version: 1,
    operatorId: "generate-end-depth",
    input: {
      imageDataUrl: PNG_DATA_URL,
      prompt: "Generate a clean end-state depth map.",
      ratio: "2048:2048",
      outputCount: 1,
    },
  } as const;
}

function validJob() {
  return {
    version: 1,
    id: "job_test_001",
    projectId: "project_local",
    operatorId: "generate-start-depth",
    status: "running",
    stage: "Queued",
    progress: 0.42,
    inputArtifactIds: ["start-state"],
    outputArtifactIds: ["start-depth"],
    createdAt: "2026-06-20T20:00:00.000Z",
    startedAt: "2026-06-20T20:00:01.000Z",
  } as const;
}

function validEndDepthJob() {
  return {
    version: 1,
    id: "job_test_002",
    projectId: "project_local",
    operatorId: "generate-end-depth",
    status: "running",
    stage: "Queued",
    progress: 0.42,
    inputArtifactIds: ["end-state"],
    outputArtifactIds: ["end-depth"],
    createdAt: "2026-06-20T20:00:00.000Z",
    startedAt: "2026-06-20T20:00:01.000Z",
  } as const;
}

function validProgressEvent() {
  return {
    version: 1,
    id: "job_test_001-event-3",
    jobId: "job_test_001",
    sequence: 3,
    type: "progress",
    status: "running",
    stage: "Uploading",
    progress: 0.35,
    createdAt: "2026-06-20T20:00:02.000Z",
    provider: "runway",
    providerTaskId: "task_123",
  } as const;
}

function validCompleteEvent() {
  return {
    version: 1,
    id: "job_test_001-event-4",
    jobId: "job_test_001",
    sequence: 4,
    type: "complete",
    status: "succeeded",
    stage: "Complete",
    progress: 1,
    createdAt: "2026-06-20T20:00:03.000Z",
    result: validResult(),
  } as const;
}

function validResult() {
  return {
    resultType: "runway-stream-result",
    operatorId: "generate-start-depth",
    outputArtifactId: "start-depth",
    id: "task_123",
    status: "SUCCEEDED",
    model: "gemini_image3_pro",
    ratio: "2048:2048",
    outputs: [
      {
        kind: "image",
        dataUri: PNG_DATA_URL,
        contentType: "image/png",
        name: "start-depth.png",
      },
    ],
  } as const;
}

function validEndDepthResult() {
  return {
    resultType: "runway-stream-result",
    operatorId: "generate-end-depth",
    outputArtifactId: "end-depth",
    id: "task_456",
    status: "SUCCEEDED",
    model: "gemini_image3_pro",
    ratio: "2048:2048",
    outputs: [
      {
        kind: "image",
        dataUri: PNG_DATA_URL,
        contentType: "image/png",
        name: "end-depth.png",
      },
    ],
  } as const;
}

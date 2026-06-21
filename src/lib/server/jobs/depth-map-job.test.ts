import { describe, expect, test, vi } from "vitest";
import { readProgressStream } from "../../../runway/progress-stream.js";
import { httpError } from "$lib/server/runway/errors";
import { createInMemoryJobStore, type InMemoryJobStore } from "./in-memory-job-store.js";
import { jobEventStreamResponse } from "./job-event-stream.js";
import {
  createDepthMapCompatibilityStreamResponse,
  createProjectJobResponse,
  type RunDepthMapJob,
} from "./depth-map-job.js";

const PNG_DATA_URL = "data:image/png;base64,AAAA";

describe("depth map job runner", () => {
  test("creates first-class generate-start-depth jobs with an injected runner", async () => {
    const store = createTestStore();
    const runDepthMap = vi.fn<RunDepthMapJob>(async (payload, onProgress) => {
      onProgress({ type: "progress", stage: "Validating", progress: 0.03 });
      expect(payload).toMatchObject({
        imageDataUrl: PNG_DATA_URL,
        prompt: "Generate a clean depth map.",
        ratio: "2048:2048",
        outputCount: 1,
      });
      return runwayResult();
    });

    const response = await createProjectJobResponse(
      jsonRequest(validCreateRequest()),
      "project_local",
      { store, runDepthMap },
    );

    expect(response.status).toBe(202);
    const job = await response.json();
    expect(job).toMatchObject({
      id: "job_1",
      projectId: "project_local",
      operatorId: "generate-start-depth",
      status: "queued",
    });

    await waitFor(() => store.getJob("job_1")?.status === "succeeded");

    expect(runDepthMap).toHaveBeenCalledTimes(1);
    expect(store.getJob("job_1")).toMatchObject({
      status: "succeeded",
      result: {
        resultType: "runway-stream-result",
        outputArtifactId: "start-depth",
        outputs: [{ dataUri: PNG_DATA_URL, contentType: "image/png" }],
      },
    });
  });

  test("creates first-class generate-end-depth jobs with end-depth metadata", async () => {
    const store = createTestStore();
    const runDepthMap = vi.fn<RunDepthMapJob>(async (payload, onProgress) => {
      onProgress({ type: "progress", stage: "Generating end depth", progress: 0.5, taskId: "task_end_depth_1" });
      expect(payload).toMatchObject({
        imageDataUrl: PNG_DATA_URL,
        prompt: "Generate a clean end depth map.",
        ratio: "2048:2048",
        outputCount: 1,
      });
      return runwayResult({
        id: "task_end_depth_1",
        outputs: [
          {
            dataUri: PNG_DATA_URL,
            contentType: "image/png",
            name: "end-depth.png",
            objectUrl: "blob:runtime-only",
          },
        ],
      });
    });

    const response = await createProjectJobResponse(
      jsonRequest(validEndDepthCreateRequest()),
      "project_local",
      { store, runDepthMap },
    );

    expect(response.status).toBe(202);
    const job = await response.json();
    expect(job).toMatchObject({
      id: "job_1",
      projectId: "project_local",
      operatorId: "generate-end-depth",
      inputArtifactIds: ["end-state"],
      outputArtifactIds: ["end-depth"],
      status: "queued",
    });

    await waitFor(() => store.getJob("job_1")?.status === "succeeded");

    expect(runDepthMap).toHaveBeenCalledTimes(1);
    expect(store.getJob("job_1")).toMatchObject({
      status: "succeeded",
      result: {
        operatorId: "generate-end-depth",
        outputArtifactId: "end-depth",
        outputs: [{ dataUri: PNG_DATA_URL, contentType: "image/png", name: "end-depth.png" }],
      },
    });
    expect(JSON.stringify(store.getJob("job_1")?.result)).not.toContain("objectUrl");
  });

  test("rejects invalid first-class job payloads before job creation or upstream work", async () => {
    const store = createTestStore();
    const runDepthMap = vi.fn<RunDepthMapJob>();

    const response = await createProjectJobResponse(
      jsonRequest({
        version: 1,
        operatorId: "generate-start-depth",
        input: { prompt: "Missing image" },
      }),
      "project_local",
      { store, runDepthMap },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("imageDataUrl") });
    expect(store.getJob("job_1")).toBeNull();
    expect(runDepthMap).not.toHaveBeenCalled();
  });

  test("rejects unsupported first-class job operators before upstream work", async () => {
    const store = createTestStore();
    const runDepthMap = vi.fn<RunDepthMapJob>();

    const response = await createProjectJobResponse(
      jsonRequest({
        version: 1,
        operatorId: "repair-start-state",
        input: validDepthPayload(),
      }),
      "project_local",
      { store, runDepthMap },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("operatorId") });
    expect(store.getJob("job_1")).toBeNull();
    expect(runDepthMap).not.toHaveBeenCalled();
  });

  test("streams raw first-class job events with replay", async () => {
    const store = createTestStore();
    const runDepthMap = vi.fn<RunDepthMapJob>(async (payload, onProgress) => {
      onProgress({ type: "progress", stage: "Uploading", progress: 0.25, taskId: "task_depth_1" });
      return runwayResult({ id: "task_depth_1" });
    });

    await createProjectJobResponse(jsonRequest(validCreateRequest()), "project_local", { store, runDepthMap });
    await waitFor(() => store.getJob("job_1")?.status === "succeeded");

    const response = jobEventStreamResponse("job_1", { store });
    expect(response?.headers.get("content-type")).toContain("application/x-ndjson");
    const events = await ndjson(response as Response);

    expect(events.map((event) => event.type)).toEqual(["queued", "started", "progress", "complete"]);
    expect(events[2]).toMatchObject({
      jobId: "job_1",
      providerTaskId: "task_depth_1",
      stage: "Uploading",
    });
    expect(events[3]).toMatchObject({
      status: "succeeded",
      result: { outputArtifactId: "start-depth" },
    });
  });

  test("keeps the existing depth-map stream shape over a job-backed runner", async () => {
    const store = createTestStore();
    const runDepthMap = vi.fn<RunDepthMapJob>(async (_payload, onProgress) => {
      onProgress({ type: "progress", stage: "Validating", progress: 0.03 });
      onProgress({ type: "progress", stage: "Queued", progress: 0.42, taskId: "task_depth_1" });
      return runwayResult({ id: "task_depth_1" });
    });
    const progress: Array<[string, number]> = [];

    const response = await createDepthMapCompatibilityStreamResponse(
      jsonRequest(validDepthPayload()),
      { store, runDepthMap },
    );

    const result = await readProgressStream(response, {
      onProgress: (stage, value) => progress.push([stage, value]),
    });

    expect(runDepthMap).toHaveBeenCalledTimes(1);
    expect(progress).toEqual([
      ["Validating", 0.03],
      ["Queued", 0.42],
      ["Complete", 1],
    ]);
    expect(result).toMatchObject({
      id: "task_depth_1",
      model: "gemini_image3_pro",
      outputs: [{ dataUri: PNG_DATA_URL, contentType: "image/png" }],
    });
    expect(store.getJob("job_1")).toMatchObject({ status: "succeeded" });
  });

  test("streams compatibility errors without paid calls", async () => {
    const store = createTestStore();
    const runDepthMap = vi.fn<RunDepthMapJob>(async () => {
      throw httpError(502, "Runway task failed.");
    });

    const response = await createDepthMapCompatibilityStreamResponse(
      jsonRequest(validDepthPayload()),
      { store, runDepthMap },
    );

    await expect(
      readProgressStream(response, {
        errorPrefix: "Runway depth request failed",
      }),
    ).rejects.toThrow("Runway task failed.");
    expect(store.getJob("job_1")).toMatchObject({
      status: "failed",
      error: { status: 502, message: "Runway task failed." },
    });
  });

  test("streams compatibility errors for successful runners with no portable outputs", async () => {
    const store = createTestStore();
    const runDepthMap = vi.fn<RunDepthMapJob>(async () => ({
      id: "task_depth_empty",
      status: "SUCCEEDED",
      model: "gemini_image3_pro",
      outputs: [],
    }));

    const response = await createDepthMapCompatibilityStreamResponse(
      jsonRequest(validDepthPayload()),
      { store, runDepthMap },
    );

    await expect(
      readProgressStream(response, {
        errorPrefix: "Runway depth request failed",
      }),
    ).rejects.toThrow("Job result requires at least one output.");
    expect(store.getJob("job_1")).toMatchObject({
      status: "failed",
      error: { status: 400, code: "invalid_input", message: expect.stringContaining("requires at least one output") },
    });
    expect(store.getEvents("job_1")?.map((event) => event.type)).toEqual(["queued", "started", "error"]);
  });

  test("rejects invalid compatibility stream payloads before job creation or upstream work", async () => {
    const store = createTestStore();
    const runDepthMap = vi.fn<RunDepthMapJob>();

    const response = await createDepthMapCompatibilityStreamResponse(
      jsonRequest({ prompt: "Missing image" }),
      { store, runDepthMap },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("Runway depth map") });
    expect(store.getJob("job_1")).toBeNull();
    expect(runDepthMap).not.toHaveBeenCalled();
  });

  test("cancels job-backed compatibility streams when the response stream is cancelled", async () => {
    const store = createTestStore();
    let runnerSignal: AbortSignal | undefined;
    let resolveSignalReady: () => void = () => {};
    const signalReady = new Promise<void>((resolve) => {
      resolveSignalReady = resolve;
    });
    const runDepthMap = vi.fn<RunDepthMapJob>(
      (_payload, _onProgress, options) =>
        new Promise((_resolve, reject) => {
          runnerSignal = options.signal;
          resolveSignalReady();
          options.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
        }),
    );

    const response = await createDepthMapCompatibilityStreamResponse(
      jsonRequest(validDepthPayload()),
      { store, runDepthMap },
    );

    await signalReady;
    await response.body?.cancel("client disconnected");
    await waitFor(() => store.getJob("job_1")?.status === "cancelled");

    expect(runnerSignal?.aborted).toBe(true);
    expect(store.getJob("job_1")).toMatchObject({
      status: "cancelled",
      error: { status: 499, code: "cancelled" },
    });
  });

  test("cancels job-backed compatibility streams when the request signal aborts", async () => {
    const store = createTestStore();
    const requestAbort = new AbortController();
    let runnerSignal: AbortSignal | undefined;
    let resolveSignalReady: () => void = () => {};
    const signalReady = new Promise<void>((resolve) => {
      resolveSignalReady = resolve;
    });
    const runDepthMap = vi.fn<RunDepthMapJob>(
      (_payload, _onProgress, options) =>
        new Promise((_resolve, reject) => {
          runnerSignal = options.signal;
          resolveSignalReady();
          options.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
        }),
    );

    const response = await createDepthMapCompatibilityStreamResponse(
      jsonRequest(validDepthPayload(), requestAbort.signal),
      { store, runDepthMap },
    );

    await signalReady;
    requestAbort.abort(httpError(499, "Browser aborted depth request."));
    await waitFor(() => store.getJob("job_1")?.status === "cancelled");

    expect(runnerSignal?.aborted).toBe(true);
    expect(store.getJob("job_1")).toMatchObject({
      status: "cancelled",
      error: { status: 499, code: "cancelled", message: "Browser aborted depth request." },
    });
    await expect(response.text()).resolves.toBe("");
  });
});

function createTestStore(): InMemoryJobStore {
  let id = 0;
  let timestamp = 0;
  return createInMemoryJobStore({
    idFactory: () => `job_${++id}`,
    now: () => `2026-06-20T20:10:${String(timestamp++).padStart(2, "0")}.000Z`,
  });
}

function validCreateRequest() {
  return {
    version: 1,
    operatorId: "generate-start-depth",
    input: validDepthPayload(),
  };
}

function validEndDepthCreateRequest() {
  return {
    version: 1,
    operatorId: "generate-end-depth",
    input: {
      imageDataUrl: PNG_DATA_URL,
      prompt: "Generate a clean end depth map.",
      ratio: "2048:2048",
      outputCount: 1,
    },
  };
}

function validDepthPayload() {
  return {
    imageDataUrl: PNG_DATA_URL,
    prompt: "Generate a clean depth map.",
    ratio: "2048:2048",
    outputCount: 1,
  };
}

function runwayResult(overrides: Record<string, unknown> = {}) {
  return {
    id: "task_depth_1",
    status: "SUCCEEDED",
    model: "gemini_image3_pro",
    ratio: "2048:2048",
    outputs: [
      {
        dataUri: PNG_DATA_URL,
        contentType: "image/png",
        name: "start-depth.png",
      },
    ],
    ...overrides,
  };
}

function jsonRequest(body: unknown, signal?: AbortSignal): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

async function ndjson(response: Response): Promise<Record<string, unknown>[]> {
  const text = await response.text();
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

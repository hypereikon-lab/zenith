import { describe, expect, test } from "vitest";
import { httpError } from "$lib/server/runway/errors";
import { createInMemoryJobStore, type JobRunner } from "./in-memory-job-store.js";
import type { JobResultV1 } from "$lib/shared/contracts/jobs";

describe("in-memory job store", () => {
  test("creates queued jobs and starts them with ordered events", async () => {
    const store = createTestStore();
    const job = store.createJob({ projectId: "project_local", operatorId: "generate-start-depth" });

    expect(job).toMatchObject({
      id: "job_1",
      projectId: "project_local",
      operatorId: "generate-start-depth",
      status: "queued",
      stage: "Queued",
      progress: 0,
      inputArtifactIds: ["start-state"],
      outputArtifactIds: ["start-depth"],
    });
    expect(store.getEvents("job_1")?.map((event) => event.type)).toEqual(["queued"]);

    await store.runJob("job_1", async (onProgress) => {
      onProgress({ stage: "Uploading", progress: 0.25, taskId: "task_1" });
      onProgress({ stage: "Queued", progress: 1.4, taskStatus: "PENDING" });
      return resultFixture();
    });

    expect(store.getJob("job_1")).toMatchObject({
      status: "succeeded",
      stage: "Complete",
      progress: 1,
      result: resultFixture(),
    });
    expect(store.getEvents("job_1")?.map((event) => [event.sequence, event.type, event.stage])).toEqual([
      [1, "queued", "Queued"],
      [2, "started", "Starting"],
      [3, "progress", "Uploading"],
      [4, "progress", "Queued"],
      [5, "complete", "Complete"],
    ]);
    expect(store.getEvents("job_1")?.[3]).toMatchObject({
      progress: 1,
      providerTaskStatus: "PENDING",
    });
  });

  test("creates end-depth jobs with operator-specific artifact metadata", async () => {
    const store = createTestStore();
    const job = store.createJob({ projectId: "project_local", operatorId: "generate-end-depth" });

    expect(job).toMatchObject({
      id: "job_1",
      projectId: "project_local",
      operatorId: "generate-end-depth",
      inputArtifactIds: ["end-state"],
      outputArtifactIds: ["end-depth"],
    });

    await store.runJob("job_1", async (onProgress) => {
      onProgress({ stage: "Generating end depth", progress: 0.5 });
      return endDepthResultFixture();
    });

    expect(store.getJob("job_1")).toMatchObject({
      status: "succeeded",
      result: {
        operatorId: "generate-end-depth",
        outputArtifactId: "end-depth",
      },
    });
    expect(store.getEvents("job_1")?.map((event) => event.type)).toEqual([
      "queued",
      "started",
      "progress",
      "complete",
    ]);
  });

  test("fails jobs whose completion result metadata does not match the operator", async () => {
    const store = createTestStore();
    store.createJob({ projectId: "project_local", operatorId: "generate-end-depth" });

    await store.runJob("job_1", async () => resultFixture());

    expect(store.getJob("job_1")).toMatchObject({
      status: "failed",
      error: {
        status: 500,
        code: "upstream_failed",
        message: expect.stringContaining("expected generate-end-depth"),
      },
    });
    expect(store.getEvents("job_1")?.map((event) => event.type)).toEqual(["queued", "started", "error"]);
  });

  test("records failed jobs with public errors and terminal-state guards", async () => {
    const store = createTestStore();
    store.createJob({ projectId: "project_local", operatorId: "generate-start-depth" });

    await store.runJob("job_1", async () => {
      throw httpError(502, "Runway task failed.");
    });

    expect(store.getJob("job_1")).toMatchObject({
      status: "failed",
      stage: "Failed",
      progress: 1,
      error: {
        message: "Runway task failed.",
        status: 502,
        code: "upstream_failed",
      },
    });
    expect(store.getEvents("job_1")?.map((event) => event.type)).toEqual(["queued", "started", "error"]);

    store.completeJob("job_1", resultFixture());
    store.appendProgress("job_1", { stage: "Too late", progress: 0.5 });

    expect(store.getJob("job_1")?.status).toBe("failed");
    expect(store.getEvents("job_1")?.map((event) => event.type)).toEqual(["queued", "started", "error"]);
  });

  test("cancels running jobs by aborting the private signal", async () => {
    const store = createTestStore();
    store.createJob({ projectId: "project_local", operatorId: "generate-start-depth" });

    let runnerSignal: AbortSignal | undefined;
    let resolveSignalReady: () => void = () => {};
    const signalReady = new Promise<void>((resolve) => {
      resolveSignalReady = resolve;
    });
    const runner: JobRunner = (_onProgress, options) =>
      new Promise((_resolve, reject) => {
        runnerSignal = options.signal;
        resolveSignalReady();
        options.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
      });

    const promise = store.runJob("job_1", runner);
    await signalReady;

    const cancelled = store.cancelJob("job_1", httpError(499, "Response stream was cancelled."));
    await promise;

    expect(runnerSignal?.aborted).toBe(true);
    expect(cancelled).toMatchObject({
      status: "cancelled",
      progress: 1,
      error: {
        status: 499,
        code: "cancelled",
        message: "Response stream was cancelled.",
      },
    });
    expect(store.getEvents("job_1")?.map((event) => event.type)).toEqual(["queued", "started", "cancelled"]);
    expect(store.getSignal("job_1")?.aborted).toBe(true);
  });

  test("replays events to subscribers and returns null for unknown jobs", async () => {
    const store = createTestStore();
    store.createJob({ projectId: "project_local", operatorId: "generate-start-depth" });
    await store.runJob("job_1", async (onProgress) => {
      onProgress({ stage: "Downloading", progress: 0.9 });
      return resultFixture();
    });

    const seen: string[] = [];
    const unsubscribe = store.subscribeEvents(
      "job_1",
      (event) => {
        seen.push(event.type);
      },
      { replay: true },
    );

    expect(seen).toEqual(["queued", "started", "progress", "complete"]);
    unsubscribe?.();
    expect(store.getJob("missing")).toBeNull();
    expect(store.getEvents("missing")).toBeNull();
    expect(store.subscribeEvents("missing", () => undefined)).toBeNull();
  });
});

function createTestStore() {
  let id = 0;
  let timestamp = 0;
  return createInMemoryJobStore({
    idFactory: () => `job_${++id}`,
    now: () => `2026-06-20T20:00:0${timestamp++}.000Z`,
  });
}

function resultFixture(): JobResultV1 {
  return {
    resultType: "runway-stream-result",
    operatorId: "generate-start-depth",
    outputArtifactId: "start-depth",
    id: "task_1",
    status: "SUCCEEDED",
    model: "gemini_image3_pro",
    ratio: "2048:2048",
    outputs: [
      {
        kind: "image",
        dataUri: "data:image/png;base64,AAAA",
        contentType: "image/png",
        name: "start-depth.png",
      },
    ],
  };
}

function endDepthResultFixture(): JobResultV1 {
  return {
    resultType: "runway-stream-result",
    operatorId: "generate-end-depth",
    outputArtifactId: "end-depth",
    id: "task_2",
    status: "SUCCEEDED",
    model: "gemini_image3_pro",
    ratio: "2048:2048",
    outputs: [
      {
        kind: "image",
        dataUri: "data:image/png;base64,BBBB",
        contentType: "image/png",
        name: "end-depth.png",
      },
    ],
  };
}

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { requestRunwayDepthMap } from "$lib/server/runway/runway-jobs";
import { serverJobStore } from "$lib/server/jobs/in-memory-job-store";
import { DELETE as cancelJobRoute } from "./[jobId]/+server.js";
import { GET as getJobEventsRoute } from "./[jobId]/events/+server.js";
import { POST as createJobRoute } from "../projects/[projectId]/jobs/+server.js";

vi.mock("$lib/server/runway/runway-jobs", () => ({
  requestRunwayDepthMap: vi.fn(),
}));

const PNG_DATA_URL = "data:image/png;base64,AAAA";

describe("job API routes", () => {
  beforeEach(() => {
    vi.mocked(requestRunwayDepthMap).mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("Unexpected network request in job route tests."))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("creates a depth job and replays first-class job events", async () => {
    vi.mocked(requestRunwayDepthMap).mockImplementationOnce(async (_payload, onProgress) => {
      onProgress({ type: "progress", stage: "Uploading", progress: 0.25, taskId: "task_route_1" });
      return runwayResult();
    });

    const createResponse = await createJobRoute(
      routeEvent<typeof createJobRoute>({
        params: { projectId: "project_route_valid" },
        request: jsonRequest(validCreateRequest()),
      }),
    );

    expect(createResponse.status).toBe(202);
    const job = await createResponse.json();
    expect(job).toMatchObject({
      projectId: "project_route_valid",
      operatorId: "generate-start-depth",
      status: "queued",
      inputArtifactIds: ["start-state"],
      outputArtifactIds: ["start-depth"],
    });

    await waitFor(() => serverJobStore.getJob(job.id)?.status === "succeeded");

    const eventsResponse = await getJobEventsRoute(
      routeEvent<typeof getJobEventsRoute>({
        params: { jobId: job.id },
        request: new Request(`http://localhost/api/jobs/${job.id}/events`),
      }),
    );
    const events = await ndjson(eventsResponse);
    const completeEvent = events.at(-1);

    expect(eventsResponse.status).toBe(200);
    expect(eventsResponse.headers.get("content-type")).toContain("application/x-ndjson");
    expect(events.map((event) => event.type)).toEqual(["queued", "started", "progress", "complete"]);
    expect(events.every((event) => event.jobId === job.id)).toBe(true);
    expect(events[2]).toMatchObject({
      type: "progress",
      providerTaskId: "task_route_1",
      stage: "Uploading",
    });
    expect(completeEvent).toMatchObject({
      type: "complete",
      result: {
        outputArtifactId: "start-depth",
        outputs: [{ dataUri: PNG_DATA_URL, contentType: "image/png", name: "start-depth.png" }],
      },
    });
    expect(JSON.stringify(completeEvent)).not.toContain("objectUrl");
    expect(JSON.stringify(completeEvent)).not.toContain("debugCanvas");
    expect(JSON.stringify(completeEvent)).not.toContain("controller");
    expect(JSON.stringify(completeEvent)).not.toContain("signal");
    expect(requestRunwayDepthMap).toHaveBeenCalledTimes(1);
  });

  test("creates an end-depth job through the same route boundary", async () => {
    vi.mocked(requestRunwayDepthMap).mockImplementationOnce(async (payload, onProgress) => {
      onProgress({ type: "progress", stage: "Generating end depth", progress: 0.35, taskId: "task_route_end_1" });
      expect(payload).toMatchObject({
        imageDataUrl: PNG_DATA_URL,
        prompt: "Generate a clean route-level end depth map.",
        ratio: "2048:2048",
        outputCount: 1,
      });
      return runwayResult({
        id: "task_route_end_1",
        outputs: [
          {
            url: "https://example.invalid/end-depth.png",
            dataUri: PNG_DATA_URL,
            contentType: "image/png",
            name: "end-depth.png",
          },
        ],
      });
    });

    const createResponse = await createJobRoute(
      routeEvent<typeof createJobRoute>({
        params: { projectId: "project_route_end_depth" },
        request: jsonRequest(validEndDepthCreateRequest()),
      }),
    );

    expect(createResponse.status).toBe(202);
    const job = await createResponse.json();
    expect(job).toMatchObject({
      projectId: "project_route_end_depth",
      operatorId: "generate-end-depth",
      inputArtifactIds: ["end-state"],
      outputArtifactIds: ["end-depth"],
      status: "queued",
    });

    await waitFor(() => serverJobStore.getJob(job.id)?.status === "succeeded");

    const eventsResponse = await getJobEventsRoute(
      routeEvent<typeof getJobEventsRoute>({
        params: { jobId: job.id },
        request: new Request(`http://localhost/api/jobs/${job.id}/events`),
      }),
    );
    const events = await ndjson(eventsResponse);

    expect(events.map((event) => event.type)).toEqual(["queued", "started", "progress", "complete"]);
    expect(events[3]).toMatchObject({
      type: "complete",
      result: {
        operatorId: "generate-end-depth",
        outputArtifactId: "end-depth",
        outputs: [{ dataUri: PNG_DATA_URL, contentType: "image/png", name: "end-depth.png" }],
      },
    });
    expect(requestRunwayDepthMap).toHaveBeenCalledTimes(1);
  });

  test("rejects invalid create requests before the paid runner", async () => {
    const response = await createJobRoute(
      routeEvent<typeof createJobRoute>({
        params: { projectId: "project_route_invalid" },
        request: jsonRequest({
          version: 1,
          operatorId: "generate-start-depth",
          input: { prompt: "Missing image" },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("imageDataUrl") });
    expect(requestRunwayDepthMap).not.toHaveBeenCalled();
  });

  test("rejects unsupported operators before the paid runner", async () => {
    const response = await createJobRoute(
      routeEvent<typeof createJobRoute>({
        params: { projectId: "project_route_unsupported" },
        request: jsonRequest({
          version: 1,
          operatorId: "repair-start-state",
          input: {
            imageDataUrl: PNG_DATA_URL,
            prompt: "Repair this plate sketch.",
            ratio: "1920:1920",
            outputCount: 1,
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("operatorId") });
    expect(requestRunwayDepthMap).not.toHaveBeenCalled();
  });

  test("returns 404 for unknown event streams and cancels", async () => {
    const missingJobId = "job_route_missing_404";

    const eventsResponse = await getJobEventsRoute(
      routeEvent<typeof getJobEventsRoute>({
        params: { jobId: missingJobId },
        request: new Request(`http://localhost/api/jobs/${missingJobId}/events`),
      }),
    );
    const cancelResponse = await cancelJobRoute(
      routeEvent<typeof cancelJobRoute>({
        params: { jobId: missingJobId },
        request: new Request(`http://localhost/api/jobs/${missingJobId}`, { method: "DELETE" }),
      }),
    );

    expect(eventsResponse.status).toBe(404);
    expect(await eventsResponse.json()).toEqual({ error: `Job ${missingJobId} was not found.` });
    expect(cancelResponse.status).toBe(404);
    expect(await cancelResponse.json()).toEqual({ error: `Job ${missingJobId} was not found.` });
    expect(requestRunwayDepthMap).not.toHaveBeenCalled();
  });

  test("cancels a running route-created job and aborts the runner signal", async () => {
    let runnerSignal: AbortSignal | undefined;
    let resolveSignalReady: () => void = () => {};
    const signalReady = new Promise<void>((resolve) => {
      resolveSignalReady = resolve;
    });

    vi.mocked(requestRunwayDepthMap).mockImplementationOnce(
      (_payload, _onProgress, options) =>
        new Promise((_resolve, reject) => {
          runnerSignal = options.signal;
          resolveSignalReady();
          options.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
        }),
    );

    const createResponse = await createJobRoute(
      routeEvent<typeof createJobRoute>({
        params: { projectId: "project_route_cancel_end" },
        request: jsonRequest(validEndDepthCreateRequest()),
      }),
    );
    expect(createResponse.status).toBe(202);
    const job = await createResponse.json();

    await withTimeout(signalReady, "Timed out waiting for the route-created runner signal.");

    const cancelResponse = await cancelJobRoute(
      routeEvent<typeof cancelJobRoute>({
        params: { jobId: job.id },
        request: new Request(`http://localhost/api/jobs/${job.id}`, { method: "DELETE" }),
      }),
    );
    const cancelled = await cancelResponse.json();

    expect(cancelResponse.status).toBe(200);
    expect(cancelled).toMatchObject({
      id: job.id,
      status: "cancelled",
      progress: 1,
      error: {
        status: 499,
        code: "cancelled",
      },
    });
    expect(runnerSignal?.aborted).toBe(true);
    await waitFor(() => serverJobStore.getJob(job.id)?.status === "cancelled");
    expect(requestRunwayDepthMap).toHaveBeenCalledTimes(1);
  });
});

function validCreateRequest() {
  return {
    version: 1,
    operatorId: "generate-start-depth",
    input: {
      imageDataUrl: PNG_DATA_URL,
      prompt: "Generate a clean route-level depth map.",
      ratio: "2048:2048",
      outputCount: 1,
    },
  };
}

function validEndDepthCreateRequest() {
  return {
    version: 1,
    operatorId: "generate-end-depth",
    input: {
      imageDataUrl: PNG_DATA_URL,
      prompt: "Generate a clean route-level end depth map.",
      ratio: "2048:2048",
      outputCount: 1,
    },
  };
}

function runwayResult(overrides: Record<string, unknown> = {}) {
  return {
    id: "task_route_1",
    status: "SUCCEEDED",
    model: "gemini_image3_pro",
    ratio: "2048:2048",
    debugCanvas: { runtimeOnly: true },
    controller: { runtimeOnly: true },
    outputs: [
      {
        url: "https://example.invalid/start-depth.png",
        dataUri: PNG_DATA_URL,
        contentType: "image/png",
        name: "start-depth.png",
        objectUrl: "blob:runtime-only",
      },
    ],
    ...overrides,
  };
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/projects/project/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function routeEvent<T extends (event: never) => unknown>(event: Partial<Parameters<T>[0]>): Parameters<T>[0] {
  return event as Parameters<T>[0];
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

function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs = 1000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

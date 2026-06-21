import { json } from "@sveltejs/kit";
import {
  jobArtifactsForOperator,
  parseCreateJobRequest,
  parseJobResult,
  type CreateJobRequestV1,
  type JobOperatorIdV1,
  type JobV1,
} from "$lib/shared/contracts/jobs";
import { errorMessage, errorStatus } from "$lib/server/runway/errors";
import { readJsonPayload } from "$lib/server/runway/route-response";
import { requestRunwayDepthMap } from "$lib/server/runway/runway-jobs";
import { validateRunwayDepthMapPayload } from "$lib/server/runway/schemas";
import type { ApiPayload, JobOptions, ProgressEvent, ProgressWriter } from "$lib/server/runway/types";
import { jobEventStreamResponse } from "./job-event-stream";
import { serverJobStore, type InMemoryJobStore } from "./in-memory-job-store";

export type RunDepthMapJob = (
  payload: ApiPayload,
  onProgress: ProgressWriter,
  options: JobOptions,
) => Promise<unknown>;

type DepthMapJobDependencies = {
  store?: InMemoryJobStore;
  runDepthMap?: RunDepthMapJob;
};

type DepthMapJobOperatorId = Extract<JobOperatorIdV1, "generate-start-depth" | "generate-end-depth">;

type DepthMapJobInput = {
  projectId: string;
  operatorId?: DepthMapJobOperatorId;
  input: ApiPayload;
} & DepthMapJobDependencies;

export function startGenerateDepthJob({
  projectId,
  operatorId = "generate-start-depth",
  input,
  store = serverJobStore,
  runDepthMap = requestRunwayDepthMap,
}: DepthMapJobInput): JobV1 {
  const payload = validateRunwayDepthMapPayload(input);
  const job = store.createJob({ projectId, operatorId });
  void store.runJob(job.id, async (onProgress, options) => {
    const result = await runDepthMap(payload, (event) => onProgress(progressFromRunway(event)), options);
    return runwayDepthMapResultToJobResult(result, operatorId);
  });
  return job;
}

export function startGenerateStartDepthJob(input: Omit<DepthMapJobInput, "operatorId">): JobV1 {
  return startGenerateDepthJob({ ...input, operatorId: "generate-start-depth" });
}

export function startGenerateDepthJobFromRequest(
  projectId: string,
  payload: unknown,
  dependencies: DepthMapJobDependencies = {},
): JobV1 {
  const request = parseCreateJobRequest(payload);
  return startGenerateDepthJob({
    projectId,
    operatorId: request.operatorId,
    input: jobRequestToDepthPayload(request),
    ...dependencies,
  });
}

export async function createProjectJobResponse(
  request: Request,
  projectId: string,
  dependencies: DepthMapJobDependencies = {},
): Promise<Response> {
  try {
    const payload = await readJsonPayload(request);
    const job = startGenerateDepthJobFromRequest(projectId, payload, dependencies);
    return json(job, { status: 202 });
  } catch (error) {
    return json({ error: errorMessage(error) }, { status: errorStatus(error) });
  }
}

export async function createDepthMapCompatibilityStreamResponse(
  request: Request,
  dependencies: DepthMapJobDependencies = {},
): Promise<Response> {
  const store = dependencies.store || serverJobStore;
  try {
    const payload = await readJsonPayload(request);
    const job = startGenerateStartDepthJob({
      projectId: "local",
      input: payload,
      ...dependencies,
      store,
    });
    const response = jobEventStreamResponse(job.id, {
      store,
      signal: request.signal,
      compatibility: true,
      cancelJobOnClose: true,
    });
    if (!response) {
      return json({ error: `Job ${job.id} was not found.` }, { status: 404 });
    }
    return response;
  } catch (error) {
    return json({ error: errorMessage(error) }, { status: errorStatus(error) });
  }
}

function jobRequestToDepthPayload(request: CreateJobRequestV1): ApiPayload {
  return {
    imageDataUrl: request.input.imageDataUrl,
    prompt: request.input.prompt,
    ratio: request.input.ratio,
    outputCount: request.input.outputCount,
  };
}

function progressFromRunway(event: ProgressEvent) {
  return {
    stage: event.stage,
    progress: typeof event.progress === "number" ? event.progress : null,
    taskId: event.taskId,
    taskStatus: event.taskStatus,
  };
}

function runwayDepthMapResultToJobResult(result: unknown, operatorId: DepthMapJobOperatorId) {
  const record = isRecord(result) ? result : {};
  const outputs = Array.isArray(record.outputs)
    ? record.outputs
        .filter(isRecord)
        .map((output) => ({
          kind: "image" as const,
          dataUri: typeof output.dataUri === "string" ? output.dataUri : undefined,
          url: typeof output.url === "string" ? output.url : undefined,
          contentType: typeof output.contentType === "string" ? output.contentType : undefined,
          name: typeof output.name === "string" ? output.name : undefined,
        }))
        .filter((output) => output.dataUri || output.url)
    : [];

  return parseJobResult({
    resultType: "runway-stream-result",
    operatorId,
    outputArtifactId: jobArtifactsForOperator(operatorId).outputArtifactId,
    id: typeof record.id === "string" ? record.id : undefined,
    status: typeof record.status === "string" ? record.status : undefined,
    model: typeof record.model === "string" ? record.model : undefined,
    ratio: typeof record.ratio === "string" ? record.ratio : undefined,
    outputs,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

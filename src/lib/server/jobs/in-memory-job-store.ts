import {
  JOB_CONTRACT_VERSION,
  jobArtifactsForOperator,
  parseJob,
  parseJobEvent,
  parseJobResult,
  type JobEventV1,
  type JobEventTypeV1,
  type JobOperatorIdV1,
  type JobResultV1,
  type JobStatusV1,
  type JobV1,
  type PublicJobErrorV1,
} from "$lib/shared/contracts/jobs";
import { errorMessage, errorStatus, httpError } from "$lib/server/runway/errors";

export type JobProgressInput = {
  stage?: string;
  progress?: number | null;
  taskId?: unknown;
  taskStatus?: unknown;
};

export type JobRunner = (
  onProgress: (event: JobProgressInput) => void,
  options: { signal?: AbortSignal },
) => Promise<JobResultV1>;

export type InMemoryJobStore = ReturnType<typeof createInMemoryJobStore>;

type RuntimeJob = JobV1 & {
  controller: AbortController;
  events: JobEventV1[];
  listeners: Set<(event: JobEventV1) => void>;
  sequence: number;
  promise?: Promise<void>;
};

type CreateJobInput = {
  projectId: string;
  operatorId: JobOperatorIdV1;
};

type RuntimeJobEventInput = {
  type: JobEventTypeV1;
  status: JobStatusV1;
  stage: string;
  progress: number;
  provider?: "runway";
  providerTaskId?: string;
  providerTaskStatus?: string;
  result?: JobResultV1;
  error?: PublicJobErrorV1;
};

type StoreOptions = {
  idFactory?: () => string;
  now?: () => string;
  maxJobs?: number;
};

const DEFAULT_MAX_JOBS = 50;

export function createInMemoryJobStore({
  idFactory = randomJobId,
  now = () => new Date().toISOString(),
  maxJobs = DEFAULT_MAX_JOBS,
}: StoreOptions = {}) {
  const jobs = new Map<string, RuntimeJob>();

  function createJob({ projectId, operatorId }: CreateJobInput): JobV1 {
    const artifacts = jobArtifactsForOperator(operatorId);
    const job: RuntimeJob = {
      version: JOB_CONTRACT_VERSION,
      id: idFactory(),
      projectId,
      operatorId,
      status: "queued",
      stage: "Queued",
      progress: 0,
      inputArtifactIds: artifacts.inputArtifactIds,
      outputArtifactIds: artifacts.outputArtifactIds,
      createdAt: now(),
      controller: new AbortController(),
      events: [],
      listeners: new Set(),
      sequence: 0,
    };
    jobs.set(job.id, job);
    appendEvent(job, {
      type: "queued",
      status: "queued",
      stage: "Queued",
      progress: 0,
    });
    pruneTerminalJobs();
    return publicJob(job);
  }

  function runJob(jobId: string, runner: JobRunner): Promise<void> {
    const job = requireJob(jobId);
    if (job.status !== "queued") {
      throw httpError(409, `Job ${jobId} is already ${job.status}.`);
    }

    job.status = "running";
    job.stage = "Starting";
    job.progress = 0.01;
    job.startedAt = now();
    appendEvent(job, {
      type: "started",
      status: "running",
      stage: job.stage,
      progress: job.progress,
    });

    const promise = Promise.resolve()
      .then(() =>
        runner((event) => appendProgress(jobId, event), {
          signal: job.controller.signal,
        }),
      )
      .then((result) => {
        if (isTerminal(job.status)) return;
        completeJob(jobId, result);
      })
      .catch((error) => {
        if (isTerminal(job.status)) return;
        failJob(jobId, error);
      });
    job.promise = promise;
    return promise;
  }

  function appendProgress(jobId: string, event: JobProgressInput): JobV1 | null {
    const job = jobs.get(jobId);
    if (!job || isTerminal(job.status)) return job ? publicJob(job) : null;
    const stage = event.stage || job.stage || "Running";
    const progress = normalizeProgress(event.progress ?? job.progress);
    job.status = "running";
    job.stage = stage;
    job.progress = progress;
    appendEvent(job, {
      type: "progress",
      status: "running",
      stage,
      progress,
      provider: "runway",
      providerTaskId: typeof event.taskId === "string" ? event.taskId : undefined,
      providerTaskStatus: typeof event.taskStatus === "string" ? event.taskStatus : undefined,
    });
    return publicJob(job);
  }

  function completeJob(jobId: string, result: JobResultV1): JobV1 | null {
    const job = jobs.get(jobId);
    if (!job || isTerminal(job.status)) return job ? publicJob(job) : null;
    const parsedResult = parseJobResult(result);
    const expected = jobArtifactsForOperator(job.operatorId);
    if (parsedResult.operatorId !== job.operatorId) {
      throw httpError(500, `Job ${jobId} returned result for ${parsedResult.operatorId}, expected ${job.operatorId}.`);
    }
    if (parsedResult.outputArtifactId !== expected.outputArtifactId) {
      throw httpError(
        500,
        `Job ${jobId} returned ${parsedResult.outputArtifactId}, expected ${expected.outputArtifactId}.`,
      );
    }
    job.status = "succeeded";
    job.stage = "Complete";
    job.progress = 1;
    job.finishedAt = now();
    job.result = parsedResult;
    appendEvent(job, {
      type: "complete",
      status: "succeeded",
      stage: "Complete",
      progress: 1,
      result: parsedResult,
    });
    return publicJob(job);
  }

  function failJob(jobId: string, error: unknown): JobV1 | null {
    const job = jobs.get(jobId);
    if (!job || isTerminal(job.status)) return job ? publicJob(job) : null;
    const publicError = publicJobError(error);
    job.status = "failed";
    job.stage = "Failed";
    job.progress = 1;
    job.finishedAt = now();
    job.error = publicError;
    appendEvent(job, {
      type: "error",
      status: "failed",
      stage: "Failed",
      progress: 1,
      error: publicError,
    });
    return publicJob(job);
  }

  function cancelJob(jobId: string, reason: unknown = httpError(499, "Job was cancelled.")): JobV1 | null {
    const job = jobs.get(jobId);
    if (!job || isTerminal(job.status)) return job ? publicJob(job) : null;
    const publicError = publicJobError(reason, "cancelled");
    job.controller.abort(reason instanceof Error ? reason : httpError(499, "Job was cancelled."));
    job.status = "cancelled";
    job.stage = "Cancelled";
    job.progress = 1;
    job.finishedAt = now();
    job.error = publicError;
    appendEvent(job, {
      type: "cancelled",
      status: "cancelled",
      stage: "Cancelled",
      progress: 1,
      error: publicError,
    });
    return publicJob(job);
  }

  function getJob(jobId: string): JobV1 | null {
    const job = jobs.get(jobId);
    return job ? publicJob(job) : null;
  }

  function getEvents(jobId: string): JobEventV1[] | null {
    const job = jobs.get(jobId);
    return job ? cloneJson(job.events) : null;
  }

  function getSignal(jobId: string): AbortSignal | null {
    return jobs.get(jobId)?.controller.signal ?? null;
  }

  function subscribeEvents(
    jobId: string,
    listener: (event: JobEventV1) => void,
    { replay = false }: { replay?: boolean } = {},
  ): (() => void) | null {
    const job = jobs.get(jobId);
    if (!job) return null;
    job.listeners.add(listener);
    if (replay) {
      for (const event of job.events) {
        listener(cloneJson(event));
      }
    }
    return () => {
      job.listeners.delete(listener);
    };
  }

  function requireJob(jobId: string): RuntimeJob {
    const job = jobs.get(jobId);
    if (!job) throw httpError(404, `Job ${jobId} was not found.`);
    return job;
  }

  function appendEvent(job: RuntimeJob, event: RuntimeJobEventInput): JobEventV1 {
    const fullEvent = parseJobEvent({
      version: JOB_CONTRACT_VERSION,
      id: `${job.id}-event-${job.sequence + 1}`,
      jobId: job.id,
      sequence: job.sequence + 1,
      createdAt: now(),
      ...stripUndefined(event),
    });
    job.sequence = fullEvent.sequence;
    job.events.push(fullEvent);
    for (const listener of job.listeners) {
      listener(cloneJson(fullEvent));
    }
    return fullEvent;
  }

  function pruneTerminalJobs(): void {
    if (jobs.size <= maxJobs) return;
    for (const [jobId, job] of jobs) {
      if (jobs.size <= maxJobs) return;
      if (isTerminal(job.status)) jobs.delete(jobId);
    }
  }

  return {
    createJob,
    runJob,
    appendProgress,
    completeJob,
    failJob,
    cancelJob,
    getJob,
    getEvents,
    getSignal,
    subscribeEvents,
  };
}

export const serverJobStore = createInMemoryJobStore();

export function isTerminalJobStatus(status: JobStatusV1): boolean {
  return isTerminal(status);
}

export function publicJobError(error: unknown, codeOverride?: PublicJobErrorV1["code"]): PublicJobErrorV1 {
  const status = errorStatus(error);
  return {
    message: errorMessage(error),
    status,
    code: codeOverride || codeForStatus(status),
    provider: "zenith",
  };
}

function publicJob(job: RuntimeJob): JobV1 {
  return parseJob(
    stripUndefined({
      version: job.version,
      id: job.id,
      projectId: job.projectId,
      operatorId: job.operatorId,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      inputArtifactIds: job.inputArtifactIds,
      outputArtifactIds: job.outputArtifactIds,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      result: job.result,
      error: job.error,
    }),
  );
}

function randomJobId(): string {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeProgress(value: number | null | undefined): number {
  const progress = Number(value);
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(1, progress));
}

function isTerminal(status: JobStatusV1): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function codeForStatus(status: number): PublicJobErrorV1["code"] {
  if (status === 400) return "invalid_input";
  if (status === 401) return "missing_secret";
  if (status === 499) return "cancelled";
  if (status === 504) return "timeout";
  if (status >= 500) return "upstream_failed";
  return "server_error";
}

function stripUndefined<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => stripUndefined(item)) as T;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .map(([key, entryValue]) => [key, stripUndefined(entryValue)]);
  return Object.fromEntries(entries) as T;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

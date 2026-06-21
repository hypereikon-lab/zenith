import { httpError } from "$lib/server/runway/errors";
import type { InMemoryJobStore } from "./in-memory-job-store";
import { isTerminalJobStatus, serverJobStore } from "./in-memory-job-store";
import type { JobEventV1, JobResultV1 } from "$lib/shared/contracts/jobs";

type JobEventStreamOptions = {
  store?: InMemoryJobStore;
  signal?: AbortSignal;
  compatibility?: boolean;
  cancelJobOnClose?: boolean;
};

type CompatibilityProgressEvent =
  | {
      type: "progress";
      stage: string;
      progress: number;
    }
  | {
      type: "complete";
      stage: "Complete";
      progress: 1;
      result: Record<string, unknown>;
    }
  | {
      type: "error";
      stage: string;
      progress: 1;
      error: string;
      status: number;
    };

export function jobEventStreamResponse(
  jobId: string,
  {
    store = serverJobStore,
    signal,
    compatibility = false,
    cancelJobOnClose = false,
  }: JobEventStreamOptions = {},
): Response | null {
  if (!store.getJob(jobId)) return null;

  const encoder = new TextEncoder();
  let closed = false;
  let unsubscribe: (() => void) | null = null;

  const body = new ReadableStream({
    start(controller) {
      const closeController = () => {
        signal?.removeEventListener("abort", abort);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // The stream may already be closed by the client.
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        closeController();
      };

      const write = (event: JobEventV1) => {
        if (closed) return;
        const payload = compatibility ? compatibilityEvent(event) : event;
        if (!payload) return;
        controller.enqueue(encoder.encode(JSON.stringify(payload) + "\n"));
        if (isTerminalEvent(event)) close();
      };

      const abort = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        if (cancelJobOnClose) {
          store.cancelJob(jobId, signal?.reason || httpError(499, "Request aborted."));
        }
        closeController();
      };

      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener("abort", abort, { once: true });

      let shouldUnsubscribe = false;
      unsubscribe = store.subscribeEvents(
        jobId,
        (event) => {
          write(event);
          if (isTerminalEvent(event)) shouldUnsubscribe = true;
        },
        { replay: true },
      );
      if (!unsubscribe) {
        close();
        return;
      }
      if (shouldUnsubscribe) {
        unsubscribe();
      }
    },
    cancel(reason) {
      closed = true;
      unsubscribe?.();
      if (cancelJobOnClose) {
        store.cancelJob(
          jobId,
          reason instanceof Error ? reason : httpError(499, "Response stream was cancelled."),
        );
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export function compatibilityEvent(event: JobEventV1): CompatibilityProgressEvent | null {
  if (event.type === "complete") {
    return {
      type: "complete",
      stage: "Complete",
      progress: 1,
      result: runwayStreamResult(event.result),
    };
  }
  if (event.type === "error" || event.type === "cancelled") {
    return {
      type: "error",
      stage: event.type === "cancelled" ? "Cancelled" : "Failed",
      progress: 1,
      error: event.error.message,
      status: event.error.status,
    };
  }
  if (event.type === "progress") {
    return {
      type: "progress",
      stage: event.stage,
      progress: event.progress,
    };
  }
  return null;
}

export function runwayStreamResult(result: JobResultV1): Record<string, unknown> {
  return {
    id: result.id,
    status: result.status,
    model: result.model,
    ratio: result.ratio,
    outputs: result.outputs.map((output) => ({
      dataUri: output.dataUri,
      url: output.url,
      contentType: output.contentType,
      name: output.name,
    })),
  };
}

function isTerminalEvent(event: JobEventV1): boolean {
  return isTerminalJobStatus(event.status);
}

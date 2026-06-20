import { Buffer } from "node:buffer";
import { MAX_JSON_BYTES } from "./config";
import type { ApiPayload, JobOptions, ProgressWriter } from "./types";
import { errorMessage, errorStatus, httpError } from "./errors";

export async function readJsonPayload(request: Request): Promise<ApiPayload> {
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_BYTES) {
    throw httpError(413, "Request is too large.");
  }
  return text ? JSON.parse(text) : {};
}

export function streamProgressResponse(
  run: (onProgress: ProgressWriter, options: JobOptions) => Promise<unknown>,
  fallbackError: string,
  signal?: AbortSignal,
): Response {
  const encoder = new TextEncoder();
  let closed = false;
  const body = new ReadableStream({
    async start(controller) {
      const abortController = new AbortController();
      const abort = () => abortController.abort(signal?.reason);
      signal?.addEventListener("abort", abort, { once: true });

      const writeProgress: ProgressWriter = (event) => {
        if (closed) return;
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      try {
        const result = await run(writeProgress, { signal: abortController.signal });
        writeProgress({ type: "complete", stage: "Complete", progress: 1, result });
      } catch (error) {
        if (!closed) {
          writeProgress({
            type: "error",
            stage: "Failed",
            progress: 1,
            error: errorMessage(error) || fallbackError,
            status: errorStatus(error),
          });
        }
      } finally {
        signal?.removeEventListener("abort", abort);
        closed = true;
        try {
          controller.close();
        } catch {
          // The client may already have closed the stream.
        }
      }
    },
    cancel() {
      closed = true;
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

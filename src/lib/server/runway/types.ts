import type { Buffer } from "node:buffer";

export type ApiPayload = Record<string, unknown>;
export type ApiJson = Record<string, unknown>;

export type ProgressEvent = Record<string, unknown> & {
  type?: "progress" | "complete" | "error";
  stage?: string;
  progress?: number;
};

export type ProgressWriter = (event: ProgressEvent) => void;
export type JobOptions = { signal?: AbortSignal };
export type HttpStatusError = Error & { status?: number };

export type RunwayRequestOptions = JobOptions & {
  method?: "GET" | "POST";
  body?: ApiJson;
};

export type RunwayPollOptions = JobOptions & {
  start?: number;
  end?: number;
  timeoutMs?: number;
  estimateMs?: number;
  label?: string;
};

export type DownloadOptions = JobOptions & {
  fallbackContentType?: string;
};

export type ParsedMediaDataUrl = {
  mime: string;
  buffer: Buffer;
};

export type UploadedFileOptions = ParsedMediaDataUrl &
  JobOptions & {
    apiKey: string;
    filename: string;
    onProgress?: ProgressWriter;
  };

export type ModelConfig = {
  ratio: string;
  maxPrompt: number;
  maxReferences: number;
  outputCount?: boolean;
  quality?: boolean;
};

export type RunwayOutput = {
  url: string;
  dataUri?: string;
  contentType?: string;
};

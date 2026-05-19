import { readProgressStream } from "./progress-stream.js";

const ROUTES = {
  status: "/api/runway/status",
  inpaint: "/api/runway/inpaint-stream",
  depthMap: "/api/runway/depth-map-stream",
  seedance: "/api/runway/seedance-stream",
  seedanceImage: "/api/runway/seedance-image-stream",
  codexSeedancePrompt: "/api/codex/seedance-prompt-stream",
  codexSeedanceImagePrompt: "/api/codex/seedance-image-prompt-stream",
};

type RunwayRequestOptions = {
  signal?: AbortSignal;
  onProgress?: (stage: string, progress: number) => void;
};

type JsonPayload = Record<string, unknown>;
export type RunwayOutput = {
  dataUri?: string;
  url?: string;
  contentType?: string;
  name?: string;
  duration?: number;
  [key: string]: unknown;
};
export type RunwayStreamResult = {
  outputs?: RunwayOutput[];
  model?: string;
  duration?: number;
  prompt?: string;
  [key: string]: unknown;
};

export async function requestRunwayStatus(): Promise<unknown | null> {
  const response = await fetch(ROUTES.status);
  if (!response.ok) return null;
  return response.json();
}

export async function requestRunwayInpaint(payload: JsonPayload, options: RunwayRequestOptions = {}): Promise<RunwayStreamResult> {
  const response = await postRunwayJson(ROUTES.inpaint, payload, options.signal);
  return readProgressStream(response, {
    errorPrefix: "Runway request failed",
    emptyMessage: "Runway stream closed before returning an image.",
    defaultStage: "Running",
    onProgress: options.onProgress,
  }) as Promise<RunwayStreamResult>;
}

export async function requestRunwayDepthMap(payload: JsonPayload, options: RunwayRequestOptions = {}): Promise<RunwayStreamResult> {
  const response = await postRunwayJson(ROUTES.depthMap, payload, options.signal);
  return readProgressStream(response, {
    errorPrefix: "Runway depth request failed",
    emptyMessage: "Runway stream closed before returning a depth map.",
    defaultStage: "Generating depth",
    onProgress: options.onProgress,
  }) as Promise<RunwayStreamResult>;
}

export async function requestRunwaySeedanceVideo(payload: JsonPayload, options: RunwayRequestOptions = {}): Promise<RunwayStreamResult> {
  const response = await postRunwayJson(ROUTES.seedance, payload, options.signal);
  return readProgressStream(response, {
    errorPrefix: "Runway Seedance request failed",
    emptyMessage: "Runway stream closed before returning a Seedance video.",
    defaultStage: "Running Seedance",
    onProgress: options.onProgress,
  }) as Promise<RunwayStreamResult>;
}

export async function requestRunwaySeedanceImageVideo(payload: JsonPayload, options: RunwayRequestOptions = {}): Promise<RunwayStreamResult> {
  const response = await postRunwayJson(ROUTES.seedanceImage, payload, options.signal);
  return readProgressStream(response, {
    errorPrefix: "Runway Seedance image request failed",
    emptyMessage: "Runway stream closed before returning a Seedance image video.",
    defaultStage: "Running Seedance",
    onProgress: options.onProgress,
  }) as Promise<RunwayStreamResult>;
}

export async function requestCodexSeedancePrompt(payload: JsonPayload, options: RunwayRequestOptions = {}): Promise<RunwayStreamResult> {
  const response = await postRunwayJson(ROUTES.codexSeedancePrompt, payload, options.signal);
  return readProgressStream(response, {
    errorPrefix: "Codex prompt planning failed",
    emptyMessage: "Codex stream closed before returning a prompt.",
    defaultStage: "Planning prompt",
    onProgress: options.onProgress,
  }) as Promise<RunwayStreamResult>;
}

export async function requestCodexSeedanceImagePrompt(payload: JsonPayload, options: RunwayRequestOptions = {}): Promise<RunwayStreamResult> {
  const response = await postRunwayJson(ROUTES.codexSeedanceImagePrompt, payload, options.signal);
  return readProgressStream(response, {
    errorPrefix: "Codex image prompt planning failed",
    emptyMessage: "Codex stream closed before returning an image-to-video prompt.",
    defaultStage: "Planning image prompt",
    onProgress: options.onProgress,
  }) as Promise<RunwayStreamResult>;
}

async function postRunwayJson(route: string, payload: JsonPayload, signal?: AbortSignal): Promise<Response> {
  return fetch(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
}

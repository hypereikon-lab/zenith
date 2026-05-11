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

export async function requestRunwayStatus() {
  const response = await fetch(ROUTES.status);
  if (!response.ok) return null;
  return response.json();
}

export async function requestRunwayInpaint(payload, options = {}) {
  const response = await postRunwayJson(ROUTES.inpaint, payload, options.signal);
  return readProgressStream(response, {
    errorPrefix: "Runway request failed",
    emptyMessage: "Runway stream closed before returning an image.",
    defaultStage: "Running",
    onProgress: options.onProgress,
  });
}

export async function requestRunwayDepthMap(payload, options = {}) {
  const response = await postRunwayJson(ROUTES.depthMap, payload, options.signal);
  return readProgressStream(response, {
    errorPrefix: "Runway depth request failed",
    emptyMessage: "Runway stream closed before returning a depth map.",
    defaultStage: "Generating depth",
    onProgress: options.onProgress,
  });
}

export async function requestRunwaySeedanceVideo(payload, options = {}) {
  const response = await postRunwayJson(ROUTES.seedance, payload, options.signal);
  return readProgressStream(response, {
    errorPrefix: "Runway Seedance request failed",
    emptyMessage: "Runway stream closed before returning a Seedance video.",
    defaultStage: "Running Seedance",
    onProgress: options.onProgress,
  });
}

export async function requestRunwaySeedanceImageVideo(payload, options = {}) {
  const response = await postRunwayJson(ROUTES.seedanceImage, payload, options.signal);
  return readProgressStream(response, {
    errorPrefix: "Runway Seedance image request failed",
    emptyMessage: "Runway stream closed before returning a Seedance image video.",
    defaultStage: "Running Seedance",
    onProgress: options.onProgress,
  });
}

export async function requestCodexSeedancePrompt(payload, options = {}) {
  const response = await postRunwayJson(ROUTES.codexSeedancePrompt, payload, options.signal);
  return readProgressStream(response, {
    errorPrefix: "Codex prompt planning failed",
    emptyMessage: "Codex stream closed before returning a prompt.",
    defaultStage: "Planning prompt",
    onProgress: options.onProgress,
  });
}

export async function requestCodexSeedanceImagePrompt(payload, options = {}) {
  const response = await postRunwayJson(ROUTES.codexSeedanceImagePrompt, payload, options.signal);
  return readProgressStream(response, {
    errorPrefix: "Codex image prompt planning failed",
    emptyMessage: "Codex stream closed before returning an image-to-video prompt.",
    defaultStage: "Planning image prompt",
    onProgress: options.onProgress,
  });
}

async function postRunwayJson(route, payload, signal) {
  return fetch(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
}

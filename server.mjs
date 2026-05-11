import { createServer as createHttpServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createServer as createViteServer } from "vite";
import { Codex } from "@openai/codex-sdk";

loadEnvFile(".env.local");
loadEnvFile(".env");

const API_BASE = process.env.RUNWAY_API_BASE || "https://api.dev.runwayml.com";
const API_VERSION = process.env.RUNWAY_API_VERSION || "2024-11-06";
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || readPortArg() || 5173);
const MAX_JSON_BYTES = 128 * 1024 * 1024;
const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 8 * 60 * 1000;
const SEEDANCE_POLL_TIMEOUT_MS = positiveNumberFromEnv("SEEDANCE_POLL_TIMEOUT_MS", 45 * 60 * 1000);
const SEEDANCE_PROGRESS_ESTIMATE_MS = positiveNumberFromEnv("SEEDANCE_PROGRESS_ESTIMATE_MS", 12 * 60 * 1000);
const INPAINT_MODEL = "gpt_image_2";
const DEPTH_MAP_MODEL = "gemini_image3_pro";
const SEEDANCE_MODEL = "seedance2";
const SEEDANCE_VIDEO_MAX_BYTES = 32 * 1024 * 1024;
const SEEDANCE_PROMPT_MAX = 3500;
const SEEDANCE_PROMPT_PACK_DIR =
  process.env.SEEDANCE_PROMPT_PACK_DIR || join(process.cwd(), "docs", "seedance_prompt_pack");
const SEEDANCE_IMAGE_PROMPT_PACK_DIR =
  process.env.SEEDANCE_IMAGE_PROMPT_PACK_DIR || join(process.cwd(), "docs", "seedance_image_prompt_pack");
const SEEDANCE_PROMPT_PACK_FILES = [
  "00_seedance_prompt_compiler_system.md",
  "01_reference_roles_and_patterns.md",
  "02_depth_warp_repair_recipe.md",
  "03_analysis_schemas.md",
  "04_prompt_templates.md",
  "05_feedback_repair_rules.md",
  "06_fewshot_prompt6_style.md",
];
const SEEDANCE_IMAGE_PROMPT_PACK_FILES = [
  "00_seedance_image_prompt_compiler_system.md",
  "01_corpus_patterns.md",
  "02_image_to_video_motion_recipe.md",
  "03_analysis_schemas.md",
  "04_prompt_templates.md",
  "05_feedback_repair_rules.md",
  "06_fewshot_seedance2_style.md",
];
const CODEX_PROMPT_MODEL = process.env.CODEX_PROMPT_MODEL || "";
const CODEX_PROMPT_REASONING = sanitizeChoice(
  process.env.CODEX_PROMPT_REASONING,
  ["minimal", "low", "medium", "high", "xhigh"],
  "medium",
);
const DEFAULT_DEPTH_PROMPT = `Generate a metric depth map visualization where depth values are represented on a grayscale gradient from black (nearest objects) to white (farthest objects). Use precise linear interpolation across the depth range. Render as a clean, high-contrast grayscale image with smooth tonal transitions. No color, no overlays, no labels. Pure depth-to-brightness mapping where each shade of gray corresponds to a specific distance value in the scene. Preserve the square 180-degree domemaster fisheye layout exactly, including zenith center, circular horizon, and pure black outside the projection circle.`;
const DEFAULT_SEEDANCE_PROMPT = `Use the input video as a rough fulldome domemaster motion guide. Preserve the circular fisheye composition, camera timing, parallax direction, scene identity, and pitch-black area outside the projection circle. Convert the depth-projected guide into coherent natural motion without adding text, borders, rectangular framing, UI marks, or visible mask artifacts.`;
const DEFAULT_SEEDANCE_IMAGE_PROMPT = `Use the input image as the source of truth for a square fulldome domemaster scene. Animate it as one seamless shot with a gentle spatial camera drift, subtle foreground parallax, natural material motion, and stable distant background. Preserve the circular fisheye projection, the original composition, and the pitch-black exterior outside the projection circle. Do not add text, borders, UI overlays, new major objects, cuts, or rectangular reframing.`;
const CODEX_SEEDANCE_SCHEMA = {
  type: "object",
  properties: {
    diagnosis: { type: "string" },
    sceneCardSummary: { type: "string" },
    motionPlateCardSummary: { type: "string" },
    selectedMode: { type: "string", enum: ["strict_repair", "conservative_lock", "more_volumetric"] },
    seedancePrompt: { type: "string" },
    promptStrategy: { type: "string" },
    variants: {
      type: "object",
      properties: {
        strictRepair: { type: "string" },
        conservativeLock: { type: "string" },
        moreVolumetric: { type: "string" },
      },
      required: ["strictRepair", "conservativeLock", "moreVolumetric"],
      additionalProperties: false,
    },
    negativeTerms: {
      type: "array",
      items: { type: "string" },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "diagnosis",
    "sceneCardSummary",
    "motionPlateCardSummary",
    "selectedMode",
    "seedancePrompt",
    "promptStrategy",
    "variants",
    "negativeTerms",
    "warnings",
  ],
  additionalProperties: false,
};
const CODEX_SEEDANCE_IMAGE_SCHEMA = {
  type: "object",
  properties: {
    diagnosis: { type: "string" },
    sceneCardSummary: { type: "string" },
    selectedMode: {
      type: "string",
      enum: ["ambient_scene_motion", "scene_event", "material_life"],
    },
    seedancePrompt: { type: "string" },
    promptStrategy: { type: "string" },
    variants: {
      type: "object",
      properties: {
        ambientSceneMotion: { type: "string" },
        sceneEvent: { type: "string" },
        materialLife: { type: "string" },
      },
      required: ["ambientSceneMotion", "sceneEvent", "materialLife"],
      additionalProperties: false,
    },
    negativeTerms: {
      type: "array",
      items: { type: "string" },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "diagnosis",
    "sceneCardSummary",
    "selectedMode",
    "seedancePrompt",
    "promptStrategy",
    "variants",
    "negativeTerms",
    "warnings",
  ],
  additionalProperties: false,
};

const MODEL_CONFIG = {
  gemini_image3_pro: {
    ratio: "2048:2048",
    maxPrompt: 5500,
    outputCount: true,
  },
  gpt_image_2: {
    ratio: "1920:1920",
    maxPrompt: 32000,
    outputCount: true,
    quality: true,
  },
};

let vite;
const server = createHttpServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);
    if (url.pathname === "/api/runway/status" && req.method === "GET") {
      return sendJson(res, 200, {
        configured: Boolean(getRunwayApiKey()),
        apiBase: API_BASE,
        apiVersion: API_VERSION,
        models: {
          inpaint: INPAINT_MODEL,
          depthMap: DEPTH_MAP_MODEL,
          seedance: SEEDANCE_MODEL,
          seedanceImage: SEEDANCE_MODEL,
        },
      });
    }
    if (url.pathname === "/api/runway/inpaint" && req.method === "POST") {
      const payload = await readJsonBody(req);
      const result = await createRunwayInpaint(payload);
      return sendJson(res, 200, result);
    }
    if (url.pathname === "/api/runway/inpaint-stream" && req.method === "POST") {
      const payload = await readJsonBody(req);
      return streamRunwayInpaint(res, payload);
    }
    if (url.pathname === "/api/runway/depth-map-stream" && req.method === "POST") {
      const payload = await readJsonBody(req);
      return streamRunwayDepthMap(res, payload);
    }
    if (url.pathname === "/api/runway/seedance-stream" && req.method === "POST") {
      const payload = await readJsonBody(req);
      return streamRunwaySeedance(res, payload);
    }
    if (url.pathname === "/api/runway/seedance-image-stream" && req.method === "POST") {
      const payload = await readJsonBody(req);
      return streamRunwaySeedanceImage(res, payload);
    }
    if (url.pathname === "/api/codex/seedance-prompt-stream" && req.method === "POST") {
      const payload = await readJsonBody(req);
      return streamCodexSeedancePrompt(res, payload);
    }
    if (url.pathname === "/api/codex/seedance-image-prompt-stream" && req.method === "POST") {
      const payload = await readJsonBody(req);
      return streamCodexSeedanceImagePrompt(res, payload);
    }
    vite.middlewares(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, error.status || 500, { error: error.message || "Server error" });
  }
});

vite = await createViteServer({
  appType: "spa",
  server: {
    middlewareMode: true,
    host: HOST,
    hmr: { server },
  },
});

server.listen(PORT, HOST, () => {
  console.log(`Fulldome viewer: http://${HOST}:${PORT}/`);
  console.log(`Runway API key: ${getRunwayApiKey() ? "configured" : "missing RUNWAYML_API_SECRET"}`);
});

async function streamRunwayJob(res, run, fallbackError) {
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let closed = false;
  const abortController = new AbortController();
  res.on("close", () => {
    closed = true;
    abortController.abort();
  });
  const writeProgress = (event) => {
    if (closed) return;
    res.write(`${JSON.stringify(event)}\n`);
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
        error: error.message || fallbackError,
        status: error.status || 500,
      });
    }
  } finally {
    if (!closed) res.end();
  }
}

async function streamRunwayInpaint(res, payload) {
  return streamRunwayJob(
    res,
    (onProgress, options) => createRunwayInpaint(payload, onProgress, options),
    "Runway request failed",
  );
}

async function streamRunwayDepthMap(res, payload) {
  return streamRunwayJob(
    res,
    (onProgress, options) => createRunwayDepthMap(payload, onProgress, options),
    "Runway depth request failed",
  );
}

async function streamRunwaySeedance(res, payload) {
  return streamRunwayJob(
    res,
    (onProgress, options) => createRunwaySeedanceVideo(payload, onProgress, options),
    "Runway Seedance request failed",
  );
}

async function streamRunwaySeedanceImage(res, payload) {
  return streamRunwayJob(
    res,
    (onProgress, options) => createRunwaySeedanceImageVideo(payload, onProgress, options),
    "Runway Seedance image-to-video request failed",
  );
}

async function streamCodexSeedancePrompt(res, payload) {
  return streamRunwayJob(
    res,
    (onProgress, options) => createCodexSeedancePrompt(payload, onProgress, options),
    "Codex prompt planning failed",
  );
}

async function streamCodexSeedanceImagePrompt(res, payload) {
  return streamRunwayJob(
    res,
    (onProgress, options) => createCodexSeedanceImagePrompt(payload, onProgress, options),
    "Codex image prompt planning failed",
  );
}

async function createRunwayInpaint(payload, onProgress = () => {}, options = {}) {
  throwIfAborted(options.signal);
  onProgress({ type: "progress", stage: "Validating", progress: 0.03 });
  const apiKey = getRunwayApiKey();
  if (!apiKey) {
    throw httpError(401, "Set RUNWAYML_API_SECRET before using Runway inpaint.");
  }

  const model = INPAINT_MODEL;
  const config = MODEL_CONFIG[model];
  if (!config) {
    throw httpError(400, `Unsupported Runway image model: ${model}`);
  }

  const { buffer, mime } = parseImageDataUrl(payload.imageDataUrl);
  const filename = `fulldome-plate-handoff-${Date.now()}.png`;
  const referenceUri = await uploadEphemeralFile({
    apiKey,
    filename,
    buffer,
    mime,
    onProgress,
    signal: options.signal,
  });
  const promptText = clampPrompt(String(payload.prompt || ""), config.maxPrompt);
  const body = {
    model,
    promptText,
    ratio: sanitizeRatio(payload.ratio, config.ratio),
    referenceImages: [{ uri: referenceUri, tag: "PlateSketch" }],
  };

  if (config.outputCount) {
    body.outputCount = clampInt(payload.outputCount, 1, model === "gpt_image_2" ? 10 : 4);
  }
  if (config.quality) {
    body.background = "opaque";
    body.quality = sanitizeChoice(payload.quality, ["low", "medium", "high", "auto"], "auto");
  }

  onProgress({ type: "progress", stage: "Creating task", progress: 0.34 });
  const task = await runwayJson(apiKey, "/v1/text_to_image", {
    method: "POST",
    body,
    signal: options.signal,
  });
  onProgress({ type: "progress", stage: "Queued", progress: 0.42, taskId: task.id });
  const completed = await waitForRunwayTask(apiKey, task.id, onProgress, { signal: options.signal });
  onProgress({ type: "progress", stage: "Downloading", progress: 0.92 });
  const outputs = await downloadTaskOutputs(completed.output || [], onProgress, 0.92, 0.98, { signal: options.signal });
  return {
    id: completed.id || task.id,
    status: completed.status,
    model,
    ratio: body.ratio,
    outputs,
  };
}

async function createRunwayDepthMap(payload, onProgress = () => {}, options = {}) {
  throwIfAborted(options.signal);
  onProgress({ type: "progress", stage: "Validating", progress: 0.03 });
  const apiKey = getRunwayApiKey();
  if (!apiKey) {
    throw httpError(401, "Set RUNWAYML_API_SECRET before generating depth maps.");
  }

  const model = DEPTH_MAP_MODEL;
  const config = MODEL_CONFIG[model];
  if (!config) {
    throw httpError(400, `Unsupported Runway image model: ${model}`);
  }

  const { buffer, mime } = parseImageDataUrl(payload.imageDataUrl);
  const referenceUri = await uploadEphemeralFile({
    apiKey,
    filename: `fulldome-depth-source-${Date.now()}.png`,
    buffer,
    mime,
    onProgress,
    signal: options.signal,
  });
  const promptText = clampPrompt(String(payload.prompt || DEFAULT_DEPTH_PROMPT), config.maxPrompt);
  const body = {
    model,
    promptText,
    ratio: sanitizeRatio(payload.ratio, config.ratio),
    referenceImages: [{ uri: referenceUri, tag: "SourceFrame" }],
  };

  if (config.outputCount) {
    body.outputCount = 1;
  }
  if (config.quality) {
    body.background = "opaque";
    body.quality = sanitizeChoice(payload.quality, ["low", "medium", "high", "auto"], "auto");
  }

  onProgress({ type: "progress", stage: "Creating depth task", progress: 0.34 });
  const task = await runwayJson(apiKey, "/v1/text_to_image", {
    method: "POST",
    body,
    signal: options.signal,
  });
  onProgress({ type: "progress", stage: "Queued", progress: 0.42, taskId: task.id });
  const completed = await waitForRunwayTask(apiKey, task.id, onProgress, {
    signal: options.signal,
    label: "Generating depth",
  });
  onProgress({ type: "progress", stage: "Downloading", progress: 0.92 });
  const outputs = await downloadTaskOutputs(completed.output || [], onProgress, 0.92, 0.98, { signal: options.signal });
  return {
    id: completed.id || task.id,
    status: completed.status,
    model,
    ratio: body.ratio,
    outputs: outputs.slice(0, 1),
  };
}

async function createRunwaySeedanceVideo(payload, onProgress = () => {}, options = {}) {
  throwIfAborted(options.signal);
  onProgress({ type: "progress", stage: "Validating", progress: 0.03 });
  const apiKey = getRunwayApiKey();
  if (!apiKey) {
    throw httpError(401, "Set RUNWAYML_API_SECRET before sending video to Seedance.");
  }

  const { buffer, mime } = parseVideoDataUrl(payload.videoDataUrl);
  if (buffer.length > SEEDANCE_VIDEO_MAX_BYTES) {
    throw httpError(413, "Seedance video-to-video input must be 32 MB or smaller.");
  }

  const promptText = clampPrompt(String(payload.prompt || DEFAULT_SEEDANCE_PROMPT), SEEDANCE_PROMPT_MAX);
  const filename = safeMediaFilename(payload.filename, "fulldome-depth-motion.mp4");
  const promptVideo = await uploadEphemeralFile({
    apiKey,
    filename,
    buffer,
    mime,
    onProgress,
    signal: options.signal,
  });

  const body = {
    model: SEEDANCE_MODEL,
    promptVideo,
    promptText,
  };

  onProgress({ type: "progress", stage: "Creating Seedance task", progress: 0.34 });
  const task = await runwayJson(apiKey, "/v1/video_to_video", {
    method: "POST",
    body,
    signal: options.signal,
  });
  onProgress({ type: "progress", stage: "Queued", progress: 0.42, taskId: task.id });
  const completed = await waitForRunwayTask(apiKey, task.id, onProgress, {
    signal: options.signal,
    label: "Running Seedance",
    timeoutMs: SEEDANCE_POLL_TIMEOUT_MS,
    estimateMs: SEEDANCE_PROGRESS_ESTIMATE_MS,
  });
  onProgress({ type: "progress", stage: "Downloading MP4", progress: 0.92 });
  const outputs = await downloadTaskOutputs(completed.output || [], onProgress, 0.92, 0.98, {
    signal: options.signal,
    fallbackContentType: "video/mp4",
  });
  return {
    id: completed.id || task.id,
    status: completed.status,
    model: SEEDANCE_MODEL,
    promptText,
    inputBytes: buffer.length,
    outputs,
  };
}

async function createRunwaySeedanceImageVideo(payload, onProgress = () => {}, options = {}) {
  throwIfAborted(options.signal);
  onProgress({ type: "progress", stage: "Validating", progress: 0.03 });
  const apiKey = getRunwayApiKey();
  if (!apiKey) {
    throw httpError(401, "Set RUNWAYML_API_SECRET before sending an image to Seedance.");
  }

  const { buffer, mime } = parseImageDataUrl(payload.imageDataUrl);
  const promptText = clampPrompt(String(payload.prompt || DEFAULT_SEEDANCE_IMAGE_PROMPT), SEEDANCE_PROMPT_MAX);
  const filename = safeMediaFilename(payload.filename, "fulldome-seedance-source.png");
  const promptImage = await uploadEphemeralFile({
    apiKey,
    filename,
    buffer,
    mime,
    onProgress,
    signal: options.signal,
  });

  const body = {
    model: SEEDANCE_MODEL,
    promptImage,
    promptText,
    ratio: sanitizeSeedanceImageRatio(payload.ratio),
    duration: clampInt(payload.duration || 5, 2, 15),
  };

  onProgress({ type: "progress", stage: "Creating Seedance image task", progress: 0.34 });
  const task = await runwayJson(apiKey, "/v1/image_to_video", {
    method: "POST",
    body,
    signal: options.signal,
  });
  onProgress({ type: "progress", stage: "Queued", progress: 0.42, taskId: task.id });
  const completed = await waitForRunwayTask(apiKey, task.id, onProgress, {
    signal: options.signal,
    label: "Running Seedance",
    timeoutMs: SEEDANCE_POLL_TIMEOUT_MS,
    estimateMs: SEEDANCE_PROGRESS_ESTIMATE_MS,
  });
  onProgress({ type: "progress", stage: "Downloading MP4", progress: 0.92 });
  const outputs = await downloadTaskOutputs(completed.output || [], onProgress, 0.92, 0.98, {
    signal: options.signal,
    fallbackContentType: "video/mp4",
  });
  return {
    id: completed.id || task.id,
    status: completed.status,
    model: SEEDANCE_MODEL,
    promptText,
    ratio: body.ratio,
    duration: body.duration,
    inputBytes: buffer.length,
    outputs,
  };
}

async function createCodexSeedancePrompt(payload, onProgress = () => {}, options = {}) {
  throwIfAborted(options.signal);
  onProgress({ type: "progress", stage: "Preparing Codex context", progress: 0.08 });

  const tempDir = await createCodexPromptTempDir();
  try {
    const sourceImage = await writePromptImage(tempDir, "source.jpg", payload.sourceImageDataUrl);
    const depthImage = await writePromptImage(tempDir, "depth.png", payload.depthImageDataUrl);
    const motionImages = await Promise.all(
      normalizeMotionFramePayload(payload.motionFrames).map((frame, index) =>
        writePromptImage(tempDir, `motion-frame-${String(index + 1).padStart(2, "0")}.jpg`, frame.imageDataUrl),
      ),
    );
    const prompt = buildSeedancePromptPlannerInstruction(payload);
    const codex = new Codex();
    const thread = codex.startThread({
      workingDirectory: process.cwd(),
      skipGitRepoCheck: true,
      sandboxMode: "read-only",
      approvalPolicy: "never",
      webSearchMode: "disabled",
      networkAccessEnabled: false,
      model: CODEX_PROMPT_MODEL || undefined,
      modelReasoningEffort: CODEX_PROMPT_REASONING,
    });

    onProgress({ type: "progress", stage: "Planning with Codex", progress: 0.35 });
    const turn = await thread.run(
      [
        { type: "text", text: prompt },
        { type: "local_image", path: sourceImage },
        { type: "local_image", path: depthImage },
        ...motionImages.map((path) => ({ type: "local_image", path })),
      ],
      {
        outputSchema: CODEX_SEEDANCE_SCHEMA,
        signal: options.signal,
      },
    );
    throwIfAborted(options.signal);
    onProgress({ type: "progress", stage: "Validating prompt", progress: 0.92 });
    const result = normalizeCodexSeedancePromptResponse(turn.finalResponse);
    return {
      ...result,
      threadId: thread.id,
      model: CODEX_PROMPT_MODEL || "codex-default",
      reasoning: CODEX_PROMPT_REASONING,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function createCodexSeedanceImagePrompt(payload, onProgress = () => {}, options = {}) {
  throwIfAborted(options.signal);
  onProgress({ type: "progress", stage: "Preparing Codex image context", progress: 0.08 });

  const tempDir = await createCodexPromptTempDir();
  try {
    const sourceImage = await writePromptImage(tempDir, "source-image.jpg", payload.sourceImageDataUrl);
    const prompt = buildSeedanceImagePromptPlannerInstruction(payload);
    const codex = new Codex();
    const thread = codex.startThread({
      workingDirectory: process.cwd(),
      skipGitRepoCheck: true,
      sandboxMode: "read-only",
      approvalPolicy: "never",
      webSearchMode: "disabled",
      networkAccessEnabled: false,
      model: CODEX_PROMPT_MODEL || undefined,
      modelReasoningEffort: CODEX_PROMPT_REASONING,
    });

    onProgress({ type: "progress", stage: "Planning image motion", progress: 0.35 });
    const turn = await thread.run(
      [
        { type: "text", text: prompt },
        { type: "local_image", path: sourceImage },
      ],
      {
        outputSchema: CODEX_SEEDANCE_IMAGE_SCHEMA,
        signal: options.signal,
      },
    );
    throwIfAborted(options.signal);
    onProgress({ type: "progress", stage: "Validating image prompt", progress: 0.92 });
    const result = normalizeCodexSeedanceImagePromptResponse(turn.finalResponse);
    return {
      ...result,
      threadId: thread.id,
      model: CODEX_PROMPT_MODEL || "codex-default",
      reasoning: CODEX_PROMPT_REASONING,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function normalizeMotionFramePayload(frames) {
  return Array.isArray(frames) ? frames.filter((frame) => typeof frame?.imageDataUrl === "string").slice(0, 8) : [];
}

async function createCodexPromptTempDir() {
  const dir = join(
    process.cwd(),
    ".codex",
    "tmp",
    `zenith-codex-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(dir, { recursive: true });
  return dir;
}

async function writePromptImage(tempDir, filename, dataUrl) {
  const { buffer } = parseImageDataUrl(dataUrl);
  const path = join(tempDir, filename);
  await writeFile(path, buffer);
  return path;
}

function buildSeedancePromptPlannerInstruction(payload) {
  const promptPackContext = loadSeedancePromptPackContext();
  const settings = {
    source: payload.source || {},
    depth: payload.depth || {},
    projection: payload.projection || {},
    motion: payload.motion || {},
    guide: payload.guide || {},
    requestedMode: payload.promptMode || "auto",
    motionFrameSamples: normalizeMotionFramePayload(payload.motionFrames).map((frame, index) => ({
      index,
      progress: frame.progress,
      label: frame.label || `motion frame ${index + 1}`,
    })),
    currentPrompt: String(payload.currentPrompt || DEFAULT_SEEDANCE_PROMPT),
  };

  return `You are a local Codex prompt planner inside Zenith, a WebGPU fulldome domemaster tool.

Goal:
Create a Runway Seedance 2.0 video-to-video prompt for an MP4 guide generated from a final/inpainted source image plus metric depth map. The attached images are in this order:
1. Image1: the final/inpainted source domemaster frame and source of truth for appearance.
2. Depth map: generation aid only.
3+. Video1 frame samples: sampled frames from the generated 2.5D/depth-warp motion plate.

The Seedance input video is a depth-reprojected guide. The prompt must treat it as a damaged motion plate, not the visual target. It should tell Seedance to preserve the guide's timing, camera path, parallax direction, fisheye geometry, black outside-circle mask, and motion rhythm, while rebuilding appearance from Image1.

Use the current prompt as a starting point, but rewrite it with more intent if the motion settings imply a clearer camera move.

Seedance prompt-pack context:
${promptPackContext}

Hard constraints:
- Return only the requested JSON object.
- seedancePrompt must be under ${SEEDANCE_PROMPT_MAX} characters.
- Do not mention "attached image", "depth map", "WebGPU", UI controls, sampled frames, or implementation details in seedancePrompt.
- Do not ask Seedance to change the scene identity.
- Do not ask for text, labels, rectangular borders, UI overlays, subtitles, logos, or visible masks.
- Preserve the square domemaster, circular fisheye projection, and pitch-black exterior outside the projection circle.
- Treat the MP4 as the choreography/camera guide, not just a style reference.
- Never say "preserve Video1 exactly" or "preserve the original video exactly" for this workflow.
- Use Image1 as the source of truth for appearance; use Video1 only for timing, camera motion, parallax direction, and broad motion rhythm.
- Name likely 2.5D/depth-warp defects as artifacts to reject.
- If requestedMode is "auto", choose one of strict_repair, conservative_lock, or more_volumetric. If a concrete mode is requested, use that mode for seedancePrompt.

Motion/settings context:
${JSON.stringify(settings, null, 2)}

JSON fields:
- diagnosis: 2-5 concise sentences about Image1, Video1 motion, likely depth-warp damage, and what should be repaired.
- sceneCardSummary: compact SceneCard-style summary of Image1.
- motionPlateCardSummary: compact MotionPlateCard-style summary of Video1 frame samples and motion settings.
- selectedMode: strict_repair, conservative_lock, or more_volumetric.
- seedancePrompt: final prompt to send to Runway Seedance video-to-video using selectedMode.
- promptStrategy: one sentence explaining why this prompt should help Seedance.
- variants.strictRepair: paste-ready strict repair variant.
- variants.conservativeLock: paste-ready conservative lock variant.
- variants.moreVolumetric: paste-ready more volumetric variant.
- negativeTerms: compact list of artifact/negative terms useful for this pair.
- warnings: short array of practical risks, empty if none.`;
}

function buildSeedanceImagePromptPlannerInstruction(payload) {
  const promptPackContext = loadSeedanceImagePromptPackContext();
  const settings = {
    source: payload.source || {},
    projection: payload.projection || {},
    requestedMode: payload.promptMode || "auto",
    durationSeconds: payload.durationSeconds || 5,
    ratio: payload.ratio || "960:960",
    currentPrompt: String(payload.currentPrompt || DEFAULT_SEEDANCE_IMAGE_PROMPT),
  };

  return `You are a local Codex prompt planner inside Zenith, a WebGPU fulldome domemaster tool.

Goal:
Create a Runway Seedance 2.0 image-to-video prompt for a single still source image. The attached image is Image1: the final/inpainted source frame and the source of truth for appearance, scene identity, layout, materials, lighting, color, detail, and any dome geometry.

There is no video guide in this workflow. You must infer what can happen inside Image1 itself: subject/environment behavior, material motion, atmosphere, light, particles, micro-events, and slow local details that belong to the visible scene. Camera movement is secondary and should usually be subtle; do not solve the prompt with fast orbiting, spinning, or generic global camera motion.

Use the current prompt as a starting point only if it fits this image-to-video task. Rewrite it when the image suggests a clearer motion plan.

Seedance image prompt-pack context:
${promptPackContext}

Hard constraints:
- Return only the requested JSON object.
- seedancePrompt must be under ${SEEDANCE_PROMPT_MAX} characters.
- Do not mention "attached image", "depth map", "WebGPU", UI controls, sampled frames, or implementation details in seedancePrompt.
- Do not mention a video guide, motion plate, or video reference.
- Use Image1 as the source of truth for appearance, scene identity, composition, color, lighting, materials, and detail.
- Preserve the square domemaster/circular fisheye geometry when Image1 has it, including pure black outside the projection circle.
- The prompt must create visible content motion from the still image: at minimum one concrete scene event or local happening, three scene-specific material/detail motions, and one restrained camera/depth instruction.
- Prioritize local scene behavior over global moves. Avoid fast orbit, spin, sweep, rollercoaster, or generic camera-only animation unless the image clearly demands it.
- Avoid generic prompt-only motion like "make it cinematic" without naming what moves.
- Do not ask for text, labels, rectangular borders, UI overlays, subtitles, logos, scene redesign, or new major objects.
- If requestedMode is "auto", choose one of ambient_scene_motion, scene_event, or material_life. If a concrete mode is requested, use that mode for seedancePrompt.

Image-to-video context:
${JSON.stringify(settings, null, 2)}

JSON fields:
- diagnosis: 2-5 concise sentences about the scene, inferred depth, and what can move.
- sceneCardSummary: compact SceneCard-style summary of Image1.
- selectedMode: ambient_scene_motion, scene_event, or material_life.
- seedancePrompt: final prompt to send to Runway Seedance image-to-video using selectedMode.
- promptStrategy: one sentence explaining how motion emerges from the still image.
- variants.ambientSceneMotion: paste-ready restrained scene-motion variant.
- variants.sceneEvent: paste-ready event-based variant.
- variants.materialLife: paste-ready detail/material-life variant.
- negativeTerms: compact list of artifact/negative terms useful for this image.
- warnings: short array of practical risks, empty if none.`;
}

function normalizeCodexSeedancePromptResponse(text) {
  const parsed = parseJsonObject(text);
  const variants = {
    strictRepair: clampOptionalPrompt(parsed.variants?.strictRepair || parsed.variants?.strict_repair),
    conservativeLock: clampOptionalPrompt(parsed.variants?.conservativeLock || parsed.variants?.conservative_lock),
    moreVolumetric: clampOptionalPrompt(parsed.variants?.moreVolumetric || parsed.variants?.more_volumetric),
  };
  const seedancePrompt = clampPrompt(
    String(parsed.seedancePrompt || parsed.seedance_prompt || variants.strictRepair || ""),
    SEEDANCE_PROMPT_MAX,
  );
  return {
    diagnosis: String(parsed.diagnosis || "Codex compiled a Seedance motion-plate repair prompt.").trim(),
    sceneCardSummary: String(parsed.sceneCardSummary || parsed.scene_card_summary || "").trim(),
    motionPlateCardSummary: String(parsed.motionPlateCardSummary || parsed.motion_plate_card_summary || "").trim(),
    selectedMode: sanitizeChoice(
      parsed.selectedMode || parsed.selected_mode,
      ["strict_repair", "conservative_lock", "more_volumetric"],
      "strict_repair",
    ),
    seedancePrompt,
    variants,
    promptStrategy: String(
      parsed.promptStrategy || "Preserve the guide motion and clean up reprojection artifacts.",
    ).trim(),
    negativeTerms: Array.isArray(parsed.negativeTerms || parsed.negative_terms)
      ? (parsed.negativeTerms || parsed.negative_terms).map((item) => String(item).trim()).filter(Boolean)
      : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map((item) => String(item).trim()).filter(Boolean) : [],
  };
}

function normalizeCodexSeedanceImagePromptResponse(text) {
  const parsed = parseJsonObject(text);
  const variants = {
    ambientSceneMotion: clampOptionalPrompt(
      parsed.variants?.ambientSceneMotion || parsed.variants?.ambient_scene_motion || parsed.variants?.ambientDomeMotion,
    ),
    sceneEvent: clampOptionalPrompt(
      parsed.variants?.sceneEvent || parsed.variants?.scene_event || parsed.variants?.cinematicReveal,
    ),
    materialLife: clampOptionalPrompt(
      parsed.variants?.materialLife || parsed.variants?.material_life || parsed.variants?.volumetricOrbit,
    ),
  };
  const seedancePrompt = clampPrompt(
    String(parsed.seedancePrompt || parsed.seedance_prompt || variants.ambientSceneMotion || ""),
    SEEDANCE_PROMPT_MAX,
  );
  return {
    diagnosis: String(parsed.diagnosis || "Codex compiled a Seedance image-to-video prompt.").trim(),
    sceneCardSummary: String(parsed.sceneCardSummary || parsed.scene_card_summary || "").trim(),
    selectedMode: sanitizeChoice(
      parsed.selectedMode || parsed.selected_mode,
      ["ambient_scene_motion", "scene_event", "material_life"],
      "ambient_scene_motion",
    ),
    seedancePrompt,
    variants,
    promptStrategy: String(
      parsed.promptStrategy || "Infer grounded local scene behavior and material motion from the still image.",
    ).trim(),
    negativeTerms: Array.isArray(parsed.negativeTerms || parsed.negative_terms)
      ? (parsed.negativeTerms || parsed.negative_terms).map((item) => String(item).trim()).filter(Boolean)
      : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map((item) => String(item).trim()).filter(Boolean) : [],
  };
}

function clampOptionalPrompt(value) {
  const prompt = String(value || "").trim();
  return prompt ? (prompt.length > SEEDANCE_PROMPT_MAX ? prompt.slice(0, SEEDANCE_PROMPT_MAX) : prompt) : "";
}

function loadSeedancePromptPackContext() {
  const parts = [];
  for (const filename of SEEDANCE_PROMPT_PACK_FILES) {
    const path = resolve(SEEDANCE_PROMPT_PACK_DIR, filename);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8").trim();
    if (!text) continue;
    parts.push(`\n--- ${filename} ---\n${normalizePromptPackText(text)}`);
  }
  if (parts.length === 0) {
    return `Prompt-pack files were not found. Use the built-in rule: Image1 is the visual source of truth; Video1 is a damaged 2.5D motion plate used only for timing, camera motion, parallax direction, and broad motion rhythm.`;
  }
  return parts.join("\n");
}

function loadSeedanceImagePromptPackContext() {
  const parts = [];
  for (const filename of SEEDANCE_IMAGE_PROMPT_PACK_FILES) {
    const path = resolve(SEEDANCE_IMAGE_PROMPT_PACK_DIR, filename);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8").trim();
    if (!text) continue;
    parts.push(`\n--- ${filename} ---\n${normalizePromptPackText(text)}`);
  }
  if (parts.length === 0) {
    return `Prompt-pack files were not found. Use the built-in rule: Image1 is the visual source of truth; infer one clear camera path, depth/parallax behavior, and scene-specific material motion from the still image while preserving domemaster geometry.`;
  }
  return parts.join("\n");
}

function normalizePromptPackText(text) {
  return String(text)
    .replace(/â€œ|â€/g, '"')
    .replace(/â€™/g, "'")
    .replace(/â€“|â€”/g, "-")
    .replace(/â€¦/g, "...");
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = /\{[\s\S]*\}/.exec(String(text || ""));
    if (!match) throw httpError(502, "Codex did not return JSON.");
    return JSON.parse(match[0]);
  }
}

async function uploadEphemeralFile({ apiKey, filename, buffer, mime, onProgress = () => {}, signal }) {
  throwIfAborted(signal);
  onProgress({ type: "progress", stage: "Requesting upload", progress: 0.1 });
  const placeholder = await runwayJson(apiKey, "/v1/uploads", {
    method: "POST",
    body: { filename, type: "ephemeral" },
    signal,
  });
  throwIfAborted(signal);
  onProgress({ type: "progress", stage: "Uploading file", progress: 0.18 });
  const form = new FormData();
  for (const [key, value] of Object.entries(placeholder.fields || {})) {
    form.append(key, String(value));
  }
  form.append("file", new Blob([buffer], { type: mime }), filename);
  const uploadResponse = await fetch(placeholder.uploadUrl, {
    method: "POST",
    body: form,
    signal,
  });
  if (!uploadResponse.ok) {
    throw httpError(uploadResponse.status, `Runway upload failed (${uploadResponse.status}).`);
  }
  onProgress({ type: "progress", stage: "Upload done", progress: 0.3 });
  return placeholder.runwayUri;
}

async function waitForRunwayTask(apiKey, taskId, onProgress = () => {}, progressOptions = {}) {
  throwIfAborted(progressOptions.signal);
  if (!taskId) {
    throw httpError(502, "Runway did not return a task id.");
  }
  const startProgress = progressOptions.start ?? 0.42;
  const endProgress = progressOptions.end ?? 0.9;
  const timeoutMs = progressOptions.timeoutMs ?? POLL_TIMEOUT_MS;
  const estimateMs = progressOptions.estimateMs ?? 3 * 60 * 1000;
  const label = progressOptions.label;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    throwIfAborted(progressOptions.signal);
    const task = await runwayJson(apiKey, `/v1/tasks/${encodeURIComponent(taskId)}`, {
      signal: progressOptions.signal,
    });
    onProgress({
      type: "progress",
      stage: label || (task.status ? titleCaseTaskStatus(task.status) : "Generating"),
      progress: taskProgress(task, started, startProgress, endProgress, estimateMs),
      taskStatus: task.status,
      taskId,
    });
    if (task.status === "SUCCEEDED") {
      return task;
    }
    if (["FAILED", "CANCELLED"].includes(task.status)) {
      throw httpError(502, `Runway task ${task.status.toLowerCase()}.`);
    }
    await delay(POLL_INTERVAL_MS, progressOptions.signal);
  }
  throw httpError(504, `${label || "Runway task"} timed out after ${formatDuration(timeoutMs)}.`);
}

async function downloadTaskOutputs(urls, onProgress = () => {}, start = 0.92, end = 0.98, options = {}) {
  throwIfAborted(options.signal);
  const outputs = [];
  const count = Math.max(1, urls.length);
  for (const [index, item] of urls.entries()) {
    throwIfAborted(options.signal);
    const url = typeof item === "string" ? item : item?.url || item?.uri;
    if (!url) continue;
    onProgress({
      type: "progress",
      stage: `Downloading ${index + 1}/${count}`,
      progress: start + (index / count) * (end - start),
    });
    const response = await fetch(url, { signal: options.signal });
    if (!response.ok) {
      outputs.push({ url });
      continue;
    }
    const contentType = response.headers.get("content-type") || options.fallbackContentType || "image/png";
    const arrayBuffer = await response.arrayBuffer();
    const dataUri = `data:${contentType};base64,${Buffer.from(arrayBuffer).toString("base64")}`;
    outputs.push({ url, dataUri, contentType });
  }
  onProgress({ type: "progress", stage: "Loading result", progress: end });
  return outputs;
}

async function runwayJson(apiKey, path, options = {}) {
  throwIfAborted(options.signal);
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Runway-Version": API_VERSION,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  const text = await response.text();
  const json = text ? tryParseJson(text) : {};
  if (!response.ok) {
    const message =
      json?.error?.message || json?.error || json?.message || text || `Runway API error (${response.status})`;
    throw httpError(response.status, message);
  }
  return json;
}

async function readJsonBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) {
      throw httpError(413, "Request is too large.");
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function parseImageDataUrl(dataUrl) {
  const { mime, buffer } = parseBase64DataUrl(dataUrl, "image");
  if (!mime.startsWith("image/")) {
    throw httpError(400, "Expected a base64 image data URL.");
  }
  if (buffer.length < 512) {
    throw httpError(400, "Image upload is too small.");
  }
  return { mime, buffer };
}

function parseVideoDataUrl(dataUrl) {
  const { mime, buffer } = parseBase64DataUrl(dataUrl, "video");
  if (!mime.startsWith("video/")) {
    throw httpError(400, "Expected a base64 video data URL.");
  }
  if (!["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"].includes(mime)) {
    throw httpError(400, "Seedance input must be MP4, MOV, M4V, or WebM video.");
  }
  if (buffer.length < 4096) {
    throw httpError(400, "Video upload is too small.");
  }
  return { mime, buffer };
}

function parseBase64DataUrl(dataUrl, kind) {
  const match = /^data:([^,]*),(.*)$/is.exec(String(dataUrl || ""));
  if (!match) {
    throw httpError(400, `Expected a base64 ${kind} data URL.`);
  }
  const mediaParts = match[1]
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const mime = (mediaParts.shift() || "").toLowerCase();
  if (!mediaParts.some((part) => part.toLowerCase() === "base64")) {
    throw httpError(400, `Expected a base64 ${kind} data URL.`);
  }
  return {
    mime,
    buffer: Buffer.from(match[2], "base64"),
  };
}

function safeMediaFilename(value, fallback) {
  const name = String(value || fallback)
    .split(/[\\/]/)
    .pop()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return name || fallback;
}

function loadEnvFile(filename) {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function getRunwayApiKey() {
  return process.env.RUNWAYML_API_SECRET || process.env.RUNWAY_SKILLS_API_SECRET || "";
}

function readPortArg() {
  const index = process.argv.indexOf("--port");
  if (index >= 0) return process.argv[index + 1];
  return null;
}

function sendJson(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function sanitizeRatio(ratio, fallback) {
  return typeof ratio === "string" && /^\d+:\d+$/.test(ratio) ? ratio : fallback;
}

function sanitizeSeedanceImageRatio(ratio) {
  return sanitizeChoice(
    ratio,
    [
      "1280:720",
      "720:1280",
      "960:960",
      "1112:834",
      "834:1112",
      "1470:630",
      "992:432",
      "864:496",
      "752:560",
      "640:640",
      "560:752",
      "496:864",
    ],
    "960:960",
  );
}

function sanitizeChoice(value, choices, fallback) {
  return choices.includes(value) ? value : fallback;
}

function clampInt(value, min, max) {
  const number = Math.round(Number(value) || min);
  return Math.max(min, Math.min(max, number));
}

function clampPrompt(value, maxLength) {
  const prompt = value.trim();
  if (!prompt) {
    throw httpError(400, "Prompt is required.");
  }
  return prompt.length > maxLength ? prompt.slice(0, maxLength) : prompt;
}

function taskProgress(task, started, start = 0.42, end = 0.9, estimateMs = 3 * 60 * 1000) {
  if (task.status === "SUCCEEDED") return end;
  if (["FAILED", "CANCELLED"].includes(task.status)) return 1;
  const rawProgress = Number(task.progress ?? task.percentComplete ?? task.percentage);
  if (Number.isFinite(rawProgress)) {
    const normalized = rawProgress > 1 ? rawProgress / 100 : rawProgress;
    return start + Math.max(0, Math.min(1, normalized)) * (end - start);
  }
  const elapsed = Date.now() - started;
  const estimated = Math.min(1, elapsed / Math.max(1000, estimateMs));
  return Math.min(end - 0.01, start + estimated * (end - start));
}

function positiveNumberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function formatDuration(milliseconds) {
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minutes`;
  return `${(minutes / 60).toFixed(1)} hours`;
}

function titleCaseTaskStatus(status) {
  return String(status || "Generating")
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) {
    throw signal.reason;
  }
  const error = new Error("Request aborted.");
  error.name = "AbortError";
  error.status = 499;
  throw error;
}

function delay(ms, signal) {
  throwIfAborted(signal);
  return new Promise((resolveDelay, rejectDelay) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abortDelay);
      resolveDelay();
    }, ms);

    function abortDelay() {
      clearTimeout(timeout);
      rejectDelay(signal.reason instanceof Error ? signal.reason : httpError(499, "Request aborted."));
    }

    signal?.addEventListener("abort", abortDelay, { once: true });
  });
}

import type { ApiJson, ApiPayload, JobOptions, ProgressWriter } from "./types";
import {
  DEFAULT_DEPTH_PROMPT,
  DEFAULT_SEEDANCE_IMAGE_PROMPT,
  DEFAULT_SEEDANCE_PROMPT,
  DEPTH_MAP_MODEL,
  getRunwayApiKey,
  INPAINT_MODEL,
  MODEL_CONFIG,
  SEEDANCE_MODEL,
  SEEDANCE_POLL_TIMEOUT_MS,
  SEEDANCE_PROGRESS_ESTIMATE_MS,
  SEEDANCE_PROMPT_MAX,
  SEEDANCE_VIDEO_MAX_BYTES,
} from "./config";
import { httpError, throwIfAborted } from "./errors";
import { downloadTaskOutputs, runwayJson, uploadEphemeralFile, waitForRunwayTask } from "./http";
import { parseImageDataUrl, parseVideoDataUrl, safeMediaFilename } from "./media";
import {
  clampInt,
  clampPrompt,
  clampSeedanceDuration,
  sanitizeChoice,
  sanitizeRatio,
  sanitizeReferenceTag,
  sanitizeSeedanceRatio,
} from "./utils";
import {
  validateRunwayDepthMapPayload,
  validateRunwayInpaintPayload,
  validateRunwaySeedanceImagePayload,
  validateRunwaySeedanceVideoPayload,
} from "./schemas";

async function createRunwayInpaint(
  payload: ApiPayload,
  onProgress: ProgressWriter = () => {},
  options: JobOptions = {},
) {
  payload = validateRunwayInpaintPayload(payload);
  throwIfAborted(options.signal);
  onProgress({ type: "progress", stage: "Validating", progress: 0.03 });
  const apiKey = getRunwayApiKey();
  if (!apiKey) {
    throw httpError(401, "Set RUNWAYML_API_SECRET before using Runway inpaint.");
  }

  const model = sanitizeChoice(payload.model, Object.keys(MODEL_CONFIG), INPAINT_MODEL);
  const config = MODEL_CONFIG[model];
  if (!config) {
    throw httpError(400, `Unsupported Runway image model: ${model}`);
  }

  const { buffer, mime } = parseImageDataUrl(payload.imageDataUrl);
  const sourceImage = payload.sourceImageDataUrl ? parseImageDataUrl(payload.sourceImageDataUrl) : null;
  const filename = `fulldome-plate-handoff-${Date.now()}.png`;
  const referenceUri = await uploadEphemeralFile({
    apiKey,
    filename,
    buffer,
    mime,
    onProgress,
    signal: options.signal,
  });
  const sourceReferenceUri = sourceImage
    ? await uploadEphemeralFile({
        apiKey,
        filename: safeMediaFilename(payload.sourceFilename, `fulldome-source-reference-${Date.now()}.png`),
        buffer: sourceImage.buffer,
        mime: sourceImage.mime,
        onProgress,
        signal: options.signal,
      })
    : null;
  const promptText = clampPrompt(String(payload.prompt || ""), config.maxPrompt);
  const sourceImageTag = sanitizeReferenceTag(payload.sourceImageTag, "source");
  const referenceImageTag = sanitizeReferenceTag(payload.referenceImageTag, "plate_sketch");
  const referenceImages = [
    ...(sourceReferenceUri ? [{ uri: sourceReferenceUri, tag: sourceImageTag }] : []),
    { uri: referenceUri, tag: referenceImageTag },
  ];
  const extraReferenceImages = Array.isArray(payload.extraReferenceImages) ? payload.extraReferenceImages : [];
  for (let index = 0; index < extraReferenceImages.length && referenceImages.length < config.maxReferences; index += 1) {
    const extra = extraReferenceImages[index];
    if (!extra || typeof extra !== "object") continue;
    const tag = sanitizeReferenceTag(extra.tag, `ref${index + 1}`);
    if (typeof extra.uri === "string" && extra.uri.trim()) {
      referenceImages.push({ uri: extra.uri.trim(), tag });
      continue;
    }
    const extraImageDataUrl = String(extra.imageDataUrl || extra.dataUri || "");
    if (!extraImageDataUrl) continue;
    const extraImage = parseImageDataUrl(extraImageDataUrl);
    const extraReferenceUri = await uploadEphemeralFile({
      apiKey,
      filename: safeMediaFilename(extra.filename, `fulldome-extra-reference-${Date.now()}-${index + 1}.png`),
      buffer: extraImage.buffer,
      mime: extraImage.mime,
      onProgress,
      signal: options.signal,
    });
    referenceImages.push({ uri: extraReferenceUri, tag });
  }
  const body: ApiJson = {
    model,
    promptText,
    ratio: sanitizeRatio(payload.ratio, config.ratio),
    referenceImages,
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

async function createRunwayDepthMap(
  payload: ApiPayload,
  onProgress: ProgressWriter = () => {},
  options: JobOptions = {},
) {
  payload = validateRunwayDepthMapPayload(payload);
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
  const body: ApiJson = {
    model,
    promptText,
    ratio: sanitizeRatio(payload.ratio, config.ratio),
    referenceImages: [{ uri: referenceUri, tag: "source" }],
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

async function createRunwaySeedanceVideo(
  payload: ApiPayload,
  onProgress: ProgressWriter = () => {},
  options: JobOptions = {},
) {
  payload = validateRunwaySeedanceVideoPayload(payload);
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
  const sourceImage = payload.imageDataUrl ? parseImageDataUrl(payload.imageDataUrl) : null;
  const finalImage = payload.finalImageDataUrl ? parseImageDataUrl(payload.finalImageDataUrl) : null;

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
  const promptImage = sourceImage
    ? await uploadEphemeralFile({
        apiKey,
        filename: safeMediaFilename(payload.imageFilename, "fulldome-seedance-source.png"),
        buffer: sourceImage.buffer,
        mime: sourceImage.mime,
        onProgress,
        signal: options.signal,
      })
    : null;
  const finalPromptImage = finalImage
    ? await uploadEphemeralFile({
        apiKey,
        filename: safeMediaFilename(payload.finalFilename, "fulldome-seedance-final.png"),
        buffer: finalImage.buffer,
        mime: finalImage.mime,
        onProgress,
        signal: options.signal,
      })
    : null;

  const body = promptImage
    ? {
        model: SEEDANCE_MODEL,
        promptText,
        references: [{ uri: promptImage }, ...(finalPromptImage ? [{ uri: finalPromptImage }] : [])],
        referenceVideos: [{ type: "video", uri: promptVideo }],
        ratio: sanitizeSeedanceRatio(payload.ratio),
        duration: clampSeedanceDuration(payload.duration),
      }
    : {
        model: SEEDANCE_MODEL,
        promptVideo,
        promptText,
        ratio: sanitizeSeedanceRatio(payload.ratio),
        duration: clampSeedanceDuration(payload.duration),
      };
  const endpoint = promptImage ? "/v1/text_to_video" : "/v1/video_to_video";

  onProgress({ type: "progress", stage: "Creating Seedance task", progress: 0.34 });
  const task = await runwayJson(apiKey, endpoint, {
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
    referenceMode: finalPromptImage
      ? "source-final-and-motion-video"
      : promptImage
        ? "source-image-and-motion-video"
        : "motion-video-only",
    ratio: body.ratio,
    duration: body.duration,
    outputs,
  };
}

async function createRunwaySeedanceImageVideo(
  payload: ApiPayload,
  onProgress: ProgressWriter = () => {},
  options: JobOptions = {},
) {
  payload = validateRunwaySeedanceImagePayload(payload);
  throwIfAborted(options.signal);
  onProgress({ type: "progress", stage: "Validating", progress: 0.03 });
  const apiKey = getRunwayApiKey();
  if (!apiKey) {
    throw httpError(401, "Set RUNWAYML_API_SECRET before sending an image to Seedance.");
  }

  const { buffer, mime } = parseImageDataUrl(payload.imageDataUrl);
  const finalImage = payload.finalImageDataUrl ? parseImageDataUrl(payload.finalImageDataUrl) : null;
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
  const finalPromptImage = finalImage
    ? await uploadEphemeralFile({
        apiKey,
        filename: safeMediaFilename(payload.finalFilename, "fulldome-seedance-final.png"),
        buffer: finalImage.buffer,
        mime: finalImage.mime,
        onProgress,
        signal: options.signal,
      })
    : null;

  const body = {
    model: SEEDANCE_MODEL,
    promptImage: finalPromptImage
      ? [
          { uri: promptImage, position: "first" },
          { uri: finalPromptImage, position: "last" },
        ]
      : [{ uri: promptImage, position: "first" }],
    promptText,
    ratio: sanitizeSeedanceRatio(payload.ratio),
    duration: clampSeedanceDuration(payload.duration),
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
    inputBytes: buffer.length + (finalImage?.buffer.length || 0),
    referenceMode: finalPromptImage ? "first-and-last-image" : "first-image-only",
    outputs,
  };
}

export async function requestRunwayInpaint(
  payload: ApiPayload,
  onProgress: ProgressWriter = () => {},
  options: JobOptions = {},
) {
  return createRunwayInpaint(payload, onProgress, options);
}

export async function requestRunwayDepthMap(
  payload: ApiPayload,
  onProgress: ProgressWriter = () => {},
  options: JobOptions = {},
) {
  return createRunwayDepthMap(payload, onProgress, options);
}

export async function requestRunwaySeedanceVideo(
  payload: ApiPayload,
  onProgress: ProgressWriter = () => {},
  options: JobOptions = {},
) {
  return createRunwaySeedanceVideo(payload, onProgress, options);
}

export async function requestRunwaySeedanceImageVideo(
  payload: ApiPayload,
  onProgress: ProgressWriter = () => {},
  options: JobOptions = {},
) {
  return createRunwaySeedanceImageVideo(payload, onProgress, options);
}

import { z, ZodError } from "zod";
import type { ApiPayload } from "./types";
import { httpError } from "./errors";

const dataUrl = z.string().regex(/^data:[^,]*;base64,/i, "Expected a base64 data URL.");
const optionalDataUrl = z.union([dataUrl, z.literal(""), z.null()]).optional();
const looseObject = z.record(z.string(), z.unknown());
const promptString = z.string().trim().min(1, "Prompt is required.");
const ratioString = z.string().regex(/^\d+:\d+$/, "Ratio must use width:height format.").optional();
const referenceImage = z
  .object({
    tag: z.string().optional(),
    uri: z.string().optional(),
    imageDataUrl: optionalDataUrl,
    dataUri: optionalDataUrl,
    filename: z.string().optional(),
  })
  .passthrough();

const baseGenerationPayload = z.object({
  prompt: z.string().optional(),
  ratio: ratioString,
  duration: z.number().or(z.string()).optional(),
  filename: z.string().optional(),
}).passthrough();

const runwayInpaintPayload = baseGenerationPayload.extend({
  imageDataUrl: dataUrl,
  prompt: promptString,
  model: z.enum(["gpt_image_2", "gemini_image3_pro"]).optional(),
  sourceImageDataUrl: optionalDataUrl,
  sourceFilename: z.string().optional(),
  sourceImageTag: z.string().optional(),
  referenceImageTag: z.string().optional(),
  outputCount: z.number().or(z.string()).optional(),
  quality: z.enum(["low", "medium", "high", "auto"]).optional(),
  extraReferenceImages: z.array(referenceImage).optional(),
});

const runwayDepthMapPayload = baseGenerationPayload.extend({
  imageDataUrl: dataUrl,
  quality: z.enum(["low", "medium", "high", "auto"]).optional(),
});

const runwaySeedanceVideoPayload = baseGenerationPayload.extend({
  videoDataUrl: dataUrl,
  imageDataUrl: optionalDataUrl,
  finalImageDataUrl: optionalDataUrl,
  imageFilename: z.string().optional(),
  finalFilename: z.string().optional(),
});

const runwaySeedanceImagePayload = baseGenerationPayload.extend({
  imageDataUrl: dataUrl,
  finalImageDataUrl: optionalDataUrl,
  finalFilename: z.string().optional(),
});

const motionFramePayload = z.object({
  imageDataUrl: dataUrl,
  progress: z.number().or(z.string()).optional(),
  label: z.string().optional(),
}).passthrough();

const codexSeedancePromptPayload = z.object({
  sourceImageDataUrl: dataUrl,
  depthImageDataUrl: dataUrl,
  motionFrames: z.array(motionFramePayload).optional(),
  source: looseObject.optional(),
  depth: looseObject.optional(),
  projection: looseObject.optional(),
  motion: looseObject.optional(),
  guide: looseObject.optional(),
  promptMode: z.string().optional(),
  currentPrompt: z.string().optional(),
}).passthrough();

const codexSeedanceImagePromptPayload = z.object({
  sourceImageDataUrl: dataUrl,
  finalImageDataUrl: optionalDataUrl,
  source: looseObject.optional(),
  finalState: looseObject.optional(),
  projection: looseObject.optional(),
  promptMode: z.string().optional(),
  durationSeconds: z.number().or(z.string()).optional(),
  ratio: ratioString,
  currentPrompt: z.string().optional(),
}).passthrough();

export function validateRunwayInpaintPayload(payload: ApiPayload): ApiPayload {
  return parsePayload("Runway inpaint", runwayInpaintPayload, payload);
}

export function validateRunwayDepthMapPayload(payload: ApiPayload): ApiPayload {
  return parsePayload("Runway depth map", runwayDepthMapPayload, payload);
}

export function validateRunwaySeedanceVideoPayload(payload: ApiPayload): ApiPayload {
  return parsePayload("Runway Seedance video", runwaySeedanceVideoPayload, payload);
}

export function validateRunwaySeedanceImagePayload(payload: ApiPayload): ApiPayload {
  return parsePayload("Runway Seedance image", runwaySeedanceImagePayload, payload);
}

export function validateCodexSeedancePromptPayload(payload: ApiPayload): ApiPayload {
  return parsePayload("Codex Seedance prompt", codexSeedancePromptPayload, payload);
}

export function validateCodexSeedanceImagePromptPayload(payload: ApiPayload): ApiPayload {
  return parsePayload("Codex Seedance image prompt", codexSeedanceImagePromptPayload, payload);
}

function parsePayload(label: string, schema: z.ZodType<unknown>, payload: ApiPayload): ApiPayload {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw httpError(400, formatZodError(label, result.error));
  }
  return result.data as ApiPayload;
}

function formatZodError(label: string, error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return `${label} payload is invalid.`;
  const path = issue.path.length ? issue.path.join(".") : "payload";
  return `${label} ${path}: ${issue.message}`;
}

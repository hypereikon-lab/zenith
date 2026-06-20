import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Codex } from "@openai/codex-sdk";
import type { ApiPayload, JobOptions, ProgressWriter } from "./types";
import {
  CODEX_PROMPT_MODEL,
  CODEX_PROMPT_REASONING,
  DEFAULT_SEEDANCE_IMAGE_PROMPT,
  DEFAULT_SEEDANCE_PROMPT,
  SEEDANCE_IMAGE_PROMPT_PACK_DIR,
  SEEDANCE_IMAGE_PROMPT_PACK_FILES,
  SEEDANCE_PROMPT_MAX,
  SEEDANCE_PROMPT_PACK_DIR,
  SEEDANCE_PROMPT_PACK_FILES,
} from "./config";
import { throwIfAborted } from "./errors";
import { parseImageDataUrl } from "./media";
import { asRecord, clampPrompt, parseJsonObject, sanitizeChoice } from "./utils";
import { validateCodexSeedanceImagePromptPayload, validateCodexSeedancePromptPayload } from "./schemas";

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
async function createCodexSeedancePrompt(
  payload: ApiPayload,
  onProgress: ProgressWriter = () => {},
  options: JobOptions = {},
) {
  payload = validateCodexSeedancePromptPayload(payload);
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
        ...motionImages.map((path) => ({ type: "local_image" as const, path })),
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

async function createCodexSeedanceImagePrompt(
  payload: ApiPayload,
  onProgress: ProgressWriter = () => {},
  options: JobOptions = {},
) {
  payload = validateCodexSeedanceImagePromptPayload(payload);
  throwIfAborted(options.signal);
  onProgress({ type: "progress", stage: "Preparing Codex image context", progress: 0.08 });

  const tempDir = await createCodexPromptTempDir();
  try {
    const sourceImage = await writePromptImage(tempDir, "source-image.jpg", payload.sourceImageDataUrl);
    const finalImage = payload.finalImageDataUrl
      ? await writePromptImage(tempDir, "final-state.jpg", payload.finalImageDataUrl)
      : null;
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
        ...(finalImage ? [{ type: "local_image" as const, path: finalImage }] : []),
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

function normalizeMotionFramePayload(frames: unknown): ApiPayload[] {
  return Array.isArray(frames) ? frames.filter((frame) => typeof frame?.imageDataUrl === "string").slice(0, 8) : [];
}

async function createCodexPromptTempDir(): Promise<string> {
  const dir = join(
    process.cwd(),
    ".codex",
    "tmp",
    `zenith-codex-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(dir, { recursive: true });
  return dir;
}

async function writePromptImage(tempDir: string, filename: string, dataUrl: unknown): Promise<string> {
  const { buffer } = parseImageDataUrl(dataUrl);
  const path = join(tempDir, filename);
  await writeFile(path, buffer);
  return path;
}

function buildSeedancePromptPlannerInstruction(payload: ApiPayload): string {
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
Create a Runway Seedance 2.0 reference prompt for a still source image plus an MP4 guide generated from that image and a metric depth map. The planning attachments are in this order:
1. Image1: the final/inpainted source domemaster frame and source of truth for appearance.
2. Depth map: generation aid only.
3+. Video1 frame samples: sampled frames from the generated 2.5D/depth-warp motion plate.

The Seedance request will include Image1 as a still image reference and the 2.5D MP4 as a video reference. The prompt must make that relationship explicit: use the still image reference as the visual source of truth, and use the video reference as choreography/camera guide. It should tell Seedance to preserve the guide's timing, camera path, parallax direction, fisheye geometry, black outside-circle mask, and motion rhythm, while rebuilding appearance from Image1.

Use the current prompt as a starting point, but rewrite it with more intent if the motion settings imply a clearer camera move.

Seedance prompt-pack context:
${promptPackContext}

Hard constraints:
- Return only the requested JSON object.
- seedancePrompt must be under ${SEEDANCE_PROMPT_MAX} characters.
- Aim for 90-160 words unless the guide has clear timed beats; write compact production direction, not an explanation.
- Do not mention "depth map", "WebGPU", UI controls, sampled frames, or implementation details in seedancePrompt.
- Preserve the user's task context from currentPrompt when present: continuation, edit-only, style conversion, readable text, dialogue/audio, and motion-reference transfer require different language.
- Do not invent dialogue, subtitles, readable text, audio direction, or style conversion when the user/currentPrompt did not ask for them.
- It is recommended to say "still image reference", "source frame", "video reference", or "motion guide" when describing how Seedance should use each input.
- Do not ask Seedance to change the scene identity.
- Unless currentPrompt explicitly requires readable in-scene text, do not ask for text, labels, rectangular borders, UI overlays, subtitles, logos, or visible masks.
- Preserve the square domemaster, circular fisheye projection, and pitch-black exterior outside the projection circle.
- Treat the MP4 as the choreography/camera guide, not as the visual source of truth.
- Never say "preserve Video1 exactly" or "preserve the original video exactly" for this workflow.
- Use Image1 as the source of truth for appearance; use Video1 only for timing, camera motion, parallax direction, and broad motion rhythm.
- Name only relevant 2.5D/depth-warp defects as artifacts to reject, then state the positive replacement briefly.
- If requestedMode is "auto", choose one of strict_repair, conservative_lock, or more_volumetric. If a concrete mode is requested, use that mode for seedancePrompt.

Motion/settings context:
${JSON.stringify(settings, null, 2)}

JSON fields:
- diagnosis: 2-5 concise sentences about Image1, Video1 motion, likely depth-warp damage, and what should be repaired.
- sceneCardSummary: compact SceneCard-style summary of Image1.
- motionPlateCardSummary: compact MotionPlateCard-style summary of Video1 frame samples and motion settings.
- selectedMode: strict_repair, conservative_lock, or more_volumetric.
- seedancePrompt: final prompt to send to Runway Seedance with the still image reference plus video reference using selectedMode.
- promptStrategy: one sentence explaining why this prompt should help Seedance.
- variants.strictRepair: paste-ready strict repair variant.
- variants.conservativeLock: paste-ready conservative lock variant.
- variants.moreVolumetric: paste-ready more volumetric variant.
- negativeTerms: compact list of artifact/negative terms useful for this pair.
- warnings: short array of practical risks, empty if none.`;
}

function buildSeedanceImagePromptPlannerInstruction(payload: ApiPayload): string {
  const promptPackContext = loadSeedanceImagePromptPackContext();
  const hasFinalState = typeof payload.finalImageDataUrl === "string" && payload.finalImageDataUrl.length > 0;
  const settings = {
    source: payload.source || {},
    finalState: payload.finalState || null,
    projection: payload.projection || {},
    requestedMode: payload.promptMode || "auto",
    durationSeconds: payload.durationSeconds || 5,
    ratio: payload.ratio || "960:960",
    currentPrompt: String(payload.currentPrompt || DEFAULT_SEEDANCE_IMAGE_PROMPT),
  };

  if (hasFinalState) {
    return `You are a local Codex prompt planner inside Zenith, a WebGPU fulldome domemaster tool.

Goal:
Create a Runway Seedance 2.0 first/last image-to-video prompt. The planning attachments are in this order:
1. Image1: the clean first/source domemaster frame and source of truth for scene identity, materials, lighting, color, layout, and projection.
2. Image2: a reconstructed final-state still made from a 2.5D endpoint. It defines the desired end pose/composition/parallax endpoint, not a new scene.

The Seedance request will include Image1 as promptImage position "first" and Image2 as promptImage position "last". The prompt must make that relationship explicit without exposing implementation details: start from Image1, move continuously toward Image2, preserve the same scene identity, and let visible materials perform natural in-between motion instead of treating the two images as unrelated frames.

Use currentPrompt only when it is still useful for this paired-frame task.

Seedance image prompt-pack context:
${promptPackContext}

Hard constraints:
- Return only the requested JSON object.
- seedancePrompt must be under ${SEEDANCE_PROMPT_MAX} characters.
- Aim for 80-150 words; write compact production direction, not an explanation.
- Do not mention "depth map", "WebGPU", "2.5D", UI controls, reconstruction, masks, sampled frames, or implementation details in seedancePrompt.
- It is recommended to say "first image", "last image", "source frame", or "final frame" to establish reference roles.
- Use Image1 as the visual source of truth for identity, style, materials, lighting, and domemaster geometry.
- Use Image2 only as the final endpoint for pose, parallax, composition, and where motion should arrive.
- Preserve the square domemaster/circular fisheye geometry when present, including pure black outside the projection circle.
- Write a continuous one-shot transition: no cut, no scene change, no teleport, no fade-to-black, no new unrelated subject.
- Let visible materials bridge the states: background/sky, particles, glass/interface marks, plants/branches/flowers/grass, water, entities, or lighting move independently when visible. Name only materials visible in the images.
- If Image2 contains endpoint defects, ask Seedance to arrive at its composition while rebuilding clean natural detail from Image1; reject tearing, holes, splat speckles, broken reprojection edges, banding, and rectangular seams.
- Avoid slow pushes into sparse center sky unless Image2 creates visible center activity; prefer locked or rim-anchored motion that keeps useful rim content alive.
- If requestedMode is "auto", choose one of ambient_scene_motion, scene_event, or material_life. If a concrete mode is requested, use that mode for seedancePrompt.

First/last image-to-video context:
${JSON.stringify(settings, null, 2)}

JSON fields:
- diagnosis: 2-5 concise sentences about Image1, Image2, likely endpoint artifacts, and how motion should bridge them.
- sceneCardSummary: compact SceneCard-style summary of Image1 and the final-state endpoint.
- selectedMode: ambient_scene_motion, scene_event, or material_life.
- seedancePrompt: final prompt to send to Runway Seedance first/last image-to-video using selectedMode.
- promptStrategy: one sentence explaining how the prompt uses Image1 and Image2.
- variants.ambientSceneMotion: paste-ready restrained state-transition variant.
- variants.sceneEvent: paste-ready event-based state-transition variant.
- variants.materialLife: paste-ready material-motion state-transition variant.
- negativeTerms: compact list of artifact/negative terms useful for this pair.
- warnings: short array of practical risks, empty if none.`;
  }

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
- Aim for 70-140 words unless the image clearly needs a sequence; write compact production direction, not an explanation.
- Do not mention "attached image", "depth map", "WebGPU", UI controls, sampled frames, or implementation details in seedancePrompt.
- Preserve the user's task context from currentPrompt when present: continuation, edit-only, style conversion, readable text, and dialogue/audio require different language.
- Do not invent dialogue, subtitles, readable text, audio direction, or style conversion when the user/currentPrompt did not ask for them.
- Do not mention a video guide, motion plate, or video reference.
- Use Image1 as the source of truth for appearance, scene identity, composition, color, lighting, materials, and detail.
- Preserve the square domemaster/circular fisheye geometry when Image1 has it, including pure black outside the projection circle.
- The prompt must create visible content motion from the still image: one motion spine, relevant local material/detail verbs, and at most one restrained camera/depth instruction.
- For fulldome/domemaster images, choose a concrete motion thesis before writing: scan path, rim pulse, particle current, refractive caustics, botanical response, source-derived emergence, glass vine growth, petal or pollen apparition, interface shimmer, sky emergence, constellation reveal, locked depth breathing, or rim-anchored drift. General ambience or camera drift alone is not enough.
- Keep the selected thesis differentiated. Do not make every prompt use the same generic petals/leaves/motes support layer; choose support details that clarify the thesis and use a start-path-settle shape when possible.
- Do not import interface, holographic, water, grass, or entity language unless those materials are visible in Image1.
- If a prompt needs more action, allow one temporary source-derived phenomenon: native light, particles, petals, pollen, dew, glass, clouds, mist, or visible marks may coalesce, open, branch, cascade, or materialize, then dissolve. This is allowed only when it grows from visible materials and does not become an unrelated subject, logo, readable symbol, or permanent scene redesign.
- If the selected thesis is abstract interface shimmer, make continuity explicit: one unbroken locked shot, same composition from first frame to last frame, no scene transition, no viewpoint change. Prefer using interface shimmer as support under rim pulse, scan path, or refractive caustics.
- If the user wants background and materials to move independently, write layered motion: distant sky/background moves slowly behind the scene, mid-layer particles/glass/interface/reflections move separately, foreground visible materials move locally, and the camera remains locked or nearly locked. Name only materials visible in Image1.
- For fulldome/domemaster images, reason about center/rim topology. If the center is sparse sky or negative space, do not use a slow push or zoom toward it; use locked camera, rim-anchored micro drift, local depth breathing, or a visible path event through existing rings/materials.
- Prioritize local scene behavior over global moves. Avoid fast orbit, spin, sweep, rollercoaster, or generic camera-only animation unless the image clearly demands it.
- Avoid generic prompt-only motion like "make it cinematic" without naming what moves.
- Unless currentPrompt explicitly requires readable in-scene text, do not ask for text, labels, rectangular borders, UI overlays, subtitles, logos, unrelated subjects, or permanent scene redesign. For source-derived emergence, do not use the lock "no new major objects"; use "no unrelated permanent objects" or "no unrelated subjects" instead.
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

function normalizeCodexSeedancePromptResponse(text: unknown) {
  const parsed = parseJsonObject(text);
  const parsedVariants = asRecord(parsed.variants);
  const negativeTerms = Array.isArray(parsed.negativeTerms)
    ? parsed.negativeTerms
    : Array.isArray(parsed.negative_terms)
      ? parsed.negative_terms
      : [];
  const variants = {
    strictRepair: clampOptionalPrompt(parsedVariants.strictRepair || parsedVariants.strict_repair),
    conservativeLock: clampOptionalPrompt(parsedVariants.conservativeLock || parsedVariants.conservative_lock),
    moreVolumetric: clampOptionalPrompt(parsedVariants.moreVolumetric || parsedVariants.more_volumetric),
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
    negativeTerms: negativeTerms.map((item: unknown) => String(item).trim()).filter(Boolean),
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map((item: unknown) => String(item).trim()).filter(Boolean) : [],
  };
}

function normalizeCodexSeedanceImagePromptResponse(text: unknown) {
  const parsed = parseJsonObject(text);
  const parsedVariants = asRecord(parsed.variants);
  const negativeTerms = Array.isArray(parsed.negativeTerms)
    ? parsed.negativeTerms
    : Array.isArray(parsed.negative_terms)
      ? parsed.negative_terms
      : [];
  const variants = {
    ambientSceneMotion: clampOptionalPrompt(
      parsedVariants.ambientSceneMotion || parsedVariants.ambient_scene_motion || parsedVariants.ambientDomeMotion,
    ),
    sceneEvent: clampOptionalPrompt(
      parsedVariants.sceneEvent || parsedVariants.scene_event || parsedVariants.cinematicReveal,
    ),
    materialLife: clampOptionalPrompt(
      parsedVariants.materialLife || parsedVariants.material_life || parsedVariants.volumetricOrbit,
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
    negativeTerms: negativeTerms.map((item: unknown) => String(item).trim()).filter(Boolean),
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map((item: unknown) => String(item).trim()).filter(Boolean) : [],
  };
}

function clampOptionalPrompt(value: unknown): string {
  const prompt = String(value || "").trim();
  return prompt ? (prompt.length > SEEDANCE_PROMPT_MAX ? prompt.slice(0, SEEDANCE_PROMPT_MAX) : prompt) : "";
}

function loadSeedancePromptPackContext(): string {
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

function loadSeedanceImagePromptPackContext(): string {
  const parts = [];
  for (const filename of SEEDANCE_IMAGE_PROMPT_PACK_FILES) {
    const path = resolve(SEEDANCE_IMAGE_PROMPT_PACK_DIR, filename);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8").trim();
    if (!text) continue;
    parts.push(`\n--- ${filename} ---\n${normalizePromptPackText(text)}`);
  }
  if (parts.length === 0) {
    return `Prompt-pack files were not found. Use the built-in rule: Image1 is the visual source of truth; infer one clear visible motion event or material behavior from the still image while preserving domemaster geometry. Prefer locked or rim-anchored camera language over pushing toward sparse central sky.`;
  }
  return parts.join("\n");
}

function normalizePromptPackText(text: unknown): string {
  return String(text)
    .replace(/â€œ|â€/g, '"')
    .replace(/â€™/g, "'")
    .replace(/â€“|â€”/g, "-")
    .replace(/â€¦/g, "...");
}

export async function requestCodexSeedancePrompt(
  payload: ApiPayload,
  onProgress: ProgressWriter = () => {},
  options: JobOptions = {},
) {
  return createCodexSeedancePrompt(payload, onProgress, options);
}

export async function requestCodexSeedanceImagePrompt(
  payload: ApiPayload,
  onProgress: ProgressWriter = () => {},
  options: JobOptions = {},
) {
  return createCodexSeedanceImagePrompt(payload, onProgress, options);
}

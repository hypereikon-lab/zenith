import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Codex } from "@openai/codex-sdk";

const ROOT = process.cwd();
const ORIGINAL_REF = "4fdca19";
const SEEDANCE_PROMPT_MAX = 3500;
const DEFAULT_SOURCE = join(
  ROOT,
  "public",
  "default-plates",
  "hypereikon_httpss.mj.run1sf2LQw-KqE_httpss.mj.runhNwVTy8YbfE__dcce9db8-946d-4ffb-822c-34814d384f48_2.png",
);
const CURRENT_IMAGE_PACK_FILES = [
  "00_runtime_prompt_recipe.md",
  "00_seedance_image_prompt_compiler_system.md",
  "02_image_to_video_motion_recipe.md",
  "03_analysis_schemas.md",
  "04_prompt_templates.md",
  "05_feedback_repair_rules.md",
  "06_fewshot_seedance2_style.md",
  "07_fulldome_domemaster_method.md",
];
const ORIGINAL_IMAGE_PACK_FILES = [
  "00_seedance_image_prompt_compiler_system.md",
  "01_corpus_patterns.md",
  "02_image_to_video_motion_recipe.md",
  "03_analysis_schemas.md",
  "04_prompt_templates.md",
  "05_feedback_repair_rules.md",
  "06_fewshot_seedance2_style.md",
];
const MOTION_PRESETS = {
  holographic_scan: {
    mode: "scene_event",
    label: "preset-holographic-scan",
    currentPrompt:
      "Motion preset: holographic scan. Make the primary event a soft cyan scan wave traveling clockwise through the existing circular holographic rings and fine interface diagrams. Tiny star particles follow the scan path. Flowers, leaves, sky, and the dome frame remain mostly stable. Use a locked camera or rim-anchored micro parallax; do not push toward empty central sky. No readable text.",
  },
  botanical_bloom: {
    mode: "scene_event",
    label: "preset-botanical-bloom",
    currentPrompt:
      "Motion preset: botanical bloom. Make the primary event a gentle living response in the existing flowers: orchid petals flex slightly, blossoms turn toward the sky, long leaves sway, and a few already-visible small petals drift inward. Do not add new flowers or change the dome layout.",
  },
  sky_aperture: {
    mode: "scene_event",
    label: "preset-sky-aperture",
    currentPrompt:
      "Motion preset: sky aperture. Make the primary event happen in the central sky only if the sky visibly changes: clouds part, star particles appear, or a soft dawn-like glow emerges and travels outward. Do not use a generic inward push into empty sky. Keep the botanical rim and fisheye dome locked.",
  },
  particle_current: {
    mode: "material_life",
    label: "preset-particle-current",
    currentPrompt:
      "Motion preset: particle current. Make the visible star motes, pollen, dew sparks, and cyan interface specks become the main motion. They gather into slow curved streams around the dome and through the flower rim, then disperse. Keep the camera locked; do not push into the empty center.",
  },
  orbital_parallax: {
    mode: "material_life",
    label: "preset-orbital-parallax",
    currentPrompt:
      "Motion preset: orbital parallax. Make the dome feel spatial with locked-center depth breathing and a tiny rim-following clockwise drift. Foreground flowers, leaves, and holographic glass shift slightly more than the central sky. Avoid spin, fast orbit, horizon flattening, or pushing rim content toward empty sky.",
  },
};
const CODEX_SEEDANCE_IMAGE_SCHEMA = {
  type: "object",
  properties: {
    diagnosis: { type: "string" },
    sceneCardSummary: { type: "string" },
    selectedMode: { type: "string", enum: ["ambient_scene_motion", "scene_event", "material_life"] },
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
    negativeTerms: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
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

loadEnvFile(".env.local");
loadEnvFile(".env");

const args = parseArgs(process.argv.slice(2));
const sourcePath = resolve(args.source || DEFAULT_SOURCE);
if (!existsSync(sourcePath)) {
  throw new Error(`Source image not found: ${sourcePath}`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = resolve(args.out || join(ROOT, ".codex", "tmp", `seedance-recipe-comparison-${stamp}`));
mkdirSync(outDir, { recursive: true });

const imageSize = readImageSize(sourcePath);
const ratio = args.ratio || ratioForImage(imageSize);
const duration = Number(args.duration || 5);
const promptMode = args.mode || "auto";
const currentPrompt = args.currentPrompt || "";

console.log(`Source: ${sourcePath}`);
console.log(`Output: ${outDir}`);
console.log(`Mode: ${promptMode}; ratio: ${ratio}; duration: ${duration}s`);

const sourceDataUrl = imageToDataUrl(sourcePath);
const payload = {
  sourceImageDataUrl: sourceDataUrl,
  currentPrompt,
  promptMode,
  durationSeconds: duration,
  ratio,
  source: {
    name: basename(sourcePath),
    kind: "image",
    width: imageSize.width,
    height: imageSize.height,
  },
  projection: {
    mode: args.projection || "source image",
    radiusScale: 1,
    customCurve: 0,
    outsideMask: "preserve pitch black outside the circular domemaster projection when present",
  },
};

const comparisons = [];
const presetList = selectedPresets(args.presets);
if (presetList.length > 0) {
  for (const preset of presetList) {
    const presetPayload = { ...payload, currentPrompt: preset.currentPrompt, promptMode: preset.mode };
    comparisons.push(
      await runPromptPlanner({
        label: preset.label,
        prompt: buildCurrentPlannerInstruction(presetPayload),
        sourcePath,
        preset,
      }),
    );
  }
} else {
  comparisons.push(
    await runPromptPlanner({
      label: "current-runtime-recipe",
      prompt: buildCurrentPlannerInstruction(payload),
      sourcePath,
    }),
  );
  if (!args.currentOnly) {
    comparisons.push(
      await runPromptPlanner({
        label: `original-${ORIGINAL_REF}`,
        prompt: buildOriginalPlannerInstruction(payload),
        sourcePath,
      }),
    );
  }
}

for (const item of comparisons) {
  writeFileSync(join(outDir, `${item.label}.prompt.txt`), item.seedancePrompt, "utf8");
  writeFileSync(join(outDir, `${item.label}.json`), JSON.stringify(item, null, 2), "utf8");
}

if (args.runway) {
  const port = Number(args.port || 5197);
  const server = await startServer(port);
  try {
    for (const item of comparisons) {
      const video = await runSeedanceImageVideo({
        baseUrl: `http://127.0.0.1:${port}`,
        label: item.label,
        imageDataUrl: sourceDataUrl,
        prompt: item.seedancePrompt,
        ratio,
        duration,
      });
      item.seedance = video;
      writeFileSync(join(outDir, `${item.label}.json`), JSON.stringify(item, null, 2), "utf8");
    }
  } finally {
    server.kill();
  }
}

writeReport({ outDir, sourcePath, imageSize, ratio, duration, comparisons, runway: Boolean(args.runway) });
console.log(`Report: ${join(outDir, "report.md")}`);

function buildCurrentPlannerInstruction(input) {
  return buildPlannerInstruction({
    input,
    promptPackContext: loadCurrentPromptPackContext(),
    extraConstraints: [
      `- Aim for 70-140 words unless the image clearly needs a sequence; write compact production direction, not an explanation.`,
      `- Preserve the user's task context from currentPrompt when present: continuation, edit-only, style conversion, readable text, and dialogue/audio require different language.`,
      `- Do not invent dialogue, subtitles, readable text, audio direction, or style conversion when the user/currentPrompt did not ask for them.`,
      `- The prompt must create visible content motion from the still image: one motion spine, relevant local material/detail verbs, and at most one restrained camera/depth instruction.`,
      `- For fulldome/domemaster images, reason about center/rim topology. If the center is sparse sky or negative space, do not use a slow push or zoom toward it; use locked camera, rim-anchored micro drift, local depth breathing, or a visible path event through existing rings/materials.`,
      `- Unless currentPrompt explicitly requires readable in-scene text, do not ask for text, labels, rectangular borders, UI overlays, subtitles, logos, scene redesign, or new major objects.`,
    ],
  });
}

function buildOriginalPlannerInstruction(input) {
  return buildPlannerInstruction({
    input,
    promptPackContext: loadOriginalPromptPackContext(),
    extraConstraints: [
      `- The prompt must create visible content motion from the still image: at minimum one concrete scene event or local happening, three scene-specific material/detail motions, and one restrained camera/depth instruction.`,
      `- Do not ask for text, labels, rectangular borders, UI overlays, subtitles, logos, scene redesign, or new major objects.`,
    ],
  });
}

function buildPlannerInstruction({ input, promptPackContext, extraConstraints }) {
  const settings = {
    source: input.source || {},
    projection: input.projection || {},
    requestedMode: input.promptMode || "auto",
    durationSeconds: input.durationSeconds || 5,
    ratio: input.ratio || "960:960",
    currentPrompt: String(input.currentPrompt || ""),
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
- Prioritize local scene behavior over global moves. Avoid fast orbit, spin, sweep, rollercoaster, or generic camera-only animation unless the image clearly demands it.
- Avoid generic prompt-only motion like "make it cinematic" without naming what moves.
${extraConstraints.join("\n")}
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

async function runPromptPlanner({ label, prompt, sourcePath, preset = null }) {
  console.log(`Planning prompt: ${label}`);
  const codex = new Codex();
  const thread = codex.startThread({
    workingDirectory: ROOT,
    skipGitRepoCheck: true,
    sandboxMode: "read-only",
    approvalPolicy: "never",
    webSearchMode: "disabled",
    networkAccessEnabled: false,
    model: process.env.CODEX_PROMPT_MODEL || undefined,
    modelReasoningEffort: process.env.CODEX_PROMPT_REASONING || "medium",
  });
  const turn = await thread.run(
    [
      { type: "text", text: prompt },
      { type: "local_image", path: sourcePath },
    ],
    { outputSchema: CODEX_SEEDANCE_IMAGE_SCHEMA },
  );
  const result = normalizeCodexSeedanceImagePromptResponse(turn.finalResponse);
  console.log(`Prompt ready: ${label} (${wordCount(result.seedancePrompt)} words, mode ${result.selectedMode})`);
  return {
    label,
    preset,
    ...result,
    model: process.env.CODEX_PROMPT_MODEL || "codex-default",
    reasoning: process.env.CODEX_PROMPT_REASONING || "medium",
  };
}

function normalizeCodexSeedanceImagePromptResponse(text) {
  const parsed = parseJsonObject(text);
  const variants = {
    ambientSceneMotion: clampOptionalPrompt(
      parsed.variants?.ambientSceneMotion || parsed.variants?.ambient_scene_motion || parsed.variants?.ambientDomeMotion,
    ),
    sceneEvent: clampOptionalPrompt(parsed.variants?.sceneEvent || parsed.variants?.scene_event || parsed.variants?.cinematicReveal),
    materialLife: clampOptionalPrompt(parsed.variants?.materialLife || parsed.variants?.material_life || parsed.variants?.volumetricOrbit),
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

async function startServer(port) {
  console.log(`Starting local server on ${port} for Runway calls`);
  const child = spawn(process.execPath, ["server.mjs", "--port", String(port)], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[server] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[server] ${chunk}`));
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/runway/status`);
      if (response.ok) {
        const status = await response.json();
        if (!status.configured) throw new Error("RUNWAYML_API_SECRET is not configured.");
        return child;
      }
    } catch {
      // keep waiting
    }
    await delay(500);
  }
  child.kill();
  throw new Error(`Server did not start on port ${port}.`);
}

async function runSeedanceImageVideo({ baseUrl, label, imageDataUrl, prompt, ratio, duration }) {
  console.log(`Running Seedance image-to-video: ${label}`);
  const result = await postProgress(`${baseUrl}/api/runway/seedance-image-stream`, {
    imageDataUrl,
    prompt,
    filename: `${label}-source.png`,
    ratio,
    duration,
  });
  const outputs = [];
  for (const [index, output] of (result.outputs || []).entries()) {
    const saved = await saveOutput(output, join(outDir, `${label}-${index + 1}.mp4`));
    outputs.push({ ...output, saved });
    console.log(`Saved ${label} output ${index + 1}: ${saved}`);
  }
  return {
    id: result.id,
    status: result.status,
    model: result.model,
    ratio: result.ratio,
    duration: result.duration,
    outputs,
  };
}

async function postProgress(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || `Request failed (${response.status})`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const result = handleProgressLine(line);
        if (result) return result;
      }
    }
    if (done) break;
  }
  if (buffer.trim()) {
    const result = handleProgressLine(buffer);
    if (result) return result;
  }
  throw new Error("Progress stream closed before a result.");
}

function handleProgressLine(line) {
  if (!line.trim()) return null;
  const event = JSON.parse(line);
  if (event.type === "error") throw new Error(event.error || "Progress stream failed.");
  if (event.type === "complete") return event.result;
  if (event.stage) {
    const percent = Math.round((Number(event.progress) || 0) * 100);
    console.log(`  ${event.stage} ${percent}%`);
  }
  return null;
}

async function saveOutput(output, path) {
  if (output.dataUri) {
    const match = /^data:[^;]+;base64,(.+)$/.exec(output.dataUri);
    if (!match) throw new Error("Unexpected data URI output.");
    writeFileSync(path, Buffer.from(match[1], "base64"));
    return path;
  }
  if (output.url) {
    const response = await fetch(output.url);
    if (!response.ok) throw new Error(`Could not download output URL (${response.status}).`);
    writeFileSync(path, Buffer.from(await response.arrayBuffer()));
    return path;
  }
  throw new Error("Output has no dataUri or url.");
}

function loadCurrentPromptPackContext() {
  return CURRENT_IMAGE_PACK_FILES.map((filename) => {
    const path = join(ROOT, "docs", "seedance_image_prompt_pack", filename);
    if (!existsSync(path)) return "";
    return `\n--- ${filename} ---\n${normalizePromptPackText(readFileSync(path, "utf8").trim())}`;
  })
    .filter(Boolean)
    .join("\n");
}

function loadOriginalPromptPackContext() {
  return ORIGINAL_IMAGE_PACK_FILES.map((filename) => {
    const path = `docs/seedance_image_prompt_pack/${filename}`;
    const text = gitShow(`${ORIGINAL_REF}:${path}`).trim();
    return `\n--- ${filename} ---\n${normalizePromptPackText(text)}`;
  }).join("\n");
}

function gitShow(spec) {
  return execFileSync("git", ["show", spec], { cwd: ROOT, encoding: "utf8" });
}

function normalizePromptPackText(text) {
  return String(text)
    .replace(/Ã¢â‚¬Å“|Ã¢â‚¬Â/g, '"')
    .replace(/Ã¢â‚¬â„¢/g, "'")
    .replace(/Ã¢â‚¬â€œ|Ã¢â‚¬â€/g, "-")
    .replace(/Ã¢â‚¬Â¦/g, "...");
}

function parseJsonObject(text) {
  if (typeof text === "object" && text) return text;
  try {
    return JSON.parse(text);
  } catch {
    const match = /\{[\s\S]*\}/.exec(String(text || ""));
    if (!match) throw new Error("Codex did not return JSON.");
    return JSON.parse(match[0]);
  }
}

function clampPrompt(value, max) {
  const prompt = String(value || "").trim();
  return prompt.length > max ? prompt.slice(0, max) : prompt;
}

function clampOptionalPrompt(value) {
  const prompt = String(value || "").trim();
  return prompt ? clampPrompt(prompt, SEEDANCE_PROMPT_MAX) : "";
}

function sanitizeChoice(value, allowed, fallback) {
  const text = String(value || "").trim();
  return allowed.includes(text) ? text : fallback;
}

function wordCount(text) {
  return (String(text).match(/\S+/g) || []).length;
}

function imageToDataUrl(path) {
  const mime = path.toLowerCase().endsWith(".jpg") || path.toLowerCase().endsWith(".jpeg") ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}

function readImageSize(path) {
  const buffer = readFileSync(path);
  if (buffer.slice(1, 4).toString("ascii") === "PNG") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
  }
  return { width: 1280, height: 720 };
}

function ratioForImage({ width, height }) {
  const aspect = width / Math.max(1, height);
  if (Math.abs(aspect - 1) < 0.08) return "960:960";
  return aspect > 1 ? "1280:720" : "720:1280";
}

function writeReport({ outDir, sourcePath, imageSize, ratio, duration, comparisons, runway }) {
  const lines = [];
  lines.push("# Seedance Recipe Comparison");
  lines.push("");
  lines.push(`Source: \`${sourcePath}\``);
  lines.push(`Size: ${imageSize.width}x${imageSize.height}`);
  lines.push(`Ratio: ${ratio}`);
  lines.push(`Duration: ${duration}s`);
  lines.push(`Runway videos: ${runway ? "yes" : "no"}`);
  lines.push("");
  for (const item of comparisons) {
    lines.push(`## ${item.label}`);
    lines.push("");
    lines.push(`Mode: ${item.selectedMode}`);
    if (item.preset) {
      lines.push(`Preset mode request: ${item.preset.mode}`);
      lines.push(`Preset instruction: ${item.preset.currentPrompt}`);
    }
    lines.push(`Prompt words: ${wordCount(item.seedancePrompt)}`);
    lines.push("");
    lines.push("Prompt:");
    lines.push("");
    lines.push("```text");
    lines.push(item.seedancePrompt);
    lines.push("```");
    lines.push("");
    lines.push(`Strategy: ${item.promptStrategy}`);
    if (item.warnings?.length) lines.push(`Warnings: ${item.warnings.join("; ")}`);
    if (item.seedance?.outputs?.length) {
      lines.push("");
      lines.push("Outputs:");
      for (const output of item.seedance.outputs) {
        lines.push(`- \`${output.saved}\``);
      }
    }
    lines.push("");
  }
  writeFileSync(join(outDir, "report.md"), lines.join("\n"), "utf8");
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--runway") parsed.runway = true;
    else if (arg === "--source") parsed.source = argv[++index];
    else if (arg === "--out") parsed.out = argv[++index];
    else if (arg === "--ratio") parsed.ratio = argv[++index];
    else if (arg === "--duration") parsed.duration = argv[++index];
    else if (arg === "--mode") parsed.mode = argv[++index];
    else if (arg === "--projection") parsed.projection = argv[++index];
    else if (arg === "--current-prompt") parsed.currentPrompt = argv[++index];
    else if (arg === "--port") parsed.port = argv[++index];
    else if (arg === "--current-only") parsed.currentOnly = true;
    else if (arg === "--presets") parsed.presets = argv[++index] || "all";
  }
  return parsed;
}

function selectedPresets(value) {
  if (!value) return [];
  const names = value === "all" ? Object.keys(MOTION_PRESETS) : String(value).split(",");
  return names.map((name) => {
    const key = name.trim();
    const preset = MOTION_PRESETS[key];
    if (!preset) {
      throw new Error(`Unknown preset "${key}". Available presets: ${Object.keys(MOTION_PRESETS).join(", ")}`);
    }
    return { id: key, ...preset };
  });
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^"|"$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

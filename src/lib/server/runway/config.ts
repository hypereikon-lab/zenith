import { join } from "node:path";
import { env as privateEnv } from "$env/dynamic/private";
import type { ModelConfig } from "./types";
import { sanitizeChoice } from "./utils";

export const API_BASE = privateEnv.RUNWAY_API_BASE || "https://api.dev.runwayml.com";
export const API_VERSION = privateEnv.RUNWAY_API_VERSION || "2024-11-06";
export const MAX_JSON_BYTES = 128 * 1024 * 1024;
export const POLL_INTERVAL_MS = 2500;
export const POLL_TIMEOUT_MS = 8 * 60 * 1000;
export const SEEDANCE_POLL_TIMEOUT_MS = positiveNumberFromEnv("SEEDANCE_POLL_TIMEOUT_MS", 45 * 60 * 1000);
export const SEEDANCE_PROGRESS_ESTIMATE_MS = positiveNumberFromEnv("SEEDANCE_PROGRESS_ESTIMATE_MS", 12 * 60 * 1000);
export const INPAINT_MODEL = "gpt_image_2";
export const DEPTH_MAP_MODEL = "gemini_image3_pro";
export const SEEDANCE_MODEL = "seedance2";
export const SEEDANCE_VIDEO_MAX_BYTES = 32 * 1024 * 1024;
export const SEEDANCE_PROMPT_MAX = 3500;
export const SEEDANCE_PROMPT_PACK_DIR =
  privateEnv.SEEDANCE_PROMPT_PACK_DIR || join(process.cwd(), "docs", "seedance_prompt_pack");
export const SEEDANCE_IMAGE_PROMPT_PACK_DIR =
  privateEnv.SEEDANCE_IMAGE_PROMPT_PACK_DIR || join(process.cwd(), "docs", "seedance_image_prompt_pack");
export const SEEDANCE_PROMPT_PACK_FILES = [
  "00_runtime_motion_plate_recipe.md",
  "00_seedance_prompt_compiler_system.md",
  "01_reference_roles_and_patterns.md",
  "02_depth_warp_repair_recipe.md",
  "03_analysis_schemas.md",
  "04_prompt_templates.md",
  "05_feedback_repair_rules.md",
  "06_fewshot_prompt6_style.md",
];
export const SEEDANCE_IMAGE_PROMPT_PACK_FILES = [
  "00_runtime_prompt_recipe.md",
  "00_seedance_image_prompt_compiler_system.md",
  "02_image_to_video_motion_recipe.md",
  "03_analysis_schemas.md",
  "04_prompt_templates.md",
  "05_feedback_repair_rules.md",
  "06_fewshot_seedance2_style.md",
  "07_fulldome_domemaster_method.md",
  "08_fulldome_motion_thesis_catalog.md",
];
export const CODEX_PROMPT_MODEL = privateEnv.CODEX_PROMPT_MODEL || "";
export const CODEX_PROMPT_REASONING = sanitizeChoice(
  privateEnv.CODEX_PROMPT_REASONING,
  ["minimal", "low", "medium", "high", "xhigh"],
  "medium",
);
export const DEFAULT_DEPTH_PROMPT = `Generate a metric depth map visualization where depth values are represented on a grayscale gradient from black (nearest objects) to white (farthest objects). Use precise linear interpolation across the depth range. Render as a clean, high-contrast grayscale image with smooth tonal transitions. No color, no overlays, no labels. Pure depth-to-brightness mapping where each shade of gray corresponds to a specific distance value in the scene. Preserve the square 180-degree domemaster fisheye layout exactly, including zenith center, circular horizon, and pure black outside the projection circle.`;
export const DEFAULT_SEEDANCE_PROMPT = `Use the still image reference as the source of truth for scene identity, composition, materials, lighting, color, and detail. Use the video reference only as a rough fulldome domemaster motion guide for camera timing, parallax direction, and motion rhythm. Preserve the circular fisheye composition and pitch-black area outside the projection circle. Convert the depth-projected guide into coherent natural motion without adding text, borders, rectangular framing, UI marks, or visible mask artifacts.`;
export const DEFAULT_SEEDANCE_IMAGE_PROMPT = `Use the input image as the source of truth for a square fulldome domemaster scene. Animate it as one seamless shot with one visible motion event or material behavior grounded in the image. If the scene needs stronger action, allow one temporary source-derived phenomenon made from visible light, particles, petals, glass, clouds, mist, or similar native materials. Keep camera motion restrained: prefer locked-off, rim-anchored micro drift, or gentle depth breathing over pushing toward empty central sky. Preserve the circular fisheye projection, original composition, stable zenith orientation, and pitch-black exterior outside the projection circle. Do not add text, borders, UI overlays, unrelated objects, cuts, or rectangular reframing.`;

export const MODEL_CONFIG: Record<string, ModelConfig> = {
  gemini_image3_pro: {
    ratio: "2048:2048",
    maxPrompt: 5500,
    maxReferences: 14,
    outputCount: true,
  },
  gpt_image_2: {
    ratio: "1920:1920",
    maxPrompt: 32000,
    maxReferences: 16,
    outputCount: true,
    quality: true,
  },
};

export function getRunwayApiKey(): string {
  return privateEnv.RUNWAYML_API_SECRET || privateEnv.RUNWAY_SKILLS_API_SECRET || "";
}

function positiveNumberFromEnv(name: string, fallback: number): number {
  const value = Number(privateEnv[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

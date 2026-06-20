import type { ApiPayload } from "./types";
import { httpError } from "./errors";

export function parseJsonObject(text: unknown): ApiPayload {
  try {
    return JSON.parse(String(text));
  } catch {
    const match = /\{[\s\S]*\}/.exec(String(text || ""));
    if (!match) throw httpError(502, "Codex did not return JSON.");
    return JSON.parse(match[0]);
  }
}

export function asRecord(value: unknown): ApiPayload {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as ApiPayload) : {};
}

export function tryParseJson(text: string): ApiPayload | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function sanitizeRatio(ratio: unknown, fallback: string): string {
  return typeof ratio === "string" && /^\d+:\d+$/.test(ratio) ? ratio : fallback;
}

export function sanitizeSeedanceRatio(ratio: unknown): string {
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

export function clampSeedanceDuration(value: unknown): number {
  return clampInt(value || 5, 5, 15);
}

export function sanitizeChoice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === "string" && (choices as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function sanitizeReferenceTag(value: unknown, fallback: string): string {
  const tag = String(value || "").trim();
  return /^[a-z][a-z0-9_]{2,15}$/.test(tag) ? tag : fallback;
}

export function clampInt(value: unknown, min: number, max: number): number {
  const number = Math.round(Number(value) || min);
  return Math.max(min, Math.min(max, number));
}

export function clampPrompt(value: string, maxLength: number): string {
  const prompt = value.trim();
  if (!prompt) {
    throw httpError(400, "Prompt is required.");
  }
  return prompt.length > maxLength ? prompt.slice(0, maxLength) : prompt;
}

export function formatDuration(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minutes`;
  return `${(minutes / 60).toFixed(1)} hours`;
}

export function titleCaseTaskStatus(status: unknown): string {
  return String(status || "Generating")
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

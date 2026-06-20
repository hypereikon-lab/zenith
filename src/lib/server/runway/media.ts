import { Buffer } from "node:buffer";
import type { ParsedMediaDataUrl } from "./types";
import { httpError } from "./errors";

export function parseImageDataUrl(dataUrl: unknown): ParsedMediaDataUrl {
  const { mime, buffer } = parseBase64DataUrl(dataUrl, "image");
  if (!mime.startsWith("image/")) {
    throw httpError(400, "Expected a base64 image data URL.");
  }
  if (buffer.length < 512) {
    throw httpError(400, "Image upload is too small.");
  }
  return { mime, buffer };
}

export function parseVideoDataUrl(dataUrl: unknown): ParsedMediaDataUrl {
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

function parseBase64DataUrl(dataUrl: unknown, kind: "image" | "video"): ParsedMediaDataUrl {
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

export function safeMediaFilename(value: unknown, fallback: string): string {
  const name = String(value || fallback)
    .split(/[\\/]/)
    .pop()
    ?.replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return name || fallback;
}

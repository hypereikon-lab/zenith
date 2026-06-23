import { getArtifactMediaHandle } from "../artifacts/artifact-store.svelte.js";
import type { ArtifactMediaHandle, ArtifactRecord, ArtifactSlotId } from "../artifacts/artifact-types.js";
import { blobToDataUrl, readArtifactMediaAsDataUrl, revokeObjectUrls } from "../artifacts/artifact-runtime-media.js";
import { loadCanvasFromImageSource } from "../media/canvas-utils.js";
import type { RgbdMediaRef, RgbdProxyArtifact } from "./rgbd-scene-types.js";

export async function artifactImageCanvasForRgbd(
  artifact: ArtifactRecord,
  handle: ArtifactMediaHandle | undefined = getArtifactMediaHandle(artifact.id as ArtifactSlotId),
): Promise<HTMLCanvasElement> {
  if (artifact.media.kind !== "image" && artifact.media.kind !== "canvas") {
    throw new Error(`${artifact.label} must be an image artifact for RGBD scene expansion.`);
  }
  if (handle?.canvas) return handle.canvas;
  return loadCanvasFromImageSource(await readArtifactMediaAsDataUrl(artifact, handle));
}

export async function rgbdImageFileToCanvas(file: File): Promise<HTMLCanvasElement> {
  return loadCanvasFromImageSource(await blobToDataUrl(file));
}

export async function rgbdMediaUrlToCanvas(url: string): Promise<HTMLCanvasElement> {
  return loadCanvasFromImageSource(url);
}

export function rgbdMediaRefFromFile(file: File, alt: string): RgbdMediaRef {
  return {
    kind: "image",
    url: URL.createObjectURL(file),
    name: file.name,
    mime: file.type || "image/png",
    alt,
  };
}

export function revokeRgbdMediaObjectUrl(media: RgbdMediaRef | null | undefined): void {
  if (media?.url?.startsWith("blob:")) {
    revokeObjectUrls([media.url]);
  }
}

export function revokeRgbdProxyObjectUrls(proxy: RgbdProxyArtifact | null | undefined): void {
  if (!proxy) return;
  const urls = [
    proxy.rgb.url,
    proxy.depthPreview.url,
    proxy.knownMask.url,
    proxy.disocclusionMask.url,
    proxy.confidencePreview.url,
  ].filter((url): url is string => Boolean(url?.startsWith("blob:")));
  revokeObjectUrls(urls);
}

export async function rgbdUrlToDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not fetch RGBD media.");
  return blobToDataUrl(await response.blob());
}

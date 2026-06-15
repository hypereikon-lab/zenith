import { requestRunwayInpaint } from "../runway/client.js";
import type { RunwayStreamResult } from "../runway/client.js";

export type GptImageProxyReconstructionRequest = {
  proxyImageDataUrl: string;
  knownMaskDataUrl?: string;
  disocclusionMaskDataUrl?: string;
  confidenceImageDataUrl?: string;
  prompt: string;
  ratio?: string;
  onProgress?: (stage: string, progress: number) => void;
};

export async function reconstructProxyViewWithGptImage2({
  proxyImageDataUrl,
  knownMaskDataUrl,
  disocclusionMaskDataUrl,
  confidenceImageDataUrl,
  prompt,
  ratio = "16:9",
  onProgress,
}: GptImageProxyReconstructionRequest): Promise<RunwayStreamResult> {
  return requestRunwayInpaint(
    {
      imageDataUrl: proxyImageDataUrl,
      sourceImageDataUrl: knownMaskDataUrl || disocclusionMaskDataUrl || confidenceImageDataUrl,
      sourceFilename: knownMaskDataUrl
        ? "zenith-known-pixel-mask.png"
        : disocclusionMaskDataUrl
          ? "zenith-disocclusion-mask.png"
          : "zenith-confidence-preview.png",
      model: "gpt_image_2",
      ratio,
      prompt,
      quality: "high",
      outputCount: 1,
      referenceImageTag: "rgbd_proxy_view",
      sourceImageTag: knownMaskDataUrl ? "known_pixel_mask" : disocclusionMaskDataUrl ? "disocclusion_mask" : "confidence_preview",
    },
    { onProgress },
  );
}

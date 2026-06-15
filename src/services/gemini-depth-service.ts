import { requestRunwayDepthMap } from "../runway/client.js";
import type { RunwayStreamResult } from "../runway/client.js";

export type GeminiRelativeDepthRequest = {
  imageDataUrl: string;
  prompt: string;
  ratio?: string;
  onProgress?: (stage: string, progress: number) => void;
};

export async function generateRelativeDepthWithGemini({
  imageDataUrl,
  prompt,
  ratio = "16:9",
  onProgress,
}: GeminiRelativeDepthRequest): Promise<RunwayStreamResult> {
  return requestRunwayDepthMap(
    {
      imageDataUrl,
      ratio,
      prompt,
      outputCount: 1,
      depthMode: "relative-dense-prior",
      intendedUse: "rgbd-scene-expansion-alignment",
    },
    { onProgress },
  );
}

import { Buffer } from "node:buffer";
import { describe, expect, test } from "vitest";
import {
  validateCodexSeedanceImagePromptPayload,
  validateCodexSeedancePromptPayload,
  validateRunwayDepthMapPayload,
  validateRunwayInpaintPayload,
  validateRunwaySeedanceImagePayload,
  validateRunwaySeedanceVideoPayload,
} from "./schemas";

const PNG_DATA_URL = `data:image/png;base64,${Buffer.alloc(1024, 1).toString("base64")}`;
const MP4_DATA_URL = `data:video/mp4;base64,${Buffer.alloc(8192, 2).toString("base64")}`;

describe("Runway and Codex request schemas", () => {
  test("accepts the currently supported Runway stream payloads", () => {
    expect(
      validateRunwayInpaintPayload({
        imageDataUrl: PNG_DATA_URL,
        prompt: "Repair the dome plate.",
        ratio: "2048:2048",
        model: "gpt_image_2",
        quality: "high",
      }),
    ).toMatchObject({ imageDataUrl: PNG_DATA_URL });

    expect(
      validateRunwayDepthMapPayload({
        imageDataUrl: PNG_DATA_URL,
        prompt: "Generate depth.",
        quality: "auto",
      }),
    ).toMatchObject({ imageDataUrl: PNG_DATA_URL });

    expect(
      validateRunwaySeedanceVideoPayload({
        videoDataUrl: MP4_DATA_URL,
        imageDataUrl: PNG_DATA_URL,
        prompt: "Repair this motion plate.",
        ratio: "16:9",
      }),
    ).toMatchObject({ videoDataUrl: MP4_DATA_URL });

    expect(
      validateRunwaySeedanceImagePayload({
        imageDataUrl: PNG_DATA_URL,
        finalImageDataUrl: "",
        prompt: "Animate this still.",
        ratio: "16:9",
      }),
    ).toMatchObject({ finalImageDataUrl: "" });
  });

  test("rejects malformed Runway payloads before upstream work", () => {
    expectValidationError(
      () => validateRunwayInpaintPayload({ prompt: "Missing media." }),
      "Runway inpaint imageDataUrl",
    );
    expectValidationError(
      () => validateRunwayInpaintPayload({ imageDataUrl: PNG_DATA_URL, prompt: "" }),
      "Runway inpaint prompt",
    );
    expectValidationError(
      () => validateRunwayInpaintPayload({ imageDataUrl: PNG_DATA_URL, prompt: "Repair.", quality: "ultra" }),
      "Runway inpaint quality",
    );
    expectValidationError(
      () => validateRunwayInpaintPayload({ imageDataUrl: PNG_DATA_URL, prompt: "Repair.", model: "runway" }),
      "Runway inpaint model",
    );
    expectValidationError(
      () => validateRunwayDepthMapPayload({ imageDataUrl: PNG_DATA_URL, ratio: "square" }),
      "Runway depth map ratio",
    );
    expectValidationError(
      () => validateRunwaySeedanceVideoPayload({ videoDataUrl: "https://example.invalid/video.mp4" }),
      "Runway Seedance video videoDataUrl",
    );
    expectValidationError(
      () => validateRunwaySeedanceImagePayload({ imageDataUrl: PNG_DATA_URL, finalImageDataUrl: "blob:runtime" }),
      "Runway Seedance image finalImageDataUrl",
    );
  });

  test("accepts Codex prompt-planning payloads without requiring paid SDK access", () => {
    expect(
      validateCodexSeedancePromptPayload({
        sourceImageDataUrl: PNG_DATA_URL,
        depthImageDataUrl: PNG_DATA_URL,
        motionFrames: [{ imageDataUrl: PNG_DATA_URL, progress: 0.25, label: "quarter" }],
        promptMode: "strict_repair",
      }),
    ).toMatchObject({ sourceImageDataUrl: PNG_DATA_URL });

    expect(
      validateCodexSeedanceImagePromptPayload({
        sourceImageDataUrl: PNG_DATA_URL,
        finalImageDataUrl: "",
        ratio: "16:9",
        durationSeconds: "5",
      }),
    ).toMatchObject({ finalImageDataUrl: "" });
  });

  test("rejects malformed Codex prompt-planning payloads before SDK work", () => {
    expectValidationError(
      () => validateCodexSeedancePromptPayload({ sourceImageDataUrl: PNG_DATA_URL }),
      "Codex Seedance prompt depthImageDataUrl",
    );
    expectValidationError(
      () =>
        validateCodexSeedancePromptPayload({
          sourceImageDataUrl: PNG_DATA_URL,
          depthImageDataUrl: PNG_DATA_URL,
          motionFrames: [{ imageDataUrl: "blob:runtime-only" }],
        }),
      "Codex Seedance prompt motionFrames.0.imageDataUrl",
    );
    expectValidationError(
      () => validateCodexSeedanceImagePromptPayload({ sourceImageDataUrl: "https://example.invalid/source.png" }),
      "Codex Seedance image prompt sourceImageDataUrl",
    );
    expectValidationError(
      () =>
        validateCodexSeedanceImagePromptPayload({
          sourceImageDataUrl: PNG_DATA_URL,
          finalImageDataUrl: PNG_DATA_URL,
          ratio: "wide",
        }),
      "Codex Seedance image prompt ratio",
    );
  });
});

function expectValidationError(run: () => unknown, expectedMessagePart: string): void {
  expect(run).toThrow(expect.objectContaining({ status: 400, message: expect.stringContaining(expectedMessagePart) }));
}

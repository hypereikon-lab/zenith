import { Buffer } from "node:buffer";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const codexMocks = vi.hoisted(() => ({
  Codex: vi.fn(),
  run: vi.fn(),
  startThread: vi.fn(),
}));

vi.mock("@openai/codex-sdk", () => ({
  Codex: codexMocks.Codex,
}));

import { requestCodexSeedanceImagePrompt, requestCodexSeedancePrompt } from "./codex-planner";

const PNG_DATA_URL = `data:image/png;base64,${Buffer.alloc(1024, 1).toString("base64")}`;

describe("Codex prompt planner boundary", () => {
  beforeEach(() => {
    codexMocks.Codex.mockReset();
    codexMocks.startThread.mockReset();
    codexMocks.run.mockReset();
    codexMocks.run.mockResolvedValue({ finalResponse: JSON.stringify(validSeedancePromptResponse()) });
    codexMocks.startThread.mockReturnValue({ id: "thread_test", run: codexMocks.run });
    codexMocks.Codex.mockImplementation(function CodexMock() {
      return { startThread: codexMocks.startThread };
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("Unexpected network request in Codex planner tests."))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("rejects invalid Seedance prompt payloads before constructing Codex", async () => {
    await expect(requestCodexSeedancePrompt({ sourceImageDataUrl: PNG_DATA_URL })).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("depthImageDataUrl"),
    });

    expect(codexMocks.Codex).not.toHaveBeenCalled();
    expect(codexMocks.startThread).not.toHaveBeenCalled();
    expect(codexMocks.run).not.toHaveBeenCalled();
  });

  test("rejects invalid image prompt payloads before constructing Codex", async () => {
    await expect(requestCodexSeedanceImagePrompt({ sourceImageDataUrl: "blob:runtime-only" })).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("sourceImageDataUrl"),
    });

    expect(codexMocks.Codex).not.toHaveBeenCalled();
    expect(codexMocks.startThread).not.toHaveBeenCalled();
    expect(codexMocks.run).not.toHaveBeenCalled();
  });

  test("runs Seedance prompt planning inside the no-network read-only sandbox", async () => {
    const progress: unknown[] = [];
    const beforeTempEntries = await codexTempEntries();

    const result = await requestCodexSeedancePrompt(
      {
        sourceImageDataUrl: PNG_DATA_URL,
        depthImageDataUrl: PNG_DATA_URL,
        motionFrames: [{ imageDataUrl: PNG_DATA_URL, progress: 0.5, label: "middle" }],
        promptMode: "strict_repair",
      },
      (event) => progress.push(event),
    );

    expect(result).toMatchObject({
      threadId: "thread_test",
      selectedMode: "strict_repair",
      seedancePrompt: "Repair this fulldome motion plate.",
    });
    expect(progress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: "Preparing Codex context" }),
        expect.objectContaining({ stage: "Planning with Codex" }),
        expect.objectContaining({ stage: "Validating prompt" }),
      ]),
    );
    expect(codexMocks.Codex).toHaveBeenCalledTimes(1);
    expect(codexMocks.startThread).toHaveBeenCalledWith(
      expect.objectContaining({
        workingDirectory: process.cwd(),
        skipGitRepoCheck: true,
        sandboxMode: "read-only",
        approvalPolicy: "never",
        webSearchMode: "disabled",
        networkAccessEnabled: false,
      }),
    );
    expect(codexMocks.run).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ type: "text", text: expect.stringContaining("Seedance 2.0") }),
        expect.objectContaining({ type: "local_image", path: expect.stringContaining(".codex") }),
      ]),
      expect.objectContaining({ outputSchema: expect.any(Object) }),
    );
    await expectNoNewCodexTempDirs(beforeTempEntries);
  });

  test("runs image prompt planning with an output schema and optional final frame", async () => {
    codexMocks.run.mockResolvedValueOnce({ finalResponse: JSON.stringify(validSeedanceImagePromptResponse()) });
    const beforeTempEntries = await codexTempEntries();

    const result = await requestCodexSeedanceImagePrompt({
      sourceImageDataUrl: PNG_DATA_URL,
      finalImageDataUrl: "",
      ratio: "16:9",
      promptMode: "ambient_scene_motion",
    });

    expect(result).toMatchObject({
      threadId: "thread_test",
      selectedMode: "ambient_scene_motion",
      seedancePrompt: "Animate this still fulldome frame.",
    });
    expect(codexMocks.Codex).toHaveBeenCalledTimes(1);
    expect(codexMocks.run).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ type: "text", text: expect.stringContaining("image-to-video prompt") }),
        expect.objectContaining({ type: "local_image", path: expect.stringContaining(".codex") }),
      ]),
      expect.objectContaining({ outputSchema: expect.any(Object) }),
    );
    await expectNoNewCodexTempDirs(beforeTempEntries);
  });
});

function validSeedancePromptResponse() {
  return {
    diagnosis: "Codex diagnosis",
    sceneCardSummary: "Dome scene",
    motionPlateCardSummary: "Motion guide",
    selectedMode: "strict_repair",
    seedancePrompt: "Repair this fulldome motion plate.",
    promptStrategy: "Keep the motion but repair artifacts.",
    variants: {
      strictRepair: "Repair this fulldome motion plate.",
      conservativeLock: "Lock the dome composition.",
      moreVolumetric: "Add volumetric ambience.",
    },
    negativeTerms: ["warped geometry"],
    warnings: ["Review rim continuity."],
  };
}

function validSeedanceImagePromptResponse() {
  return {
    diagnosis: "Codex image diagnosis",
    sceneCardSummary: "Still dome scene",
    selectedMode: "ambient_scene_motion",
    seedancePrompt: "Animate this still fulldome frame.",
    promptStrategy: "Use grounded local motion.",
    variants: {
      ambientSceneMotion: "Animate this still fulldome frame.",
      sceneEvent: "Add one visible scene event.",
      materialLife: "Add subtle material motion.",
    },
    negativeTerms: ["camera drift"],
    warnings: ["Keep the rim stable."],
  };
}

async function codexTempEntries(): Promise<Set<string>> {
  try {
    return new Set(await readdir(join(process.cwd(), ".codex", "tmp")));
  } catch {
    return new Set();
  }
}

async function expectNoNewCodexTempDirs(before: Set<string>): Promise<void> {
  const after = await codexTempEntries();
  const newZenithDirs = [...after].filter((entry) => entry.startsWith("zenith-codex-") && !before.has(entry));
  expect(newZenithDirs).toEqual([]);
}

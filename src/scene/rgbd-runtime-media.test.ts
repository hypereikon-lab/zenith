import { afterEach, describe, expect, test, vi } from "vitest";
import {
  artifactImageCanvasForRgbd,
  revokeRgbdMediaObjectUrl,
  revokeRgbdProxyObjectUrls,
  rgbdMediaRefFromFile,
} from "./rgbd-runtime-media.js";
import type { ArtifactRecord } from "../artifacts/artifact-types.js";
import { defaultRgbdCameraPose } from "./camera-path.js";

describe("RGBD runtime media ownership", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("creates browser object URL media refs from imported files", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:http://127.0.0.1/rgbd-import");
    const file = new File(["rgbd"], "reconstruction.png", { type: "image/png" });

    expect(rgbdMediaRefFromFile(file, "Imported RGBD media")).toEqual({
      kind: "image",
      url: "blob:http://127.0.0.1/rgbd-import",
      name: "reconstruction.png",
      mime: "image/png",
      alt: "Imported RGBD media",
    });
  });

  test("revokes only runtime object URLs", () => {
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    revokeRgbdMediaObjectUrl({ kind: "image", url: "blob:http://127.0.0.1/rgbd-old" });
    revokeRgbdMediaObjectUrl({ kind: "image", url: "data:image/png;base64,PORTABLE" });
    revokeRgbdMediaObjectUrl(null);

    expect(revokeSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith("blob:http://127.0.0.1/rgbd-old");
  });

  test("revokes every object URL owned by a rendered proxy artifact", () => {
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    revokeRgbdProxyObjectUrls({
      id: "proxy",
      keyframeId: "keyframe-expand",
      label: "Proxy",
      status: "ready",
      pose: defaultRgbdCameraPose(),
      projectionProfile: "zenith-180",
      createdAt: "2026-06-23T12:00:00.000Z",
      updatedAt: "2026-06-23T12:00:00.000Z",
      rgb: { kind: "image", url: "blob:http://127.0.0.1/rgb" },
      depthPreview: { kind: "image", url: "blob:http://127.0.0.1/depth" },
      knownMask: { kind: "image", url: "blob:http://127.0.0.1/known" },
      disocclusionMask: { kind: "image", url: "blob:http://127.0.0.1/hole" },
      confidencePreview: { kind: "image", url: "data:image/png;base64,CONFIDENCE" },
      warnings: [],
    });

    expect(revokeSpy.mock.calls.map(([url]) => url)).toEqual([
      "blob:http://127.0.0.1/rgb",
      "blob:http://127.0.0.1/depth",
      "blob:http://127.0.0.1/known",
      "blob:http://127.0.0.1/hole",
    ]);
  });

  test("returns live canvas handles without serializing through URLs", async () => {
    const canvas = { width: 4, height: 4 } as HTMLCanvasElement;

    await expect(artifactImageCanvasForRgbd(imageArtifact(), { canvas, blob: null, file: null })).resolves.toBe(canvas);
  });

  test("rejects non-image workbench artifacts before canvas loading", async () => {
    await expect(
      artifactImageCanvasForRgbd({
        ...imageArtifact(),
        label: "Motion Draft",
        media: { kind: "video", url: "data:video/mp4;base64,VIDEO", blob: null, file: null, canvas: null },
      }),
    ).rejects.toThrow(/Motion Draft must be an image artifact for RGBD scene expansion/);
  });
});

function imageArtifact(): ArtifactRecord {
  return {
    id: "start-state",
    type: "start-state",
    stage: "start",
    label: "Start State",
    summary: "Ready",
    status: "ready",
    inputs: ["plate-sketch"],
    operatorId: "import-source",
    projectionProfile: "zenith-180",
    media: {
      kind: "image",
      url: "data:image/png;base64,START",
      blob: null,
      file: null,
      canvas: null,
    },
    results: [],
    createdAt: "2026-06-23T12:00:00.000Z",
    updatedAt: "2026-06-23T12:00:00.000Z",
    warnings: [],
    qcNotes: [],
    stale: false,
  };
}

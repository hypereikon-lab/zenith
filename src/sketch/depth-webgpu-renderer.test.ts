import { describe, expect, test } from "vitest";
import {
  buildDepthPreviewUniformArray,
  depthReprojectionShaderCode,
  gapFillSplatPixels,
} from "./depth-webgpu-renderer.js";

describe("depth WebGPU reprojection preview", () => {
  test("uses vertex texture sampling and depth-buffered splat quads", () => {
    expect(depthReprojectionShaderCode).toContain("@vertex");
    expect(depthReprojectionShaderCode).toContain("@fragment");
    expect(depthReprojectionShaderCode).toContain("textureSampleLevel(depthTexture");
    expect(depthReprojectionShaderCode).toContain("depthFarFactor");
    expect(depthReprojectionShaderCode).toContain("guideMode");
    expect(depthReprojectionShaderCode).toContain("multiOctaveGuideNoise");
    expect(depthReprojectionShaderCode).toContain("applyGuideNoise");
    expect(depthReprojectionShaderCode).toContain("discard;");
    expect(depthReprojectionShaderCode).toContain("corners[vertexIndex % 6u]");
    expect(depthReprojectionShaderCode).toContain("splatLocal");
    expect(depthReprojectionShaderCode).toContain("dot(in.splatLocal, in.splatLocal)");
  });

  test("packs tight base-pass uniforms in vec4-aligned order", () => {
    const uniforms = buildDepthPreviewUniformArray({
      profile: {
        fisheyeScaleX: 0.5,
        fisheyeScaleY: 0.5,
      },
      settings: {
        nearMeters: 1,
        farMeters: 12,
        polarity: "brightFar",
        depthContrast: 1.5,
        guideMode: "depthMap",
        guideNoise: 0.05,
        gapFillPasses: 3,
      },
      pose: {
        yaw: 0.1,
        pitch: 0.2,
        roll: 0.3,
        offset: [1, 2, 3],
      },
      size: 720,
    });

    expect(uniforms).toHaveLength(20);
    expect(uniforms[0]).toBeCloseTo(0.5);
    expect(uniforms[3]).toBeCloseTo(720);
    expect(uniforms[6]).toBe(0);
    expect(uniforms[11]).toBeCloseTo(0.58);
    expect(uniforms[15]).toBe(0);
    expect(uniforms[16]).toBe(0);
    expect(uniforms[17]).toBe(2);
    expect(uniforms[18]).toBeCloseTo(0.05);
  });

  test("computes gap-fill splats separately from base reprojection", () => {
    expect(gapFillSplatPixels(0)).toBe(1);
    expect(gapFillSplatPixels(3)).toBeCloseTo(2.65);
    expect(gapFillSplatPixels(12)).toBe(4.5);
  });
});

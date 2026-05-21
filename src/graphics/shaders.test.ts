import { describe, expect, test } from "vitest";
import { domeShaderCode, flatShaderCode } from "./shaders.js";

describe("dome shader", () => {
  test("uses one full projection path instead of an equidistant fast-map bypass", () => {
    expect(domeShaderCode).not.toContain("fastMap");
    expect(domeShaderCode).not.toContain("domeMap");
    expect(domeShaderCode).toContain("let dir = normalize(rotateX(physicalDir, uniforms.domeTilt))");
    expect(domeShaderCode).toContain("let radial = clamp(projectionRadius(theta), 0.0, 1.0)");
    expect(domeShaderCode).toContain("sin(azimuth) * uniforms.fisheyeScale.x");
    expect(domeShaderCode).toContain("uniforms.customCurve");
  });
});

describe("flat shader", () => {
  test("masks outside the domemaster circle to opaque black", () => {
    expect(flatShaderCode).toContain("var color = select(sampledColor, vec3<f32>(0.0, 0.0, 0.0), radius > 1.0);");
    expect(flatShaderCode).toContain("* insideMask * uniforms.showSourceCircle");
  });

  test("samples texture before the radius mask to satisfy WGSL uniform-control rules", () => {
    const sampleIndex = flatShaderCode.indexOf("textureSample(domeTexture, domeSampler, sampleUv)");
    const maskIndex = flatShaderCode.indexOf("radius > 1.0");
    expect(sampleIndex).toBeGreaterThan(-1);
    expect(maskIndex).toBeGreaterThan(-1);
    expect(sampleIndex).toBeLessThan(maskIndex);
    expect(flatShaderCode).not.toContain("if (radius > 1.0)");
  });

  test("rotates flat texture sampling with the domemaster azimuth", () => {
    const helperIndex = flatShaderCode.indexOf("fn rotate2d");
    const sampleIndex = flatShaderCode.indexOf("let sampleUv = rotate2d");
    expect(helperIndex).toBeGreaterThan(-1);
    expect(helperIndex).toBeLessThan(sampleIndex);
    expect(flatShaderCode).toContain("let sampleUv = rotate2d(in.uv - vec2<f32>(0.5, 0.5), uniforms.rotation)");
    expect(flatShaderCode).toContain("textureSample(domeTexture, domeSampler, sampleUv)");
  });

  test("draws flat latitude rings through the active projection curve", () => {
    expect(flatShaderCode).toContain("const HALF_PI: f32 = 1.5707963267948966;");
    expect(flatShaderCode).toContain("fn inverseProjectionRadius");
    expect(flatShaderCode).toContain("let theta = inverseProjectionRadius(radius)");
    expect(flatShaderCode).toContain("lineAt(theta, HALF_PI / 6.0");
    expect(flatShaderCode).toContain("uniforms.projectionMode");
    expect(flatShaderCode).toContain("uniforms.customCurve");
  });
});

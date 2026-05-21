import { describe, expect, test } from "vitest";
import { domeShaderCode, flatShaderCode } from "./shaders.js";

describe("dome shader", () => {
  test("uses one equidistant domemaster path instead of a projection-mode branch", () => {
    expect(domeShaderCode).not.toContain("fastMap");
    expect(domeShaderCode).not.toContain("domeMap");
    expect(domeShaderCode).not.toContain("projectionMode");
    expect(domeShaderCode).not.toContain("customCurve");
    expect(domeShaderCode).toContain("let dir = normalize(rotateX(physicalDir, uniforms.domeTilt))");
    expect(domeShaderCode).toContain("return clamp(theta / HALF_PI, 0.0, 1.0);");
    expect(domeShaderCode).toContain("let radial = clamp(projectionRadius(theta), 0.0, 1.0)");
    expect(domeShaderCode).toContain("sin(azimuth) * uniforms.fisheyeScale.x");
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
    const sampleIndex = flatShaderCode.indexOf("let rotatedSample = rotate2d");
    expect(helperIndex).toBeGreaterThan(-1);
    expect(helperIndex).toBeLessThan(sampleIndex);
    expect(flatShaderCode).toContain("let fisheyeScale = max(uniforms.fisheyeScale, vec2<f32>(0.0001));");
    expect(flatShaderCode).toContain("let normalized = (in.uv - vec2<f32>(0.5, 0.5)) / fisheyeScale");
    expect(flatShaderCode).toContain("let rotatedSample = rotate2d(normalized, uniforms.rotation)");
    expect(flatShaderCode).toContain("let sampleUv = vec2<f32>(0.5, 0.5) + rotatedSample * fisheyeScale");
    expect(flatShaderCode).toContain("textureSample(domeTexture, domeSampler, sampleUv)");
  });

  test("draws flat latitude rings through equidistant domemaster geometry", () => {
    expect(flatShaderCode).toContain("const HALF_PI: f32 = 1.5707963267948966;");
    expect(flatShaderCode).toContain("let theta = clamp(radius, 0.0, 1.0) * HALF_PI");
    expect(flatShaderCode).toContain("lineAt(theta, HALF_PI / 6.0");
    expect(flatShaderCode).not.toContain("projectionMode");
    expect(flatShaderCode).not.toContain("customCurve");
  });
});

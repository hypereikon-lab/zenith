import { describe, expect, test } from "vitest";
import { caveShaderCode, domeShaderCode, flatShaderCode } from "./projection-preview-shaders.js";

describe("dome shader", () => {
  test("uses one equidistant domemaster path instead of a projection-mode branch", () => {
    expect(domeShaderCode).not.toContain("fastMap");
    expect(domeShaderCode).not.toContain("domeMap");
    expect(domeShaderCode).not.toContain("projectionMode");
    expect(domeShaderCode).not.toContain("customCurve");
    expect(domeShaderCode).not.toContain("_pad0");
    expect(domeShaderCode).toContain("let dir = normalize(rotateX(physicalDir, uniforms.domeTilt))");
    expect(domeShaderCode).toContain("fn physicalDirectionFromSource(sourceDir: vec3<f32>) -> vec3<f32>");
    expect(domeShaderCode).toContain("let physical = physicalDirectionFromSource(position)");
    expect(domeShaderCode).toContain("out.world = physical");
    expect(domeShaderCode).toContain("sourceCenterTheta: vec4<f32>");
    expect(domeShaderCode).toContain("sourceCarrierSplit: f32");
    expect(domeShaderCode).toContain("sourceCarrierHorizon: f32");
    expect(domeShaderCode).toContain("fn sourceSample(sourceDir: vec3<f32>) -> vec3<f32>");
    expect(domeShaderCode).toContain("let thetaMax = max(uniforms.sourceCenterTheta.w, 0.0001)");
    expect(domeShaderCode).toContain("let radial = physicalRadiusToCarrierRadius(physicalRadial, thetaMax)");
    expect(domeShaderCode).toContain("dot(tangent, uniforms.sourceRight.xyz)");
    expect(domeShaderCode).toContain("dot(tangent, uniforms.sourceUp.xyz)");
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
    expect(flatShaderCode).toContain("sourceCenterTheta: vec4<f32>");
    expect(flatShaderCode).toContain("sourceCarrierSplit: f32");
    expect(flatShaderCode).toContain("sourceCarrierHorizon: f32");
    expect(flatShaderCode).toContain("fn carrierRadiusToPhysicalRadius(carrierRadius: f32, thetaMax: f32) -> f32");
    expect(flatShaderCode).toContain(
      "let theta = carrierRadiusToPhysicalRadius(radius, max(uniforms.sourceCenterTheta.w, 0.0001))",
    );
    expect(flatShaderCode).toContain("lineAt(theta, PI / 12.0");
    expect(flatShaderCode).toContain("abs(theta - HALF_PI)");
    expect(flatShaderCode).toContain("let eyeHorizon = (1.0 - smoothstep");
    expect(flatShaderCode).toContain("let wallMask = smoothstep(floorBand + 0.015");
    expect(flatShaderCode).not.toContain("projectionMode");
    expect(flatShaderCode).not.toContain("customCurve");
  });
});

describe("cave shader", () => {
  test("samples CAVE room faces through the shared equidistant source projection", () => {
    expect(caveShaderCode).toContain("sourceCenterTheta: vec4<f32>");
    expect(caveShaderCode).toContain("sourceCarrierSplit: f32");
    expect(caveShaderCode).toContain("sourceCarrierHorizon: f32");
    expect(caveShaderCode).toContain("fn sourceDirectionFromPhysical(physicalDir: vec3<f32>) -> vec3<f32>");
    expect(caveShaderCode).toContain("fn sourceSample(sourceDir: vec3<f32>) -> vec3<f32>");
    expect(caveShaderCode).toContain("let radial = physicalRadiusToCarrierRadius(physicalRadial, thetaMax)");
    expect(caveShaderCode).toContain("fn continuityPhysicalDirectionFromCavePoint");
    expect(caveShaderCode).toContain("fn caveFloorContinuityDirection");
    expect(caveShaderCode).toContain("return caveFloorContinuityDirection(point)");
    expect(caveShaderCode).toContain(
      "let continuityPhysicalDir = continuityPhysicalDirectionFromCavePoint(in.world, in.faceUv, in.face)",
    );
    expect(caveShaderCode).toContain("textureSample(domeTexture, domeSampler");
    expect(caveShaderCode).toContain("edgeLine(in.faceUv.x)");
    expect(caveShaderCode).not.toContain("projectionMode");
    expect(caveShaderCode).not.toContain("customCurve");
  });
});

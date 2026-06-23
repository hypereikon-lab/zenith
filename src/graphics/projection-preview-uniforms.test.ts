import { describe, expect, test } from "vitest";
import {
  buildProjectionPreviewUniformArray,
  PROJECTION_PREVIEW_UNIFORM_BYTES,
  PROJECTION_PREVIEW_UNIFORM_FLOATS,
  PROJECTION_PREVIEW_UNIFORM_OFFSETS,
} from "./projection-preview-uniforms.js";
import type { Mat4, Vec3 } from "../projection.js";

describe("projection preview uniforms", () => {
  test("packs the projection preview ABI in the shader's vec4-aligned order", () => {
    const mvp = new Float32Array(Array.from({ length: 16 }, (_, index) => index + 1)) as Mat4;
    const sourceCenterAxis: Vec3 = [0.1, 0.2, 0.3];
    const sourceRightAxis: Vec3 = [1, 0, 0];
    const sourceUpAxis: Vec3 = [0, 1, 0];
    const cameraPosition: Vec3 = [4, 5, 6];

    const uniforms = buildProjectionPreviewUniformArray({
      mvp,
      fisheyeScale: [0.91, 0.82],
      overlayOpacity: 0.78,
      showGuides: true,
      shellShade: 0.12,
      sourceCarrierSplit: 0.42,
      sourceCarrierHorizon: 0.73,
      sourceCenterAxis,
      sourceTheta: 2.3,
      sourceRightAxis,
      sourceUpAxis,
      caveMaskMode: 2,
      cameraPosition,
    });

    expect(PROJECTION_PREVIEW_UNIFORM_FLOATS).toBe(48);
    expect(PROJECTION_PREVIEW_UNIFORM_BYTES).toBe(192);
    expect(uniforms).toHaveLength(PROJECTION_PREVIEW_UNIFORM_FLOATS);
    expect(uniforms.byteLength).toBe(PROJECTION_PREVIEW_UNIFORM_BYTES);
    expect(Array.from(uniforms.subarray(0, 16))).toEqual(Array.from(mvp));
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.fisheyeScale]).toBeCloseTo(0.91);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.fisheyeScale + 1]).toBeCloseTo(0.82);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.rotation]).toBe(0);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.exposure]).toBe(1);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.overlayOpacity]).toBeCloseTo(0.78);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.showRings]).toBe(1);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.showSpokes]).toBe(1);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.showHorizon]).toBe(1);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.showZenith]).toBe(1);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.showSourceCircle]).toBe(1);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.shellShade]).toBeCloseTo(0.12);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.sourceCarrierSplit]).toBeCloseTo(0.42);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.sourceCarrierHorizon]).toBeCloseTo(0.73);
    expectVectorClose(Array.from(uniforms.subarray(32, 35)) as Vec3, sourceCenterAxis);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.sourceCenterTheta + 3]).toBeCloseTo(2.3);
    expect(Array.from(uniforms.subarray(36, 39))).toEqual(sourceRightAxis);
    expect(Array.from(uniforms.subarray(40, 43))).toEqual(sourceUpAxis);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.showCaveMask]).toBe(2);
    expect(Array.from(uniforms.subarray(45, 48))).toEqual(cameraPosition);
  });

  test("packs guide and optional boolean slots as shader floats", () => {
    const uniforms = buildProjectionPreviewUniformArray({
      mvp: new Float32Array(
        Array.from({ length: 16 }, (_, index) => (index === 0 || index === 5 || index === 10 || index === 15 ? 1 : 0)),
      ) as Mat4,
      fisheyeScale: [1, 1],
      rotation: 0.25,
      exposure: 0.5,
      overlayOpacity: 0.28,
      mirror: true,
      domeTilt: -0.4,
      cutaway: true,
      showGuides: false,
      shellShade: 0.3,
      sourceCarrierSplit: 0.5,
      sourceCarrierHorizon: 0.9,
      sourceCenterAxis: [0, 1, 0],
      sourceTheta: 1.57,
      sourceRightAxis: [1, 0, 0],
      sourceUpAxis: [0, 0, -1],
      caveMaskMode: 0,
      cameraPosition: [0, 0, 0],
    });

    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.rotation]).toBeCloseTo(0.25);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.exposure]).toBeCloseTo(0.5);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.mirror]).toBe(1);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.domeTilt]).toBeCloseTo(-0.4);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.cutaway]).toBe(1);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.showRings]).toBe(0);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.showSourceCircle]).toBe(0);
  });
});

function expectVectorClose(actual: Vec3, expected: Vec3): void {
  for (let index = 0; index < 3; index += 1) {
    expect(actual[index]).toBeCloseTo(expected[index]);
  }
}

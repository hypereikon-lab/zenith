import { describe, expect, test } from "vitest";
import { PROJECTION_PREVIEW_UNIFORM_OFFSETS } from "./projection-preview-uniforms.js";
import { buildProjectionPreviewRenderUniforms } from "./projection-preview-render-uniforms.js";

describe("projection preview render uniforms", () => {
  test("packs common render options for both source-map and plate sketch previews", () => {
    const uniforms = buildProjectionPreviewRenderUniforms({
      targetWidth: 960,
      targetHeight: 540,
      sourceWidth: 2048,
      sourceHeight: 1024,
      sourceProjectionMode: "zenith-230",
      projectionViewMode: "dome-pov",
      projectionCamera: { position: [1, 2, 3] },
      showProjectionGuides: true,
      domeGuideSemanticSplit: 0.42,
      domeGuideHorizonSplit: 0.73,
      showCaveMask: true,
      invertCaveMask: true,
    });

    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.fisheyeScale]).toBeCloseTo(0.25);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.fisheyeScale + 1]).toBeCloseTo(0.5);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.overlayOpacity]).toBeCloseTo(0.78);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.showRings]).toBe(1);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.shellShade]).toBeCloseTo(0.12);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.sourceCarrierSplit]).toBeCloseTo(0.42);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.sourceCarrierHorizon]).toBeCloseTo(0.73);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.showCaveMask]).toBe(2);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.cameraPosition]).toBeCloseTo(1);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.cameraPosition + 1]).toBeCloseTo(2);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.cameraPosition + 2]).toBeCloseTo(3);
  });

  test("treats source-map view as dome-orbit for projected preview uniforms", () => {
    const uniforms = buildProjectionPreviewRenderUniforms({
      targetWidth: 768,
      targetHeight: 768,
      sourceWidth: 768,
      sourceHeight: 768,
      sourceProjectionMode: "zenith-180",
      projectionViewMode: "source-map",
      showProjectionGuides: false,
    });

    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.overlayOpacity]).toBeCloseTo(0.28);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.showRings]).toBe(0);
    expect(uniforms[PROJECTION_PREVIEW_UNIFORM_OFFSETS.shellShade]).toBeCloseTo(0.3);
  });
});

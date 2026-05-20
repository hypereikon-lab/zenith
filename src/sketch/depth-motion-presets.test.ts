import { describe, expect, test } from "vitest";
import { normalizeDepthMotionSettings } from "./depth-parallax-renderer.js";
import { DEPTH_MOTION_PRESETS, findDepthMotionPreset } from "./depth-motion-presets.js";

describe("depth motion presets", () => {
  test("provide unique selectable preset ids", () => {
    const ids = DEPTH_MOTION_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(findDepthMotionPreset(id)?.id).toBe(id);
    }
    expect(findDepthMotionPreset("custom")).toBeNull();
  });

  test("map to normalized 2.5D motion settings", () => {
    for (const preset of DEPTH_MOTION_PRESETS) {
      const settings = normalizeDepthMotionSettings({
        nearMeters: preset.controls.depthNear,
        farMeters: preset.controls.depthFar,
        polarity: preset.controls.depthPolarity,
        guideMode: preset.controls.depthGuideMode,
        motionGain: preset.controls.depthMotionGain,
        depthContrast: preset.controls.depthContrast,
        guideNoise: preset.controls.depthGuideNoise,
        yawDegrees: preset.controls.depthSketchYaw,
        pitchDegrees: preset.controls.depthSketchPitch,
        rollDegrees: preset.controls.depthSketchRoll,
        truckMeters: preset.controls.depthSketchTruck,
        liftMeters: preset.controls.depthSketchLift,
        pushMeters: preset.controls.depthSketchPush,
        gapFillPasses: preset.controls.depthSketchGapFill,
      });

      expect(settings.farMeters).toBeGreaterThan(settings.nearMeters);
      expect(settings.motionGain).toBeGreaterThan(0);
      expect(settings.guideMode).toBe(preset.controls.depthGuideMode);
    }
  });
});

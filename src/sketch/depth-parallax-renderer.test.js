import { describe, expect, test } from "vitest";
import {
  depthMetersFromRgba,
  depthGuideModeIndex,
  motionPoseAt,
  normalizeDepthMotionSettings,
} from "./depth-parallax-renderer.js";

describe("depth parallax renderer", () => {
  test("maps grayscale depth through the selected polarity", () => {
    const pixel = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    const brightFar = normalizeDepthMotionSettings({ nearMeters: 2, farMeters: 12, polarity: "brightFar" });
    const brightNear = normalizeDepthMotionSettings({ nearMeters: 2, farMeters: 12, polarity: "brightNear" });

    expect(depthMetersFromRgba(pixel, 0, brightFar)).toBeCloseTo(12);
    expect(depthMetersFromRgba(pixel, 4, brightFar)).toBeCloseTo(2);
    expect(depthMetersFromRgba(pixel, 0, brightNear)).toBeCloseTo(2);
    expect(depthMetersFromRgba(pixel, 4, brightNear)).toBeCloseTo(12);
  });

  test("keeps the first motion frame at the source camera pose", () => {
    const settings = normalizeDepthMotionSettings({
      yawDegrees: 12,
      pitchDegrees: -4,
      rollDegrees: 3,
      truckMeters: 0.5,
      liftMeters: 0.2,
      pushMeters: -0.4,
    });

    expect(motionPoseAt(0, settings)).toMatchObject({
      yaw: 0,
      pitch: 0,
      roll: 0,
      offset: [0, 0, 0],
    });
    expect(motionPoseAt(1, settings).offset).toEqual([0.5, 0.2, -0.4]);
  });

  test("motion gain scales the exported camera move", () => {
    const settings = normalizeDepthMotionSettings({
      yawDegrees: 10,
      truckMeters: 0.5,
      motionGain: 3,
    });
    const pose = motionPoseAt(1, settings);

    expect(pose.yaw).toBeCloseTo((30 * Math.PI) / 180);
    expect(pose.offset[0]).toBeCloseTo(1.5);
  });

  test("normalizes guide render modes for GPU preview and export", () => {
    expect(normalizeDepthMotionSettings({ guideMode: "depthShaded" }).guideMode).toBe("depthShaded");
    expect(normalizeDepthMotionSettings({ guideMode: "depthMap" }).guideMode).toBe("depthMap");
    expect(normalizeDepthMotionSettings({ guideMode: "invalid" }).guideMode).toBe("source");
    expect(normalizeDepthMotionSettings({ guideNoise: 0.08 }).guideNoise).toBeCloseTo(0.08);
    expect(normalizeDepthMotionSettings({ guideNoise: 9 }).guideNoise).toBeCloseTo(0.2);
    expect(depthGuideModeIndex("depthMap")).toBe(2);
  });
});

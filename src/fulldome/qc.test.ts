import { describe, expect, test } from "vitest";
import { analyzeFulldomeMotionQuality, formatFulldomeQcItems } from "./qc.js";
import { buildFulldomeProfile } from "./profile.js";

const profile = buildFulldomeProfile({
  projectionMode: "zenith-180",
  radiusScale: 1,
  masterWidth: 1024,
  masterHeight: 1024,
  fps: 24,
});

describe("fulldome QC", () => {
  test("passes a restrained guide motion", () => {
    const report = analyzeFulldomeMotionQuality({
      profile,
      durationSeconds: 7,
      fps: 24,
      settings: {
        nearMeters: 1,
        farMeters: 12,
        yawDegrees: 1,
        pitchDegrees: -0.4,
        rollDegrees: 0,
        truckMeters: 0.03,
        liftMeters: 0.01,
        pushMeters: -0.04,
        motionGain: 1.5,
        depthContrast: 0.8,
      },
    });

    expect(report.status).toBe("clear");
    expect(report.items).toHaveLength(0);
    expect(formatFulldomeQcItems(report.items)).toBe("No production warnings");
  });

  test("flags aggressive roll, angular rate, near travel, and depth range", () => {
    const report = analyzeFulldomeMotionQuality({
      profile,
      durationSeconds: 5,
      fps: 12,
      settings: {
        nearMeters: 0.6,
        farMeters: 60,
        yawDegrees: 10,
        pitchDegrees: 8,
        rollDegrees: 3,
        truckMeters: 0.45,
        liftMeters: 0.08,
        pushMeters: -0.36,
        motionGain: 3,
        depthContrast: 2,
      },
    });

    expect(report.status).toBe("revise");
    expect(report.items.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "guide-fps",
        "angular-rate",
        "roll-angle",
        "near-translation",
        "forward-push",
        "depth-range",
        "depth-contrast",
      ]),
    );
    expect(report.metrics.peakAngularRateDegreesPerSecond).toBeGreaterThan(10);
    expect(report.metrics.translationNearRatio).toBeGreaterThan(0.5);
  });
});

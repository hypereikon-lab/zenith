import { describe, expect, test } from "vitest";
import { applyInverseDepthAlignment, fitInverseDepthAlignment, grayscaleToDepthMeters } from "./depth-alignment.js";
import type { DepthAlignmentSample } from "./depth-alignment.js";

describe("inverse-depth alignment", () => {
  test("fits scale and offset from reliable overlap samples", () => {
    const samples: DepthAlignmentSample[] = [];
    const scale = 1.4;
    const offset = -0.025;
    for (let index = 0; index < 80; index += 1) {
      const viewDepth = 1.2 + index * 0.07;
      const sceneInverse = scale * (1 / viewDepth) + offset;
      samples.push({
        viewDepthMeters: viewDepth,
        sceneDepthMeters: 1 / sceneInverse,
        confidence: 0.9,
      });
    }
    const result = fitInverseDepthAlignment("proxy", "depth", samples, { minSamples: 12, now: () => "t" });
    expect(result.status).toBe("aligned");
    expect(result.scale).toBeCloseTo(scale, 5);
    expect(result.offset).toBeCloseTo(offset, 5);
    expect(result.samplesUsed).toBe(80);
  });

  test("rejects disoccluded and low-confidence samples", () => {
    const reliable = Array.from({ length: 20 }, (_, index) => ({
      viewDepthMeters: 2 + index * 0.1,
      sceneDepthMeters: 2 + index * 0.1,
      confidence: 0.8,
    }));
    const rejected = [
      { viewDepthMeters: 8, sceneDepthMeters: 1, confidence: 0.2 },
      { viewDepthMeters: 8, sceneDepthMeters: 1, confidence: 0.9, disoccluded: true },
    ];
    const result = fitInverseDepthAlignment("proxy", "depth", [...reliable, ...rejected], { minSamples: 12, now: () => "t" });
    expect(result.status).toBe("aligned");
    expect(result.rejectedSamples).toBeGreaterThanOrEqual(2);
    expect(result.scale).toBeCloseTo(1, 5);
  });

  test("reports insufficient overlap instead of faking alignment", () => {
    const result = fitInverseDepthAlignment("proxy", "depth", [{ viewDepthMeters: 2, sceneDepthMeters: 2, confidence: 1 }], {
      minSamples: 8,
      now: () => "t",
    });
    expect(result.status).toBe("insufficient-overlap");
    expect(result.warnings[0]).toContain("Needs at least");
  });

  test("applies inverse-depth alignment back to meters", () => {
    const aligned = applyInverseDepthAlignment(4, { scale: 2, offset: 0 });
    expect(aligned).toBeCloseTo(2, 6);
  });

  test("maps grayscale to relative depth with polarity", () => {
    expect(grayscaleToDepthMeters(0, 1, 11, "brightFar")).toBeCloseTo(1, 6);
    expect(grayscaleToDepthMeters(0, 1, 11, "brightNear")).toBeCloseTo(11, 6);
  });
});

import { describe, expect, test } from "vitest";
import { createExternalFeatureAnchorService, importReport } from "./feature-anchor-service.js";

describe("feature anchor service foundation", () => {
  test("reports external runtime absence instead of fake matches", async () => {
    const service = createExternalFeatureAnchorService();
    const report = await service.compare({
      proxyId: "proxy",
      reconstructionId: "reconstruction",
      sourceImage: null,
      targetImage: null,
      provider: "dinov3",
    });
    expect(report.status).toBe("not-available");
    expect(report.anchors).toHaveLength(0);
    expect(report.warnings[0]).toContain("No in-browser dense feature runtime");
  });

  test("imports deterministic manual feature anchor reports", () => {
    const report = importReport(
      JSON.stringify({
        model: "manual",
        coverage: 0.5,
        driftScore: 0.2,
        anchors: [
          { sourcePoint: { x: 10, y: 11 }, targetPoint: { x: 12, y: 13 }, confidence: 0.8 },
          { sourcePoint: { x: "bad", y: 11 }, targetPoint: { x: 12, y: 13 }, confidence: 0.8 },
        ],
      }),
      "proxy",
      "reconstruction",
    );
    expect(report.status).toBe("imported");
    expect(report.anchors).toHaveLength(1);
    expect(report.coverage).toBe(0.5);
  });
});

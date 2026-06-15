import { describe, expect, test } from "vitest";
import { disabledReasonForOperator, getOperator, operatorsForArtifact } from "./operator-registry.js";

describe("artifact-first operator registry", () => {
  test("attaches valid next operations to artifact slots", () => {
    const plateSketchOperators = operatorsForArtifact("plate-sketch").map((item) => item.operator.id);
    const videoOperators = operatorsForArtifact("video-take").map((item) => item.operator.id);

    expect(plateSketchOperators).toContain("import-plate-sketch");
    expect(plateSketchOperators).toContain("repair-start-state");
    expect(plateSketchOperators).toContain("choose-projection");
    expect(videoOperators).toContain("generate-video-take");
    expect(videoOperators).toEqual(["generate-video-take"]);
  });

  test("marks paid operators as confirmation-gated", () => {
    const videoOperator = getOperator("generate-video-take");

    expect(videoOperator.kind).toBe("paid-api");
    expect(videoOperator.requiresConfirmation).toBe(true);
    expect(disabledReasonForOperator(videoOperator)).toBe("Needs Start State, End State, Motion Draft.");
    expect(videoOperator.description).toContain("Image 1 = Start State");
  });
});

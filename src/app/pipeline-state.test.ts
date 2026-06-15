import { describe, expect, test } from "vitest";
import { createInitialState } from "./app-state.js";
import {
  pipeline,
  getPipelineStatusNodes,
  selectPipelineArtifact,
  selectPipelineLane,
  syncPipelineFromZenithState,
} from "./pipeline-state.svelte.js";

describe("pipeline rune state", () => {
  test("selects lanes and artifacts as shared UI state", () => {
    selectPipelineLane("motion");
    expect(pipeline.activeLane).toBe("motion");
    expect(pipeline.selectedArtifactId).toBe("motion-guide");

    selectPipelineArtifact("endpoint-bridge");
    expect(pipeline.activeLane).toBe("bridge");
    expect(pipeline.selectedArtifactId).toBe("endpoint-bridge");
  });

  test("derives lane status from the artifact graph", () => {
    const state = createInitialState();
    state.depthMapCanvas = {} as HTMLCanvasElement;
    syncPipelineFromZenithState(state);

    const depth = getPipelineStatusNodes().find((node) => node.artifactId === "depth-map");
    const motion = getPipelineStatusNodes().find((node) => node.artifactId === "motion-guide");

    expect(depth).toMatchObject({ lane: "depth", status: "done", summary: "Depth ready" });
    expect(motion).toMatchObject({ lane: "motion", status: "ready", summary: "Ready" });
  });
});

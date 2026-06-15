import { describe, expect, test } from "vitest";
import { createInitialState } from "../app/app-state.js";
import { createArtifactGraph } from "./artifact-graph.js";

describe("artifact graph", () => {
  test("expresses the fulldome generation order as a DAG", () => {
    const graph = createArtifactGraph(createInitialState());

    expect(graph.nodes.map((node) => node.id)).toEqual([
      "source",
      "plate-sketch",
      "inpaint-repair",
      "depth-map",
      "motion-guide",
      "endpoint-bridge",
      "seedance-video",
      "delivery",
    ]);
    expect(graph.edges).toContainEqual({ from: "motion-guide", to: "endpoint-bridge" });
    expect(graph.edges).toContainEqual({ from: "endpoint-bridge", to: "seedance-video" });
  });

  test("marks downstream artifacts from current runtime state", () => {
    const state = createInitialState();
    state.depthMapCanvas = {} as HTMLCanvasElement;
    state.seedanceOutputs = [{ workflow: "depth-motion-reference" }];

    const graph = createArtifactGraph(state);
    const motion = graph.nodes.find((node) => node.id === "motion-guide");
    const bridge = graph.nodes.find((node) => node.id === "endpoint-bridge");

    expect(motion).toMatchObject({ lane: "motion", status: "done", summary: "Guide ready" });
    expect(bridge).toMatchObject({ lane: "bridge", status: "active", summary: "Capture final" });
  });
});

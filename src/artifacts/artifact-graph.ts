import type { WorkspaceId, ZenithState } from "../app/types.js";

export type ArtifactStatus = "waiting" | "ready" | "active" | "done" | "warning";
export type ArtifactNodeId =
  | "source"
  | "plate-sketch"
  | "inpaint-repair"
  | "depth-map"
  | "motion-guide"
  | "endpoint-bridge"
  | "seedance-video"
  | "delivery";

export type ArtifactNode = {
  id: ArtifactNodeId;
  lane: WorkspaceId;
  label: string;
  summary: string;
  status: ArtifactStatus;
  inputs: ArtifactNodeId[];
};

export type ArtifactEdge = {
  from: ArtifactNodeId;
  to: ArtifactNodeId;
};

export type ArtifactGraph = {
  nodes: ArtifactNode[];
  edges: ArtifactEdge[];
};

export const ARTIFACT_EDGES: ArtifactEdge[] = [
  { from: "source", to: "plate-sketch" },
  { from: "plate-sketch", to: "inpaint-repair" },
  { from: "source", to: "depth-map" },
  { from: "depth-map", to: "motion-guide" },
  { from: "motion-guide", to: "endpoint-bridge" },
  { from: "source", to: "seedance-video" },
  { from: "motion-guide", to: "seedance-video" },
  { from: "endpoint-bridge", to: "seedance-video" },
  { from: "seedance-video", to: "delivery" },
];

export function createArtifactGraph(state: ZenithState): ArtifactGraph {
  const hasSource = Boolean(
    state.sourceCanvas || state.mediaKind === "video" || (state.sourceWidth && state.sourceHeight),
  );
  const hasPlates = state.plates.length > 0;
  const hasPlatePreview = Boolean(state.plateCompositeTexture);
  const hasCommittedPlateMap = Boolean(state.plateCompositeCanvas && !state.plateCompositeDirty);
  const hasInpaintOutput = state.runwayOutputs.length > 0;
  const hasDepthMap = Boolean(state.depthMapCanvas);
  const seedanceOutputs = state.seedanceOutputs || [];
  const hasGuideVideo = seedanceOutputs.some((output) => output.workflow === "depth-motion-reference");
  const hasBridgeEndpoint = Boolean(state.depthFinalReconstructedCanvas || state.depthFinalStateCanvas);
  const hasBridgeVideo = seedanceOutputs.some((output) => output.workflow === "state-to-state");
  const hasImageVideo = seedanceOutputs.some((output) => output.workflow === "image-to-video");
  const hasSeedanceOutput = seedanceOutputs.length > 0;

  return {
    nodes: [
      node("source", "source", "Source", hasSource ? "Ready" : "Waiting", hasSource ? "done" : "waiting", []),
      node(
        "plate-sketch",
        "sketch",
        "Sketch",
        hasCommittedPlateMap
          ? "Committed"
          : state.plateCompositeDirty
            ? "Preview dirty"
            : hasPlatePreview
              ? "Preview"
              : hasPlates
                ? "Arrange"
                : "Load images",
        hasCommittedPlateMap ? "done" : hasPlates ? "active" : "waiting",
        ["source"],
      ),
      node(
        "inpaint-repair",
        "repair",
        "Repair",
        hasInpaintOutput ? "Result ready" : hasCommittedPlateMap ? "Ready" : "Needs plate map",
        hasInpaintOutput ? "done" : hasCommittedPlateMap ? "ready" : "waiting",
        ["plate-sketch"],
      ),
      node(
        "depth-map",
        "depth",
        "Depth",
        hasDepthMap ? "Depth ready" : hasSource ? "Ready" : "Needs source",
        hasDepthMap ? "done" : hasSource ? "ready" : "waiting",
        ["source"],
      ),
      node(
        "motion-guide",
        "motion",
        "Motion",
        hasGuideVideo ? "Guide ready" : hasDepthMap ? "Ready" : hasSource ? "Needs depth" : "Needs source",
        hasGuideVideo ? "done" : hasDepthMap ? "ready" : "waiting",
        ["depth-map"],
      ),
      node(
        "endpoint-bridge",
        "bridge",
        "Bridge",
        hasBridgeVideo
          ? "Bridge video"
          : hasBridgeEndpoint
            ? "Endpoint ready"
            : hasDepthMap
              ? "Capture final"
              : "Needs depth",
        hasBridgeVideo ? "done" : hasBridgeEndpoint ? "ready" : hasDepthMap ? "active" : "waiting",
        ["motion-guide"],
      ),
      node(
        "seedance-video",
        "video",
        "Video",
        hasImageVideo ? "Image video" : hasSeedanceOutput ? "Video ready" : hasSource ? "Ready" : "Needs source",
        hasImageVideo || hasSeedanceOutput ? "done" : hasSource ? "ready" : "waiting",
        ["source", "motion-guide", "endpoint-bridge"],
      ),
      node(
        "delivery",
        "deliver",
        "Deliver",
        hasSeedanceOutput ? "Ready" : hasSource ? "Inspect/export" : "Waiting",
        hasSeedanceOutput ? "done" : hasSource ? "ready" : "waiting",
        ["seedance-video"],
      ),
    ],
    edges: ARTIFACT_EDGES,
  };
}

function node(
  id: ArtifactNodeId,
  lane: WorkspaceId,
  label: string,
  summary: string,
  status: ArtifactStatus,
  inputs: ArtifactNodeId[],
): ArtifactNode {
  return { id, lane, label, summary, status, inputs };
}

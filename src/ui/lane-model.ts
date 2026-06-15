import type { ArtifactNodeId, ArtifactStatus } from "../artifacts/artifact-graph.js";

export type LaneId = "source" | "sketch" | "repair" | "depth" | "motion" | "bridge" | "video" | "deliver";

export type LaneDefinition = {
  id: LaneId;
  number: string;
  label: string;
  artifactId: ArtifactNodeId;
  readoutId: string;
  summary: string;
};

export type ArtifactStatusNode = {
  artifactId: ArtifactNodeId;
  lane: LaneId;
  label: string;
  summary: string;
  status: ArtifactStatus;
  readoutId: string;
};

export const LANE_DEFINITIONS: LaneDefinition[] = [
  {
    id: "source",
    number: "01",
    label: "Source",
    artifactId: "source",
    readoutId: "flowSourceState",
    summary: "Default map",
  },
  {
    id: "sketch",
    number: "02",
    label: "Sketch",
    artifactId: "plate-sketch",
    readoutId: "flowSketchState",
    summary: "Load images",
  },
  {
    id: "repair",
    number: "03",
    label: "Repair",
    artifactId: "inpaint-repair",
    readoutId: "flowRepairState",
    summary: "Needs sketch",
  },
  {
    id: "depth",
    number: "04",
    label: "Depth",
    artifactId: "depth-map",
    readoutId: "flowDepthState",
    summary: "Needs source",
  },
  {
    id: "motion",
    number: "05",
    label: "Motion",
    artifactId: "motion-guide",
    readoutId: "flowMotionState",
    summary: "Needs depth",
  },
  {
    id: "bridge",
    number: "06",
    label: "Bridge",
    artifactId: "endpoint-bridge",
    readoutId: "flowBridgeState",
    summary: "Needs final",
  },
  {
    id: "video",
    number: "07",
    label: "Video",
    artifactId: "seedance-video",
    readoutId: "flowVideoState",
    summary: "Not ready",
  },
  {
    id: "deliver",
    number: "08",
    label: "Deliver",
    artifactId: "delivery",
    readoutId: "flowDeliverState",
    summary: "Waiting",
  },
];

export function createInitialArtifactStatuses(): ArtifactStatusNode[] {
  return LANE_DEFINITIONS.map((lane) => ({
    artifactId: lane.artifactId,
    lane: lane.id,
    label: lane.label,
    summary: lane.summary,
    status: "waiting",
    readoutId: lane.readoutId,
  }));
}

export function isLaneId(value?: string): value is LaneId {
  return Boolean(value && LANE_DEFINITIONS.some((lane) => lane.id === value));
}

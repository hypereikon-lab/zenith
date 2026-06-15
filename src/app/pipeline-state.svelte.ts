import { createContext } from "svelte";
import { ARTIFACT_EDGES, createArtifactGraph } from "../artifacts/artifact-graph.js";
import { LANE_DEFINITIONS, isLaneId } from "../ui/lane-model.js";
import type { ZenithState } from "./types.js";
import type { ArtifactGraph, ArtifactNode, ArtifactNodeId } from "../artifacts/artifact-graph.js";
import type { ArtifactStatusNode, LaneId } from "../ui/lane-model.js";

export type PipelineReadouts = {
  source: string;
  media: string;
  view: string;
  upload: string;
  renderer: string;
};

export type PipelineReferences = {
  seedanceStill: string;
  seedanceMotion: string;
  stateFirst: string;
  stateLast: string;
  imageStill: string;
};

export type PipelineSystemState = {
  gpu: string;
  gpuError: boolean;
};

export type PipelineJobState = {
  message: string;
  busy: boolean;
  progress: number | null;
};

export type PipelinePromptState = {
  preview: string;
  status: string;
  empty: boolean;
  stale: boolean;
};

export type PipelineRuntimeArtifacts = {
  sourceCanvas: HTMLCanvasElement | null;
  depthMapCanvas: HTMLCanvasElement | null;
  finalStateCanvas: HTMLCanvasElement | null;
  reconstructedFinalCanvas: HTMLCanvasElement | null;
};

export type PipelineError = {
  message: string;
  createdAt: string;
  scope?: string;
};

export type PipelineState = {
  activeLane: LaneId;
  selectedArtifactId: ArtifactNodeId | null;
  graph: ArtifactGraph;
  readouts: PipelineReadouts;
  drop: {
    active: boolean;
    depth: number;
  };
  references: PipelineReferences;
  jobs: {
    depthMotion: PipelineJobState;
  };
  prompts: {
    motion: PipelinePromptState;
    bridge: PipelinePromptState;
    video: PipelinePromptState;
  };
  system: PipelineSystemState;
  errors: PipelineError[];
};

export type PipelineContext = {
  state: PipelineState;
  statusNodes: () => ArtifactStatusNode[];
  selectedArtifact: () => ArtifactNode | null;
  inputArtifacts: (id: ArtifactNodeId) => ArtifactNode[];
  outputArtifacts: (id: ArtifactNodeId) => ArtifactNode[];
  operatorFor: (id: ArtifactNodeId) => string;
  selectArtifact: (id: ArtifactNodeId) => void;
  selectLane: (lane: LaneId) => void;
};

export const [getPipelineContext, setPipelineContext] = createContext<PipelineContext>();

export const pipeline = $state<PipelineState>({
  activeLane: "source",
  selectedArtifactId: "source",
  graph: createInitialPipelineGraph(),
  readouts: {
    source: "Procedural 180 map",
    media: "2048 x 2048 image",
    view: "Inside dome",
    upload: "Image texture",
    renderer: "Fast map",
  },
  drop: {
    active: false,
    depth: 0,
  },
  references: {
    seedanceStill: "Current source image",
    seedanceMotion: "2.5D MP4 guide",
    stateFirst: "Current source image",
    stateLast: "Needs final state",
    imageStill: "Current source image",
  },
  jobs: {
    depthMotion: {
      message: "Generate a depth map",
      busy: false,
      progress: null,
    },
  },
  prompts: {
    motion: {
      preview: "Generated on send",
      status: "Not planned",
      empty: true,
      stale: false,
    },
    bridge: {
      preview: "Generated on send",
      status: "Not planned",
      empty: true,
      stale: false,
    },
    video: {
      preview: "Generated on send",
      status: "Not planned",
      empty: true,
      stale: false,
    },
  },
  system: {
    gpu: "Starting",
    gpuError: false,
  },
  errors: [],
});

let sourceCanvasArtifact = $state.raw<HTMLCanvasElement | null>(null);
let depthMapCanvasArtifact = $state.raw<HTMLCanvasElement | null>(null);
let finalStateCanvasArtifact = $state.raw<HTMLCanvasElement | null>(null);
let reconstructedFinalCanvasArtifact = $state.raw<HTMLCanvasElement | null>(null);

const pipelineStatusNodes = $derived.by(() =>
  LANE_DEFINITIONS.map((lane) => {
    const node = pipeline.graph.nodes.find((item) => item.id === lane.artifactId);
    return {
      artifactId: lane.artifactId,
      lane: lane.id,
      label: lane.label,
      summary: node?.summary || lane.summary,
      status: node?.status || "waiting",
      readoutId: lane.readoutId,
    } satisfies ArtifactStatusNode;
  }),
);

const selectedArtifact = $derived.by(
  () => pipeline.graph.nodes.find((node) => node.id === pipeline.selectedArtifactId) || null,
);

export function createPipelineContext(): PipelineContext {
  return {
    state: pipeline,
    statusNodes: getPipelineStatusNodes,
    selectedArtifact: getSelectedArtifact,
    inputArtifacts,
    outputArtifacts,
    operatorFor,
    selectArtifact: selectPipelineArtifact,
    selectLane: selectPipelineLane,
  };
}

export function getPipelineStatusNodes(): ArtifactStatusNode[] {
  return pipelineStatusNodes;
}

export function getSelectedArtifact(): ArtifactNode | null {
  return selectedArtifact;
}

export function selectPipelineLane(lane: string): void {
  if (!isLaneId(lane)) return;
  pipeline.activeLane = lane;
  const laneArtifactId = LANE_DEFINITIONS.find((definition) => definition.id === lane)?.artifactId;
  if (laneArtifactId) {
    pipeline.selectedArtifactId = laneArtifactId;
  }
}

export function selectPipelineArtifact(id: ArtifactNodeId): void {
  const node = pipeline.graph.nodes.find((item) => item.id === id);
  if (!node) return;
  pipeline.selectedArtifactId = id;
  if (isLaneId(node.lane)) {
    pipeline.activeLane = node.lane;
  }
}

export function syncPipelineFromZenithState(
  state: ZenithState,
  options: {
    readouts?: Partial<PipelineReadouts>;
    references?: Partial<PipelineReferences>;
    depthMotionJob?: Partial<PipelineJobState>;
    prompts?: Partial<Record<keyof PipelineState["prompts"], Partial<PipelinePromptState>>>;
  } = {},
): void {
  pipeline.graph = createArtifactGraph(state);
  Object.assign(pipeline.readouts, options.readouts);
  Object.assign(pipeline.references, referencesFromZenithState(state), options.references);
  Object.assign(pipeline.jobs.depthMotion, options.depthMotionJob);
  if (options.prompts) {
    for (const [key, prompt] of Object.entries(options.prompts)) {
      Object.assign(pipeline.prompts[key as keyof PipelineState["prompts"]], prompt);
    }
  }
  sourceCanvasArtifact = state.sourceCanvas;
  depthMapCanvasArtifact = state.depthMapCanvas;
  finalStateCanvasArtifact = state.depthFinalStateCanvas;
  reconstructedFinalCanvasArtifact = state.depthFinalReconstructedCanvas;

  if (!pipeline.selectedArtifactId || !pipeline.graph.nodes.some((node) => node.id === pipeline.selectedArtifactId)) {
    pipeline.selectedArtifactId = pipeline.graph.nodes[0]?.id || null;
  }
}

export function setPipelineReadouts(readouts: Partial<PipelineReadouts>): void {
  Object.assign(pipeline.readouts, readouts);
}

export function setPipelinePromptState(
  key: keyof PipelineState["prompts"],
  prompt: Partial<PipelinePromptState>,
): void {
  Object.assign(pipeline.prompts[key], prompt);
}

export function setPipelineDepthMotionJob(job: Partial<PipelineJobState>): void {
  Object.assign(pipeline.jobs.depthMotion, job);
}

export function createPipelineDepthMotionReadoutSink(): { textContent: string } {
  return {
    get textContent() {
      return pipeline.jobs.depthMotion.message;
    },
    set textContent(value: string | null | undefined) {
      setPipelineDepthMotionJob({ message: value || "Generate a depth map" });
    },
  };
}

export function setPipelineDropActive(active: boolean, depth = active ? Math.max(1, pipeline.drop.depth) : 0): void {
  pipeline.drop.active = active;
  pipeline.drop.depth = depth;
}

export function setPipelineGpuState(text: string, isError = false): void {
  pipeline.system.gpu = text;
  pipeline.system.gpuError = Boolean(isError);
}

export function recordPipelineError(message: string, scope?: string): void {
  pipeline.errors.unshift({ message, scope, createdAt: new Date().toISOString() });
  pipeline.errors = pipeline.errors.slice(0, 12);
}

export function getPipelineRuntimeArtifacts(): PipelineRuntimeArtifacts {
  return {
    sourceCanvas: sourceCanvasArtifact,
    depthMapCanvas: depthMapCanvasArtifact,
    finalStateCanvas: finalStateCanvasArtifact,
    reconstructedFinalCanvas: reconstructedFinalCanvasArtifact,
  };
}

export function inputArtifacts(id: ArtifactNodeId): ArtifactNode[] {
  const node = pipeline.graph.nodes.find((item) => item.id === id);
  if (!node) return [];
  return node.inputs.map((inputId) => pipeline.graph.nodes.find((item) => item.id === inputId)).filter(Boolean);
}

export function outputArtifacts(id: ArtifactNodeId): ArtifactNode[] {
  const outputIds = pipeline.graph.edges.filter((edge) => edge.from === id).map((edge) => edge.to);
  return outputIds.map((outputId) => pipeline.graph.nodes.find((item) => item.id === outputId)).filter(Boolean);
}

export function operatorFor(id: ArtifactNodeId): string {
  switch (id) {
    case "source":
      return "Media source / procedural map";
    case "plate-sketch":
      return "Plate placement compositor";
    case "inpaint-repair":
      return "Runway inpaint handoff";
    case "depth-map":
      return "Gemini depth map";
    case "motion-guide":
      return "WebGPU 2.5D depth motion";
    case "endpoint-bridge":
      return "2.5D final capture + GPT image reconstruction";
    case "seedance-video":
      return "Seedance video generation";
    case "delivery":
      return "Fulldome / CAVE export";
  }
}

function referencesFromZenithState(state: ZenithState): PipelineReferences {
  const hasSource = Boolean(
    state.sourceCanvas || state.mediaKind === "video" || (state.sourceWidth && state.sourceHeight),
  );
  const hasDepthMap = Boolean(state.depthMapCanvas);
  const sourceLabel = state.sourceName || "Current source";
  return {
    seedanceStill: hasSource ? `${sourceLabel} still` : "Needs source",
    seedanceMotion: hasDepthMap ? "2.5D MP4 guide" : "Needs depth map",
    stateFirst: hasSource ? `${sourceLabel} still` : "Needs source",
    stateLast: state.depthFinalReconstructedCanvas
      ? state.depthFinalReconstructedName || "Reconstructed final"
      : state.depthFinalStateCanvas
        ? state.depthFinalStateName || "Raw final state"
        : hasDepthMap
          ? "Needs capture"
          : "Needs depth map",
    imageStill: hasSource ? `${sourceLabel} still` : "Needs source",
  };
}

function createInitialPipelineGraph(): ArtifactGraph {
  return {
    edges: ARTIFACT_EDGES,
    nodes: LANE_DEFINITIONS.map((lane) => ({
      id: lane.artifactId,
      lane: lane.id,
      label: lane.label,
      summary: lane.summary,
      status: "waiting",
      inputs: ARTIFACT_EDGES.filter((edge) => edge.to === lane.artifactId).map((edge) => edge.from),
    })),
  };
}

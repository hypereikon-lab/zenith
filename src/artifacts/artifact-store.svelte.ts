import type {
  ArtifactMedia,
  ArtifactRecord,
  ArtifactResult,
  ArtifactSlotId,
  JobState,
  PendingPaidAction,
  QcItem,
  WorkflowStage,
  WorkflowStageId,
} from "./artifact-types.js";
import { inpaintPromptForProjection } from "../inpaint/inpaint-prompts.js";
import { DOME_HANDOFF_GUIDE } from "../geometry/dome-handoff-guide.js";
import { defaultSourceGuideCarrierHorizonRadius } from "../geometry/source-guide-semantics.js";
import type { SourceProjectionMode } from "../geometry/source-projection.js";
import { PROJECT_ARTIFACT_INPUTS_BY_ID, PROJECT_ARTIFACT_STAGE_BY_ID } from "../lib/shared/contracts/artifact-topology.js";

export type ArtifactMediaHandle = {
  blob?: Blob | null;
  file?: File | null;
  canvas?: HTMLCanvasElement | null;
};

const DEFAULT_PLATE_SKETCH = "/default-plates/hypereikon_httpss.mj.runH1b_6iuqGYI_httpss.mj.rungE7F-sXgL5s_ht_b8d28ad8-33c1-4c3e-8099-385dddae3428.png";

export const WORKFLOW_STAGES: WorkflowStage[] = [
  {
    id: "start",
    number: "01",
    label: "Build Start State",
    summary: "Plate Sketch first, then repair into Start State and depth",
    artifactIds: ["plate-sketch", "start-state", "start-depth"],
  },
  {
    id: "motion",
    number: "02",
    label: "Design Motion Draft",
    summary: "Local 2.5D guide/proxy, not final production quality",
    artifactIds: ["motion-draft", "displaced-endpoint"],
  },
  {
    id: "end",
    number: "03",
    label: "Build End State",
    summary: "Reconstruct the displaced endpoint into a clean final still",
    artifactIds: ["end-state", "end-depth"],
  },
  {
    id: "video",
    number: "04",
    label: "Generate Video Take",
    summary: "Image 1 = Start, Image 2 = End, Video 1 = Motion Draft",
    artifactIds: ["video-take"],
  },
  {
    id: "deliver",
    number: "05",
    label: "QC + Export",
    summary: "Production checks and delivery exports",
    artifactIds: ["deliverables"],
  },
];

const now = () => new Date().toISOString();

export const workbench = $state({
  selectedStageId: "start" as WorkflowStageId,
  selectedArtifactId: "plate-sketch" as ArtifactSlotId,
  projectionProfile: "zenith-180" as SourceProjectionMode,
  domeGuideSemanticSplit: DOME_HANDOFF_GUIDE.defaultSemanticSplit,
  domeGuideHorizonSplit: defaultSourceGuideCarrierHorizonRadius("cave-270", DOME_HANDOFF_GUIDE.defaultSemanticSplit),
  compareMode: "single" as "single" | "start-end" | "endpoint-triptych",
  viewerMode: "domemaster" as "domemaster" | "dome-check" | "rim-check",
  surfaceMode: "artifact" as "artifact" | "media-preview" | "rgbd-lab",
  mediaPreview: {
    media: { kind: "none", blob: null, file: null, canvas: null } as ArtifactMedia,
    summary: "Drop an outside generation here to inspect it through the selected projection geometry.",
    updatedAt: now(),
  },
  artifacts: createInitialArtifacts(),
  jobs: [] as JobState[],
  errors: [] as { id: string; message: string; scope?: string; createdAt: string }[],
  pendingPaidAction: null as PendingPaidAction,
  drop: {
    active: false,
    depth: 0,
  },
  promptDrafts: {
    repair: inpaintPromptForProjection("zenith-180"),
    startDepth:
      "Generate a clean grayscale depth map for this square fulldome domemaster. Preserve the circular fisheye layout exactly. Use black for nearest objects and white for farthest depth with smooth tonal transitions. Keep the pitch-black exterior outside the projection circle.",
    reconstruct:
      "Use the displaced endpoint image as the structural source of truth: reconstruct the visible final pose, parallax endpoint, and warped arrangement into a clean square domemaster still. Use the Start State only as a style, material, lighting, and identity reference. Do not copy the Start State composition. Remove 2.5D tearing, green/black handoff artifacts, holes, splat speckles, and broken projection edges while preserving the endpoint structure.",
    endDepth:
      "Generate a clean grayscale depth map for the reconstructed End State. Match the same fulldome depth convention as Start Depth so the two depth states can be compared or interpolated. Preserve square domemaster geometry and pitch-black exterior.",
    video:
      "Create one continuous fulldome domemaster video take. Image 1 is the Start State and defines scene identity, style, material, lighting, and first-frame composition. Image 2 is the End State and defines the final-frame endpoint. Video 1 is the local 2.5D Motion Draft and should be used only as choreography: camera timing, parallax direction, depth rhythm, and broad motion path. Preserve the circular fisheye projection and pure black exterior. Avoid cuts, rectangular reframing, text, UI overlays, mask artifacts, scene replacement, or flat-landscape interpretation.",
  },
  motionConfig: {
    duration: 5,
    fps: 12,
    size: 1024,
    radiusScale: 1,
    yaw: 16,
    pitch: -4,
    roll: 0,
    truck: 0,
    lift: 0,
    push: 0.28,
    depthGain: 0.42,
    nearMeters: 1,
    farMeters: 24,
    depthContrast: 1,
    gapFillPasses: 2,
    polarity: "brightFar" as const,
    guideMode: "source" as const,
    emptyBackground: "greenDome" as const,
  },
  qcItems: createQcItems(),
});

export const artifactMediaHandles = $state.raw(new Map<ArtifactSlotId, ArtifactMediaHandle>());
let mediaPreviewHandle: ArtifactMediaHandle = { blob: null, file: null, canvas: null };

const selectedStageValue = $derived.by(
  () => WORKFLOW_STAGES.find((stage) => stage.id === workbench.selectedStageId) || WORKFLOW_STAGES[0],
);

const selectedArtifactValue = $derived.by(() => getArtifact(workbench.selectedArtifactId));

const artifactListValue = $derived.by(() =>
  WORKFLOW_STAGES.flatMap((stage) => stage.artifactIds.map((id) => workbench.artifacts[id])),
);

const readyQcCountValue = $derived.by(() => workbench.qcItems.filter((item) => item.checked).length);

export function getSelectedStage() {
  return selectedStageValue;
}

export function getSelectedArtifact() {
  return selectedArtifactValue;
}

export function getArtifactList() {
  return artifactListValue;
}

export function getReadyQcCount() {
  return readyQcCountValue;
}

export function selectStage(stageId: WorkflowStageId): void {
  const stage = WORKFLOW_STAGES.find((item) => item.id === stageId);
  if (!stage) return;
  workbench.selectedStageId = stage.id;
  if (!stage.artifactIds.includes(workbench.selectedArtifactId)) {
    workbench.selectedArtifactId = stage.artifactIds[0];
  }
}

export function selectArtifact(artifactId: ArtifactSlotId): void {
  const artifact = getArtifact(artifactId);
  workbench.surfaceMode = "artifact";
  workbench.selectedArtifactId = artifact.id;
  workbench.selectedStageId = artifact.stage;
}

export function selectSurfaceMode(mode: typeof workbench.surfaceMode): void {
  workbench.surfaceMode = mode;
}

export function getArtifact(artifactId: ArtifactSlotId): ArtifactRecord {
  return workbench.artifacts[artifactId];
}

export function setArtifactMediaHandle(artifactId: ArtifactSlotId, handle: ArtifactMediaHandle): void {
  artifactMediaHandles.set(artifactId, handle);
}

export function getArtifactMediaHandle(artifactId: ArtifactSlotId): ArtifactMediaHandle | undefined {
  return artifactMediaHandles.get(artifactId);
}

export function setMediaPreviewHandle(handle: ArtifactMediaHandle): void {
  mediaPreviewHandle = handle;
}

export function getMediaPreviewHandle(): ArtifactMediaHandle {
  return mediaPreviewHandle;
}

export function artifactIsReady(artifactId: ArtifactSlotId): boolean {
  const artifact = getArtifact(artifactId);
  return artifact.status === "ready" || artifact.status === "done" || artifact.status === "warning";
}

export function artifactInputsReady(artifact: Pick<ArtifactRecord, "inputs">): boolean {
  return artifact.inputs.every(artifactIsReady);
}

export function updateArtifact(
  artifactId: ArtifactSlotId,
  patch: Partial<Omit<ArtifactRecord, "id" | "type">>,
): void {
  const artifact = getArtifact(artifactId);
  Object.assign(artifact, patch, { updatedAt: now() });
  markDownstreamStale(artifactId);
}

export function replaceArtifacts(artifacts: Record<ArtifactSlotId, ArtifactRecord>): void {
  workbench.artifacts = artifacts;
}

export function replaceQcItems(qcItems: QcItem[]): void {
  workbench.qcItems = qcItems;
}

export function addArtifactResult(artifactId: ArtifactSlotId, result: Omit<ArtifactResult, "id" | "createdAt">): void {
  const artifact = getArtifact(artifactId);
  artifact.results.forEach((item) => {
    item.selected = false;
  });
  artifact.results.unshift({
    ...result,
    id: `${artifactId}-result-${Date.now()}`,
    createdAt: now(),
    selected: true,
  });
  artifact.updatedAt = now();
}

export function selectArtifactResult(artifactId: ArtifactSlotId, resultId: string): void {
  const artifact = getArtifact(artifactId);
  const result = artifact.results.find((item) => item.id === resultId);
  if (!result) return;
  artifact.results.forEach((item) => {
    item.selected = item.id === resultId;
  });
  artifact.media = result.media;
  artifact.prompt = result.prompt || artifact.prompt;
  artifact.updatedAt = now();
}

export function setProjectionProfile(profile: SourceProjectionMode): void {
  workbench.projectionProfile = profile;
  for (const artifact of Object.values(workbench.artifacts)) {
    artifact.projectionProfile = profile;
  }
}

export function startJob(operatorId: JobState["operatorId"], label: string, stage = "Starting"): void {
  workbench.jobs.unshift({ operatorId, label, stage, progress: 0.01, busy: true });
}

export function updateJob(operatorId: JobState["operatorId"], stage: string, progress: number | null = null): void {
  const job = workbench.jobs.find((item) => item.operatorId === operatorId && item.busy);
  if (!job) return;
  job.stage = stage;
  job.progress = progress;
}

export function finishJob(operatorId: JobState["operatorId"], stage = "Done"): void {
  const job = workbench.jobs.find((item) => item.operatorId === operatorId && item.busy);
  if (!job) return;
  job.stage = stage;
  job.progress = 1;
  job.busy = false;
}

export function recordWorkbenchError(message: string, scope?: string): void {
  workbench.errors.unshift({ id: `error-${Date.now()}`, message, scope, createdAt: now() });
  workbench.errors = workbench.errors.slice(0, 5);
}

export function setMediaPreview(media: ArtifactMedia, summary: string): void {
  workbench.mediaPreview.media = media;
  workbench.mediaPreview.summary = summary;
  workbench.mediaPreview.updatedAt = now();
  workbench.surfaceMode = "media-preview";
}

export function clearMediaPreview(): void {
  workbench.mediaPreview.media = { kind: "none", blob: null, file: null, canvas: null };
  workbench.mediaPreview.summary = "Drop an outside generation here to inspect it through the selected projection geometry.";
  workbench.mediaPreview.updatedAt = now();
  setMediaPreviewHandle({ blob: null, file: null, canvas: null });
}

export function setDropActive(active: boolean, depth = 0): void {
  workbench.drop.active = active;
  workbench.drop.depth = depth;
}

function markDownstreamStale(changed: ArtifactSlotId): void {
  for (const artifact of Object.values(workbench.artifacts)) {
    if (!artifact.inputs.includes(changed)) continue;
    if (artifact.status === "ready" || artifact.status === "done") {
      artifact.stale = true;
      artifact.status = "stale";
      artifact.warnings = [...new Set([...artifact.warnings, "Input artifact changed after this result was produced."])];
    }
  }
}

function artifact(
  id: ArtifactSlotId,
  label: string,
  summary: string,
  media: ArtifactRecord["media"],
  status: ArtifactRecord["status"] = "missing",
): ArtifactRecord {
  return {
    id,
    type: id,
    stage: PROJECT_ARTIFACT_STAGE_BY_ID[id],
    label,
    summary,
    status,
    inputs: [...PROJECT_ARTIFACT_INPUTS_BY_ID[id]],
    projectionProfile: "zenith-180",
    media,
    results: [],
    createdAt: now(),
    updatedAt: now(),
    warnings: [],
    qcNotes: [],
    stale: false,
  };
}

function createInitialArtifacts(): Record<ArtifactSlotId, ArtifactRecord> {
  const records: Record<ArtifactSlotId, ArtifactRecord> = {
    "plate-sketch": artifact(
      "plate-sketch",
      "Plate Sketch",
      "Default fulldome Plate Sketch handoff loaded. This is the first artifact for inpaint.",
      {
        kind: "image",
        url: DEFAULT_PLATE_SKETCH,
        name: "Default plate sketch handoff",
        alt: "Default square fulldome plate sketch composition handoff",
        blob: null,
        file: null,
        canvas: null,
      },
      "ready",
    ),
    "start-state": artifact(
      "start-state",
      "Start State",
      "Repair/inpaint the Plate Sketch or import a clean square domemaster Start State.",
      { kind: "none", blob: null, file: null, canvas: null },
      "missing",
    ),
    "start-depth": artifact(
      "start-depth",
      "Start Depth",
      "Import or generate a depth map from the Start State before real 2.5D motion.",
      { kind: "none", blob: null, file: null, canvas: null },
      "missing",
    ),
    "motion-draft": artifact(
      "motion-draft",
      "Motion Draft",
      "Create a real local 2.5D guide from Start State + Start Depth. This is not final production quality.",
      { kind: "none", blob: null, file: null, canvas: null },
      "missing",
    ),
    "displaced-endpoint": artifact(
      "displaced-endpoint",
      "Displaced Endpoint",
      "Capture this from the real local 2.5D depth-motion engine.",
      { kind: "none", blob: null, file: null, canvas: null },
      "missing",
    ),
    "end-state": artifact(
      "end-state",
      "End State",
      "Reconstruct the displaced endpoint into a clean final domemaster still.",
      { kind: "none", blob: null, file: null, canvas: null },
      "missing",
    ),
    "end-depth": artifact(
      "end-depth",
      "End Depth",
      "Optional depth map for the reconstructed endpoint.",
      { kind: "none", blob: null, file: null, canvas: null },
      "missing",
    ),
    "video-take": artifact(
      "video-take",
      "Video Take",
      "Generate from Image 1, Image 2, and the real WebGPU/WebCodecs Motion Draft.",
      { kind: "none", blob: null, file: null, canvas: null },
      "missing",
    ),
    deliverables: artifact(
      "deliverables",
      "Deliverables",
      "Run QC and export after a real Video Take exists.",
      { kind: "none", blob: null, file: null, canvas: null },
      "missing",
    ),
  };
  seedInitialResult(records, "plate-sketch", "Default Plate Sketch");
  return records;
}

function seedInitialResult(records: Record<ArtifactSlotId, ArtifactRecord>, artifactId: ArtifactSlotId, label: string): void {
  const source = records[artifactId];
  source.results = [
    {
      id: `${artifactId}-initial-result`,
      label,
      createdAt: source.createdAt || now(),
      media: source.media,
      operatorId: source.operatorId,
      selected: true,
    },
  ];
}

function createQcItems(): QcItem[] {
  return [
    {
      id: "projection-profile",
      label: "Projection profile",
      description: "Correct zenith/nadir field of view and projection convention selected.",
      checked: false,
    },
    {
      id: "circular-framing",
      label: "Circular framing",
      description: "Dome circle is centered, complete, and black outside the projection circle.",
      checked: false,
    },
    {
      id: "zenith-nadir",
      label: "Zenith/nadir check",
      description: "Center and pole regions are visually coherent for the selected orientation.",
      checked: false,
    },
    {
      id: "seam-edge",
      label: "Seam/edge check",
      description: "Rim, horizon, and projection boundary do not show visible repair seams.",
      checked: false,
    },
    {
      id: "motion-tearing",
      label: "Motion tearing check",
      description: "2.5D/reconstruction artifacts do not dominate the final video take.",
      checked: false,
    },
    {
      id: "video-playback",
      label: "Video playback check",
      description: "Final video plays cleanly without stalls, cuts, or rectangular reframing.",
      checked: false,
    },
    {
      id: "delivery-export",
      label: "Delivery export check",
      description: "Still, video, project manifest, and depth/motion config exports are reviewed before delivery.",
      checked: false,
    },
    {
      id: "provenance-prompt",
      label: "Provenance/prompt check",
      description: "Prompts, input roles, and produced artifacts are inspectable.",
      checked: false,
    },
  ];
}

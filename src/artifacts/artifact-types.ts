import type { SourceProjectionMode } from "../geometry/source-projection.js";
import type { ProjectArtifactSlotId, ProjectWorkflowStageId } from "../lib/shared/contracts/artifact-topology.js";

export type WorkflowStageId = ProjectWorkflowStageId;

export type ArtifactSlotId = ProjectArtifactSlotId;

export type ArtifactStatus = "missing" | "ready" | "working" | "done" | "warning" | "stale";

export type ArtifactMediaKind = "none" | "image" | "video" | "canvas";

export type ArtifactMedia = {
  kind: ArtifactMediaKind;
  url?: string;
  name?: string;
  mime?: string;
  alt?: string;
  blob?: Blob | null;
  file?: File | null;
  canvas?: HTMLCanvasElement | null;
};

export type ArtifactMediaHandle = {
  blob?: Blob | null;
  file?: File | null;
  canvas?: HTMLCanvasElement | null;
};

export type ArtifactResult = {
  id: string;
  label: string;
  createdAt: string;
  media: ArtifactMedia;
  prompt?: string;
  operatorId?: string;
  selected?: boolean;
};

export type ArtifactConfigValue =
  | string
  | number
  | boolean
  | null
  | ArtifactConfigValue[]
  | { [key: string]: ArtifactConfigValue };

export type ArtifactRecord = {
  id: ArtifactSlotId;
  type: ArtifactSlotId;
  stage: WorkflowStageId;
  label: string;
  summary: string;
  status: ArtifactStatus;
  inputs: ArtifactSlotId[];
  operatorId?: string;
  projectionProfile: SourceProjectionMode;
  prompt?: string;
  config?: Record<string, ArtifactConfigValue>;
  media: ArtifactMedia;
  results: ArtifactResult[];
  createdAt?: string;
  updatedAt?: string;
  warnings: string[];
  qcNotes: string[];
  stale: boolean;
};

export type WorkflowStage = {
  id: WorkflowStageId;
  number: string;
  label: string;
  summary: string;
  artifactIds: ArtifactSlotId[];
};

export type OperatorId =
  | "import-plate-sketch"
  | "import-source"
  | "import-start-depth"
  | "import-end-depth"
  | "choose-projection"
  | "commit-plates"
  | "repair-start-state"
  | "generate-start-depth"
  | "export-start-depth"
  | "export-end-depth"
  | "preview-motion-draft"
  | "export-motion-proxy"
  | "export-motion-config"
  | "capture-displaced-endpoint"
  | "reconstruct-end-state"
  | "generate-end-depth"
  | "generate-video-take"
  | "inspect-qc"
  | "export-deliverables"
  | "save-project"
  | "load-project";

export type OperatorKind = "local" | "paid-api";

export type PromptField = {
  id: string;
  label: string;
  artifactId: ArtifactSlotId;
  rows?: number;
};

export type OperatorDefinition = {
  id: OperatorId;
  stage: WorkflowStageId;
  attachTo: ArtifactSlotId;
  label: string;
  description: string;
  inputs: ArtifactSlotId[];
  output: ArtifactSlotId;
  kind: OperatorKind;
  requiresConfirmation: boolean;
  confirmationTitle?: string;
  confirmationBody?: string;
  promptFields?: PromptField[];
  configFields?: string[];
};

export type OperatorAvailability = {
  operator: OperatorDefinition;
  disabledReason: string | null;
};

export type JobState = {
  operatorId: OperatorId;
  label: string;
  stage: string;
  progress: number | null;
  busy: boolean;
};

export type PendingPaidAction = {
  operatorId: OperatorId;
  label: string;
  body: string;
} | null;

export type QcItemId =
  | "projection-profile"
  | "circular-framing"
  | "zenith-nadir"
  | "seam-edge"
  | "motion-tearing"
  | "video-playback"
  | "delivery-export"
  | "provenance-prompt";

export type QcItem = {
  id: QcItemId;
  label: string;
  description: string;
  checked: boolean;
};

export const PROJECT_ARTIFACT_SLOT_IDS = [
  "plate-sketch",
  "start-state",
  "start-depth",
  "motion-draft",
  "displaced-endpoint",
  "end-state",
  "end-depth",
  "video-take",
  "deliverables",
] as const;

export const PROJECT_WORKFLOW_STAGE_IDS = ["start", "motion", "end", "video", "deliver"] as const;

export type ProjectArtifactSlotId = (typeof PROJECT_ARTIFACT_SLOT_IDS)[number];
export type ProjectWorkflowStageId = (typeof PROJECT_WORKFLOW_STAGE_IDS)[number];

export const PROJECT_ARTIFACT_STAGE_BY_ID = {
  "plate-sketch": "start",
  "start-state": "start",
  "start-depth": "start",
  "motion-draft": "motion",
  "displaced-endpoint": "motion",
  "end-state": "end",
  "end-depth": "end",
  "video-take": "video",
  deliverables: "deliver",
} as const satisfies Record<ProjectArtifactSlotId, ProjectWorkflowStageId>;

export const PROJECT_ARTIFACT_INPUTS_BY_ID = {
  "plate-sketch": [],
  "start-state": ["plate-sketch"],
  "start-depth": ["start-state"],
  "motion-draft": ["start-state", "start-depth"],
  "displaced-endpoint": ["start-state", "start-depth", "motion-draft"],
  "end-state": ["start-state", "displaced-endpoint"],
  "end-depth": ["end-state"],
  "video-take": ["start-state", "end-state", "motion-draft"],
  deliverables: ["video-take"],
} as const satisfies Record<ProjectArtifactSlotId, readonly ProjectArtifactSlotId[]>;

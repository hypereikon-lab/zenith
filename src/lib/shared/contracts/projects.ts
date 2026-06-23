import { z, ZodError } from "zod";
import {
  PROJECT_ARTIFACT_INPUTS_BY_ID,
  PROJECT_ARTIFACT_SLOT_IDS,
  PROJECT_ARTIFACT_STAGE_BY_ID,
  PROJECT_WORKFLOW_STAGE_IDS,
  type ProjectArtifactSlotId,
} from "./artifact-topology.js";

export {
  PROJECT_ARTIFACT_INPUTS_BY_ID,
  PROJECT_ARTIFACT_SLOT_IDS,
  PROJECT_ARTIFACT_STAGE_BY_ID,
  PROJECT_WORKFLOW_STAGE_IDS,
} from "./artifact-topology.js";
export type { ProjectArtifactSlotId, ProjectWorkflowStageId } from "./artifact-topology.js";

export const PROJECT_SNAPSHOT_VERSION = 1;

export const PROJECT_ARTIFACT_STATUSES = ["missing", "ready", "working", "done", "warning", "stale"] as const;
export const PROJECT_MEDIA_KINDS = ["none", "image", "video"] as const;
export const PROJECT_PROJECTION_MODES = ["zenith-180", "zenith-230", "nadir-180", "cave-270"] as const;
export const PROJECT_VIEWER_MODES = ["domemaster", "dome-check", "rim-check"] as const;
export const PROJECT_DEPTH_POLARITIES = ["brightFar", "brightNear"] as const;
export const PROJECT_DEPTH_GUIDE_MODES = ["source", "depthShaded", "depthMap"] as const;
export const PROJECT_EMPTY_BACKGROUNDS = ["black", "greenDome"] as const;
export const PROJECT_QC_ITEM_IDS = [
  "projection-profile",
  "circular-framing",
  "zenith-nadir",
  "seam-edge",
  "motion-tearing",
  "video-playback",
  "delivery-export",
  "provenance-prompt",
] as const;

export type ProjectProjectionMode = (typeof PROJECT_PROJECTION_MODES)[number];
export type ProjectMediaKind = (typeof PROJECT_MEDIA_KINDS)[number];

export type ProjectArtifactMediaV1 = {
  kind: ProjectMediaKind;
  url?: string;
  name?: string;
  mime?: string;
  alt?: string;
};

export type ProjectJsonValue =
  | string
  | number
  | boolean
  | null
  | ProjectJsonValue[]
  | { [key: string]: ProjectJsonValue };

const finiteNumberSchema = z.number().finite();
const artifactSlotIdSchema = z.enum(PROJECT_ARTIFACT_SLOT_IDS);
const workflowStageIdSchema = z.enum(PROJECT_WORKFLOW_STAGE_IDS);
const projectionModeSchema = z.enum(PROJECT_PROJECTION_MODES);

const projectJsonValueSchema: z.ZodType<ProjectJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    finiteNumberSchema,
    z.boolean(),
    z.null(),
    z.array(projectJsonValueSchema),
    z.record(z.string(), projectJsonValueSchema),
  ]),
);

export const ProjectArtifactMediaV1Schema = z
  .object({
    kind: z.enum(PROJECT_MEDIA_KINDS),
    url: z
      .string()
      .refine((url) => !url.startsWith("blob:"), "object URLs are runtime-only and cannot be stored in project snapshots")
      .optional(),
    name: z.string().optional(),
    mime: z.string().optional(),
    alt: z.string().optional(),
    blob: z.null().optional(),
    file: z.null().optional(),
    canvas: z.null().optional(),
  })
  .strict()
  .superRefine((media, ctx) => {
    if ((media.kind === "image" || media.kind === "video") && !media.url) {
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message: `${media.kind} media requires a portable url`,
      });
    }
  })
  .transform(({ kind, url, name, mime, alt }): ProjectArtifactMediaV1 =>
    compactOptional({
      kind,
      url,
      name,
      mime,
      alt,
    }),
  );

export const ProjectArtifactResultV1Schema = z
  .object({
    id: z.string(),
    label: z.string(),
    createdAt: z.string(),
    media: ProjectArtifactMediaV1Schema,
    prompt: z.string().optional(),
    operatorId: z.string().optional(),
    selected: z.boolean().optional(),
  })
  .strict();

export const ProjectArtifactRecordV1Schema = z
  .object({
    id: artifactSlotIdSchema,
    type: artifactSlotIdSchema,
    stage: workflowStageIdSchema,
    label: z.string(),
    summary: z.string(),
    status: z.enum(PROJECT_ARTIFACT_STATUSES),
    inputs: z.array(artifactSlotIdSchema),
    operatorId: z.string().optional(),
    projectionProfile: projectionModeSchema,
    prompt: z.string().optional(),
    config: z.record(z.string(), projectJsonValueSchema).optional(),
    media: ProjectArtifactMediaV1Schema,
    results: z.array(ProjectArtifactResultV1Schema),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    warnings: z.array(z.string()),
    qcNotes: z.array(z.string()),
    stale: z.boolean(),
  })
  .strict();

const artifactSchemas = Object.fromEntries(
  PROJECT_ARTIFACT_SLOT_IDS.map((id) => [id, ProjectArtifactRecordV1Schema]),
) as Record<ProjectArtifactSlotId, typeof ProjectArtifactRecordV1Schema>;

export const ProjectArtifactsV1Schema = z
  .object(artifactSchemas)
  .strict()
  .superRefine((artifacts, ctx) => {
    for (const id of PROJECT_ARTIFACT_SLOT_IDS) {
      const artifact = artifacts[id];
      if (artifact.id !== id) {
        ctx.addIssue({
          code: "custom",
          path: [id, "id"],
          message: `artifact id must match its map key (${id})`,
        });
      }
      if (artifact.type !== id) {
        ctx.addIssue({
          code: "custom",
          path: [id, "type"],
          message: `artifact type must match its map key (${id})`,
        });
      }
      const expectedStage = PROJECT_ARTIFACT_STAGE_BY_ID[id];
      if (artifact.stage !== expectedStage) {
        ctx.addIssue({
          code: "custom",
          path: [id, "stage"],
          message: `artifact stage must be ${expectedStage}`,
        });
      }
      const expectedInputs = PROJECT_ARTIFACT_INPUTS_BY_ID[id];
      if (!arrayEquals(artifact.inputs, expectedInputs)) {
        ctx.addIssue({
          code: "custom",
          path: [id, "inputs"],
          message: `artifact inputs must be [${expectedInputs.join(", ")}]`,
        });
      }
    }
  });

export const ProjectPromptDraftsV1Schema = z
  .object({
    repair: z.string(),
    startDepth: z.string(),
    reconstruct: z.string(),
    endDepth: z.string(),
    video: z.string(),
  })
  .strict();

export const ProjectMotionConfigV1Schema = z
  .object({
    duration: finiteNumberSchema,
    fps: finiteNumberSchema,
    size: finiteNumberSchema,
    radiusScale: finiteNumberSchema,
    yaw: finiteNumberSchema,
    pitch: finiteNumberSchema,
    roll: finiteNumberSchema,
    truck: finiteNumberSchema,
    lift: finiteNumberSchema,
    push: finiteNumberSchema,
    depthGain: finiteNumberSchema,
    nearMeters: finiteNumberSchema,
    farMeters: finiteNumberSchema,
    depthContrast: finiteNumberSchema,
    gapFillPasses: finiteNumberSchema,
    polarity: z.enum(PROJECT_DEPTH_POLARITIES),
    guideMode: z.enum(PROJECT_DEPTH_GUIDE_MODES),
    emptyBackground: z.enum(PROJECT_EMPTY_BACKGROUNDS),
  })
  .strict();

export const ProjectQcItemV1Schema = z
  .object({
    id: z.enum(PROJECT_QC_ITEM_IDS),
    label: z.string(),
    description: z.string(),
    checked: z.boolean(),
  })
  .strict();

export const ProjectSnapshotV1Schema = z
  .object({
    version: z.literal(PROJECT_SNAPSHOT_VERSION),
    createdAt: z.string(),
    selectedArtifactId: artifactSlotIdSchema,
    selectedStageId: workflowStageIdSchema,
    projectionProfile: projectionModeSchema,
    domeGuideSemanticSplit: finiteNumberSchema.optional(),
    domeGuideHorizonSplit: finiteNumberSchema.optional(),
    viewerMode: z.enum(PROJECT_VIEWER_MODES),
    artifacts: ProjectArtifactsV1Schema,
    prompts: ProjectPromptDraftsV1Schema,
    motionConfig: ProjectMotionConfigV1Schema,
    qcItems: z.array(ProjectQcItemV1Schema),
  })
  .strict();

export type ProjectArtifactResultV1 = z.infer<typeof ProjectArtifactResultV1Schema>;
export type ProjectArtifactRecordV1 = z.infer<typeof ProjectArtifactRecordV1Schema>;
export type ProjectSnapshotV1 = z.infer<typeof ProjectSnapshotV1Schema>;

export class ProjectSnapshotParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectSnapshotParseError";
  }
}

export function parseProjectSnapshot(payload: unknown): ProjectSnapshotV1 {
  if (!isPlainRecord(payload)) {
    throw new ProjectSnapshotParseError("Project snapshot must be a JSON object.");
  }
  if (!("version" in payload)) {
    throw new ProjectSnapshotParseError("Project snapshot version is required.");
  }
  if (payload.version !== PROJECT_SNAPSHOT_VERSION) {
    throw new ProjectSnapshotParseError(
      `Unsupported Zenith project snapshot version ${String(payload.version)}. Supported versions: ${PROJECT_SNAPSHOT_VERSION}.`,
    );
  }

  try {
    return ProjectSnapshotV1Schema.parse(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ProjectSnapshotParseError(formatProjectSnapshotZodError(error));
    }
    throw error;
  }
}

function formatProjectSnapshotZodError(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Project snapshot is invalid.";
  const path = issue.path.map(String).join(".");
  if (!path) return `Project snapshot is invalid: ${issue.message}`;
  return `Project snapshot ${path}: ${issue.message}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compactOptional<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function arrayEquals(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

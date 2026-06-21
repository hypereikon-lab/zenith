import { z, ZodError } from "zod";

export const JOB_CONTRACT_VERSION = 1;
export const JOB_OPERATOR_IDS = ["generate-start-depth", "generate-end-depth"] as const;
export const JOB_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export const JOB_EVENT_TYPES = ["queued", "started", "progress", "complete", "error", "cancelled"] as const;

export type JobOperatorIdV1 = (typeof JOB_OPERATOR_IDS)[number];
export type JobStatusV1 = (typeof JOB_STATUSES)[number];
export type JobEventTypeV1 = (typeof JOB_EVENT_TYPES)[number];
export type JobInputArtifactIdsV1 = ["start-state"] | ["end-state"];
export type JobOutputArtifactIdsV1 = ["start-depth"] | ["end-depth"];
export type JobOutputArtifactIdV1 = JobOutputArtifactIdsV1[0];

export function jobArtifactsForOperator(operatorId: JobOperatorIdV1): {
  inputArtifactIds: JobInputArtifactIdsV1;
  outputArtifactIds: JobOutputArtifactIdsV1;
  outputArtifactId: JobOutputArtifactIdV1;
} {
  switch (operatorId) {
    case "generate-end-depth":
      return {
        inputArtifactIds: ["end-state"],
        outputArtifactIds: ["end-depth"],
        outputArtifactId: "end-depth",
      };
    case "generate-start-depth":
      return {
        inputArtifactIds: ["start-state"],
        outputArtifactIds: ["start-depth"],
        outputArtifactId: "start-depth",
      };
  }
}

const finiteProgressSchema = z.number().finite().min(0).max(1);
const dataUrlSchema = z.string().regex(/^data:[^,]*;base64,/i, "Expected a base64 data URL.");
const portableUrlSchema = z
  .string()
  .refine((url) => !url.startsWith("blob:"), "object URLs are runtime-only and cannot be stored in job events");
const ratioSchema = z.string().regex(/^\d+:\d+$/, "Ratio must use width:height format.");
const inputArtifactIdsSchema = z.union([z.tuple([z.literal("start-state")]), z.tuple([z.literal("end-state")])]);
const outputArtifactIdsSchema = z.union([z.tuple([z.literal("start-depth")]), z.tuple([z.literal("end-depth")])]);
const outputArtifactIdSchema = z.enum(["start-depth", "end-depth"]);

const publicJobErrorSchema = z
  .object({
    message: z.string(),
    status: z.number().int().min(100).max(599),
    code: z
      .enum(["invalid_input", "missing_secret", "upstream_failed", "timeout", "cancelled", "server_error"])
      .optional(),
    provider: z.enum(["zenith", "runway"]).optional(),
    providerTaskId: z.string().optional(),
  })
  .strict();

const jobOutputSchema = z
  .object({
    kind: z.literal("image"),
    dataUri: dataUrlSchema.optional(),
    url: portableUrlSchema.optional(),
    contentType: z.string().optional(),
    name: z.string().optional(),
  })
  .strict()
  .superRefine((output, ctx) => {
    if (!output.dataUri && !output.url) {
      ctx.addIssue({
        code: "custom",
        path: ["dataUri"],
        message: "Job output requires a portable dataUri or url.",
      });
    }
  });

export const CreateJobRequestV1Schema = z
  .object({
    version: z.literal(JOB_CONTRACT_VERSION),
    operatorId: z.enum(JOB_OPERATOR_IDS),
    inputArtifactIds: inputArtifactIdsSchema.optional(),
    outputArtifactIds: outputArtifactIdsSchema.optional(),
    input: z
      .object({
        imageDataUrl: dataUrlSchema,
        prompt: z.string().trim().min(1, "Prompt is required."),
        ratio: ratioSchema.optional(),
        outputCount: z.literal(1).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((request, ctx) => {
    assertOptionalArtifactIdsMatchOperator(request, ctx);
  });

export const JobResultV1Schema = z
  .object({
    resultType: z.literal("runway-stream-result"),
    operatorId: z.enum(JOB_OPERATOR_IDS),
    outputArtifactId: outputArtifactIdSchema,
    id: z.string().optional(),
    status: z.string().optional(),
    model: z.string().optional(),
    ratio: z.string().optional(),
    outputs: z.array(jobOutputSchema).min(1, "Job result requires at least one output."),
  })
  .strict()
  .superRefine((result, ctx) => {
    assertOutputArtifactIdMatchesOperator(result, ctx);
  });

const baseJobEventSchema = z.object({
  version: z.literal(JOB_CONTRACT_VERSION),
  id: z.string(),
  jobId: z.string(),
  sequence: z.number().int().positive(),
  status: z.enum(JOB_STATUSES),
  stage: z.string(),
  progress: finiteProgressSchema,
  createdAt: z.string(),
});

export const JobEventV1Schema = z.discriminatedUnion("type", [
  baseJobEventSchema
    .extend({
      type: z.literal("queued"),
      status: z.literal("queued"),
    })
    .strict(),
  baseJobEventSchema
    .extend({
      type: z.literal("started"),
      status: z.literal("running"),
    })
    .strict(),
  baseJobEventSchema
    .extend({
      type: z.literal("progress"),
      status: z.literal("running"),
      provider: z.enum(["runway"]).optional(),
      providerTaskId: z.string().optional(),
      providerTaskStatus: z.string().optional(),
    })
    .strict(),
  baseJobEventSchema
    .extend({
      type: z.literal("complete"),
      status: z.literal("succeeded"),
      result: JobResultV1Schema,
    })
    .strict(),
  baseJobEventSchema
    .extend({
      type: z.literal("error"),
      status: z.literal("failed"),
      error: publicJobErrorSchema,
    })
    .strict(),
  baseJobEventSchema
    .extend({
      type: z.literal("cancelled"),
      status: z.literal("cancelled"),
      error: publicJobErrorSchema,
    })
    .strict(),
]);

export const JobV1Schema = z
  .object({
    version: z.literal(JOB_CONTRACT_VERSION),
    id: z.string(),
    projectId: z.string(),
    operatorId: z.enum(JOB_OPERATOR_IDS),
    status: z.enum(JOB_STATUSES),
    stage: z.string(),
    progress: finiteProgressSchema,
    inputArtifactIds: inputArtifactIdsSchema,
    outputArtifactIds: outputArtifactIdsSchema,
    createdAt: z.string(),
    startedAt: z.string().optional(),
    finishedAt: z.string().optional(),
    result: JobResultV1Schema.optional(),
    error: publicJobErrorSchema.optional(),
  })
  .strict()
  .superRefine((job, ctx) => {
    assertArtifactIdsMatchOperator(job, ctx);
    if (job.result && job.result.operatorId !== job.operatorId) {
      ctx.addIssue({
        code: "custom",
        path: ["result", "operatorId"],
        message: `Job result operatorId must match job operatorId ${job.operatorId}.`,
      });
    }
  });

export type CreateJobRequestV1 = z.infer<typeof CreateJobRequestV1Schema>;
export type JobResultV1 = z.infer<typeof JobResultV1Schema>;
export type PublicJobErrorV1 = z.infer<typeof publicJobErrorSchema>;
export type JobEventV1 = z.infer<typeof JobEventV1Schema>;
export type JobV1 = z.infer<typeof JobV1Schema>;

export class JobContractParseError extends Error {
  status = 400;

  constructor(message: string) {
    super(message);
    this.name = "JobContractParseError";
  }
}

export function parseCreateJobRequest(payload: unknown): CreateJobRequestV1 {
  return parseJobContract(CreateJobRequestV1Schema, payload, "Job create request");
}

export function parseJob(payload: unknown): JobV1 {
  return parseJobContract(JobV1Schema, payload, "Job");
}

export function parseJobEvent(payload: unknown): JobEventV1 {
  return parseJobContract(JobEventV1Schema, payload, "Job event");
}

export function parseJobResult(payload: unknown): JobResultV1 {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new JobContractParseError("Job result must be a JSON object.");
  }
  try {
    return JobResultV1Schema.parse(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new JobContractParseError(formatJobZodError(error));
    }
    throw error;
  }
}

function parseJobContract<T>(schema: z.ZodType<T>, payload: unknown, label: string): T {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new JobContractParseError(`${label} must be a JSON object.`);
  }
  if (!("version" in payload)) {
    throw new JobContractParseError(`${label} version is required.`);
  }
  const version = (payload as { version?: unknown }).version;
  if (version !== JOB_CONTRACT_VERSION) {
    throw new JobContractParseError(`Unsupported Zenith job contract version ${String(version)}.`);
  }
  try {
    return schema.parse(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new JobContractParseError(formatJobZodError(error));
    }
    throw error;
  }
}

function formatJobZodError(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Job contract is invalid.";
  const path = issue.path.length ? issue.path.join(".") : "payload";
  return `${path}: ${issue.message}`;
}

function assertOptionalArtifactIdsMatchOperator(
  value: {
    operatorId: JobOperatorIdV1;
    inputArtifactIds?: readonly unknown[];
    outputArtifactIds?: readonly unknown[];
  },
  ctx: z.RefinementCtx,
): void {
  if (value.inputArtifactIds || value.outputArtifactIds) {
    assertArtifactIdsMatchOperator(
      {
        operatorId: value.operatorId,
        inputArtifactIds: value.inputArtifactIds || jobArtifactsForOperator(value.operatorId).inputArtifactIds,
        outputArtifactIds: value.outputArtifactIds || jobArtifactsForOperator(value.operatorId).outputArtifactIds,
      },
      ctx,
    );
  }
}

function assertArtifactIdsMatchOperator(
  value: {
    operatorId: JobOperatorIdV1;
    inputArtifactIds?: readonly unknown[];
    outputArtifactIds?: readonly unknown[];
  },
  ctx: z.RefinementCtx,
): void {
  const artifacts = jobArtifactsForOperator(value.operatorId);
  if (!value.inputArtifactIds || !sameIds(value.inputArtifactIds, artifacts.inputArtifactIds)) {
    ctx.addIssue({
      code: "custom",
      path: ["inputArtifactIds"],
      message: `${value.operatorId} jobs must use inputArtifactIds [${artifacts.inputArtifactIds.join(", ")}].`,
    });
  }
  if (!value.outputArtifactIds || !sameIds(value.outputArtifactIds, artifacts.outputArtifactIds)) {
    ctx.addIssue({
      code: "custom",
      path: ["outputArtifactIds"],
      message: `${value.operatorId} jobs must use outputArtifactIds [${artifacts.outputArtifactIds.join(", ")}].`,
    });
  }
}

function assertOutputArtifactIdMatchesOperator(
  value: { operatorId: JobOperatorIdV1; outputArtifactId: JobOutputArtifactIdV1 },
  ctx: z.RefinementCtx,
): void {
  const expected = jobArtifactsForOperator(value.operatorId).outputArtifactId;
  if (value.outputArtifactId !== expected) {
    ctx.addIssue({
      code: "custom",
      path: ["outputArtifactId"],
      message: `${value.operatorId} results must use outputArtifactId ${expected}.`,
    });
  }
}

function sameIds(left: readonly unknown[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

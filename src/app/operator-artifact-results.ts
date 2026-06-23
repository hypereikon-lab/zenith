import { finishJob, replaceArtifactMedia, selectArtifact } from "../artifacts/artifact-store.svelte.js";
import type {
  ArtifactMedia,
  ArtifactMediaHandle,
  ArtifactRecord,
  ArtifactSlotId,
  OperatorId,
} from "../artifacts/artifact-types.js";
import type { RunwayStreamResult } from "../runway/client.js";

type ApplyOperatorArtifactResultOptions = {
  artifactId: ArtifactSlotId;
  operatorId: OperatorId;
  media: ArtifactMedia;
  resultLabel: string;
  summary: string;
  prompt?: string;
  config?: ArtifactRecord["config"];
  warnings?: string[];
  handle?: ArtifactMediaHandle;
};

type RunwayOutputMediaOptions = {
  result: RunwayStreamResult;
  kind: "image" | "video";
  label: string;
  fallbackMime: string;
  emptyMessage: string;
};

const emptyMediaHandle: ArtifactMediaHandle = { blob: null, file: null, canvas: null };

export function applyOperatorArtifactResult({
  artifactId,
  operatorId,
  media,
  resultLabel,
  summary,
  prompt,
  config,
  warnings = [],
  handle = emptyMediaHandle,
}: ApplyOperatorArtifactResultOptions): void {
  const patch: Partial<Omit<ArtifactRecord, "id" | "type">> & Pick<ArtifactRecord, "media"> = {
    status: "ready",
    stale: false,
    summary,
    operatorId,
    media,
    warnings,
  };
  if (prompt !== undefined) {
    patch.prompt = prompt;
  }
  if (config !== undefined) {
    patch.config = config;
  }
  replaceArtifactMedia(artifactId, {
    patch,
    handle,
    result: {
      label: resultLabel,
      media,
      ...(prompt !== undefined ? { prompt } : {}),
      operatorId,
    },
  });
  finishJob(operatorId, "Complete");
  selectArtifact(artifactId);
}

export function runwayOutputArtifactMedia({
  result,
  kind,
  label,
  fallbackMime,
  emptyMessage,
}: RunwayOutputMediaOptions): ArtifactMedia {
  const output = result.outputs?.find((item) => item.dataUri || item.url);
  if (!output) throw new Error(emptyMessage);
  return {
    kind,
    url: output.dataUri || output.url,
    name: output.name || label,
    mime: output.contentType || fallbackMime,
    alt: label,
    blob: null,
    file: null,
    canvas: null,
  };
}

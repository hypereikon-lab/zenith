import {
  clearMediaPreview,
  getArtifactMediaHandle,
  replaceArtifacts,
  replaceQcItems,
  selectArtifact,
  setArtifactMediaHandle,
  setProjectionProfile,
  workbench,
} from "../artifacts/artifact-store.svelte.js";
import type {
  ArtifactMedia,
  ArtifactRecord,
  ArtifactResult,
  ArtifactSlotId,
  QcItem,
  WorkflowStageId,
} from "../artifacts/artifact-types.js";
import { normalizeDomeGuideSemanticSplit } from "../geometry/dome-handoff-guide.js";
import { normalizeSourceGuideCarrierHorizonRadius } from "../geometry/source-guide-semantics.js";
import { downloadBlob } from "../media/canvas-utils.js";
import {
  parseProjectSnapshot,
  PROJECT_ARTIFACT_SLOT_IDS,
  PROJECT_SNAPSHOT_VERSION,
  ProjectSnapshotParseError,
  type ProjectArtifactMediaV1,
  type ProjectArtifactRecordV1,
  type ProjectArtifactResultV1,
  type ProjectSnapshotV1,
} from "../lib/shared/contracts/projects.js";

export async function importProjectSnapshotFile(file: File): Promise<void> {
  restoreProjectSnapshotText(await file.text());
}

export async function downloadProjectSnapshot(): Promise<void> {
  const snapshot = await createProjectSnapshot();
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
  downloadBlob(blob, `zenith-artifact-project-${Date.now()}.json`);
}

export async function createProjectSnapshot({
  createdAt = new Date().toISOString(),
}: { createdAt?: string } = {}): Promise<ProjectSnapshotV1> {
  const artifacts = {} as ProjectSnapshotV1["artifacts"];
  for (const id of PROJECT_ARTIFACT_SLOT_IDS) {
    artifacts[id] = await serializeArtifactRecord(workbench.artifacts[id as ArtifactSlotId]);
  }

  return parseProjectSnapshot({
    version: PROJECT_SNAPSHOT_VERSION,
    createdAt,
    selectedArtifactId: workbench.selectedArtifactId,
    selectedStageId: workbench.selectedStageId,
    projectionProfile: workbench.projectionProfile,
    domeGuideSemanticSplit: workbench.domeGuideSemanticSplit,
    domeGuideHorizonSplit: workbench.domeGuideHorizonSplit,
    viewerMode: workbench.viewerMode,
    artifacts,
    prompts: jsonClone(workbench.promptDrafts),
    motionConfig: jsonClone(workbench.motionConfig),
    qcItems: jsonClone(workbench.qcItems),
  });
}

export function parseProjectSnapshotText(text: string): ProjectSnapshotV1 {
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new ProjectSnapshotParseError("Project snapshot contains invalid JSON.");
  }
  return parseProjectSnapshot(payload);
}

export function restoreProjectSnapshotText(text: string): void {
  applyProjectSnapshot(parseProjectSnapshotText(text));
}

export function restoreProjectSnapshot(snapshot: unknown): void {
  applyProjectSnapshot(parseProjectSnapshot(snapshot));
}

function applyProjectSnapshot(snapshot: ProjectSnapshotV1): void {
  const restored = {} as Record<ArtifactSlotId, ArtifactRecord>;
  for (const id of PROJECT_ARTIFACT_SLOT_IDS) {
    restored[id as ArtifactSlotId] = toRuntimeArtifactRecord(snapshot.artifacts[id]);
  }

  const oldObjectUrls = collectRuntimeObjectUrls();
  for (const id of PROJECT_ARTIFACT_SLOT_IDS) {
    setArtifactMediaHandle(id as ArtifactSlotId, { blob: null, file: null, canvas: null });
  }
  clearMediaPreview();
  replaceArtifacts(restored);
  Object.assign(workbench.promptDrafts, jsonClone(snapshot.prompts));
  Object.assign(workbench.motionConfig, jsonClone(snapshot.motionConfig));
  replaceQcItems(snapshot.qcItems.map((item) => ({ ...item })) as QcItem[]);
  workbench.viewerMode = snapshot.viewerMode;
  if (snapshot.domeGuideSemanticSplit !== undefined) {
    workbench.domeGuideSemanticSplit = normalizeDomeGuideSemanticSplit(snapshot.domeGuideSemanticSplit);
  }
  if (snapshot.domeGuideHorizonSplit !== undefined) {
    workbench.domeGuideHorizonSplit = normalizeSourceGuideCarrierHorizonRadius(
      snapshot.projectionProfile,
      workbench.domeGuideSemanticSplit,
      snapshot.domeGuideHorizonSplit,
    );
  }
  setProjectionProfile(snapshot.projectionProfile);
  workbench.selectedStageId = snapshot.selectedStageId as WorkflowStageId;
  selectArtifact(snapshot.selectedArtifactId as ArtifactSlotId);
  revokeObjectUrls(oldObjectUrls);
}

async function serializeArtifactRecord(artifact: ArtifactRecord): Promise<ProjectArtifactRecordV1> {
  const results = await Promise.all(
    artifact.results.map(async (result) =>
      compactOptional({
        id: result.id,
        label: result.label,
        createdAt: result.createdAt,
        media: await serializableMedia(artifact.id, result.media, false),
        prompt: result.prompt,
        operatorId: result.operatorId,
        selected: result.selected,
      }),
    ),
  );

  return compactOptional({
    id: artifact.id,
    type: artifact.type,
    stage: artifact.stage,
    label: artifact.label,
    summary: artifact.summary,
    status: artifact.status,
    inputs: [...artifact.inputs],
    operatorId: artifact.operatorId,
    projectionProfile: artifact.projectionProfile,
    prompt: artifact.prompt,
    config: artifact.config ? jsonClone(artifact.config) : undefined,
    media: await serializableMedia(artifact.id, artifact.media, true),
    results,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
    warnings: [...artifact.warnings],
    qcNotes: [...artifact.qcNotes],
    stale: artifact.stale,
  });
}

async function serializableMedia(
  artifactId: ArtifactSlotId,
  media: ArtifactMedia,
  preferLiveHandle: boolean,
): Promise<ProjectArtifactMediaV1> {
  const cleanMedia = toPortableMedia(media);
  if (media.kind === "none") return cleanMedia;
  if (media.url?.startsWith("data:")) return cleanMedia;

  const handle = getArtifactMediaHandle(artifactId);
  if (preferLiveHandle && handle?.canvas) {
    return { ...cleanMedia, kind: "image", url: handle.canvas.toDataURL("image/png"), mime: "image/png" };
  }
  if (preferLiveHandle && handle?.blob) {
    return { ...cleanMedia, url: await blobToDataUrl(handle.blob), mime: handle.blob.type || cleanMedia.mime };
  }
  if (media.canvas) {
    return { ...cleanMedia, kind: "image", url: media.canvas.toDataURL("image/png"), mime: "image/png" };
  }
  if (media.blob) {
    return { ...cleanMedia, url: await blobToDataUrl(media.blob), mime: media.blob.type || cleanMedia.mime };
  }
  if (!media.url) return cleanMedia;

  try {
    const response = await fetch(media.url);
    if (!response.ok) return withoutRuntimeObjectUrl(cleanMedia);
    const blob = await response.blob();
    return { ...cleanMedia, url: await blobToDataUrl(blob), mime: blob.type || cleanMedia.mime };
  } catch {
    return withoutRuntimeObjectUrl(cleanMedia);
  }
}

function toPortableMedia(media: ArtifactMedia): ProjectArtifactMediaV1 {
  const kind = media.kind === "canvas" ? "image" : media.kind;
  return compactOptional({
    kind,
    url: media.url,
    name: media.name,
    mime: media.mime,
    alt: media.alt,
  });
}

function withoutRuntimeObjectUrl(media: ProjectArtifactMediaV1): ProjectArtifactMediaV1 {
  if (!media.url?.startsWith("blob:")) return media;
  const { url: _url, ...rest } = media;
  return rest;
}

function toRuntimeArtifactRecord(artifact: ProjectArtifactRecordV1): ArtifactRecord {
  return {
    id: artifact.id as ArtifactSlotId,
    type: artifact.type as ArtifactSlotId,
    stage: artifact.stage as WorkflowStageId,
    label: artifact.label,
    summary: artifact.summary,
    status: artifact.status,
    inputs: artifact.inputs as ArtifactSlotId[],
    operatorId: artifact.operatorId,
    projectionProfile: artifact.projectionProfile,
    prompt: artifact.prompt,
    config: artifact.config,
    media: toRuntimeMedia(artifact.media),
    results: artifact.results.map(toRuntimeArtifactResult),
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
    warnings: [...artifact.warnings],
    qcNotes: [...artifact.qcNotes],
    stale: artifact.stale,
  };
}

function toRuntimeArtifactResult(result: ProjectArtifactResultV1): ArtifactResult {
  return {
    id: result.id,
    label: result.label,
    createdAt: result.createdAt,
    media: toRuntimeMedia(result.media),
    prompt: result.prompt,
    operatorId: result.operatorId,
    selected: result.selected,
  };
}

function toRuntimeMedia(media: ProjectArtifactMediaV1): ArtifactMedia {
  return {
    ...media,
    blob: null,
    file: null,
    canvas: null,
  } as ArtifactMedia;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read blob."));
    reader.readAsDataURL(blob);
  });
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function collectRuntimeObjectUrls(): string[] {
  const urls = new Set<string>();
  for (const artifact of Object.values(workbench.artifacts)) {
    addObjectUrl(urls, artifact.media.url);
    for (const result of artifact.results) {
      addObjectUrl(urls, result.media.url);
    }
  }
  addObjectUrl(urls, workbench.mediaPreview.media.url);
  return [...urls];
}

function addObjectUrl(urls: Set<string>, url: string | undefined): void {
  if (url?.startsWith("blob:")) {
    urls.add(url);
  }
}

function revokeObjectUrls(urls: readonly string[]): void {
  if (typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  for (const url of urls) {
    URL.revokeObjectURL(url);
  }
}

function compactOptional<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

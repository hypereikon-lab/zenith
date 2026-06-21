import {
  addArtifactResult,
  finishJob,
  getArtifact,
  getMediaPreviewHandle,
  recordWorkbenchError,
  selectArtifact,
  selectSurfaceMode,
  setMediaPreview,
  setMediaPreviewHandle,
  setArtifactMediaHandle,
  setProjectionProfile,
  updateArtifact,
  workbench,
} from "../artifacts/artifact-store.svelte.js";
import { getOperator } from "./operator-registry.js";
import { inpaintPromptForProjection, shouldReplaceWithProjectionInpaintPrompt } from "./app-state.js";
import { downloadBlob } from "../media/canvas-utils.js";
import { normalizeDomeGuideSemanticSplit } from "../geometry/dome-handoff-guide.js";
import {
  defaultSourceGuideCarrierHorizonRadius,
  normalizeSourceGuideCarrierHorizonRadius,
  sourceGuideHasCarrierHorizon,
} from "../geometry/source-guide-semantics.js";
import type { ArtifactSlotId, OperatorId } from "../artifacts/artifact-types.js";
import type { SourceProjectionMode } from "../geometry/source-projection.js";
import { executeLocalRenderOperator } from "./local-render-operators.js";
import { executePaidOperator } from "./paid-operator-execution.js";
import {
  downloadProjectSnapshot,
  importProjectSnapshotFile as importProjectSnapshotFileFromPersistence,
} from "./project-persistence.js";

type WorkbenchViewerMode = typeof workbench.viewerMode;
type WorkbenchSurfaceMode = typeof workbench.surfaceMode;

let plateSketchCommitHandler: (() => Promise<void>) | null = null;

export function installPlateSketchCommitHandler(handler: (() => Promise<void>) | null): () => void {
  plateSketchCommitHandler = handler;
  return () => {
    if (plateSketchCommitHandler === handler) {
      plateSketchCommitHandler = null;
    }
  };
}

export async function importPlateSketchFile(file: File): Promise<void> {
  const url = URL.createObjectURL(file);
  setArtifactMediaHandle("plate-sketch", { blob: file, file, canvas: null });
  updateArtifact("plate-sketch", {
    status: "ready",
    stale: false,
    summary: `${file.name} imported as Plate Sketch inpaint handoff.`,
    operatorId: "import-plate-sketch",
    media: {
      kind: "image",
      url,
      name: file.name,
      mime: file.type,
      alt: "Imported fulldome Plate Sketch composition handoff",
      blob: null,
      file: null,
      canvas: null,
    },
    warnings: file.type.startsWith("image/") ? [] : ["Plate Sketch should be a square image handoff for inpaint."],
  });
  addArtifactResult("plate-sketch", {
    label: `Imported ${file.name}`,
    media: getArtifact("plate-sketch").media,
    operatorId: "import-plate-sketch",
  });
  selectArtifact("plate-sketch");
}

export async function importSourceFile(file: File): Promise<void> {
  const url = URL.createObjectURL(file);
  const kind = file.type.startsWith("video/") ? "video" : "image";
  setArtifactMediaHandle("start-state", { blob: file, file, canvas: null });
  updateArtifact("start-state", {
    status: "ready",
    stale: false,
    summary: `${file.name} imported as already-clean Start State.`,
    operatorId: "import-source",
    media: {
      kind,
      url,
      name: file.name,
      mime: file.type,
      alt: `Imported ${kind} Start State`,
      blob: null,
      file: null,
      canvas: null,
    },
    warnings: kind === "video" ? ["Video sources should be paused/selected before paid still-image operations."] : [],
  });
  addArtifactResult("start-state", {
    label: `Imported ${file.name}`,
    media: getArtifact("start-state").media,
    operatorId: "import-source",
  });
  selectArtifact("start-state");
}

export async function importDepthFile(artifactId: "start-depth" | "end-depth", file: File): Promise<void> {
  const url = URL.createObjectURL(file);
  const operatorId = artifactId === "start-depth" ? "import-start-depth" : "import-end-depth";
  setArtifactMediaHandle(artifactId, { blob: file, file, canvas: null });
  updateArtifact(artifactId, {
    status: "ready",
    stale: false,
    summary: `${file.name} imported as ${getArtifact(artifactId).label}.`,
    operatorId,
    media: {
      kind: "image",
      url,
      name: file.name,
      mime: file.type,
      alt: `Imported ${getArtifact(artifactId).label}`,
      blob: null,
      file: null,
      canvas: null,
    },
    warnings: file.type.startsWith("image/") ? [] : ["Depth maps should be image files."],
  });
  addArtifactResult(artifactId, {
    label: `Imported ${file.name}`,
    media: getArtifact(artifactId).media,
    operatorId,
  });
  selectArtifact(artifactId);
}

export async function importPreviewMediaFile(file: File): Promise<void> {
  const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : "none";
  if (kind === "none") {
    recordWorkbenchError("Drop an image or video file for Media Preview.", "media-preview");
    return;
  }
  const url = URL.createObjectURL(file);
  setMediaPreviewHandle({ blob: file, file, canvas: null });
  setMediaPreview(
    {
      kind,
      url,
      name: file.name,
      mime: file.type,
      alt: `Imported ${kind} for projection Media Preview`,
      blob: null,
      file: null,
      canvas: null,
    },
    `${file.name} loaded into Media Preview. It has not changed the production artifact graph.`,
  );
}

export async function promotePreviewMedia(targetArtifactId: ArtifactSlotId): Promise<void> {
  const file = getMediaPreviewHandle().file;
  if (!file) {
    recordWorkbenchError("Media Preview does not have a file to promote yet.", "media-preview");
    return;
  }
  if (targetArtifactId === "plate-sketch") {
    await importPlateSketchFile(file);
    return;
  }
  if (targetArtifactId === "start-state") {
    await importSourceFile(file);
    return;
  }
  if (targetArtifactId === "start-depth" || targetArtifactId === "end-depth") {
    await importDepthFile(targetArtifactId, file);
    return;
  }
  if (targetArtifactId === "deliverables") {
    recordWorkbenchError("Media Preview cannot be promoted directly to Deliverables.", "media-preview");
    return;
  }
  await importMediaToArtifact(targetArtifactId, file);
}

async function importMediaToArtifact(
  artifactId: Exclude<ArtifactSlotId, "plate-sketch" | "start-state" | "start-depth" | "end-depth" | "deliverables">,
  file: File,
): Promise<void> {
  const artifact = getArtifact(artifactId);
  const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : "none";
  if (kind === "none") {
    recordWorkbenchError(`Import ${artifact.label} from an image or video file.`, artifactId);
    return;
  }
  if ((artifactId === "displaced-endpoint" || artifactId === "end-state") && kind !== "image") {
    recordWorkbenchError(`${artifact.label} should be imported as a still image.`, artifactId);
    return;
  }
  const url = URL.createObjectURL(file);
  setArtifactMediaHandle(artifactId, { blob: file, file, canvas: null });
  updateArtifact(artifactId, {
    status: "ready",
    stale: false,
    summary: `${file.name} imported as ${artifact.label} from Media Preview.`,
    operatorId: `import-${artifactId}`,
    media: {
      kind,
      url,
      name: file.name,
      mime: file.type,
      alt: `Imported ${artifact.label}`,
      blob: null,
      file: null,
      canvas: null,
    },
    warnings:
      artifactId === "motion-draft" && kind !== "video"
        ? [
            "Motion Draft is normally a video proxy. A still image can be inspected, but it will not drive video choreography.",
          ]
        : [],
  });
  addArtifactResult(artifactId, {
    label: `Imported ${file.name}`,
    media: getArtifact(artifactId).media,
    operatorId: `import-${artifactId}`,
  });
  selectArtifact(artifactId);
}

export function changeProjectionProfile(profile: SourceProjectionMode): void {
  const previousProfile = workbench.projectionProfile;
  const refreshRepairPrompt = shouldReplaceWithProjectionInpaintPrompt(workbench.promptDrafts.repair);
  setProjectionProfile(profile);
  if (sourceGuideHasCarrierHorizon(profile)) {
    const nextHorizon = sourceGuideHasCarrierHorizon(previousProfile)
      ? workbench.domeGuideHorizonSplit
      : defaultSourceGuideCarrierHorizonRadius(profile, workbench.domeGuideSemanticSplit);
    workbench.domeGuideHorizonSplit = normalizeSourceGuideCarrierHorizonRadius(
      profile,
      workbench.domeGuideSemanticSplit,
      nextHorizon,
    );
  } else {
    workbench.domeGuideHorizonSplit = defaultSourceGuideCarrierHorizonRadius(profile, workbench.domeGuideSemanticSplit);
  }
  if (refreshRepairPrompt) {
    workbench.promptDrafts.repair = inpaintPromptForProjection(
      profile,
      workbench.domeGuideSemanticSplit,
      workbench.domeGuideHorizonSplit,
    );
  }
  updateArtifact("plate-sketch", {
    operatorId: "choose-projection",
    summary: `${projectionLabel(profile)} profile selected.`,
  });
}

export function changeViewerMode(mode: WorkbenchViewerMode): void {
  workbench.viewerMode = mode;
}

export function changeSurfaceMode(mode: WorkbenchSurfaceMode): void {
  selectSurfaceMode(mode);
}

export function setDomeGuideSemanticSplit(value: number | string | null | undefined): void {
  const refreshRepairPrompt = shouldReplaceWithProjectionInpaintPrompt(workbench.promptDrafts.repair);
  workbench.domeGuideSemanticSplit = normalizeDomeGuideSemanticSplit(value);
  workbench.domeGuideHorizonSplit = normalizeSourceGuideCarrierHorizonRadius(
    workbench.projectionProfile,
    workbench.domeGuideSemanticSplit,
    workbench.domeGuideHorizonSplit,
  );
  if (refreshRepairPrompt) {
    workbench.promptDrafts.repair = inpaintPromptForProjection(
      workbench.projectionProfile,
      workbench.domeGuideSemanticSplit,
      workbench.domeGuideHorizonSplit,
    );
  }
  updateArtifact("plate-sketch", {
    operatorId: "choose-projection",
    summary: projectionGuideSummary(),
  });
}

export function setDomeGuideHorizonSplit(value: number | string | null | undefined): void {
  const refreshRepairPrompt = shouldReplaceWithProjectionInpaintPrompt(workbench.promptDrafts.repair);
  workbench.domeGuideHorizonSplit = normalizeSourceGuideCarrierHorizonRadius(
    workbench.projectionProfile,
    workbench.domeGuideSemanticSplit,
    value,
  );
  if (refreshRepairPrompt) {
    workbench.promptDrafts.repair = inpaintPromptForProjection(
      workbench.projectionProfile,
      workbench.domeGuideSemanticSplit,
      workbench.domeGuideHorizonSplit,
    );
  }
  updateArtifact("plate-sketch", {
    operatorId: "choose-projection",
    summary: projectionGuideSummary(),
  });
}

export async function executeOperator(operatorId: OperatorId, options: { confirmed?: boolean } = {}): Promise<void> {
  const operator = getOperator(operatorId);
  if (operator.kind === "paid-api" && operator.requiresConfirmation && !options.confirmed) {
    workbench.pendingPaidAction = {
      operatorId,
      label: operator.label,
      body:
        operator.confirmationBody ||
        "This action sends the visible prompt/config and referenced artifacts to a paid API endpoint.",
    };
    return;
  }

  try {
    if (operator.kind === "local") {
      await executeLocalOperator(operatorId);
    } else {
      await executePaidOperator(operatorId);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Operator failed.";
    recordWorkbenchError(message, operatorId);
    finishJob(operatorId, "Failed");
  }
}

export async function confirmPendingPaidAction(): Promise<void> {
  const pending = workbench.pendingPaidAction;
  if (!pending) return;
  workbench.pendingPaidAction = null;
  await executeOperator(pending.operatorId, { confirmed: true });
}

export function cancelPendingPaidAction(): void {
  workbench.pendingPaidAction = null;
}

export async function importProjectSnapshotFile(file: File): Promise<void> {
  await importProjectSnapshotFileFromPersistence(file);
}

async function executeLocalOperator(operatorId: OperatorId): Promise<void> {
  switch (operatorId) {
    case "import-plate-sketch":
      selectArtifact("plate-sketch");
      return;
    case "commit-plates":
      if (plateSketchCommitHandler) {
        await plateSketchCommitHandler();
        return;
      }
      updateArtifact("plate-sketch", {
        status: "ready",
        stale: false,
        summary: "Plate Sketch committed as the inpaint handoff.",
        operatorId,
      });
      addArtifactResult("plate-sketch", {
        label: "Committed Plate Sketch",
        media: getArtifact("plate-sketch").media,
        operatorId,
      });
      selectArtifact("plate-sketch");
      return;
    case "preview-motion-draft":
    case "export-motion-proxy":
    case "export-motion-config":
    case "capture-displaced-endpoint":
    case "export-start-depth":
    case "export-end-depth":
      await executeLocalRenderOperator(operatorId);
      return;
    case "inspect-qc":
      selectArtifact("deliverables");
      return;
    case "export-deliverables":
      downloadDeliveryManifest();
      return;
    case "save-project":
      await downloadProjectSnapshot();
      return;
    case "import-source":
    case "import-start-depth":
    case "import-end-depth":
    case "choose-projection":
    case "load-project":
      return;
    default:
      recordWorkbenchError(`Local operator ${operatorId} is not implemented yet.`, operatorId);
  }
}

function downloadDeliveryManifest(): void {
  const manifest = {
    createdAt: new Date().toISOString(),
    projectionProfile: workbench.projectionProfile,
    domeGuideSemanticSplit: workbench.domeGuideSemanticSplit,
    domeGuideHorizonSplit: workbench.domeGuideHorizonSplit,
    artifacts: Object.fromEntries(
      Object.entries(workbench.artifacts).map(([id, artifact]) => [
        id,
        {
          label: artifact.label,
          status: artifact.status,
          inputs: artifact.inputs,
          operatorId: artifact.operatorId,
          projectionProfile: artifact.projectionProfile,
          prompt: artifact.prompt,
          media: {
            kind: artifact.media.kind,
            name: artifact.media.name,
            mime: artifact.media.mime,
            url: artifact.media.url,
          },
          warnings: artifact.warnings,
          stale: artifact.stale,
          updatedAt: artifact.updatedAt,
        },
      ]),
    ),
    prompts: { ...workbench.promptDrafts },
    motionConfig: { ...workbench.motionConfig },
    qc: workbench.qcItems.map((item) => ({ id: item.id, label: item.label, checked: item.checked })),
  };
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
  downloadBlob(blob, `zenith-delivery-manifest-${Date.now()}.json`);
}

function projectionLabel(profile: SourceProjectionMode): string {
  return profile
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function projectionGuideSummary(): string {
  const inner = Math.round(workbench.domeGuideSemanticSplit * 100);
  if (!sourceGuideHasCarrierHorizon(workbench.projectionProfile)) {
    return `${projectionLabel(workbench.projectionProfile)} profile selected with ${inner}% semantic guide split.`;
  }
  const horizon = Math.round(workbench.domeGuideHorizonSplit * 100);
  return `${projectionLabel(workbench.projectionProfile)} profile selected with ${inner}% inner split and ${horizon}% horizon carrier.`;
}

import {
  selectSurfaceMode,
  setProjectionProfile,
  updateArtifact,
  workbench,
} from "../artifacts/artifact-store.svelte.js";
import { normalizeDomeGuideSemanticSplit } from "../geometry/dome-handoff-guide.js";
import {
  defaultSourceGuideCarrierHorizonRadius,
  normalizeSourceGuideCarrierHorizonRadius,
  sourceGuideHasCarrierHorizon,
} from "../geometry/source-guide-semantics.js";
import type { SourceProjectionMode } from "../geometry/source-projection.js";
import { inpaintPromptForProjection, shouldReplaceWithProjectionInpaintPrompt } from "../inpaint/inpaint-prompts.js";

type WorkbenchViewerMode = typeof workbench.viewerMode;
type WorkbenchSurfaceMode = typeof workbench.surfaceMode;

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

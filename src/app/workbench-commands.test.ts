import { afterEach, describe, expect, test, vi } from "vitest";
import {
  downloadProjectSnapshot,
  importProjectSnapshotFile as importProjectSnapshotFileFromPersistence,
} from "./project-persistence.js";
import { executeLocalRenderOperator } from "./local-render-operators.js";
import { executePaidOperator } from "./paid-operator-execution.js";
import {
  cancelPendingPaidAction,
  changeProjectionProfile,
  changeSurfaceMode,
  changeViewerMode,
  confirmPendingPaidAction,
  executeOperator,
  importProjectSnapshotFile as importProjectSnapshotFileCommand,
  importPreviewMediaFile,
  promotePreviewMedia,
  setDomeGuideHorizonSplit,
  setDomeGuideSemanticSplit,
} from "./workbench-commands.js";
import { inpaintPromptForProjection } from "./app-state.js";
import { workbench } from "../artifacts/artifact-store.svelte.js";

vi.mock("./project-persistence.js", () => ({
  downloadProjectSnapshot: vi.fn().mockResolvedValue(undefined),
  importProjectSnapshotFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./local-render-operators.js", () => ({
  executeLocalRenderOperator: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./paid-operator-execution.js", () => ({
  executePaidOperator: vi.fn().mockResolvedValue(undefined),
}));

describe("artifact-first workbench commands", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("opens confirmation before paid operators run", async () => {
    await executeOperator("repair-start-state");

    expect(workbench.pendingPaidAction?.operatorId).toBe("repair-start-state");
    expect(workbench.jobs.some((job) => job.operatorId === "repair-start-state" && job.busy)).toBe(false);
    expectNoPaidOperatorCalls();

    cancelPendingPaidAction();
  });

  test("confirms and cancels paid actions through the public command layer", async () => {
    await executeOperator("repair-start-state");

    await confirmPendingPaidAction();

    expect(workbench.pendingPaidAction).toBeNull();
    expect(executePaidOperator).toHaveBeenCalledTimes(1);
    expect(executePaidOperator).toHaveBeenCalledWith("repair-start-state");

    await executeOperator("generate-start-depth");
    cancelPendingPaidAction();

    expect(workbench.pendingPaidAction).toBeNull();
    expect(executePaidOperator).toHaveBeenCalledTimes(1);
  });

  test("routes project save and load entry points through persistence without paid clients", async () => {
    const file = new File(["{}"], "zenith-project.json", { type: "application/json" });

    await executeOperator("save-project");
    await executeOperator("load-project");
    await importProjectSnapshotFileCommand(file);

    expect(downloadProjectSnapshot).toHaveBeenCalledTimes(1);
    expect(importProjectSnapshotFileFromPersistence).toHaveBeenCalledTimes(1);
    expect(importProjectSnapshotFileFromPersistence).toHaveBeenCalledWith(file);
    expectNoPaidOperatorCalls();
  });

  test("routes local render and render-export operators through the local render module", async () => {
    const operatorIds = [
      "preview-motion-draft",
      "export-motion-proxy",
      "export-motion-config",
      "capture-displaced-endpoint",
      "export-start-depth",
      "export-end-depth",
    ] as const;

    for (const operatorId of operatorIds) {
      await executeOperator(operatorId);
    }

    expect(executeLocalRenderOperator).toHaveBeenCalledTimes(operatorIds.length);
    for (const operatorId of operatorIds) {
      expect(executeLocalRenderOperator).toHaveBeenCalledWith(operatorId);
    }
    expectNoPaidOperatorCalls();
  });

  test("routes global view state through the public command layer", () => {
    changeViewerMode("rim-check");
    changeSurfaceMode("rgbd-lab");

    expect(workbench.viewerMode).toBe("rim-check");
    expect(workbench.surfaceMode).toBe("rgbd-lab");
    expectNoPaidOperatorCalls();

    changeViewerMode("domemaster");
    changeSurfaceMode("artifact");
  });

  test("refreshes generated repair prompts when projection changes", () => {
    workbench.promptDrafts.repair = inpaintPromptForProjection("zenith-180");
    workbench.domeGuideSemanticSplit = 1 / 3;

    changeProjectionProfile("cave-270");

    expect(workbench.projectionProfile).toBe("cave-270");
    expect(workbench.promptDrafts.repair).toBe(inpaintPromptForProjection("cave-270"));
    expect(workbench.promptDrafts.repair).toContain("square projection-source map");
  });

  test("defaults carrier horizon when changing from a non-carrier projection", () => {
    changeProjectionProfile("zenith-180");
    setDomeGuideSemanticSplit(1 / 3);

    changeProjectionProfile("cave-270");

    expect(workbench.projectionProfile).toBe("cave-270");
    expect(workbench.domeGuideHorizonSplit).toBeCloseTo(2 / 3, 5);
    expectNoPaidOperatorCalls();
  });

  test("refreshes generated dome repair prompts when the semantic split changes", () => {
    changeProjectionProfile("zenith-180");
    workbench.promptDrafts.repair = inpaintPromptForProjection("zenith-180");

    setDomeGuideSemanticSplit(0.5);

    expect(workbench.domeGuideSemanticSplit).toBe(0.5);
    expect(workbench.promptDrafts.repair).toBe(inpaintPromptForProjection("zenith-180", 0.5));
    expect(workbench.promptDrafts.repair).toContain("50% from the center");
  });

  test("refreshes generated CAVE carrier prompts when the semantic split changes", () => {
    changeProjectionProfile("cave-270");
    workbench.promptDrafts.repair = inpaintPromptForProjection("cave-270");
    setDomeGuideHorizonSplit(0.75);

    setDomeGuideSemanticSplit(0.5);

    expect(workbench.domeGuideSemanticSplit).toBe(0.5);
    expect(workbench.domeGuideHorizonSplit).toBe(0.75);
    expect(workbench.promptDrafts.repair).toBe(inpaintPromptForProjection("cave-270", 0.5, 0.75));
    expect(workbench.promptDrafts.repair).toContain("floor-to-wall split is 50% from the center");
    expect(workbench.promptDrafts.repair).toContain("eye-level/horizon breakpoint at 75%");
  });

  test("refreshes generated multi-anchor prompts when the horizon carrier changes", () => {
    changeProjectionProfile("cave-270");
    workbench.promptDrafts.repair = inpaintPromptForProjection(
      "cave-270",
      workbench.domeGuideSemanticSplit,
      workbench.domeGuideHorizonSplit,
    );

    setDomeGuideSemanticSplit(1 / 3);
    setDomeGuideHorizonSplit(0.58);

    expect(workbench.domeGuideHorizonSplit).toBe(0.58);
    expect(workbench.promptDrafts.repair).toBe(inpaintPromptForProjection("cave-270", 1 / 3, 0.58));
    expect(workbench.promptDrafts.repair).toContain("eye-level/horizon breakpoint at 58%");
  });

  test("keeps manually edited repair prompts when projection changes", () => {
    workbench.promptDrafts.repair = "Keep this custom CAVE source-map experiment prompt.";

    setDomeGuideSemanticSplit(1 / 3);
    changeProjectionProfile("zenith-180");

    expect(workbench.projectionProfile).toBe("zenith-180");
    expect(workbench.promptDrafts.repair).toBe("Keep this custom CAVE source-map experiment prompt.");
  });

  test("keeps manually edited repair prompts when guide breakpoints change", () => {
    changeProjectionProfile("cave-270");
    workbench.promptDrafts.repair = "Keep this custom guide authoring prompt.";

    setDomeGuideSemanticSplit(0.5);
    setDomeGuideHorizonSplit(0.8);

    expect(workbench.domeGuideSemanticSplit).toBe(0.5);
    expect(workbench.domeGuideHorizonSplit).toBe(0.8);
    expect(workbench.promptDrafts.repair).toBe("Keep this custom guide authoring prompt.");
    expectNoPaidOperatorCalls();
  });

  test("imports dropped media into isolated Media Preview", async () => {
    const plateSketchUrl = workbench.artifacts["plate-sketch"].media.url;
    const file = new File(["preview"], "outside-generation.png", { type: "image/png" });

    await importPreviewMediaFile(file);

    expect(workbench.surfaceMode).toBe("media-preview");
    expect(workbench.mediaPreview.media.kind).toBe("image");
    expect(workbench.mediaPreview.media.name).toBe("outside-generation.png");
    expect(workbench.artifacts["plate-sketch"].media.url).toBe(plateSketchUrl);
    expectNoPaidOperatorCalls();
  });

  test("promotes Media Preview only after an explicit target selection", async () => {
    const file = new File(["end-state"], "manual-end-state.png", { type: "image/png" });

    await importPreviewMediaFile(file);
    await promotePreviewMedia("end-state");

    expect(workbench.selectedArtifactId).toBe("end-state");
    expect(workbench.surfaceMode).toBe("artifact");
    expect(workbench.artifacts["end-state"].media.name).toBe("manual-end-state.png");
    expect(workbench.artifacts["end-state"].summary).toContain("from Media Preview");
    expectNoPaidOperatorCalls();
  });
});

function expectNoPaidOperatorCalls(): void {
  expect(executePaidOperator).not.toHaveBeenCalled();
}

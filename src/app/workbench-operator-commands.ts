import {
  addArtifactResult,
  finishJob,
  getArtifact,
  recordWorkbenchError,
  selectArtifact,
  updateArtifact,
  workbench,
} from "../artifacts/artifact-store.svelte.js";
import type { OperatorId } from "../artifacts/artifact-types.js";
import { downloadProjectSnapshot } from "./project-persistence.js";
import { executeLocalRenderOperator } from "./local-render-operators.js";
import { getOperator } from "./operator-registry.js";
import { executePaidOperator } from "./paid-operator-execution.js";
import { downloadDeliveryManifest } from "./workbench-project-commands.js";

let plateSketchCommitHandler: (() => Promise<void>) | null = null;

export function installPlateSketchCommitHandler(handler: (() => Promise<void>) | null): () => void {
  plateSketchCommitHandler = handler;
  return () => {
    if (plateSketchCommitHandler === handler) {
      plateSketchCommitHandler = null;
    }
  };
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

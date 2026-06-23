import { describe, expect, test } from "vitest";
import { OPERATORS } from "../app/operator-registry.js";
import {
  PROJECT_ARTIFACT_INPUTS_BY_ID,
  PROJECT_ARTIFACT_STAGE_BY_ID,
  PROJECT_ARTIFACT_SLOT_IDS,
  PROJECT_WORKFLOW_STAGE_IDS,
} from "../lib/shared/contracts/artifact-topology.js";
import { WORKFLOW_STAGES, workbench } from "./artifact-store.svelte.js";

describe("artifact graph consistency", () => {
  test("keeps runtime workflow stage ordering aligned with the shared project contract", () => {
    expect(WORKFLOW_STAGES.map((stage) => stage.id)).toEqual([...PROJECT_WORKFLOW_STAGE_IDS]);
    expect(WORKFLOW_STAGES.flatMap((stage) => stage.artifactIds)).toEqual([...PROJECT_ARTIFACT_SLOT_IDS]);

    for (const stage of WORKFLOW_STAGES) {
      for (const artifactId of stage.artifactIds) {
        expect(PROJECT_ARTIFACT_STAGE_BY_ID[artifactId]).toBe(stage.id);
      }
    }
  });

  test("creates initial runtime artifacts from the shared project topology", () => {
    expect(Object.keys(workbench.artifacts)).toEqual([...PROJECT_ARTIFACT_SLOT_IDS]);

    for (const artifactId of PROJECT_ARTIFACT_SLOT_IDS) {
      const artifact = workbench.artifacts[artifactId];

      expect(artifact.id).toBe(artifactId);
      expect(artifact.type).toBe(artifactId);
      expect(artifact.stage).toBe(PROJECT_ARTIFACT_STAGE_BY_ID[artifactId]);
      expect(artifact.inputs).toEqual([...PROJECT_ARTIFACT_INPUTS_BY_ID[artifactId]]);
    }
  });

  test("keeps operators attached to known artifact slots and stages", () => {
    const artifactSlots = new Set(PROJECT_ARTIFACT_SLOT_IDS);
    const workflowStages = new Set(PROJECT_WORKFLOW_STAGE_IDS);

    for (const operator of OPERATORS) {
      expect(workflowStages.has(operator.stage)).toBe(true);
      expect(artifactSlots.has(operator.attachTo)).toBe(true);
      expect(artifactSlots.has(operator.output)).toBe(true);
      expect(operator.inputs.every((input) => artifactSlots.has(input))).toBe(true);
      expect(PROJECT_ARTIFACT_STAGE_BY_ID[operator.attachTo]).toBe(operator.stage);
      expect(PROJECT_ARTIFACT_STAGE_BY_ID[operator.output]).toBe(operator.stage);
    }
  });
});

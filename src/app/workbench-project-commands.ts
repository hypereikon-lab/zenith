import { workbench } from "../artifacts/artifact-store.svelte.js";
import { downloadBlob } from "../media/canvas-utils.js";
import { importProjectSnapshotFile as importProjectSnapshotFileFromPersistence } from "./project-persistence.js";

export async function importProjectSnapshotFile(file: File): Promise<void> {
  await importProjectSnapshotFileFromPersistence(file);
}

export function downloadDeliveryManifest(): void {
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

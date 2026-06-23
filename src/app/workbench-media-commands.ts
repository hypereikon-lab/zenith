import {
  getArtifact,
  getMediaPreviewHandle,
  recordWorkbenchError,
  replaceArtifactMedia,
  replaceMediaPreview,
  selectArtifact,
} from "../artifacts/artifact-store.svelte.js";
import { artifactMediaFromFile } from "../artifacts/artifact-runtime-media.js";
import type { ArtifactSlotId } from "../artifacts/artifact-types.js";

export async function importPlateSketchFile(file: File): Promise<void> {
  const { media, handle } = artifactMediaFromFile(file, {
    kind: "image",
    alt: "Imported fulldome Plate Sketch composition handoff",
  });
  replaceArtifactMedia("plate-sketch", {
    patch: {
      status: "ready",
      stale: false,
      summary: `${file.name} imported as Plate Sketch inpaint handoff.`,
      operatorId: "import-plate-sketch",
      media,
      warnings: file.type.startsWith("image/") ? [] : ["Plate Sketch should be a square image handoff for inpaint."],
    },
    handle,
    result: {
      label: `Imported ${file.name}`,
      media,
      operatorId: "import-plate-sketch",
    },
  });
  selectArtifact("plate-sketch");
}

export async function importSourceFile(file: File): Promise<void> {
  const kind = file.type.startsWith("video/") ? "video" : "image";
  const { media, handle } = artifactMediaFromFile(file, {
    kind,
    alt: `Imported ${kind} Start State`,
  });
  replaceArtifactMedia("start-state", {
    patch: {
      status: "ready",
      stale: false,
      summary: `${file.name} imported as already-clean Start State.`,
      operatorId: "import-source",
      media,
      warnings: kind === "video" ? ["Video sources should be paused/selected before paid still-image operations."] : [],
    },
    handle,
    result: {
      label: `Imported ${file.name}`,
      media,
      operatorId: "import-source",
    },
  });
  selectArtifact("start-state");
}

export async function importDepthFile(artifactId: "start-depth" | "end-depth", file: File): Promise<void> {
  const operatorId = artifactId === "start-depth" ? "import-start-depth" : "import-end-depth";
  const { media, handle } = artifactMediaFromFile(file, {
    kind: "image",
    alt: `Imported ${getArtifact(artifactId).label}`,
  });
  replaceArtifactMedia(artifactId, {
    patch: {
      status: "ready",
      stale: false,
      summary: `${file.name} imported as ${getArtifact(artifactId).label}.`,
      operatorId,
      media,
      warnings: file.type.startsWith("image/") ? [] : ["Depth maps should be image files."],
    },
    handle,
    result: {
      label: `Imported ${file.name}`,
      media,
      operatorId,
    },
  });
  selectArtifact(artifactId);
}

export async function importPreviewMediaFile(file: File): Promise<void> {
  const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : "none";
  if (kind === "none") {
    recordWorkbenchError("Drop an image or video file for Media Preview.", "media-preview");
    return;
  }
  const { media, handle } = artifactMediaFromFile(file, {
    kind,
    alt: `Imported ${kind} for projection Media Preview`,
  });
  replaceMediaPreview(
    media,
    `${file.name} loaded into Media Preview. It has not changed the production artifact graph.`,
    handle,
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
  const { media, handle } = artifactMediaFromFile(file, {
    kind,
    alt: `Imported ${artifact.label}`,
  });
  replaceArtifactMedia(artifactId, {
    patch: {
      status: "ready",
      stale: false,
      summary: `${file.name} imported as ${artifact.label} from Media Preview.`,
      operatorId: `import-${artifactId}`,
      media,
      warnings:
        artifactId === "motion-draft" && kind !== "video"
          ? [
              "Motion Draft is normally a video proxy. A still image can be inspected, but it will not drive video choreography.",
            ]
          : [],
    },
    handle,
    result: {
      label: `Imported ${file.name}`,
      media,
      operatorId: `import-${artifactId}`,
    },
  });
  selectArtifact(artifactId);
}

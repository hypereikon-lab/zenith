import { renderCaveFaces } from "../export/cave-exporter.js";
import { CAVE_FACES, DEFAULT_CAVE_ROOM } from "../geometry/cave-projection.js";
import { canvasToBlob, cloneCanvas, downloadBlob } from "../media/canvas-utils.js";
import { createStoredZip } from "../media/zip.js";
import { errorMessage } from "../utils/errors.js";
import type { CaveSourceProjectionPreset } from "../export/cave-exporter.js";
import type { ZenithControls } from "../ui/dom.js";
import type { ZenithState } from "../app/types.js";

type CaveExportSource = "current" | "reconstructed-final" | "raw-final";

type CaveExportControllerOptions = {
  state: ZenithState;
  controls: ZenithControls;
  video: HTMLVideoElement;
  elements: {
    exportCaveFaces: HTMLButtonElement;
    caveExportReadout: HTMLElement;
  };
};

type SelectedSource = {
  canvas: HTMLCanvasElement;
  name: string;
};

export function createCaveExportController({ state, controls, video, elements }: CaveExportControllerOptions) {
  const { exportCaveFaces: exportButton, caveExportReadout } = elements;

  async function exportCaveFaces(): Promise<void> {
    const selected = selectedSourceCanvas();
    if (!selected) {
      caveExportReadout.textContent = "Load or generate a still image before exporting CAVE faces";
      updateCaveExportUiState();
      return;
    }

    exportButton.disabled = true;
    const faceSize = caveFaceSize();
    const sourceProjection = caveSourceProjection();
    const sourceTransform = caveSourceTransform();
    caveExportReadout.textContent = `Rendering ${CAVE_FACES.length} CAVE faces at ${faceSize}px`;

    try {
      const rendered = renderCaveFaces({
        sourceCanvas: selected.canvas,
        sourceProjection,
        faceSize,
        room: DEFAULT_CAVE_ROOM,
        sourceTransform,
      });
      const timestamp = Date.now();
      const entries = await Promise.all(
        rendered.map(async (result) => ({
          name: `zenith-cave-${result.face}-${timestamp}.png`,
          data: await canvasToBlob(result.canvas, "image/png"),
        })),
      );
      const manifest = {
        schema: "zenith.cave-face-export.v1",
        createdAt: new Date(timestamp).toISOString(),
        sourceName: selected.name,
        sourceWidth: selected.canvas.width,
        sourceHeight: selected.canvas.height,
        sourceProjection,
        sourceTransform,
        room: DEFAULT_CAVE_ROOM,
        faceSize,
        faces: rendered.map((result, index) => ({
          face: result.face,
          filename: entries[index].name,
          coverage: result.coverage,
        })),
      };
      const zip = await createStoredZip([
        ...entries,
        {
          name: `zenith-cave-manifest-${timestamp}.json`,
          data: JSON.stringify(manifest, null, 2),
        },
      ]);
      downloadBlob(zip, `zenith-cave-faces-${timestamp}.zip`);
      caveExportReadout.textContent = coverageSummary(rendered.map((result) => result.coverage.ratio));
    } catch (error) {
      console.error(error);
      caveExportReadout.textContent = errorMessage(error) || "Could not export CAVE faces";
    } finally {
      updateCaveExportUiState();
    }
  }

  function updateCaveExportUiState(): void {
    const selected = selectedSourceCanvas();
    exportButton.disabled = !selected;
    if (!selected) return;
    const label = selected.name || "selected still";
    caveExportReadout.textContent = `${caveSourceProjectionLabel()} from ${label}`;
  }

  function selectedSourceCanvas(): SelectedSource | null {
    const source = String(controls.caveSource.value || "current") as CaveExportSource;
    if (source === "reconstructed-final" && state.depthFinalReconstructedCanvas) {
      return {
        canvas: state.depthFinalReconstructedCanvas,
        name: state.depthFinalReconstructedName || "Reconstructed final state",
      };
    }
    if (source === "raw-final" && state.depthFinalStateCanvas) {
      return {
        canvas: state.depthFinalStateCanvas,
        name: state.depthFinalStateName || "Raw final state",
      };
    }
    if (state.sourceCanvas) {
      return {
        canvas: state.sourceCanvas,
        name: state.sourceName || "Current source",
      };
    }
    if (state.mediaKind === "video" && video.videoWidth > 0 && video.videoHeight > 0) {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d", { alpha: false }).drawImage(video, 0, 0, canvas.width, canvas.height);
      return {
        canvas,
        name: state.sourceName || "Current video frame",
      };
    }
    return null;
  }

  function caveSourceProjection(): CaveSourceProjectionPreset {
    const value = String(controls.caveProjection.value || "nadir-270");
    if (value === "nadir-180" || value === "zenith-270" || value === "zenith-180") return value;
    return "nadir-270";
  }

  function caveFaceSize(): number {
    return Math.max(256, Math.min(4096, Math.round(Number(controls.caveFaceSize.value) || 1024)));
  }

  function caveSourceTransform() {
    return {
      sourceRotationRadians: ((Number(controls.rotation.value) || 0) * Math.PI) / 180,
      domeTiltRadians: ((Number(controls.domeTilt.value) || 0) * Math.PI) / 180,
      mirror: Boolean(controls.mirror.checked),
    };
  }

  function caveSourceProjectionLabel(): string {
    const projection = caveSourceProjection();
    if (projection === "nadir-180") return "Nadir 180 -> floor/lower walls";
    if (projection === "zenith-270") return "Zenith 270 -> upper walls + horizon band";
    if (projection === "zenith-180") return "Zenith 180 -> upper walls";
    return "Nadir 270 -> floor/walls";
  }

  return {
    exportCaveFaces,
    updateCaveExportUiState,
    cloneSelectedSourceCanvas: () => {
      const selected = selectedSourceCanvas();
      return selected ? cloneCanvas(selected.canvas) : null;
    },
  };
}

function coverageSummary(ratios: number[]): string {
  const minimum = Math.min(...ratios);
  const average = ratios.reduce((total, ratio) => total + ratio, 0) / Math.max(1, ratios.length);
  return `Exported CAVE ZIP - avg ${Math.round(average * 100)}%, min ${Math.round(minimum * 100)}% coverage`;
}

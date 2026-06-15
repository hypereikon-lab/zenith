import { selectPipelineLane } from "./pipeline-state.svelte.js";
import type { LaneId } from "../ui/lane-model.js";

type PipelineCommands = {
  setWorkspace: (workspace: LaneId) => void;
  loadMediaFile: (file: File) => Promise<void>;
  loadPlateFiles: (files: File[]) => Promise<void>;
  handleSourceProjectionChange: () => void;
  handleCanvasPointerDown: (event: PointerEvent) => void;
  handleCanvasPointerMove: (event: PointerEvent) => void;
  handleCanvasPointerUp: (event: PointerEvent) => void;
  handleCanvasWheel: (event: WheelEvent) => void;
};

let installedCommands: PipelineCommands = {
  setWorkspace: selectPipelineLane,
  async loadMediaFile() {},
  async loadPlateFiles() {},
  handleSourceProjectionChange() {},
  handleCanvasPointerDown() {},
  handleCanvasPointerMove() {},
  handleCanvasPointerUp() {},
  handleCanvasWheel() {},
};

export const pipelineCommands: PipelineCommands = {
  setWorkspace(workspace) {
    installedCommands.setWorkspace(workspace);
  },
  loadMediaFile(file) {
    return installedCommands.loadMediaFile(file);
  },
  loadPlateFiles(files) {
    return installedCommands.loadPlateFiles(files);
  },
  handleSourceProjectionChange() {
    installedCommands.handleSourceProjectionChange();
  },
  handleCanvasPointerDown(event) {
    installedCommands.handleCanvasPointerDown(event);
  },
  handleCanvasPointerMove(event) {
    installedCommands.handleCanvasPointerMove(event);
  },
  handleCanvasPointerUp(event) {
    installedCommands.handleCanvasPointerUp(event);
  },
  handleCanvasWheel(event) {
    installedCommands.handleCanvasWheel(event);
  },
};

export function installPipelineCommands(commands: Partial<PipelineCommands>): void {
  installedCommands = { ...installedCommands, ...commands };
}

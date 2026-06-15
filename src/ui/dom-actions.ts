import { pipeline, recordPipelineError, setPipelineDropActive } from "../app/pipeline-state.svelte.js";
import { pipelineCommands } from "../app/pipeline-commands.js";
import { errorMessage } from "../utils/errors.js";

export function autosizeTextarea(node: HTMLTextAreaElement) {
  const resize = () => {
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight + 2}px`;
  };

  node.addEventListener("input", resize);
  node.addEventListener("change", resize);
  requestAnimationFrame(resize);

  return {
    destroy() {
      node.removeEventListener("input", resize);
      node.removeEventListener("change", resize);
    },
  };
}

export function viewerPointerInput(node: HTMLCanvasElement) {
  const handlePointerDown = (event: PointerEvent) => pipelineCommands.handleCanvasPointerDown(event);
  const handlePointerMove = (event: PointerEvent) => pipelineCommands.handleCanvasPointerMove(event);
  const handlePointerUp = (event: PointerEvent) => pipelineCommands.handleCanvasPointerUp(event);
  const handleWheel = (event: WheelEvent) => pipelineCommands.handleCanvasWheel(event);

  node.addEventListener("pointerdown", handlePointerDown);
  node.addEventListener("pointermove", handlePointerMove);
  node.addEventListener("pointerup", handlePointerUp);
  node.addEventListener("wheel", handleWheel, { passive: false });

  return {
    destroy() {
      node.removeEventListener("pointerdown", handlePointerDown);
      node.removeEventListener("pointermove", handlePointerMove);
      node.removeEventListener("pointerup", handlePointerUp);
      node.removeEventListener("wheel", handleWheel);
    },
  };
}

export function windowMediaDrop(_node: HTMLElement) {
  const setDepth = (depth: number) => {
    setPipelineDropActive(depth > 0, Math.max(0, depth));
  };

  const handleDragEnter = (event: DragEvent) => {
    event.preventDefault();
    setDepth(pipeline.drop.depth + 1);
  };

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
  };

  const handleDragLeave = () => {
    setDepth(Math.max(0, pipeline.drop.depth - 1));
  };

  const handleDrop = async (event: DragEvent) => {
    event.preventDefault();
    setDepth(0);
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    try {
      await pipelineCommands.loadMediaFile(file);
    } catch (error) {
      recordPipelineError(errorMessage(error) || "Could not load dropped media", "media-drop");
    }
  };

  window.addEventListener("dragenter", handleDragEnter);
  window.addEventListener("dragover", handleDragOver);
  window.addEventListener("dragleave", handleDragLeave);
  window.addEventListener("drop", handleDrop);

  return {
    destroy() {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    },
  };
}

import { downloadBlob } from "../media/canvas-utils.js";
import { encodeCanvasSequenceMp4, hasWebCodecsMp4Support } from "../media/webcodecs-mp4.js";
import { errorMessage } from "../utils/errors.js";

const CAPTURE_FPS = 30;
const CAPTURE_SIZE = 1080;

type ViewCaptureOptions = {
  renderer: {
    captureCompositeCanvas: (options?: { square?: boolean; width?: number; height?: number }) => Promise<HTMLCanvasElement>;
    drawCompositeToCanvas: (
      output: HTMLCanvasElement,
      options?: { square?: boolean; width?: number; height?: number },
    ) => Promise<void>;
  };
  elements: {
    captureSquareFrame: HTMLButtonElement;
    recordCanvas: HTMLButtonElement;
    captureReadout: HTMLElement;
  };
};

export function createViewCaptureController({ renderer, elements }: ViewCaptureOptions) {
  const { captureSquareFrame, recordCanvas, captureReadout } = elements;
  let frameTimer: number | null = null;
  let captureCanvas: HTMLCanvasElement | null = null;
  let frames: ImageBitmap[] = [];
  let recording = false;
  let encoding = false;
  let capturing = false;

  async function exportSquareFrame() {
    const output = await renderer.captureCompositeCanvas({ square: true, width: CAPTURE_SIZE, height: CAPTURE_SIZE });
    output.toBlob((blob: Blob | null) => {
      if (!blob) return;
      downloadBlob(blob, `zenith-view-square-${Date.now()}.png`);
      captureReadout.textContent = "Exported square PNG";
    }, "image/png");
  }

  async function toggleCanvasRecording() {
    if (encoding) return;
    if (recording) {
      await stopRecording();
      return;
    }
    await startRecording();
  }

  async function startRecording() {
    if (!hasWebCodecsMp4Support()) {
      captureReadout.textContent = "WebCodecs MP4 is not available";
      return;
    }

    captureCanvas = await renderer.captureCompositeCanvas({ square: true, width: CAPTURE_SIZE, height: CAPTURE_SIZE });
    frames = [];
    recording = true;
    frameTimer = window.setInterval(captureFrame, 1000 / CAPTURE_FPS);
    captureFrame();
    recordCanvas.textContent = "Stop MP4";
    captureSquareFrame.disabled = true;
    captureReadout.textContent = "Recording MP4 frames";
  }

  async function stopRecording() {
    if (!recording) return;
    stopFrameTimer();
    recording = false;
    encoding = true;
    recordCanvas.disabled = true;
    captureReadout.textContent = `Encoding ${frames.length} frames`;

    try {
      if (frames.length < 2 || !captureCanvas) {
        throw new Error("Record at least two frames before exporting MP4.");
      }
      const encodeCanvas = document.createElement("canvas");
      encodeCanvas.width = captureCanvas.width;
      encodeCanvas.height = captureCanvas.height;
      const encodeContext = encodeCanvas.getContext("2d", { alpha: false });
      const blob = await encodeCanvasSequenceMp4({
        width: encodeCanvas.width,
        height: encodeCanvas.height,
        fps: CAPTURE_FPS,
        frameCount: frames.length,
        renderFrame: async (_progress, index) => {
          encodeContext.drawImage(frames[index], 0, 0, encodeCanvas.width, encodeCanvas.height);
          return encodeCanvas;
        },
        onProgress: (stage: string, progress: number) => {
          captureReadout.textContent = `${stage} ${Math.round(progress * 100)}%`;
        },
      });
      downloadBlob(blob, `zenith-canvas-recording-${Date.now()}.mp4`);
      captureReadout.textContent = "Exported MP4 recording";
    } catch (error) {
      console.error(error);
      captureReadout.textContent = errorMessage(error) || "Could not encode MP4";
    } finally {
      cleanupRecording();
    }
  }

  function cleanupRecording() {
    stopFrameTimer();
    frames.forEach((frame: ImageBitmap) => frame.close?.());
    captureCanvas = null;
    frames = [];
    recording = false;
    encoding = false;
    recordCanvas.disabled = false;
    recordCanvas.textContent = "Record MP4";
    captureSquareFrame.disabled = false;
  }

  async function captureFrame() {
    if (!recording || !captureCanvas || capturing) return;
    capturing = true;
    try {
      await renderer.drawCompositeToCanvas(captureCanvas, { square: true, width: CAPTURE_SIZE, height: CAPTURE_SIZE });
      const frame = await createImageBitmap(captureCanvas);
      frames.push(frame);
      const seconds = frames.length / CAPTURE_FPS;
      captureReadout.textContent = `Recording MP4 ${seconds.toFixed(1)}s`;
    } finally {
      capturing = false;
    }
  }

  function stopFrameTimer() {
    if (!frameTimer) return;
    window.clearInterval(frameTimer);
    frameTimer = null;
  }

  return {
    exportSquareFrame,
    toggleCanvasRecording,
    stopRecording,
    isRecording: () => recording,
  };
}

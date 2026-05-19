import { clamp } from "../projection.js";
import type { MediaKind, SetGpuState } from "../app/types.js";

const METADATA_TIMEOUT_MS = 15000;

type VideoTransportOptions = {
  video: HTMLVideoElement | {
    readyState: number;
    videoWidth: number;
    videoHeight: number;
    paused: boolean;
    currentTime: number;
    duration?: number;
    playbackRate?: number;
    play: () => Promise<void>;
    pause: () => void;
    addEventListener: EventTarget["addEventListener"];
    removeEventListener: EventTarget["removeEventListener"];
  };
  state: {
    mediaKind: MediaKind;
    timelineSeeking: boolean;
    mediaDuration: number;
    mediaFps?: number;
    lastFrameMediaTime?: number | null;
    pendingVideoUpload?: boolean;
    videoFrameCallbackId: number | null;
  };
  elements: {
    playToggle: { disabled: boolean; textContent: string | null };
    stepBack: { disabled: boolean };
    stepForward: { disabled: boolean };
    timeline: { disabled: boolean; value: string; max: string };
    playbackRate: { disabled: boolean; value: string };
    timeReadout: { textContent: string | null };
  };
  actions: {
    setGpuState: SetGpuState;
  };
};

export function createVideoTransport({ video, state, elements, actions }: VideoTransportOptions) {
  const { playToggle, stepBack, stepForward, timeline, playbackRate, timeReadout } = elements;

  function handlePlaybackRateChange() {
    video.playbackRate = Number(playbackRate.value);
  }

  function handleTimelinePointerDown() {
    state.timelineSeeking = true;
  }

  function handleTimelineInput() {
    seekVideo(Number(timeline.value));
  }

  function handleTimelinePointerUp() {
    state.timelineSeeking = false;
  }

  function handleTimelineChange() {
    state.timelineSeeking = false;
    seekVideo(Number(timeline.value));
  }

  function handleVideoSeeked() {
    state.pendingVideoUpload = true;
    updateTransport();
  }

  async function waitForMetadata(timeoutMs = METADATA_TIMEOUT_MS): Promise<void> {
    const haveMetadata = globalThis.HTMLMediaElement?.HAVE_METADATA ?? 1;
    if (video.readyState >= haveMetadata && video.videoWidth > 0) {
      return;
    }
    await once(video, "loadedmetadata", timeoutMs);
  }

  function startFrameLoop() {
    if (!("requestVideoFrameCallback" in video)) return;
    const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
      state.videoFrameCallbackId = null;
      state.pendingVideoUpload = true;
      updateFpsEstimate(metadata);
      updateTransport();
      if (state.mediaKind === "video") {
        state.videoFrameCallbackId = video.requestVideoFrameCallback(onFrame);
      }
    };
    state.videoFrameCallbackId = video.requestVideoFrameCallback(onFrame);
  }

  function stopFrameLoop() {
    if (state.videoFrameCallbackId !== null && "cancelVideoFrameCallback" in video) {
      video.cancelVideoFrameCallback(state.videoFrameCallbackId);
    }
    state.videoFrameCallbackId = null;
  }

  function updateFpsEstimate(metadata: VideoFrameCallbackMetadata): void {
    if (!metadata || typeof metadata.mediaTime !== "number") return;
    if (state.lastFrameMediaTime !== null) {
      const delta = metadata.mediaTime - state.lastFrameMediaTime;
      if (delta > 0.001 && delta < 0.2) {
        state.mediaFps = clamp(1 / delta, 1, 120);
      }
    }
    state.lastFrameMediaTime = metadata.mediaTime;
  }

  function toggleVideo() {
    if (state.mediaKind !== "video") return;
    if (video.paused) {
      video
        .play()
        .then(() => {
          playToggle.textContent = "Pause";
          updateTransport();
        })
        .catch((error) => {
          console.error(error);
          actions.setGpuState("Playback failed", true);
        });
    } else {
      video.pause();
      playToggle.textContent = "Play";
      updateTransport();
    }
  }

  function seekVideo(seconds: number): void {
    if (state.mediaKind !== "video") return;
    const duration = Number.isFinite(video.duration) ? video.duration : state.mediaDuration;
    video.currentTime = clamp(seconds, 0, Math.max(duration || 0, 0));
    state.pendingVideoUpload = true;
    updateTransport();
  }

  function stepVideo(direction: number): void {
    if (state.mediaKind !== "video") return;
    const wasPaused = video.paused;
    if (!wasPaused) {
      video.pause();
    }
    const step = 1 / Math.max(state.mediaFps || 24, 1);
    seekVideo(video.currentTime + direction * step);
    if (!wasPaused) {
      playToggle.textContent = "Play";
    }
  }

  function setControlsEnabled(enabled: boolean): void {
    playToggle.disabled = !enabled;
    stepBack.disabled = !enabled;
    stepForward.disabled = !enabled;
    timeline.disabled = !enabled;
    playbackRate.disabled = !enabled;
    if (!enabled) {
      playToggle.textContent = "Play";
      timeline.value = "0";
    }
  }

  function updateTransport() {
    if (state.mediaKind !== "video") {
      timeReadout.textContent = "00:00.000 / 00:00.000";
      return;
    }
    const duration = Number.isFinite(video.duration) ? video.duration : state.mediaDuration;
    if (!state.timelineSeeking) {
      timeline.max = String(duration || 1);
      timeline.value = String(video.currentTime || 0);
    }
    playToggle.textContent = video.paused ? "Play" : "Pause";
    timeReadout.textContent = `${formatMediaTime(video.currentTime || 0)} / ${formatMediaTime(duration || 0)}`;
    state.mediaDuration = duration || 0;
  }

  return {
    handlePlaybackRateChange,
    handleTimelinePointerDown,
    handleTimelineInput,
    handleTimelinePointerUp,
    handleTimelineChange,
    handleVideoSeeked,
    waitForMetadata,
    startFrameLoop,
    stopFrameLoop,
    toggleVideo,
    stepVideo,
    setControlsEnabled,
    updateTransport,
  };
}

export function formatMediaTime(seconds: number): string {
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safeSeconds / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const milliseconds = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 1000);
  return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function once(
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">,
  eventName: string,
  timeoutMs = 0,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      target.removeEventListener(eventName, onEvent);
      target.removeEventListener("error", onError);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Failed while waiting for ${eventName}.`));
    };
    target.addEventListener(eventName, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out while waiting for ${eventName}.`));
      }, timeoutMs);
    }
  });
}

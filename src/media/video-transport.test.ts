import { afterEach, describe, expect, it, vi } from "vitest";
import { createVideoTransport, formatMediaTime } from "./video-transport.js";

describe("formatMediaTime", () => {
  it("formats finite seconds with milliseconds", () => {
    expect(formatMediaTime(65.4329)).toBe("01:05.432");
  });

  it("clamps invalid and negative inputs to zero", () => {
    expect(formatMediaTime(Number.NaN)).toBe("00:00.000");
    expect(formatMediaTime(-2)).toBe("00:00.000");
  });
});

describe("video transport metadata", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects when generated video metadata never arrives", async () => {
    vi.useFakeTimers();
    const video = eventTargetVideoStub();
    const transport = createVideoTransport({
      video,
      state: { mediaKind: "video", timelineSeeking: false, mediaDuration: 0, videoFrameCallbackId: null },
      elements: transportElements(),
      actions: { setGpuState() {} },
    });

    const metadata = expect(transport.waitForMetadata(25)).rejects.toThrow(
      "Timed out while waiting for loadedmetadata.",
    );
    await vi.advanceTimersByTimeAsync(25);
    await metadata;
  });
});

function eventTargetVideoStub() {
  const listeners = new Map<string, EventListener>();
  return {
    readyState: 0,
    videoWidth: 0,
    videoHeight: 0,
    paused: true,
    currentTime: 0,
    duration: 0,
    playbackRate: 1,
    play: () => Promise.resolve(),
    pause() {},
    addEventListener(type: string, listener: EventListener) {
      listeners.set(type, listener);
    },
    removeEventListener(type: string, listener: EventListener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
}

function transportElements() {
  return {
    playToggle: { disabled: false, textContent: "" },
    stepBack: { disabled: false },
    stepForward: { disabled: false },
    timeline: { disabled: false, value: "0", max: "1" },
    playbackRate: { disabled: false, value: "1" },
    timeReadout: { textContent: "" },
  };
}

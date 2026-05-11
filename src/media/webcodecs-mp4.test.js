import { describe, expect, test } from "vitest";
import { bitrateForMp4, hasWebCodecsMp4Support } from "./webcodecs-mp4.js";

describe("WebCodecs MP4 helpers", () => {
  test("reports support as a boolean", () => {
    expect(typeof hasWebCodecsMp4Support()).toBe("boolean");
  });

  test("scales bitrate by frame size and frame rate within sane limits", () => {
    expect(bitrateForMp4({ width: 64, height: 64, fps: 6 })).toBe(800_000);
    expect(bitrateForMp4({ width: 720, height: 720, fps: 12 })).toBe(6_000_000);
    expect(bitrateForMp4({ width: 1280, height: 1280, fps: 30 })).toBeGreaterThan(20_000_000);
    expect(bitrateForMp4({ width: 8192, height: 8192, fps: 60 })).toBe(42_000_000);
  });
});

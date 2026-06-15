import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
} from "mediabunny";

const AVC_PROFILE_PREFIXES = [
  "42e0", // Constrained Baseline
  "4200", // Baseline
  "4d40", // Main
  "6400", // High
];
const AVC_LEVELS = [
  { macroblocks: 3600, bitrate: 14_000_000, hex: "1f" }, // 3.1
  { macroblocks: 5120, bitrate: 20_000_000, hex: "20" }, // 3.2
  { macroblocks: 8192, bitrate: 20_000_000, hex: "28" }, // 4.0
  { macroblocks: 8192, bitrate: 50_000_000, hex: "29" }, // 4.1
  { macroblocks: 8704, bitrate: 50_000_000, hex: "2a" }, // 4.2
  { macroblocks: 22080, bitrate: 135_000_000, hex: "32" }, // 5.0
  { macroblocks: 36864, bitrate: 240_000_000, hex: "33" }, // 5.1
  { macroblocks: Number.POSITIVE_INFINITY, bitrate: Number.POSITIVE_INFINITY, hex: "34" }, // 5.2
];
const REQUIRED_HARDWARE_ACCELERATION: VideoEncoderConfig["hardwareAcceleration"] = "prefer-hardware";
type Mp4EncodeOptions = {
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  renderFrame: (progress: number, index: number) => Promise<HTMLCanvasElement> | HTMLCanvasElement;
  onProgress?: (stage: string, progress: number) => void;
};
type Mp4VideoConfig = {
  codec: "avc";
  fullCodecString?: string;
  bitrate: number;
  latencyMode: VideoEncoderConfig["latencyMode"];
  hardwareAcceleration: VideoEncoderConfig["hardwareAcceleration"];
};
type VideoConfigProbe = VideoEncoderConfig & { avc?: { format: "avc" } };
type BitrateInput = { width: number; height: number; fps: number };

export function hasWebCodecsMp4Support() {
  return "VideoEncoder" in globalThis && "VideoFrame" in globalThis;
}

export async function encodeCanvasSequenceMp4({
  width,
  height,
  fps,
  frameCount,
  renderFrame,
  onProgress = () => {},
}: Mp4EncodeOptions): Promise<Blob> {
  if (!hasWebCodecsMp4Support()) {
    throw new Error("This browser does not expose WebCodecs MP4 encoding.");
  }
  if (typeof renderFrame !== "function") {
    throw new TypeError("encodeCanvasSequenceMp4 requires a renderFrame callback.");
  }
  const safeFps = clampInteger(fps, 1, 60);
  const safeFrameCount = clampInteger(frameCount, 2, 900);
  const safeWidth = clampInteger(width, 16, 8192);
  const safeHeight = clampInteger(height, 16, 8192);
  const codecConfig = await supportedMp4VideoConfig({
    width: safeWidth,
    height: safeHeight,
    fps: safeFps,
  });
  const firstCanvas = await renderFrame(0, 0);
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });
  const videoSource = new CanvasSource(firstCanvas, {
    codec: codecConfig.codec,
    fullCodecString: codecConfig.fullCodecString,
    bitrate: codecConfig.bitrate,
    keyFrameInterval: 1,
    latencyMode: codecConfig.latencyMode,
    hardwareAcceleration: codecConfig.hardwareAcceleration,
  });
  output.addVideoTrack(videoSource, {
    frameRate: safeFps,
    maximumPacketCount: safeFrameCount,
  });

  try {
    await output.start();
    const frameDuration = 1 / safeFps;
    await videoSource.add(0, frameDuration, { keyFrame: true });
    onProgress("Rendering", 1 / safeFrameCount * 0.76);

    for (let index = 1; index < safeFrameCount; index += 1) {
      const progress = safeFrameCount <= 1 ? 1 : index / (safeFrameCount - 1);
      const canvas = await renderFrame(progress, index);
      if (canvas !== firstCanvas) {
        throw new Error("MP4 export renderer must reuse the same canvas for each frame.");
      }
      await videoSource.add(index * frameDuration, frameDuration, { keyFrame: index % safeFps === 0 });
      onProgress("Rendering", ((index + 1) / safeFrameCount) * 0.76);
    }

    onProgress("Encoding", 0.86);
    videoSource.close();
    const mimeType = await output.getMimeType();
    await output.finalize();
    if (!target.buffer) {
      throw new Error("MP4 export produced no buffer.");
    }
    onProgress("Finalizing", 0.96);
    return new Blob([target.buffer], { type: mimeType || "video/mp4" });
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  }
}

export async function supportedMp4VideoConfig({ width, height, fps }: BitrateInput): Promise<Mp4VideoConfig> {
  const bitrate = bitrateForMp4({ width, height, fps });
  const avcCandidates = avcCodecStringsForConfig({ width, height, bitrate });

  for (const fullCodecString of avcCandidates) {
    const supportedConfig = await supportedVideoEncoderConfig({
      codec: fullCodecString,
      width,
      height,
      bitrate,
      framerate: fps,
      latencyMode: "quality",
      hardwareAcceleration: REQUIRED_HARDWARE_ACCELERATION,
      alpha: "discard",
      avc: { format: "avc" },
    });
    if (supportedConfig) {
      return {
        codec: "avc",
        fullCodecString: supportedConfig.codec || fullCodecString,
        bitrate,
        latencyMode: supportedConfig.latencyMode || "quality",
        hardwareAcceleration: supportedConfig.hardwareAcceleration || REQUIRED_HARDWARE_ACCELERATION,
      };
    }
  }

  throw new Error("No supported AVC WebCodecs MP4 encoder is available in this browser.");
}

async function supportedVideoEncoderConfig(config: VideoConfigProbe): Promise<VideoEncoderConfig | null> {
  if (typeof VideoEncoder === "undefined") return null;
  try {
    const support = await VideoEncoder.isConfigSupported(config);
    return support?.supported ? support.config || config : null;
  } catch {
    return null;
  }
}

function avcCodecStringsForConfig({ width, height, bitrate }: { width: number; height: number; bitrate: number }): string[] {
  const totalMacroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
  const minimumLevelIndex = AVC_LEVELS.findIndex((level) => (
    totalMacroblocks <= level.macroblocks && bitrate <= level.bitrate
  ));
  const levelIndex = Math.max(0, minimumLevelIndex);
  const levels = AVC_LEVELS.slice(levelIndex).map((level) => level.hex);
  const candidates: string[] = [];
  for (const level of levels) {
    for (const profile of AVC_PROFILE_PREFIXES) {
      candidates.push(`avc1.${profile}${level}`);
    }
  }
  return candidates;
}

export function bitrateForMp4({ width, height, fps }: BitrateInput): number {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const safeFps = Number.isFinite(Number(fps)) ? Number(fps) : 24;
  const megapixels = (safeWidth * safeHeight) / 1_000_000;
  const frameRateScale = Math.max(0.5, Math.min(2, safeFps / 24));
  const minimumBitrate = Math.min(safeWidth, safeHeight) < 256 ? 800_000 : 6_000_000;
  return Math.round(Math.max(minimumBitrate, Math.min(42_000_000, megapixels * frameRateScale * 12_000_000)));
}

function clampInteger(value: number, min: number, max: number): number {
  const number = Math.round(Number(value) || min);
  return Math.max(min, Math.min(max, number));
}

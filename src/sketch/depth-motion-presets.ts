import type { DepthGuideMode, DepthPolarity } from "./depth-parallax-renderer.js";

export const CUSTOM_DEPTH_MOTION_PRESET_ID = "custom";

export type DepthMotionPresetControlKey =
  | "depthPolarity"
  | "depthGuideMode"
  | "depthSketchSize"
  | "depthNear"
  | "depthFar"
  | "depthSketchDuration"
  | "depthSketchFps"
  | "depthMotionGain"
  | "depthContrast"
  | "depthGuideNoise"
  | "depthSketchYaw"
  | "depthSketchPitch"
  | "depthSketchRoll"
  | "depthSketchTruck"
  | "depthSketchLift"
  | "depthSketchPush"
  | "depthSketchGapFill"
  | "seedancePromptMode";

export type DepthMotionPresetControls = Record<DepthMotionPresetControlKey, string | number>;

export type DepthMotionPreset = {
  id: string;
  label: string;
  description: string;
  controls: DepthMotionPresetControls & {
    depthPolarity: DepthPolarity;
    depthGuideMode: DepthGuideMode;
    seedancePromptMode: "auto" | "strict_repair" | "conservative_lock" | "more_volumetric";
  };
};

export const DEPTH_MOTION_PRESETS = [
  {
    id: "subtle_breathe",
    label: "Subtle breathe",
    description: "Small forward drift with source color, useful when the image should stay mostly locked.",
    controls: {
      depthPolarity: "brightFar",
      depthGuideMode: "source",
      depthSketchSize: "720",
      depthNear: 1,
      depthFar: 14,
      depthSketchDuration: 6,
      depthSketchFps: 24,
      depthMotionGain: 1.8,
      depthContrast: 0.8,
      depthGuideNoise: 0.01,
      depthSketchYaw: 1,
      depthSketchPitch: -0.4,
      depthSketchRoll: 0,
      depthSketchTruck: 0.05,
      depthSketchLift: 0.02,
      depthSketchPush: -0.08,
      depthSketchGapFill: 1,
      seedancePromptMode: "conservative_lock",
    },
  },
  {
    id: "orbital_drift",
    label: "Orbital drift",
    description: "A readable sideways orbit that shows dome depth without throwing the composition away.",
    controls: {
      depthPolarity: "brightFar",
      depthGuideMode: "depthShaded",
      depthSketchSize: "720",
      depthNear: 1,
      depthFar: 12,
      depthSketchDuration: 6,
      depthSketchFps: 24,
      depthMotionGain: 3.2,
      depthContrast: 0.75,
      depthGuideNoise: 0.015,
      depthSketchYaw: 3.2,
      depthSketchPitch: -0.8,
      depthSketchRoll: 0.3,
      depthSketchTruck: -0.22,
      depthSketchLift: 0.03,
      depthSketchPush: -0.05,
      depthSketchGapFill: 2,
      seedancePromptMode: "auto",
    },
  },
  {
    id: "dolly_push",
    label: "Dolly push",
    description: "A forward camera move with restrained rotation, good for entering the scene.",
    controls: {
      depthPolarity: "brightFar",
      depthGuideMode: "depthShaded",
      depthSketchSize: "720",
      depthNear: 0.8,
      depthFar: 13,
      depthSketchDuration: 6,
      depthSketchFps: 24,
      depthMotionGain: 3.6,
      depthContrast: 0.85,
      depthGuideNoise: 0.012,
      depthSketchYaw: -0.6,
      depthSketchPitch: -0.4,
      depthSketchRoll: 0,
      depthSketchTruck: 0,
      depthSketchLift: 0.02,
      depthSketchPush: -0.42,
      depthSketchGapFill: 2,
      seedancePromptMode: "strict_repair",
    },
  },
  {
    id: "lateral_float",
    label: "Lateral float",
    description: "A soft side-slide with light lift for airy material and landscape motion.",
    controls: {
      depthPolarity: "brightFar",
      depthGuideMode: "source",
      depthSketchSize: "720",
      depthNear: 1,
      depthFar: 15,
      depthSketchDuration: 7,
      depthSketchFps: 24,
      depthMotionGain: 3.1,
      depthContrast: 0.8,
      depthGuideNoise: 0.018,
      depthSketchYaw: -2.4,
      depthSketchPitch: 0.2,
      depthSketchRoll: -0.4,
      depthSketchTruck: 0.38,
      depthSketchLift: 0.07,
      depthSketchPush: -0.03,
      depthSketchGapFill: 1,
      seedancePromptMode: "auto",
    },
  },
  {
    id: "volumetric_sweep",
    label: "Volumetric sweep",
    description: "A stronger parallax pass for images that can tolerate more generated motion.",
    controls: {
      depthPolarity: "brightFar",
      depthGuideMode: "depthShaded",
      depthSketchSize: "1024",
      depthNear: 0.8,
      depthFar: 16,
      depthSketchDuration: 7,
      depthSketchFps: 24,
      depthMotionGain: 4.4,
      depthContrast: 1.15,
      depthGuideNoise: 0.02,
      depthSketchYaw: 5,
      depthSketchPitch: -1.4,
      depthSketchRoll: 0.5,
      depthSketchTruck: -0.35,
      depthSketchLift: 0.08,
      depthSketchPush: -0.25,
      depthSketchGapFill: 3,
      seedancePromptMode: "more_volumetric",
    },
  },
  {
    id: "depth_map_repair",
    label: "Depth map repair",
    description: "A clean monochrome guide for fixing warped 2.5D renders before Seedance.",
    controls: {
      depthPolarity: "brightFar",
      depthGuideMode: "depthMap",
      depthSketchSize: "720",
      depthNear: 1,
      depthFar: 12,
      depthSketchDuration: 5,
      depthSketchFps: 24,
      depthMotionGain: 2.4,
      depthContrast: 0.7,
      depthGuideNoise: 0,
      depthSketchYaw: -0.8,
      depthSketchPitch: -0.5,
      depthSketchRoll: 0.1,
      depthSketchTruck: -0.1,
      depthSketchLift: 0,
      depthSketchPush: -0.04,
      depthSketchGapFill: 3,
      seedancePromptMode: "strict_repair",
    },
  },
] as const satisfies readonly DepthMotionPreset[];

export function findDepthMotionPreset(id: string): DepthMotionPreset | null {
  return DEPTH_MOTION_PRESETS.find((preset) => preset.id === id) || null;
}

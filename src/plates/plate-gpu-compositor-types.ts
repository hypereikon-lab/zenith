import type { SourceProjectionMode } from "../geometry/source-projection.js";
import type { PlatePlacementInput } from "./plate-placement.js";

export const PLATE_OUTPUT_FORMAT = "rgba8unorm";
export const PLATE_UNIFORM_FLOATS = 44;
export const PLATE_UNIFORM_BYTES = PLATE_UNIFORM_FLOATS * 4;

export type PlateImage = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  width: number;
  height: number;
  aspect?: number;
};

export type PlateTextureCache = {
  texture: GPUTexture;
  width: number;
  height: number;
};

export type PlateGpuCompositorOptions = {
  device: GPUDevice;
  sampler: GPUSampler;
};

export type PlateRenderOptions = {
  plates: PlateImage[];
  plateCount: number;
  plateFit: string;
  plateFeather: number | string;
  platePlacements: PlatePlacementInput[];
  size: number;
  sourceProjectionMode?: SourceProjectionMode;
  guideMode?: "transparent" | "inpaint-handoff";
  domeGuideSemanticSplit?: number | string | null;
  domeGuideHorizonSplit?: number | string | null;
};

export type PlacementUniformOptions = {
  placement: PlatePlacementInput;
  plate: PlateImage;
  plateFit: string;
  plateFeather: number | string;
  outputSize: number;
  sourceProjectionMode: SourceProjectionMode;
  domeGuideSemanticSplit?: number | string | null;
  domeGuideHorizonSplit?: number | string | null;
};

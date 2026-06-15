import {
  CAVE_FACES,
  DEFAULT_CAVE_ROOM,
  caveContinuityDirectionFromSurfacePoint,
  caveFacePoint,
} from "../geometry/cave-projection.js";
import { createFisheyeProjectionProfile, directionToFisheyeUv } from "../geometry/fisheye-projection.js";
import { sourceDirectionToUv } from "../geometry/source-projection.js";
import { sourceDirectionFromPhysicalDirection } from "../geometry/source-transform.js";
import type { MapUv } from "../projection.js";
import type { CaveCoverage, CaveFace, CaveFaceSample, CaveRoom } from "../geometry/cave-projection.js";
import type { FisheyeProjectionProfile } from "../geometry/fisheye-projection.js";
import type { SourceOrientationTransform } from "../geometry/source-transform.js";
import type { Vec3 } from "../projection.js";

export const CAVE_SOURCE_PROJECTION_PRESETS = ["cave-270"] as const;

export type CaveSourceProjectionPreset = (typeof CAVE_SOURCE_PROJECTION_PRESETS)[number];

export type CaveFaceRenderResult = {
  face: CaveFace;
  canvas: HTMLCanvasElement;
  coverage: CaveCoverage;
};

export type CaveFaceRenderOptions = {
  sourceCanvas: HTMLCanvasElement;
  sourceProjection: CaveSourceProjectionPreset | FisheyeProjectionProfile;
  face: CaveFace;
  faceSize: number;
  room?: CaveRoom;
  sourceTransform?: Partial<SourceOrientationTransform>;
  missingColor?: [number, number, number, number];
};

export type CaveExportRenderOptions = Omit<CaveFaceRenderOptions, "face"> & {
  faces?: readonly CaveFace[];
};

export function createCaveSourceProfile(
  preset: CaveSourceProjectionPreset,
  width: number,
  height: number,
): FisheyeProjectionProfile {
  void preset;
  return createFisheyeProjectionProfile({ width, height, center: "nadir", fieldOfViewDegrees: 270 });
}

export function caveProjectionPresetLabel(preset: CaveSourceProjectionPreset): string {
  void preset;
  return "CAVE 270 continuity carrier";
}

export function renderCaveFaces(options: CaveExportRenderOptions): CaveFaceRenderResult[] {
  return (options.faces || CAVE_FACES).map((face) => renderCaveFace({ ...options, face }));
}

export function renderCaveFace({
  sourceCanvas,
  sourceProjection,
  face,
  faceSize,
  room = DEFAULT_CAVE_ROOM,
  sourceTransform,
  missingColor = [0, 0, 0, 255],
}: CaveFaceRenderOptions): CaveFaceRenderResult {
  const sourceProfile =
    typeof sourceProjection === "string"
      ? createCaveSourceProfile(sourceProjection, sourceCanvas.width, sourceCanvas.height)
      : sourceProjection;
  const size = Math.max(16, Math.round(faceSize));
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const sourceData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const output = document.createElement("canvas");
  output.width = size;
  output.height = size;
  const outputContext = output.getContext("2d", { alpha: false });
  const image = outputContext.createImageData(size, size);
  let covered = 0;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const direction = caveSourceDirectionForFaceSample(
        face,
        {
          u: (x + 0.5) / size,
          v: (y + 0.5) / size,
        },
        room,
        sourceTransform,
      );
      const uv = sourceUvForCaveExportDirection(direction, sourceProjection, sourceProfile, sourceCanvas.width, sourceCanvas.height);
      const outputIndex = (y * size + x) * 4;
      if (!uv) {
        image.data.set(missingColor, outputIndex);
        continue;
      }
      covered += 1;
      const sample = sampleBilinearRgba(sourceData.data, sourceData.width, sourceData.height, uv.u, uv.v);
      image.data.set(sample, outputIndex);
    }
  }

  outputContext.putImageData(image, 0, 0);
  return {
    face,
    canvas: output,
    coverage: {
      covered,
      total: size * size,
      ratio: covered / (size * size),
    },
  };
}

function sourceUvForCaveExportDirection(
  direction: Vec3,
  sourceProjection: CaveSourceProjectionPreset | FisheyeProjectionProfile,
  sourceProfile: FisheyeProjectionProfile,
  width: number,
  height: number,
): MapUv | null {
  if (typeof sourceProjection === "string") {
    return sourceDirectionToUv(direction, sourceProjection, width, height);
  }
  return directionToFisheyeUv(direction, sourceProfile);
}

export function caveSourceDirectionForFaceSample(
  face: CaveFace,
  sample: CaveFaceSample,
  room: CaveRoom = DEFAULT_CAVE_ROOM,
  sourceTransform: Partial<SourceOrientationTransform> = {},
): Vec3 {
  const point = caveFacePoint(face, sample, room);
  const eyeRelativePoint: Vec3 = [point[0] - (room.eyeX || 0), point[1] - (room.eyeHeight || DEFAULT_CAVE_ROOM.eyeHeight), point[2] - (room.eyeZ || 0)];
  const physicalDirection = caveContinuityDirectionFromSurfacePoint(eyeRelativePoint, room);
  return sourceDirectionFromPhysicalDirection(physicalDirection, {
    sourceRotationRadians: sourceTransform.sourceRotationRadians ?? 0,
    domeTiltRadians: sourceTransform.domeTiltRadians ?? 0,
    mirror: sourceTransform.mirror ?? false,
  });
}

function sampleBilinearRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  u: number,
  v: number,
): [number, number, number, number] {
  const x = clampSample(u, width);
  const y = clampSample(v, height);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const top = mixPixel(data, width, x0, y0, x1, y0, tx);
  const bottom = mixPixel(data, width, x0, y1, x1, y1, tx);
  return [
    Math.round(lerp(top[0], bottom[0], ty)),
    Math.round(lerp(top[1], bottom[1], ty)),
    Math.round(lerp(top[2], bottom[2], ty)),
    Math.round(lerp(top[3], bottom[3], ty)),
  ];
}

function clampSample(value: number, size: number): number {
  return Math.max(0, Math.min(size - 1, value * (size - 1)));
}

function mixPixel(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  t: number,
): [number, number, number, number] {
  const a = pixelAt(data, width, x0, y0);
  const b = pixelAt(data, width, x1, y1);
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
}

function pixelAt(data: Uint8ClampedArray, width: number, x: number, y: number): [number, number, number, number] {
  const index = (y * width + x) * 4;
  return [data[index], data[index + 1], data[index + 2], data[index + 3]];
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

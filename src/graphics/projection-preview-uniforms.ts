import type { Mat4, Vec3 } from "../projection.js";

export const PROJECTION_PREVIEW_UNIFORM_FLOATS = 48;
export const PROJECTION_PREVIEW_UNIFORM_BYTES = PROJECTION_PREVIEW_UNIFORM_FLOATS * Float32Array.BYTES_PER_ELEMENT;

export const PROJECTION_PREVIEW_UNIFORM_OFFSETS = {
  mvp: 0,
  fisheyeScale: 16,
  rotation: 18,
  exposure: 19,
  overlayOpacity: 20,
  mirror: 21,
  domeTilt: 22,
  cutaway: 23,
  showRings: 24,
  showSpokes: 25,
  showHorizon: 26,
  showZenith: 27,
  showSourceCircle: 28,
  shellShade: 29,
  sourceCarrierSplit: 30,
  sourceCarrierHorizon: 31,
  sourceCenterTheta: 32,
  sourceRight: 36,
  sourceUp: 40,
  showCaveMask: 44,
  cameraPosition: 45,
} as const;

export type ProjectionPreviewUniformInput = {
  mvp: Mat4;
  fisheyeScale: readonly [number, number];
  rotation?: number;
  exposure?: number;
  overlayOpacity: number;
  mirror?: boolean;
  domeTilt?: number;
  cutaway?: boolean;
  showGuides: boolean;
  shellShade: number;
  sourceCarrierSplit: number;
  sourceCarrierHorizon: number;
  sourceCenterAxis: Vec3;
  sourceTheta: number;
  sourceRightAxis: Vec3;
  sourceUpAxis: Vec3;
  caveMaskMode: 0 | 1 | 2;
  cameraPosition: Vec3;
};

export function buildProjectionPreviewUniformArray(input: ProjectionPreviewUniformInput): Float32Array {
  const data = new Float32Array(PROJECTION_PREVIEW_UNIFORM_FLOATS);
  const showGuides = input.showGuides ? 1 : 0;
  const offsets = PROJECTION_PREVIEW_UNIFORM_OFFSETS;

  data.set(input.mvp, offsets.mvp);
  data[offsets.fisheyeScale] = input.fisheyeScale[0];
  data[offsets.fisheyeScale + 1] = input.fisheyeScale[1];
  data[offsets.rotation] = input.rotation ?? 0;
  data[offsets.exposure] = input.exposure ?? 1;
  data[offsets.overlayOpacity] = input.overlayOpacity;
  data[offsets.mirror] = input.mirror ? 1 : 0;
  data[offsets.domeTilt] = input.domeTilt ?? 0;
  data[offsets.cutaway] = input.cutaway ? 1 : 0;
  data[offsets.showRings] = showGuides;
  data[offsets.showSpokes] = showGuides;
  data[offsets.showHorizon] = showGuides;
  data[offsets.showZenith] = showGuides;
  data[offsets.showSourceCircle] = showGuides;
  data[offsets.shellShade] = input.shellShade;
  data[offsets.sourceCarrierSplit] = input.sourceCarrierSplit;
  data[offsets.sourceCarrierHorizon] = input.sourceCarrierHorizon;
  data.set(input.sourceCenterAxis, offsets.sourceCenterTheta);
  data[offsets.sourceCenterTheta + 3] = input.sourceTheta;
  data.set(input.sourceRightAxis, offsets.sourceRight);
  data.set(input.sourceUpAxis, offsets.sourceUp);
  data[offsets.showCaveMask] = input.caveMaskMode;
  data.set(input.cameraPosition, offsets.cameraPosition);

  return data;
}

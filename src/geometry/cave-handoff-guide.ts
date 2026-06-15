import { DEFAULT_CAVE_CONTINUITY_FLOOR_BAND } from "./cave-continuity-carrier.js";
import {
  DEFAULT_CAVE_HORIZON_WALL_FRACTION,
  normalizeSourceInnerGuideSplit,
  sourceGuideCarrierHorizonRadius,
} from "./source-guide-semantics.js";

export const CAVE_HANDOFF_GUIDE = {
  floorBand: DEFAULT_CAVE_CONTINUITY_FLOOR_BAND,
  baseSpokeCount: 12,
  wallRayCount: 12,
  wallRayIntervalRadians: Math.PI / 6,
  wallRayLineWidthPixels: 0.92,
  wallRayOpacity: 0.72,
  noFloorSpokes: true,
  colors: {
    floor: [0, 255, 0] as const,
    lowerWall: [0, 255, 210] as const,
    upperWall: [62, 128, 255] as const,
    line: [0, 0, 0] as const,
  },
  line: {
    blackThreshold: 0.52,
    baseWidthPixels: 3,
    seamWidthMultiplier: 1.45,
    horizonWidthMultiplier: 1.75,
    boundaryWidthMultiplier: 1.25,
    wallMaskStartOffset: -0.015,
    wallMaskEndOffset: 0.04,
    centerRadius: 0.018,
  },
  floorBandFractions: [] as const,
  wallBandFractions: [0.25, 0.75] as const,
  horizonWallFraction: DEFAULT_CAVE_HORIZON_WALL_FRACTION,
  promptTerms: {
    carrierName: "square CAVE 270 continuity-carrier map",
    floorZone: "neon green inner zone is missing floor and intentionally has no floor spokes or floor rings",
    seam: "first black square seam is the removable floor-to-wall edge",
    wallZones: "aqua lower-wall zone and blue upper-wall zone are missing wall carrier regions",
    wallBands: "wall bands subdivide wall height",
    horizon: "stronger middle wall band is removable eye-level horizon guidance",
    wallRays: "wall grid rays outside the floor seam indicate wall direction, wall corners, and wall centers",
  },
} as const;

export function caveGuideFloorBands(
  floorBand: number | string | null | undefined = CAVE_HANDOFF_GUIDE.floorBand,
): number[] {
  const split = normalizeSourceInnerGuideSplit(floorBand);
  return CAVE_HANDOFF_GUIDE.floorBandFractions.map((fraction) => split * fraction);
}

export function caveGuideWallBands(
  floorBand: number | string | null | undefined = CAVE_HANDOFF_GUIDE.floorBand,
  horizonBand?: number | string | null,
): number[] {
  const split = normalizeSourceInnerGuideSplit(floorBand);
  const horizon = caveGuideHorizonBand(split, horizonBand);
  return [(split + horizon) * 0.5, horizon + (1 - horizon) * 0.5];
}

export function caveGuideHorizonBand(
  floorBand: number | string | null | undefined = CAVE_HANDOFF_GUIDE.floorBand,
  horizonBand?: number | string | null,
): number {
  return sourceGuideCarrierHorizonRadius("cave-270", floorBand, horizonBand);
}

export function caveGuideLineWidthForSize(size: number): number {
  return CAVE_HANDOFF_GUIDE.line.baseWidthPixels / Math.max(size, 1);
}

export function caveGuideWallColor(wallT: number): [number, number, number] {
  return wallT < 0.5
    ? [...CAVE_HANDOFF_GUIDE.colors.lowerWall]
    : [...CAVE_HANDOFF_GUIDE.colors.upperWall];
}

export function caveGuidePromptClause(
  floorBand: number | string | null | undefined = CAVE_HANDOFF_GUIDE.floorBand,
  horizonBand?: number | string | null,
): string {
  const terms = CAVE_HANDOFF_GUIDE.promptTerms;
  const splitPercent = Math.round(normalizeSourceInnerGuideSplit(floorBand) * 100);
  const horizonPercent = Math.round(caveGuideHorizonBand(floorBand, horizonBand) * 100);
  return `Visual harness: the center is the floor center; the floor-to-wall split is ${splitPercent}% from the center; the eye-level horizon wall breakpoint is ${horizonPercent}% from the center; the ${terms.floorZone}; the ${terms.seam}; the ${terms.wallZones} rising toward the upper room edge; the ${terms.wallBands}; the ${terms.horizon}; ${terms.wallRays}.`;
}

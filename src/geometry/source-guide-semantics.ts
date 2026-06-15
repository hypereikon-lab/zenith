import { clamp } from "../projection.js";
import type { SourceProjectionMode } from "./source-projection.js";

export const DEFAULT_SOURCE_INNER_GUIDE_SPLIT = 1 / 3;
export const MIN_SOURCE_INNER_GUIDE_SPLIT = 0.18;
export const MAX_SOURCE_INNER_GUIDE_SPLIT = 0.72;
export const DEFAULT_CAVE_HORIZON_WALL_FRACTION = 0.5;
export const MIN_SOURCE_GUIDE_BREAKPOINT_GAP = 0.04;
export const MAX_SOURCE_CARRIER_HORIZON_SPLIT = 0.94;

export type SourceGuideBreakpoint = {
  id: "inner-split" | "physical-horizon" | "carrier-horizon";
  label: string;
  radius: number;
  editable: boolean;
  role: "semantic-split" | "horizon";
};

export type SourceGuideZone = {
  id: string;
  label: string;
  startRadius: number;
  endRadius: number;
  tone: "sky" | "horizon" | "floor" | "lower-wall" | "upper-wall";
};

export type SourceGuideGeometry = {
  mode: SourceProjectionMode;
  innerSplit: number;
  horizonRadius: number;
  carrierHorizonRadius: number | null;
  hasPhysicalHorizon: boolean;
  hasCarrierHorizon: boolean;
  hasBelowHorizonSection: boolean;
};

export type NormalizedSourceGuideBreakpoints = {
  innerSplit: number;
  carrierHorizonRadius: number;
};

export function normalizeSourceInnerGuideSplit(value: number | string | null | undefined): number {
  const numeric = numericGuideValue(value);
  return clamp(
    numeric ?? DEFAULT_SOURCE_INNER_GUIDE_SPLIT,
    MIN_SOURCE_INNER_GUIDE_SPLIT,
    MAX_SOURCE_INNER_GUIDE_SPLIT,
  );
}

export function sourceGuideHasCarrierHorizon(mode: SourceProjectionMode): boolean {
  return mode === "zenith-230" || mode === "cave-270";
}

export function defaultSourceGuideCarrierHorizonRadius(
  mode: SourceProjectionMode,
  innerSplit: number | string | null | undefined = DEFAULT_SOURCE_INNER_GUIDE_SPLIT,
): number {
  const split = normalizeSourceInnerGuideSplit(innerSplit);
  if (mode === "cave-270") return split + (1 - split) * DEFAULT_CAVE_HORIZON_WALL_FRACTION;
  if (mode === "zenith-230") return 18 / 23;
  return 1;
}

export function normalizeSourceGuideCarrierHorizonRadius(
  mode: SourceProjectionMode,
  innerSplit: number | string | null | undefined = DEFAULT_SOURCE_INNER_GUIDE_SPLIT,
  carrierHorizonRadius?: number | string | null,
): number {
  const split = normalizeSourceInnerGuideSplit(innerSplit);
  if (!sourceGuideHasCarrierHorizon(mode)) return 1;
  const fallback = defaultSourceGuideCarrierHorizonRadius(mode, split);
  const numeric = numericGuideValue(carrierHorizonRadius);
  return clamp(
    numeric ?? fallback,
    split + MIN_SOURCE_GUIDE_BREAKPOINT_GAP,
    MAX_SOURCE_CARRIER_HORIZON_SPLIT,
  );
}

export function normalizeSourceGuideBreakpoints(
  mode: SourceProjectionMode,
  innerSplit: number | string | null | undefined = DEFAULT_SOURCE_INNER_GUIDE_SPLIT,
  carrierHorizonRadius?: number | string | null,
): NormalizedSourceGuideBreakpoints {
  const split = normalizeSourceInnerGuideSplit(innerSplit);
  return {
    innerSplit: split,
    carrierHorizonRadius: normalizeSourceGuideCarrierHorizonRadius(mode, split, carrierHorizonRadius),
  };
}

export function sourceGuideGeometry(
  mode: SourceProjectionMode,
  innerSplit: number | string | null | undefined = DEFAULT_SOURCE_INNER_GUIDE_SPLIT,
  carrierHorizonRadius?: number | string | null,
): SourceGuideGeometry {
  const { innerSplit: split, carrierHorizonRadius: horizonCarrier } = normalizeSourceGuideBreakpoints(
    mode,
    innerSplit,
    carrierHorizonRadius,
  );
  const horizonRadius = mode === "zenith-230" ? 18 / 23 : mode === "cave-270" ? split : 1;
  return {
    mode,
    innerSplit: split,
    horizonRadius,
    carrierHorizonRadius: sourceGuideHasCarrierHorizon(mode) ? horizonCarrier : null,
    hasPhysicalHorizon: mode === "zenith-230",
    hasCarrierHorizon: sourceGuideHasCarrierHorizon(mode),
    hasBelowHorizonSection: mode === "zenith-230" || mode === "cave-270",
  };
}

export function sourceGuideCarrierHorizonRadius(
  mode: SourceProjectionMode,
  innerSplit: number | string | null | undefined = DEFAULT_SOURCE_INNER_GUIDE_SPLIT,
  carrierHorizonRadius?: number | string | null,
): number {
  return normalizeSourceGuideCarrierHorizonRadius(mode, innerSplit, carrierHorizonRadius);
}

export function sourceGuideBreakpoints(
  mode: SourceProjectionMode,
  innerSplit: number | string | null | undefined = DEFAULT_SOURCE_INNER_GUIDE_SPLIT,
  carrierHorizonRadius?: number | string | null,
): SourceGuideBreakpoint[] {
  const { innerSplit: split, carrierHorizonRadius: horizonCarrier } = normalizeSourceGuideBreakpoints(
    mode,
    innerSplit,
    carrierHorizonRadius,
  );
  const breakpoints: SourceGuideBreakpoint[] = [
    {
      id: "inner-split",
      label: innerSplitLabel(mode),
      radius: split,
      editable: true,
      role: "semantic-split",
    },
  ];

  if (mode === "zenith-230") {
    breakpoints.push({
      id: "physical-horizon",
      label: "Physical horizon carrier",
      radius: horizonCarrier,
      editable: true,
      role: "horizon",
    });
  }

  if (mode === "cave-270") {
    breakpoints.push({
      id: "carrier-horizon",
      label: "Eye-level horizon",
      radius: horizonCarrier,
      editable: true,
      role: "horizon",
    });
  }

  return breakpoints.sort((left, right) => left.radius - right.radius);
}

export function sourceGuideZones(
  mode: SourceProjectionMode,
  innerSplit: number | string | null | undefined = DEFAULT_SOURCE_INNER_GUIDE_SPLIT,
  carrierHorizonRadius?: number | string | null,
): SourceGuideZone[] {
  const { innerSplit: split, carrierHorizonRadius: horizon } = normalizeSourceGuideBreakpoints(
    mode,
    innerSplit,
    carrierHorizonRadius,
  );
  if (mode === "zenith-230") {
    return compactZones([
      { id: "sky", label: "Sky / overhead", startRadius: 0, endRadius: split, tone: "sky" },
      { id: "human-level", label: "Human-level band", startRadius: split, endRadius: horizon, tone: "horizon" },
      { id: "below-horizon", label: "Below-horizon band", startRadius: horizon, endRadius: 1, tone: "floor" },
    ]);
  }
  if (mode === "nadir-180") {
    return compactZones([
      { id: "floor", label: "Floor / lower world", startRadius: 0, endRadius: split, tone: "floor" },
      { id: "horizon", label: "Horizon surroundings", startRadius: split, endRadius: 1, tone: "horizon" },
    ]);
  }
  if (mode === "cave-270") {
    return compactZones([
      { id: "floor", label: "Floor carrier", startRadius: 0, endRadius: split, tone: "floor" },
      { id: "lower-wall", label: "Lower wall carrier", startRadius: split, endRadius: horizon, tone: "lower-wall" },
      { id: "upper-wall", label: "Upper wall carrier", startRadius: horizon, endRadius: 1, tone: "upper-wall" },
    ]);
  }
  return compactZones([
    { id: "sky", label: "Sky / overhead", startRadius: 0, endRadius: split, tone: "sky" },
    { id: "horizon", label: "Horizon / human-level", startRadius: split, endRadius: 1, tone: "horizon" },
  ]);
}

function innerSplitLabel(mode: SourceProjectionMode): string {
  if (mode === "nadir-180") return "Floor / horizon split";
  if (mode === "cave-270") return "Floor / wall seam";
  if (mode === "zenith-230") return "Sky / human-level split";
  return "Sky / horizon split";
}

function compactZones(zones: SourceGuideZone[]): SourceGuideZone[] {
  return zones.filter((zone) => zone.endRadius - zone.startRadius > 0.0001);
}

function numericGuideValue(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

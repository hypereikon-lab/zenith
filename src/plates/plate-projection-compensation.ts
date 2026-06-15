import { normalizeSourceProjectionMode, sourceProjectionCenterLabel } from "../geometry/source-projection.js";
import type { SourceProjectionMode } from "../geometry/source-projection.js";
import type { PlatePlacementInput } from "./plate-placement.js";

export function shouldCompensateProjectionCenterChange(
  previousMode: SourceProjectionMode | string | null | undefined,
  nextMode: SourceProjectionMode | string | null | undefined,
): boolean {
  return projectionCenter(previousMode) !== projectionCenter(nextMode);
}

export function compensatePlateSpinsForProjectionCenterChange<T extends PlatePlacementInput>(
  placements: readonly T[],
  previousMode: SourceProjectionMode | string | null | undefined,
  nextMode: SourceProjectionMode | string | null | undefined,
): T[] {
  if (!shouldCompensateProjectionCenterChange(previousMode, nextMode)) {
    return placements.map((placement) => ({ ...placement }));
  }
  return placements.map((placement) => ({
    ...placement,
    spin: normalizeDegrees((Number(placement.spin) || 0) + 180),
  }));
}

function projectionCenter(mode: SourceProjectionMode | string | null | undefined): "zenith" | "nadir" {
  return sourceProjectionCenterLabel(normalizeSourceProjectionMode(mode)).toLowerCase() as "zenith" | "nadir";
}

function normalizeDegrees(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

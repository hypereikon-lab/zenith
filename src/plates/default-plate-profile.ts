import defaultDepthMotionConfig from "../../docs/default-depth-motion-config.json" with { type: "json" };

type ConfigRecord = Record<string, unknown>;
type DefaultConfig = {
  plateSketch?: { activePlateIndex?: unknown; placements?: ConfigRecord[]; plates?: Array<{ name?: unknown }> };
};

const config = defaultDepthMotionConfig as DefaultConfig;
const plateSketch = config.plateSketch || {};

export const DEFAULT_ACTIVE_PLATE_INDEX = Math.max(0, Math.round(numberOr(plateSketch.activePlateIndex, 0)));

export const DEFAULT_PLATE_PLACEMENTS = Array.isArray(plateSketch.placements)
  ? plateSketch.placements.map((placement) => ({
      azimuth: numberOr(placement.azimuth, 0),
      radius: numberOr(placement.radius, 0.35),
      scale: numberOr(placement.scale ?? placement.width, 0.72),
      spin: numberOr(placement.spin, 0),
      opacity: numberOr(placement.opacity, 1),
      flipX: Boolean(placement.flipX),
      flipY: Boolean(placement.flipY),
    }))
  : [];

export const DEFAULT_PLATE_REFERENCES = Array.isArray(plateSketch.plates)
  ? plateSketch.plates
      .map((plate) => String(plate.name || "").trim())
      .filter(Boolean)
      .map((name) => ({
        name,
        url: `/default-plates/${encodeURIComponent(name)}`,
      }))
  : [];

function numberOr(value: unknown, defaultValue: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

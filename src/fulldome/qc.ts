import { clamp } from "../projection.js";
import type { FulldomeProfile } from "./profile.js";

export type FulldomeMotionSettingsLike = {
  nearMeters: number;
  farMeters: number;
  yawDegrees: number;
  pitchDegrees: number;
  rollDegrees: number;
  truckMeters: number;
  liftMeters: number;
  pushMeters: number;
  motionGain: number;
  depthContrast: number;
};

export type FulldomeQcSeverity = "ok" | "notice" | "warning";

export type FulldomeQcItem = {
  id: string;
  label: string;
  severity: FulldomeQcSeverity;
  value: string;
  threshold: string;
  note: string;
};

export type FulldomeMotionQualityReport = {
  schema: "zenith.fulldome-motion-qc";
  version: 1;
  status: "clear" | "watch" | "revise";
  summary: string;
  metrics: {
    durationSeconds: number;
    fps: number;
    endpointYawDegrees: number;
    endpointPitchDegrees: number;
    endpointRollDegrees: number;
    angularPathDegrees: number;
    peakAngularRateDegreesPerSecond: number;
    peakRollRateDegreesPerSecond: number;
    endpointTranslationMeters: number;
    endpointPushMeters: number;
    translationNearRatio: number;
    pushNearRatio: number;
    farNearRatio: number;
  };
  items: FulldomeQcItem[];
};

export function analyzeFulldomeMotionQuality(input: {
  profile: FulldomeProfile;
  settings: FulldomeMotionSettingsLike;
  durationSeconds?: number | string;
  fps?: number | string;
}): FulldomeMotionQualityReport {
  const durationSeconds = clamp(Number(input.durationSeconds) || 6, 0.1, 120);
  const fps = Math.max(0, Number(input.fps) || input.profile.master.fps || 0);
  const settings = input.settings;
  const gain = Math.max(0.0001, Number(settings.motionGain) || 1);
  const endpointYawDegrees = settings.yawDegrees * gain;
  const endpointPitchDegrees = settings.pitchDegrees * gain;
  const endpointRollDegrees = settings.rollDegrees * gain;
  const angularPathDegrees = Math.hypot(endpointYawDegrees, endpointPitchDegrees);
  const peakAngularRateDegreesPerSecond = (angularPathDegrees * 1.5) / durationSeconds;
  const peakRollRateDegreesPerSecond = (Math.abs(endpointRollDegrees) * 1.5) / durationSeconds;
  const endpointTruckMeters = settings.truckMeters * gain;
  const endpointLiftMeters = settings.liftMeters * gain;
  const endpointPushMeters = settings.pushMeters * gain;
  const endpointTranslationMeters = Math.hypot(endpointTruckMeters, endpointLiftMeters, endpointPushMeters);
  const nearMeters = Math.max(0.001, settings.nearMeters);
  const farNearRatio = Math.max(settings.farMeters, nearMeters) / nearMeters;
  const metrics = {
    durationSeconds,
    fps,
    endpointYawDegrees,
    endpointPitchDegrees,
    endpointRollDegrees,
    angularPathDegrees,
    peakAngularRateDegreesPerSecond,
    peakRollRateDegreesPerSecond,
    endpointTranslationMeters,
    endpointPushMeters,
    translationNearRatio: endpointTranslationMeters / nearMeters,
    pushNearRatio: Math.abs(endpointPushMeters) / nearMeters,
    farNearRatio,
  };

  const items = [
    qc("master-shape", !input.profile.master.square, "warning", {
      label: "Master shape",
      value: `${input.profile.master.width} x ${input.profile.master.height}`,
      threshold: "square domemaster",
      note: "Fulldome masters should remain square before venue-specific slicing or remap.",
    }),
    qc("guide-fps", fps > 0 && fps < 24, "notice", {
      label: "Guide FPS",
      value: fps ? `${round1(fps)} fps` : "unknown",
      threshold: "24 fps or higher for exhibition",
      note: "Low FPS can be fine for AI motion guides, but final dome masters should be checked at exhibition cadence.",
    }),
    qc("radius-overfill", input.profile.radiusScale > 1.02, "warning", {
      label: "Map radius",
      value: `${round1(input.profile.radiusScale)}x`,
      threshold: "1.02x max before crop risk",
      note: "Overfilling the source circle can clip horizon and below-horizon content during remaps.",
    }),
    qc("radius-underfill", input.profile.radiusScale < 0.98, "notice", {
      label: "Map radius",
      value: `${round1(input.profile.radiusScale)}x`,
      threshold: "near 1.0x",
      note: "Underfilling leaves extra border and can confuse image/video models that read the black area as content.",
    }),
    qc("angular-rate", metrics.peakAngularRateDegreesPerSecond > 10, rateSeverity(metrics.peakAngularRateDegreesPerSecond), {
      label: "Peak angular rate",
      value: `${round1(metrics.peakAngularRateDegreesPerSecond)} deg/s`,
      threshold: "watch above 10 deg/s",
      note: "Fast yaw/pitch motion is uncomfortable on domes and makes AI repairs less coherent.",
    }),
    qc("roll-angle", Math.abs(metrics.endpointRollDegrees) > 2, rollSeverity(Math.abs(metrics.endpointRollDegrees)), {
      label: "Roll endpoint",
      value: `${round1(metrics.endpointRollDegrees)} deg`,
      threshold: "watch above 2 deg",
      note: "Roll reads strongly in fulldome because the viewer has no rectangular frame to stabilize against.",
    }),
    qc("roll-rate", metrics.peakRollRateDegreesPerSecond > 3, rollRateSeverity(metrics.peakRollRateDegreesPerSecond), {
      label: "Peak roll rate",
      value: `${round1(metrics.peakRollRateDegreesPerSecond)} deg/s`,
      threshold: "watch above 3 deg/s",
      note: "Rolling camera motion should be treated as a deliberate special effect, not a default guide move.",
    }),
    qc("near-translation", metrics.translationNearRatio > 0.25, translationSeverity(metrics.translationNearRatio), {
      label: "Near-field travel",
      value: `${round1(metrics.endpointTranslationMeters)} m (${round1(metrics.translationNearRatio * 100)}% near)`,
      threshold: "watch above 25% of near plane",
      note: "Large camera offsets against close depth produce occlusion holes and strong dome parallax.",
    }),
    qc(
      "forward-push",
      metrics.endpointPushMeters < 0 && metrics.pushNearRatio > 0.18,
      metrics.pushNearRatio > 0.35 ? "warning" : "notice",
      {
        label: "Forward push",
        value: `${round1(metrics.endpointPushMeters)} m`,
        threshold: "watch above 18% of near plane",
        note: "Forward moves into sparse center sky often waste motion budget and expose reconstruction gaps.",
      },
    ),
    qc("depth-range", metrics.farNearRatio > 30, metrics.farNearRatio > 60 ? "warning" : "notice", {
      label: "Depth range",
      value: `${round1(metrics.farNearRatio)}x far/near`,
      threshold: "watch above 30x",
      note: "Without calibration, very wide depth ranges make two generated depth maps harder to normalize.",
    }),
    qc("depth-contrast", settings.depthContrast > 1.6 || settings.depthContrast < 0.65, "notice", {
      label: "Depth contrast",
      value: `${round1(settings.depthContrast)}x`,
      threshold: "0.65x to 1.6x",
      note: "Extreme contrast can make the 2.5D bridge overreact to Gemini tone differences.",
    }),
  ].filter((item): item is FulldomeQcItem => Boolean(item));

  const hasWarning = items.some((item) => item.severity === "warning");
  const hasNotice = items.some((item) => item.severity === "notice");
  const status = hasWarning ? "revise" : hasNotice ? "watch" : "clear";
  return {
    schema: "zenith.fulldome-motion-qc",
    version: 1,
    status,
    summary: formatFulldomeQcSummary(status, items),
    metrics,
    items,
  };
}

export function formatFulldomeQcSummary(
  status: FulldomeMotionQualityReport["status"],
  items: readonly FulldomeQcItem[],
): string {
  if (status === "clear") return "QC clear: dome profile and 2.5D motion are within conservative guide limits.";
  const warnings = items.filter((item) => item.severity === "warning").length;
  const notices = items.filter((item) => item.severity === "notice").length;
  if (warnings > 0) return `QC revise: ${warnings} warning${warnings === 1 ? "" : "s"}, ${notices} notice${notices === 1 ? "" : "s"}.`;
  return `QC watch: ${notices} notice${notices === 1 ? "" : "s"}.`;
}

export function formatFulldomeQcItems(items: readonly FulldomeQcItem[], maxItems = 3): string {
  if (items.length < 1) return "No production warnings";
  return items
    .slice(0, Math.max(1, maxItems))
    .map((item) => `${item.label}: ${item.value}`)
    .join("; ");
}

function qc(
  id: string,
  active: boolean,
  severity: FulldomeQcSeverity,
  detail: Omit<FulldomeQcItem, "id" | "severity">,
): FulldomeQcItem | null {
  if (!active) return null;
  return { id, severity, ...detail };
}

function rateSeverity(value: number): FulldomeQcSeverity {
  return value > 18 ? "warning" : "notice";
}

function rollSeverity(value: number): FulldomeQcSeverity {
  return value > 6 ? "warning" : "notice";
}

function rollRateSeverity(value: number): FulldomeQcSeverity {
  return value > 5 ? "warning" : "notice";
}

function translationSeverity(value: number): FulldomeQcSeverity {
  return value > 0.5 ? "warning" : "notice";
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

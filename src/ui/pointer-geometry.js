import { clamp } from "../projection.js";

export function flatMapMetricsFromClient(client, layout) {
  const rect = layout.flatRect;
  if (!rect) return null;
  const x = client.x - rect.x;
  const y = client.y - rect.y;
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
  const radius = Math.min(rect.width, rect.height) * 0.5;
  const cx = rect.x + rect.width * 0.5;
  const cy = rect.y + rect.height * 0.5;
  return {
    rect,
    radius,
    cx,
    cy,
    x: client.x,
    y: client.y,
    dx: (client.x - cx) / radius,
    dy: (client.y - cy) / radius,
  };
}

export function flatDomePointFromMetrics(metrics) {
  const r = Math.hypot(metrics.dx, metrics.dy);
  if (r > 1.02) return null;
  return {
    radius: clamp(r, 0, 1),
    azimuth: (((Math.atan2(metrics.dx, -metrics.dy) * 180) / Math.PI + 540) % 360) - 180,
  };
}

export function flatMapUvFromMetrics(metrics) {
  const r = Math.hypot(metrics.dx, metrics.dy);
  if (r > 1.02) return null;
  return {
    u: clamp((metrics.x - metrics.rect.x) / metrics.rect.width, 0, 1),
    v: clamp((metrics.y - metrics.rect.y) / metrics.rect.height, 0, 1),
  };
}

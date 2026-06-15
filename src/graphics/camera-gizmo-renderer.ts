import { cameraPreviewGuideLines } from "../scene/camera-gizmo.js";
import type { CameraRigDiagnostics } from "../geometry/camera-rig.js";
import type { CameraGizmoHandle, CameraGizmoLine, CameraGizmoModel, CameraGizmoViewport } from "../scene/camera-gizmo.js";

export type CameraGizmoRenderOptions = {
  background?: "author" | "transparent";
  activeToolLabel?: string;
};

export function renderCameraGizmoCanvas(ctx: CanvasRenderingContext2D, model: CameraGizmoModel, options: CameraGizmoRenderOptions = {}): void {
  const { width, height } = model.viewport;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  if (options.background !== "transparent") {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#071013");
    gradient.addColorStop(1, "#020304");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
  drawVignette(ctx, width, height);
  drawLines(ctx, model.lines);
  drawLines(ctx, model.selectedFrustum);
  drawPathSamples(ctx, model);
  drawHandles(ctx, model.handles);
  drawLegend(ctx, model, options.activeToolLabel);
  ctx.restore();
}

export function renderCameraPreviewCanvas(
  ctx: CanvasRenderingContext2D,
  viewport: CameraGizmoViewport,
  diagnostics: CameraRigDiagnostics | null,
  hasProxyImage: boolean,
): void {
  const { width, height } = viewport;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  if (!hasProxyImage) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#061316");
    gradient.addColorStop(0.5, "#0e151a");
    gradient.addColorStop(1, "#020405");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(117, 215, 229, 0.12)";
    ctx.lineWidth = 1;
    for (let i = -height; i < width; i += 34) {
      ctx.beginPath();
      ctx.moveTo(i, height);
      ctx.lineTo(i + height, 0);
      ctx.stroke();
    }
  }
  drawLines(ctx, cameraPreviewGuideLines(viewport));
  drawPreviewFrame(ctx, viewport, diagnostics, hasProxyImage);
  ctx.restore();
}

function drawLines(ctx: CanvasRenderingContext2D, lines: CameraGizmoLine[]): void {
  for (const line of lines) {
    ctx.save();
    ctx.strokeStyle = strokeForLine(line);
    ctx.lineWidth = line.kind === "path" ? 3 : line.kind === "frustum" ? 1.4 : 1;
    ctx.setLineDash(dashForLine(line));
    ctx.beginPath();
    ctx.moveTo(line.from.x, line.from.y);
    ctx.lineTo(line.to.x, line.to.y);
    ctx.stroke();
    if (line.label) {
      ctx.setLineDash([]);
      ctx.fillStyle = strokeForLine(line);
      ctx.font = "600 11px Inter, system-ui, sans-serif";
      ctx.fillText(line.label, line.to.x + 5, line.to.y - 5);
    }
    ctx.restore();
  }
}

function drawPathSamples(ctx: CanvasRenderingContext2D, model: CameraGizmoModel): void {
  for (const sample of model.pathSamples) {
    if (!sample.point) continue;
    ctx.save();
    ctx.fillStyle = sample.risk === "high" ? "#ee786d" : sample.risk === "medium" ? "#e8c061" : "#75d7e5";
    ctx.globalAlpha = sample.risk === "low" ? 0.42 : 0.72;
    ctx.beginPath();
    ctx.arc(sample.point.x, sample.point.y, sample.risk === "high" ? 3.2 : 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawHandles(ctx: CanvasRenderingContext2D, handles: CameraGizmoHandle[]): void {
  for (const handle of handles) {
    ctx.save();
    const radius = handle.kind === "pivot" ? 6 : handle.selected ? 9 : 7;
    ctx.fillStyle = handle.kind === "pivot" ? "rgba(232, 192, 97, 0.9)" : handle.selected ? "rgba(117, 215, 229, 0.95)" : "rgba(233, 241, 243, 0.72)";
    ctx.strokeStyle = handle.risk === "high" ? "#ee786d" : handle.risk === "medium" ? "#e8c061" : "rgba(255, 255, 255, 0.82)";
    ctx.lineWidth = handle.selected ? 2.4 : 1.4;
    ctx.beginPath();
    if (handle.kind === "pivot") {
      ctx.rect(handle.point.x - radius, handle.point.y - radius, radius * 2, radius * 2);
    } else {
      ctx.arc(handle.point.x, handle.point.y, radius, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
    if (handle.selected) {
      ctx.fillStyle = "#d9f8fc";
      ctx.font = "600 12px Inter, system-ui, sans-serif";
      ctx.fillText(handle.label, handle.point.x + 11, handle.point.y - 9);
    }
    ctx.restore();
  }
}

function drawLegend(ctx: CanvasRenderingContext2D, model: CameraGizmoModel, activeToolLabel?: string): void {
  const padding = 12;
  const diagnostics = model.selectedDiagnostics;
  const lines = [
    activeToolLabel ? `Tool: ${activeToolLabel}` : "Tool: Select",
    diagnostics ? `Risk: ${diagnostics.risk} / ${Math.round(diagnostics.expectedDisocclusion * 100)}%` : "Risk: no keyframe",
    `View: ${model.authorView.yawDegrees.toFixed(0)} deg yaw, ${model.authorView.pitchDegrees.toFixed(0)} deg pitch`,
  ];
  ctx.save();
  ctx.fillStyle = "rgba(2, 4, 5, 0.72)";
  ctx.strokeStyle = "rgba(117, 215, 229, 0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(padding, padding, 218, 72, 8);
  ctx.fill();
  ctx.stroke();
  ctx.font = "600 11px Inter, system-ui, sans-serif";
  lines.forEach((line, index) => {
    ctx.fillStyle = index === 1 && diagnostics?.risk === "high" ? "#ee786d" : index === 1 && diagnostics?.risk === "medium" ? "#e8c061" : "#c8d6d8";
    ctx.fillText(line, padding + 10, padding + 20 + index * 18);
  });
  ctx.restore();
}

function drawVignette(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const gradient = ctx.createRadialGradient(width * 0.5, height * 0.48, Math.min(width, height) * 0.12, width * 0.5, height * 0.5, Math.max(width, height) * 0.65);
  gradient.addColorStop(0, "rgba(117, 215, 229, 0.05)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.48)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawPreviewFrame(ctx: CanvasRenderingContext2D, viewport: CameraGizmoViewport, diagnostics: CameraRigDiagnostics | null, hasProxyImage: boolean): void {
  const width = viewport.width;
  const height = viewport.height;
  ctx.save();
  ctx.strokeStyle = diagnostics?.risk === "high" ? "rgba(238, 120, 109, 0.9)" : diagnostics?.risk === "medium" ? "rgba(232, 192, 97, 0.9)" : "rgba(117, 215, 229, 0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);
  ctx.fillStyle = "rgba(2, 4, 5, 0.72)";
  ctx.fillRect(12, height - 45, Math.min(width - 24, 360), 33);
  ctx.fillStyle = "#dbe7e9";
  ctx.font = "600 12px Inter, system-ui, sans-serif";
  const label = hasProxyImage ? "Rendered proxy view with camera-safe guides" : "Camera view frame / render proxy here";
  const risk = diagnostics ? ` · ${diagnostics.risk} disocclusion ${Math.round(diagnostics.expectedDisocclusion * 100)}%` : "";
  ctx.fillText(`${label}${risk}`, 22, height - 24);
  ctx.restore();
}

function strokeForLine(line: CameraGizmoLine): string {
  if (line.tone === "selected") return "rgba(117, 215, 229, 0.96)";
  if (line.tone === "warning") return "rgba(232, 192, 97, 0.54)";
  if (line.tone === "danger") return "rgba(238, 120, 109, 0.72)";
  if (line.tone === "primary") return "rgba(117, 215, 229, 0.66)";
  if (line.tone === "x") return "rgba(238, 120, 109, 0.58)";
  if (line.tone === "y") return "rgba(145, 220, 139, 0.58)";
  if (line.tone === "z") return "rgba(117, 154, 229, 0.58)";
  if (line.kind === "dome") return "rgba(117, 215, 229, 0.19)";
  if (line.kind === "cave") return "rgba(232, 192, 97, 0.26)";
  return "rgba(219, 231, 233, 0.15)";
}

function dashForLine(line: CameraGizmoLine): number[] {
  if (line.kind === "grid") return [3, 7];
  if (line.kind === "dome") return [5, 8];
  if (line.kind === "cave") return [8, 7];
  if (line.kind === "frustum" && line.tone !== "selected") return [5, 5];
  return [];
}

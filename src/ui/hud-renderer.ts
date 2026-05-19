import {
  domeDirectionToFlatPoint,
  plateUvToDisplayFlatPoint,
  sourceFlatToDisplayFlatPoint,
  visiblePlateUvBounds,
} from "../geometry/flat-domemaster.js";
import { sourceDomeDirectionFromScreenPoint, sourceDomeDirectionToScreenPoint } from "../geometry/dome-view.js";
import type { DomeViewProjection } from "../geometry/dome-view.js";
import { projectPlateScreenControls } from "../geometry/plate-screen-controls.js";
import type { PlateSource, ViewMode, WorkspaceId } from "../app/types.js";
import type { CssLayout, Rect } from "../graphics/render-layout.js";
import type { PlatePlacementInput, PreparedPlatePlacement } from "../plates/plate-placement.js";
import { directionFromPlateUv, preparePlatePlacement } from "../plates/plate-placement.js";
import { TAU, lerp, multiplyMat4, multiplyMat4Vec4, perspectiveLH } from "../projection.js";
import type { Mat4, Point2D, Vec3 } from "../projection.js";

export type HudOptions = {
  dpr: number;
  width: number;
  height: number;
  layout: CssLayout;
  viewMode: ViewMode;
  viewLabel: string;
  activeWorkspace: WorkspaceId;
  platesLength: number;
  showLabels: boolean;
  showSourceCircle: boolean;
  showZenith: boolean;
  radiusScale: number;
  flatRotationRadians: number;
  domeTiltRadians: number;
  mirror: boolean;
  plateCount: number;
  plateFit: string;
  editPlacement: boolean;
  platePlacements: PlatePlacementInput[];
  plates: PlateSource[];
  activePlateIndex: number;
  domeViewMatrix: Mat4 | null;
  fovDegrees: number;
  compassYaw: number;
};

export function drawZenithHud(ctx: CanvasRenderingContext2D | null, options: HudOptions): void {
  if (!ctx) return;
  const { dpr, width, height, layout, viewMode } = options;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textBaseline = "middle";

  if (viewMode === "split") {
    drawDivider(ctx, layout.splitX, height);
    drawPaneLabel(ctx, layout.flatPane, "Flat domemaster");
    drawPaneLabel(ctx, layout.domePane, "Projected dome");
    drawFlatHud(ctx, layout.flatRect, options);
    drawDomeHud(ctx, layout.domePane, options);
  } else if (viewMode === "flat") {
    drawPaneLabel(ctx, layout.fullRect, "Flat domemaster");
    drawFlatHud(ctx, layout.flatRect, options);
  } else {
    drawPaneLabel(ctx, layout.fullRect, options.viewLabel);
    drawDomeHud(ctx, layout.fullRect, options);
  }

  drawCompass(ctx, width, height, options);
}

function drawPaneLabel(ctx: CanvasRenderingContext2D, rect: Rect, label: string): void {
  ctx.save();
  ctx.fillStyle = "rgba(6, 10, 13, 0.58)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.lineWidth = 1;
  roundRect(ctx, rect.x + 16, rect.y + 16, Math.min(170, rect.width - 32), 30, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(230, 244, 248, 0.9)";
  ctx.fillText(label, rect.x + 28, rect.y + 31);
  ctx.restore();
}

function drawDivider(ctx: CanvasRenderingContext2D, x: number, height: number): void {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
  ctx.restore();
}

function drawFlatHud(ctx: CanvasRenderingContext2D, rect: Rect, options: HudOptions): void {
  const showPatchHud = shouldShowPatchHud(options);
  if (!options.showLabels && !options.showSourceCircle && !showPatchHud) return;

  const cx = rect.x + rect.width * 0.5;
  const cy = rect.y + rect.height * 0.5;
  const mapRadius = Math.min(rect.width, rect.height) * 0.5;
  const radius = mapRadius * options.radiusScale;
  ctx.save();
  if (options.showSourceCircle) {
    ctx.strokeStyle = "rgba(210, 247, 255, 0.42)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.stroke();
  }
  if (options.showLabels) {
    ctx.fillStyle = "rgba(230, 244, 248, 0.86)";
    ctx.textAlign = "center";
    drawTextAt(ctx, "N", cx, cy - radius - 13);
    drawTextAt(ctx, "E", cx + radius + 13, cy);
    drawTextAt(ctx, "S", cx, cy + radius + 13);
    drawTextAt(ctx, "W", cx - radius - 13, cy);
  }
  if (showPatchHud) {
    drawPlatePlacementHud(ctx, rect, radius, Number(options.flatRotationRadians) || 0, options);
  }
  ctx.restore();
}

function drawPlatePlacementHud(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  radius: number,
  flatRotation: number,
  options: HudOptions,
): void {
  const cx = rect.x + rect.width * 0.5;
  const cy = rect.y + rect.height * 0.5;
  const plateCount = Math.max(1, options.plateCount);
  ctx.save();
  ctx.lineWidth = 1.4;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let index = 0; index < plateCount; index += 1) {
    if (!options.platePlacements[index]) continue;
    const placement = preparePlatePlacement(options.platePlacements[index], options.plates?.[index]);
    const active = index === options.activePlateIndex;
    ctx.strokeStyle = active ? "rgba(180, 255, 225, 0.92)" : "rgba(210, 247, 255, 0.42)";
    ctx.fillStyle = active ? "rgba(180, 255, 225, 0.96)" : "rgba(230, 244, 248, 0.72)";
    const bounds = visiblePlateUvBounds(placement, options.plateFit);
    drawPlacementOutline(ctx, placement, bounds, cx, cy, radius, flatRotation);
    const center = sourceFlatToDisplayFlatPoint(domeDirectionToFlatPoint(placement.center, cx, cy, radius), cx, cy, flatRotation);
    if (center) {
      ctx.beginPath();
      ctx.arc(center.x, center.y, active ? 4.5 : 3, 0, TAU);
      ctx.fill();
      drawTextAt(ctx, String(index + 1), center.x, center.y - 13);
    }
    if (active && options.editPlacement) {
      drawPlacementHandles(ctx, placement, bounds, cx, cy, radius, flatRotation);
    }
  }
  ctx.restore();
}

function drawPlacementOutline(
  ctx: CanvasRenderingContext2D,
  placement: PreparedPlatePlacement,
  bounds: { minU: number; minV: number; maxU: number; maxV: number },
  cx: number,
  cy: number,
  radius: number,
  flatRotation: number,
): void {
  const segments = 12;
  ctx.beginPath();
  let started = false;
  const edges = [
    [bounds.minU, bounds.minV, bounds.maxU, bounds.minV],
    [bounds.maxU, bounds.minV, bounds.maxU, bounds.maxV],
    [bounds.maxU, bounds.maxV, bounds.minU, bounds.maxV],
    [bounds.minU, bounds.maxV, bounds.minU, bounds.minV],
  ];
  for (const edge of edges) {
    for (let step = 0; step <= segments; step += 1) {
      const t = step / segments;
      const u = lerp(edge[0], edge[2], t);
      const v = lerp(edge[1], edge[3], t);
      const point = plateUvToDisplayFlatPoint(placement, u, v, cx, cy, radius, flatRotation);
      if (!point) {
        started = false;
        continue;
      }
      if (!started) {
        ctx.moveTo(point.x, point.y);
        started = true;
      } else {
        ctx.lineTo(point.x, point.y);
      }
    }
  }
  ctx.stroke();
}

function drawPlacementHandles(
  ctx: CanvasRenderingContext2D,
  placement: PreparedPlatePlacement,
  bounds: { minU: number; minV: number; maxU: number; maxV: number },
  cx: number,
  cy: number,
  radius: number,
  flatRotation: number,
): void {
  const handleUvs = [
    [bounds.minU, bounds.minV],
    [bounds.maxU, bounds.minV],
    [bounds.maxU, bounds.maxV],
    [bounds.minU, bounds.maxV],
  ];
  const points = handleUvs
    .map(([u, v]) => plateUvToDisplayFlatPoint(placement, u, v, cx, cy, radius, flatRotation))
    .filter((point): point is Point2D => Boolean(point));
  const centerU = (bounds.minU + bounds.maxU) * 0.5;
  const top = plateUvToDisplayFlatPoint(placement, centerU, bounds.minV, cx, cy, radius, flatRotation);
  const rotate = plateUvToDisplayFlatPoint(placement, centerU, bounds.minV - 0.18, cx, cy, radius, flatRotation);

  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.fillStyle = "rgba(6, 10, 13, 0.88)";
  ctx.strokeStyle = "rgba(180, 255, 225, 0.96)";
  if (top && rotate) {
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(rotate.x, rotate.y);
    ctx.stroke();
  }
  for (const point of points) {
    drawSquareHandle(ctx, point.x, point.y, 7);
  }
  if (rotate) {
    drawRoundHandle(ctx, rotate.x, rotate.y, 7.5);
  }
  ctx.restore();
}

function drawSquareHandle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  roundRect(ctx, x - size * 0.5, y - size * 0.5, size, size, 2);
  ctx.fill();
  ctx.stroke();
}

function drawRoundHandle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
  ctx.stroke();
}

function drawDomeHud(ctx: CanvasRenderingContext2D, rect: Rect, options: HudOptions): void {
  if (!options.domeViewMatrix) return;
  const projection = perspectiveLH((options.fovDegrees * Math.PI) / 180, rect.width / rect.height, 0.01, 20);
  const mvp = multiplyMat4(projection, options.domeViewMatrix);
  const domeProjection: DomeViewProjection = {
    rect,
    viewMatrix: options.domeViewMatrix,
    fovDegrees: options.fovDegrees,
    sourceRotationRadians: options.flatRotationRadians,
    domeTiltRadians: options.domeTiltRadians,
    mirror: options.mirror,
    cutaway: options.viewMode === "cutaway",
  };

  const showPatchHud = shouldShowPatchHud(options);
  if (showPatchHud) {
    drawDomePlacementHud(ctx, domeProjection, options);
  }

  if (options.showLabels) {
    const points: Array<[string, Vec3]> = [
      ["N", [0, 0, 1]],
      ["E", [1, 0, 0]],
      ["S", [0, 0, -1]],
      ["W", [-1, 0, 0]],
    ];
    if (options.showZenith) {
      points.push(["Z", [0, 1, 0]]);
    }
    ctx.save();
    ctx.fillStyle = "rgba(230, 244, 248, 0.82)";
    ctx.textAlign = "center";
    for (const [label, point] of points) {
      const projected = projectPoint(mvp, point, rect);
      if (projected) {
        drawTextAt(ctx, label, projected.x, projected.y);
      }
    }
    ctx.restore();
  }
}

function drawDomePlacementHud(
  ctx: CanvasRenderingContext2D,
  projection: DomeViewProjection,
  options: HudOptions,
): void {
  const plateCount = Math.max(1, options.plateCount);
  ctx.save();
  ctx.lineWidth = 1.4;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let index = 0; index < plateCount; index += 1) {
    if (!options.platePlacements[index]) continue;
    const placement = preparePlatePlacement(options.platePlacements[index], options.plates?.[index]);
    const active = index === options.activePlateIndex;
    ctx.strokeStyle = active ? "rgba(180, 255, 225, 0.92)" : "rgba(210, 247, 255, 0.42)";
    ctx.fillStyle = active ? "rgba(180, 255, 225, 0.96)" : "rgba(230, 244, 248, 0.72)";
    const bounds = visiblePlateUvBounds(placement, options.plateFit);
    drawDomePlacementOutline(ctx, placement, bounds, projection);
    const center = sourceDomeDirectionToScreenPoint(placement.center, projection);
    if (center) {
      ctx.beginPath();
      ctx.arc(center.x, center.y, active ? 4.5 : 3, 0, TAU);
      ctx.fill();
      drawTextAt(ctx, String(index + 1), center.x, center.y - 13);
    }
    if (active && options.editPlacement) {
      drawDomePlacementHandles(ctx, placement, bounds, projection);
    }
  }
  ctx.restore();
}

function drawDomePlacementOutline(
  ctx: CanvasRenderingContext2D,
  placement: PreparedPlatePlacement,
  bounds: { minU: number; minV: number; maxU: number; maxV: number },
  projection: DomeViewProjection,
): void {
  const segments = 12;
  ctx.beginPath();
  let started = false;
  const edges = [
    [bounds.minU, bounds.minV, bounds.maxU, bounds.minV],
    [bounds.maxU, bounds.minV, bounds.maxU, bounds.maxV],
    [bounds.maxU, bounds.maxV, bounds.minU, bounds.maxV],
    [bounds.minU, bounds.maxV, bounds.minU, bounds.minV],
  ];
  for (const edge of edges) {
    for (let step = 0; step <= segments; step += 1) {
      const t = step / segments;
      const u = lerp(edge[0], edge[2], t);
      const v = lerp(edge[1], edge[3], t);
      const point = sourceDomeDirectionToScreenPoint(directionFromPlateUv(placement, u, v), projection);
      if (!point) {
        started = false;
        continue;
      }
      if (!started) {
        ctx.moveTo(point.x, point.y);
        started = true;
      } else {
        ctx.lineTo(point.x, point.y);
      }
    }
  }
  ctx.stroke();
}

function drawDomePlacementHandles(
  ctx: CanvasRenderingContext2D,
  placement: PreparedPlatePlacement,
  bounds: { minU: number; minV: number; maxU: number; maxV: number },
  projection: DomeViewProjection,
): void {
  const controls = projectPlateScreenControls(placement, bounds, {
    projectSourceDirection: (direction) => sourceDomeDirectionToScreenPoint(direction, projection),
    sourceDirectionAt: (point) => sourceDomeDirectionFromScreenPoint(point, projection),
    rect: projection.rect,
  });
  if (!controls) return;

  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.fillStyle = "rgba(6, 10, 13, 0.88)";
  ctx.strokeStyle = "rgba(180, 255, 225, 0.96)";
  if (controls.rotateAnchor && controls.rotateHandle) {
    ctx.beginPath();
    ctx.moveTo(controls.rotateAnchor.x, controls.rotateAnchor.y);
    ctx.lineTo(controls.rotateHandle.x, controls.rotateHandle.y);
    ctx.stroke();
  }
  for (const point of controls.scaleHandles) {
    drawSquareHandle(ctx, point.x, point.y, 7);
  }
  if (controls.rotateHandle) {
    drawRoundHandle(ctx, controls.rotateHandle.x, controls.rotateHandle.y, 7.5);
  }
  ctx.restore();
}

function drawCompass(ctx: CanvasRenderingContext2D, width: number, height: number, options: HudOptions): void {
  if (!options.showLabels) return;
  const x = width - 46;
  const y = height - 102;
  const yaw = options.compassYaw;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "rgba(230, 244, 248, 0.34)";
  ctx.fillStyle = "rgba(230, 244, 248, 0.86)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, TAU);
  ctx.stroke();
  ctx.rotate(-yaw);
  ctx.beginPath();
  ctx.moveTo(0, -17);
  ctx.lineTo(5, -4);
  ctx.lineTo(0, -7);
  ctx.lineTo(-5, -4);
  ctx.closePath();
  ctx.fill();
  ctx.rotate(yaw);
  ctx.textAlign = "center";
  ctx.fillText("N", 0, -33);
  ctx.restore();
}

function shouldShowPatchHud(options: HudOptions): boolean {
  return options.platesLength >= 1 && (options.activeWorkspace === "create" || options.editPlacement);
}

function drawTextAt(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.58)";
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function projectPoint(mvp: Mat4, point: Vec3, rect: Rect): Point2D | null {
  const clip = multiplyMat4Vec4(mvp, [point[0], point[1], point[2], 1]);
  if (clip[3] <= 0.0001) return null;
  const x = clip[0] / clip[3];
  const y = clip[1] / clip[3];
  const z = clip[2] / clip[3];
  if (x < -1.1 || x > 1.1 || y < -1.1 || y > 1.1 || z < 0 || z > 1.05) return null;
  return {
    x: rect.x + (x * 0.5 + 0.5) * rect.width,
    y: rect.y + (1 - (y * 0.5 + 0.5)) * rect.height,
  };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width * 0.5, height * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

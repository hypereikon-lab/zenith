import {
  MAX_PLATE_SCALE,
  MIN_PLATE_SCALE,
  clonePlateCornerOffsets,
  cornerOffsetFromLocal,
  directionToPlateLocal,
  normalizePlatePlacement,
  plateCornerLocal,
  plateLocalToWarpedUv,
  preparePlatePlacement,
} from "../plates/plate-placement.js";
import type { PlateCorner, PlatePlacementInput } from "../plates/plate-placement.js";
import { clamp } from "../projection.js";
import {
  clientEventToCanvasPoint,
  domeDirectionToFlatPoint,
  flatDisplayPointToDomeDirection,
  flatDisplayPointToDomePoint,
  flatMapRadius,
  sourceFlatToDisplayFlatPoint,
  visiblePlateUvBounds,
} from "../geometry/flat-domemaster.js";
import type { DomePoint } from "../geometry/flat-domemaster.js";
import {
  sourceDomeDirectionFromScreenPoint,
  sourceDomeDirectionToScreenPoint,
  sourceDomePointFromScreenPoint,
} from "../geometry/dome-view.js";
import type { DomeViewProjection } from "../geometry/dome-view.js";
import { projectPlateScreenControls } from "../geometry/plate-screen-controls.js";
import type {
  ActiveDomeCamera,
  CameraState,
  PlacementDrag,
  PlateHandleHit,
  PointerMode,
  ScheduleWorkspaceAutosave,
  ZenithPointerState,
} from "../app/types.js";
import type { PreparedPlatePlacement } from "../plates/plate-placement.js";
import type { Mat4, Point2D, Vec3 } from "../projection.js";
import type { FlatLayout, FlatPointerMetrics } from "./pointer-geometry.js";
import { flatMapMetricsFromClient } from "./pointer-geometry.js";

const HANDLE_RADIUS = 13;
const MOVE_DRAG_THRESHOLD = 3;
const PLATE_HIT_LOCAL_PAD = 0.012;
type PlateGeometryHandle = Point2D & ({ action: "scale"; corner: PlateCorner } | { action: "rotate" });
type PlateGeometry = { center: Point2D; handles: PlateGeometryHandle[] };
type PlateHit = { index: number; handle: PlateHandleHit };
type PointerCanvas = {
  clientWidth: number;
  clientHeight: number;
  classList: Pick<DOMTokenList, "add" | "remove">;
  setPointerCapture: (pointerId: number) => void;
  releasePointerCapture: (pointerId: number) => void;
  getBoundingClientRect?: () => { left: number; top: number; width: number; height: number };
};
type PointerLike = { clientX: number; clientY: number; pointerId: number; altKey?: boolean; shiftKey?: boolean };
type WheelLike = { clientX: number; clientY: number; deltaY: number; shiftKey?: boolean; preventDefault: () => void };
type ValueControl = { value: string };
type CheckboxControl = { checked: boolean };
type PointerToolControls = {
  editPlacement: CheckboxControl;
  activePlate: ValueControl;
  fov: ValueControl;
  theaterPitch: ValueControl;
  radiusScale?: ValueControl;
  rotation?: ValueControl;
  domeTilt?: ValueControl;
  mirror?: CheckboxControl;
  plateFit?: ValueControl;
  plateCornerMode?: ValueControl;
};
type PointerToolState = {
  viewMode: string;
  plates: Array<{ name?: string; aspect?: number | string | null }>;
  activePlateIndex: number;
  platePlacements: PlatePlacementInput[];
  pointer: ZenithPointerState;
  camera: Partial<CameraState> & Record<string, number | undefined>;
};
type PointerToolOptions = {
  canvas: PointerCanvas;
  state: PointerToolState;
  controls: PointerToolControls;
  getCssLayout: (width: number, height: number) => FlatLayout;
  activeDomeCamera: () => ActiveDomeCamera;
  currentDomeViewMatrix?: () => Mat4 | null;
  actions: {
    ensurePlatePlacements: () => void;
    resolvedPlateCount?: () => number;
    updatePatchControlsFromActive: () => void;
    updatePlateSelect?: () => void;
    renderPlatePreviewNow?: () => void;
    schedulePlatePreview: (delay: number) => void;
    scheduleWorkspaceAutosave: ScheduleWorkspaceAutosave;
  };
};
type PlacementPointerMetrics = {
  sourceDirectionAt: (point: Point2D) => Vec3 | null;
  sourcePointAt: (point: Point2D) => DomePoint | null;
  projectSourceDirection: (direction: Vec3) => Point2D | null;
  rect?: { x: number; y: number; width: number; height: number } | null;
};

export function createPointerToolController({
  canvas,
  state,
  controls,
  getCssLayout,
  activeDomeCamera,
  currentDomeViewMatrix,
  actions,
}: PointerToolOptions) {
  function handlePointerDown(event: PointerLike): void {
    if (tryStartPlatePlacementDrag(event)) return;
    if (!canDragView(event)) return;
    beginPointerCapture(event, "view");
  }

  function handlePointerMove(event: PointerLike): void {
    if (!state.pointer.active) return;
    if (state.pointer.mode === "plate") {
      updatePlacementDrag(event);
      return;
    }
    const dx = event.clientX - state.pointer.x;
    const dy = event.clientY - state.pointer.y;
    state.pointer.x = event.clientX;
    state.pointer.y = event.clientY;

    const camera = activeDomeCamera();
    if (camera === "inside") {
      state.camera.insideYaw -= dx * 0.004;
      state.camera.insidePitch = clamp(state.camera.insidePitch + dy * 0.0035, -0.28, 1.42);
    } else if (camera === "theater") {
      state.camera.theaterYaw -= dx * 0.004;
      const nextPitch = clamp(Number(controls.theaterPitch.value) + dy * 0.045, 4, 68);
      controls.theaterPitch.value = String(nextPitch);
    } else {
      state.camera.orbitYaw -= dx * 0.004;
      state.camera.orbitPitch = clamp(state.camera.orbitPitch + dy * 0.0035, -0.2, 1.28);
    }
  }

  function handlePointerUp(event: PointerLike): void {
    const pointerMode = state.pointer.mode;
    if (state.pointer.active) {
      canvas.releasePointerCapture(event.pointerId);
    }
    canvas.classList.remove("dragging");
    state.pointer.active = false;
    state.pointer.mode = null;
    state.pointer.placementDrag = null;
    if (pointerMode) {
      actions.scheduleWorkspaceAutosave(pointerMode, pointerMode === "plate" ? 900 : 250);
    }
  }

  function handleWheel(event: WheelLike): void {
    if (tryHandlePlateWheel(event)) return;
    event.preventDefault();
    if (state.viewMode === "flat") return;
    if (["inside", "theater"].includes(activeDomeCamera())) {
      const nextFov = clamp(Number(controls.fov.value) + event.deltaY * 0.03, 45, 130);
      controls.fov.value = String(nextFov);
    } else {
      state.camera.orbitDistance = clamp(state.camera.orbitDistance + event.deltaY * 0.002, 1.45, 5.6);
    }
    actions.scheduleWorkspaceAutosave("camera", 350);
  }

  function tryStartPlatePlacementDrag(event: PointerLike): boolean {
    if (state.plates.length < 1) return false;
    if (!controls.editPlacement.checked) return false;
    actions.ensurePlatePlacements();
    const metrics = clientToPlacementMetrics(event);
    if (!metrics) return false;
    const hit = hitTestPlatePlacement(event, metrics);
    if (!hit) return tryStartEmptyDomeRotation(event, metrics);

    state.activePlateIndex = hit.index;
    actions.updatePlateSelect?.();
    actions.updatePatchControlsFromActive();
    const placement = state.platePlacements[state.activePlateIndex];
    if (!placement) return false;
    const drag = createPlacementDrag(event, metrics, hit, placement);
    if (!drag) return false;
    state.pointer.placementDrag = drag;
    beginPointerCapture(event, "plate");
    return true;
  }

  function tryStartEmptyDomeRotation(event: PointerLike, metrics: PlacementPointerMetrics): boolean {
    const point = clientEventToCanvasPoint(event, canvas);
    const direction = metrics.sourceDirectionAt(point);
    if (!direction) return false;
    const placement = state.platePlacements[state.activePlateIndex];
    const geometry = placementGeometry(state.activePlateIndex, metrics);
    if (!placement || !geometry?.center) return false;
    state.pointer.placementDrag = {
      action: "rotate",
      startSpin: Number(placement.spin) || 0,
      startAngle: Math.atan2(point.y - geometry.center.y, point.x - geometry.center.x),
      center: geometry.center,
      started: false,
    };
    beginPointerCapture(event, "plate");
    return true;
  }

  function createPlacementDrag(
    event: PointerLike,
    metrics: PlacementPointerMetrics,
    hit: PlateHit,
    placement: PlatePlacementInput,
  ): PlacementDrag | null {
    const geometry = placementGeometry(state.activePlateIndex, metrics);
    const point = clientEventToCanvasPoint(event, canvas);
    const center = geometry?.center || point;
    const handle = hit?.handle || { action: "move" };
    if (handle.action === "rotate") {
      return {
        action: "rotate",
        startSpin: Number(placement.spin) || 0,
        startAngle: Math.atan2(point.y - center.y, point.x - center.x),
        center,
      };
    }
    if (handle.action === "scale") {
      const direction = metrics.sourceDirectionAt(point);
      const prepared = preparePlatePlacement(placement, activePlate());
      const useWarpCorner =
        (event.altKey || event.shiftKey || controls.plateCornerMode?.value === "warp") && handle.corner;
      if (useWarpCorner && handle.corner) {
        return {
          action: "warp",
          corner: handle.corner,
          startLocal: direction ? directionToPlacementLocal(direction, prepared) : null,
          startCornerLocal: plateCornerLocal(prepared, handle.corner),
          startCornerOffsets: clonePlateCornerOffsets(prepared.cornerOffsets),
        };
      }
      return {
        action: "scale",
        handle,
        startScale: Number(normalizePlatePlacement(placement, activePlate()).scale) || 0.5,
        startLocal: direction ? directionToPlacementLocal(direction, prepared) : null,
      };
    }
    return {
      action: "move",
      startClient: point,
      startCenter: center,
      started: false,
    };
  }

  function updatePlacementDrag(event: PointerLike): void {
    const placement = state.platePlacements[state.activePlateIndex];
    if (!placement) return;
    const metrics = clientToPlacementMetrics(event);
    if (!metrics) return;
    const drag = state.pointer.placementDrag;
    if (!drag) {
      moveActivePlacement(event, metrics, null, placement);
    } else if (drag.action === "move") {
      moveActivePlacement(event, metrics, drag, placement);
    } else if (drag.action === "scale") {
      scaleActivePlacement(event, metrics, drag, placement);
    } else if (drag.action === "warp") {
      warpActivePlacement(event, metrics, drag, placement);
    } else if (drag.action === "rotate") {
      rotateActivePlacement(event, drag, placement);
    }
    actions.updatePatchControlsFromActive();
    actions.schedulePlatePreview(55);
  }

  function moveActivePlacement(
    event: PointerLike,
    metrics: PlacementPointerMetrics,
    drag: Extract<PlacementDrag, { action: "move" }> | null | undefined,
    placement: PlatePlacementInput,
  ): void {
    if (!drag) {
      const point = clientToDomePoint(event);
      if (!point) return;
      placement.azimuth = point.azimuth;
      placement.radius = point.radius;
      return;
    }
    const localPoint = clientEventToCanvasPoint(event, canvas);
    const nextCenter = {
      x: drag.startCenter.x + localPoint.x - drag.startClient.x,
      y: drag.startCenter.y + localPoint.y - drag.startClient.y,
    };
    if (!drag.started && distance(nextCenter, drag.startCenter) < MOVE_DRAG_THRESHOLD) return;
    drag.started = true;
    const domePoint = metrics.sourcePointAt(nextCenter);
    if (!domePoint) return;
    placement.azimuth = domePoint.azimuth;
    placement.radius = domePoint.radius;
  }

  function scaleActivePlacement(
    event: PointerLike,
    metrics: PlacementPointerMetrics,
    drag: Extract<PlacementDrag, { action: "scale" }>,
    placement: PlatePlacementInput,
  ): void {
    const direction = metrics.sourceDirectionAt(clientEventToCanvasPoint(event, canvas));
    if (!direction) return;
    const prepared = preparePlatePlacement(placement, activePlate());
    const local = directionToPlacementLocal(direction, prepared);
    if (!local) return;
    const startScale = clamp(Number(drag.startScale) || 0.5, MIN_PLATE_SCALE, MAX_PLATE_SCALE);
    const startLocal = drag.startLocal || {
      x: prepared.angularWidth * 0.5,
      y: prepared.angularHeight * 0.5,
    };
    const widthFactor = Math.abs(local.x) / Math.max(Math.abs(startLocal.x), 0.0001);
    const heightFactor = Math.abs(local.y) / Math.max(Math.abs(startLocal.y), 0.0001);
    const unclampedFactor = Math.max(widthFactor, heightFactor, 0.01);
    const factor = clamp(unclampedFactor, MIN_PLATE_SCALE / startScale, MAX_PLATE_SCALE / startScale);
    placement.scale = startScale * factor;
  }

  function rotateActivePlacement(
    event: PointerLike,
    drag: Extract<PlacementDrag, { action: "rotate" }>,
    placement: PlatePlacementInput,
  ): void {
    const point = clientEventToCanvasPoint(event, canvas);
    const currentAngle = Math.atan2(point.y - drag.center.y, point.x - drag.center.x);
    const deltaDegrees = ((currentAngle - drag.startAngle) * 180) / Math.PI;
    if (!drag.started && Math.abs(deltaDegrees) < MOVE_DRAG_THRESHOLD) return;
    drag.started = true;
    placement.spin = normalizeDegrees(drag.startSpin - deltaDegrees);
  }

  function warpActivePlacement(
    event: PointerLike,
    metrics: PlacementPointerMetrics,
    drag: Extract<PlacementDrag, { action: "warp" }>,
    placement: PlatePlacementInput,
  ): void {
    const direction = metrics.sourceDirectionAt(clientEventToCanvasPoint(event, canvas));
    if (!direction) return;
    const prepared = preparePlatePlacement({ ...placement, cornerOffsets: drag.startCornerOffsets }, activePlate());
    const local = directionToPlacementLocal(direction, prepared);
    if (!local) return;
    const targetLocal = drag.startLocal
      ? {
          x: drag.startCornerLocal.x + local.x - drag.startLocal.x,
          y: drag.startCornerLocal.y + local.y - drag.startLocal.y,
        }
      : local;
    const nextOffsets = clonePlateCornerOffsets(drag.startCornerOffsets);
    nextOffsets[drag.corner] = cornerOffsetFromLocal(prepared, drag.corner, targetLocal);
    placement.cornerOffsets = nextOffsets;
  }

  function tryHandlePlateWheel(event: WheelLike): boolean {
    if (!controls.editPlacement.checked || state.plates.length < 1) {
      return false;
    }
    const metrics = clientToPlacementMetrics(event);
    if (!metrics || !metrics.sourcePointAt(clientEventToCanvasPoint(event, canvas))) return false;
    event.preventDefault();
    actions.ensurePlatePlacements();
    const hit = hitTestPlatePlacement(event, metrics);
    if (!hit) return true;
    state.activePlateIndex = hit.index;
    actions.updatePlateSelect?.();
    const placement = state.platePlacements[state.activePlateIndex];
    if (!placement) return true;
    if (event.shiftKey) {
      placement.spin = normalizeDegrees((Number(placement.spin) || 0) - event.deltaY * 0.08);
    } else {
      const factor = Math.exp(-event.deltaY * 0.0015);
      const current = normalizePlatePlacement(placement, activePlate()).scale;
      placement.scale = clamp(current * factor, MIN_PLATE_SCALE, MAX_PLATE_SCALE);
    }
    actions.updatePatchControlsFromActive();
    actions.schedulePlatePreview(40);
    actions.scheduleWorkspaceAutosave("plate-wheel", 350);
    return true;
  }

  function hitTestPlatePlacement(event: PointerLike | WheelLike, metrics: PlacementPointerMetrics): PlateHit | null {
    const activeGeometry = placementGeometry(state.activePlateIndex, metrics);
    const point = clientEventToCanvasPoint(event, canvas);
    const direction = metrics.sourceDirectionAt(point);
    const handle = hitHandle(point, activeGeometry);
    const hitsActiveBody = direction ? hitPlateBodyByDirection(direction, state.activePlateIndex) : false;
    if (handle && shouldPreferHandleHit(point, handle, activeGeometry, hitsActiveBody)) {
      return { index: state.activePlateIndex, handle };
    }

    if (!direction) return null;
    const plateCount = actions.resolvedPlateCount?.() || state.platePlacements.length;
    for (let index = plateCount - 1; index >= 0; index -= 1) {
      if (!hitPlateBodyByDirection(direction, index)) continue;
      return { index, handle: { action: "move" } };
    }
    return null;
  }

  function shouldPreferHandleHit(
    point: Point2D,
    handle: PlateGeometryHandle,
    geometry: PlateGeometry | null,
    hitsActiveBody: boolean,
  ): boolean {
    if (!hitsActiveBody || !geometry?.center) return true;
    const handleDistance = distance(point, handle);
    const centerDistance = distance(point, geometry.center);
    return handleDistance <= Math.max(4, centerDistance * 0.55);
  }

  function hitPlateBodyByDirection(direction: Vec3, index: number): boolean {
    const placement = state.platePlacements[index];
    if (!placement) return false;
    const prepared = preparePlatePlacement(placement, state.plates[index]);
    const local = directionToPlacementLocal(direction, prepared);
    if (!local) return false;
    const bounds = visiblePlateUvBounds(prepared, controls.plateFit?.value);
    const uv = plateLocalToWarpedUv(local, prepared);
    if (!uv) return false;
    return (
      uv.x >= bounds.minU - PLATE_HIT_LOCAL_PAD &&
      uv.x <= bounds.maxU + PLATE_HIT_LOCAL_PAD &&
      uv.y >= bounds.minV - PLATE_HIT_LOCAL_PAD &&
      uv.y <= bounds.maxV + PLATE_HIT_LOCAL_PAD
    );
  }

  function hitHandle(point: Point2D, geometry: PlateGeometry | null): PlateGeometryHandle | null {
    if (!geometry?.handles) return null;
    for (const handle of geometry.handles) {
      if (distance(point, handle) <= HANDLE_RADIUS) {
        return handle;
      }
    }
    return null;
  }

  function placementGeometry(index: number, metrics: PlacementPointerMetrics): PlateGeometry | null {
    const placement = state.platePlacements[index];
    if (!placement) return null;
    const prepared = preparePlatePlacement(placement, state.plates[index]);
    const bounds = visiblePlateUvBounds(prepared, controls.plateFit?.value);
    const controlsGeometry = projectPlateScreenControls(prepared, bounds, metrics);
    if (!controlsGeometry) return null;
    const handles = [
      ...controlsGeometry.scaleHandles.map((point) => ({ ...point, action: "scale" as const, corner: point.corner })),
      controlsGeometry.rotateHandle ? { ...controlsGeometry.rotateHandle, action: "rotate" as const } : null,
    ].filter((handle): handle is PlateGeometryHandle => Boolean(handle));
    return {
      center: controlsGeometry.center,
      handles,
    };
  }

  function clientToDomePoint(event: PointerLike | WheelLike): DomePoint | null {
    const metrics = clientToPlacementMetrics(event);
    if (!metrics) return null;
    return metrics.sourcePointAt(clientEventToCanvasPoint(event, canvas));
  }

  function clientToPlacementMetrics(event: PointerLike | WheelLike): PlacementPointerMetrics | null {
    const point = clientEventToCanvasPoint(event, canvas);
    const layout = getCssLayout(canvas.clientWidth, canvas.clientHeight);
    const flatMetrics = flatMapMetricsFromClient(point, layout);
    if (flatMetrics) return createFlatPlacementMetrics(flatMetrics);
    return createDomePlacementMetrics(point, layout);
  }

  function canDragView(event: PointerLike): boolean {
    if (state.viewMode === "flat") return false;
    if (state.viewMode !== "split") return true;
    return clientEventToCanvasPoint(event, canvas).x > canvas.clientWidth * 0.5;
  }

  function screenToFlatDomePoint(point: Point2D, metrics: FlatPointerMetrics): DomePoint | null {
    return flatDisplayPointToDomePoint(point, metrics, {
      radiusScale: controls.radiusScale?.value ?? 1,
      rotationRadians: flatRotationRadians(),
    });
  }

  function screenToDomeDirection(point: Point2D, metrics: FlatPointerMetrics): Vec3 | null {
    return flatDisplayPointToDomeDirection(point, metrics, {
      radiusScale: controls.radiusScale?.value ?? 1,
      rotationRadians: flatRotationRadians(),
    });
  }

  function createFlatPlacementMetrics(metrics: FlatPointerMetrics): PlacementPointerMetrics {
    return {
      sourceDirectionAt: (point) => screenToDomeDirection(point, metrics),
      sourcePointAt: (point) => screenToFlatDomePoint(point, metrics),
      projectSourceDirection: (direction) => {
        const radius = flatMapRadius(metrics, controls.radiusScale?.value ?? 1);
        return sourceFlatToDisplayFlatPoint(
          domeDirectionToFlatPoint(direction, metrics.cx, metrics.cy, radius),
          metrics.cx,
          metrics.cy,
          flatRotationRadians(),
        );
      },
      rect: metrics.rect,
    };
  }

  function createDomePlacementMetrics(point: Point2D, layout: FlatLayout): PlacementPointerMetrics | null {
    const projection = domeViewProjection(layout);
    if (!projection || !sourceDomeDirectionFromScreenPoint(point, projection)) return null;
    return {
      sourceDirectionAt: (screenPoint) => sourceDomeDirectionFromScreenPoint(screenPoint, projection),
      sourcePointAt: (screenPoint) => sourceDomePointFromScreenPoint(screenPoint, projection),
      projectSourceDirection: (direction) => sourceDomeDirectionToScreenPoint(direction, projection),
      rect: projection.rect,
    };
  }

  function domeViewProjection(layout: FlatLayout): DomeViewProjection | null {
    const rect = layout.domeRect || layout.domePane || (state.viewMode !== "flat" ? layout.fullRect : null);
    const viewMatrix = currentDomeViewMatrix?.();
    if (!rect || !viewMatrix) return null;
    return {
      rect,
      viewMatrix,
      fovDegrees: Number(controls.fov.value) || 92,
      sourceRotationRadians: flatRotationRadians(),
      domeTiltRadians: ((Number(controls.domeTilt?.value) || 0) * Math.PI) / 180,
      mirror: Boolean(controls.mirror?.checked),
      cutaway: state.viewMode === "cutaway",
    };
  }

  function directionToPlacementLocal(direction: Vec3, placement: PreparedPlatePlacement): Point2D | null {
    return directionToPlateLocal(direction, placement);
  }

  function flatRotationRadians(): number {
    return ((Number(controls.rotation?.value) || 0) * Math.PI) / 180;
  }

  function activePlate(): PointerToolState["plates"][number] | null {
    return state.plates[state.activePlateIndex] || null;
  }

  function distance(a: Point2D, b: Point2D): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function normalizeDegrees(value: number): number {
    return ((((value + 180) % 360) + 360) % 360) - 180;
  }

  function beginPointerCapture(event: PointerLike, mode: PointerMode): void {
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("dragging");
    state.pointer.active = true;
    state.pointer.mode = mode;
    state.pointer.x = event.clientX;
    state.pointer.y = event.clientY;
  }

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleWheel,
  };
}

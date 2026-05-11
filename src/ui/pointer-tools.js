import {
  MAX_PLATE_SCALE,
  MIN_PLATE_SCALE,
  directionToPlateLocal,
  normalizePlatePlacement,
  preparePlatePlacement,
} from "../plates/plate-placement.js";
import { HALF_PI, clamp } from "../projection.js";
import { domeDirectionToFlatPoint, plateUvToFlatPoint, visiblePlateUvBounds } from "./hud-renderer.js";
import { flatDomePointFromMetrics, flatMapMetricsFromClient } from "./pointer-geometry.js";

const HANDLE_RADIUS = 13;
const MOVE_DRAG_THRESHOLD = 3;
const PLATE_HIT_LOCAL_PAD = 0.012;
export function createPointerToolController({ canvas, state, controls, getCssLayout, activeDomeCamera, actions }) {
  function handlePointerDown(event) {
    if (tryStartPlatePlacementDrag(event)) return;
    if (!canDragView(event)) return;
    beginPointerCapture(event, "view");
  }

  function handlePointerMove(event) {
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

  function handlePointerUp(event) {
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

  function handleWheel(event) {
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

  function tryStartPlatePlacementDrag(event) {
    if (state.plates.length < 1) return false;
    if (!controls.editPlacement.checked) return false;
    actions.ensurePlatePlacements();
    const metrics = clientToFlatMapMetrics(event);
    if (!metrics) return false;
    const hit = hitTestPlatePlacement(event, metrics);
    if (!hit) return tryStartEmptyDomeRotation(event, metrics);

    state.activePlateIndex = hit.index;
    actions.updatePlateSelect?.();
    const placement = state.platePlacements[state.activePlateIndex];
    if (!placement) return false;
    const drag = createPlacementDrag(event, metrics, hit, placement);
    if (!drag) return false;
    state.pointer.placementDrag = drag;
    beginPointerCapture(event, "plate");
    return true;
  }

  function tryStartEmptyDomeRotation(event, metrics) {
    const direction = screenToDomeDirection(clientToScreenPoint(event), metrics);
    if (!direction) return false;
    const placement = state.platePlacements[state.activePlateIndex];
    const geometry = placementGeometry(state.activePlateIndex, metrics);
    if (!placement || !geometry?.center) return false;
    state.pointer.placementDrag = {
      action: "rotate",
      startSpin: Number(placement.spin) || 0,
      startAngle: Math.atan2(event.clientY - geometry.center.y, event.clientX - geometry.center.x),
      center: geometry.center,
      started: false,
    };
    beginPointerCapture(event, "plate");
    return true;
  }

  function createPlacementDrag(event, metrics, hit, placement) {
    const geometry = placementGeometry(state.activePlateIndex, metrics);
    const center = geometry?.center || clientToScreenPoint(event);
    const handle = hit?.handle || { action: "move" };
    if (handle.action === "rotate") {
      return {
        action: "rotate",
        startSpin: Number(placement.spin) || 0,
        startAngle: Math.atan2(event.clientY - center.y, event.clientX - center.x),
        center,
      };
    }
    if (handle.action === "scale") {
      const direction = screenToDomeDirection(clientToScreenPoint(event), metrics);
      const prepared = preparePlatePlacement(placement, activePlate());
      return {
        action: "scale",
        handle,
        startScale: Number(normalizePlatePlacement(placement, activePlate()).scale) || 0.5,
        startLocal: direction ? directionToPlacementLocal(direction, prepared) : null,
      };
    }
    return {
      action: "move",
      startClient: clientToScreenPoint(event),
      startCenter: center,
      started: false,
    };
  }

  function updatePlacementDrag(event) {
    const placement = state.platePlacements[state.activePlateIndex];
    if (!placement) return;
    const metrics = clientToFlatMapMetrics(event);
    if (!metrics) return;
    const drag = state.pointer.placementDrag;
    if (!drag || drag.action === "move") {
      moveActivePlacement(event, metrics, drag, placement);
    } else if (drag.action === "scale") {
      scaleActivePlacement(event, metrics, drag, placement);
    } else if (drag.action === "rotate") {
      rotateActivePlacement(event, drag, placement);
    }
    actions.updatePatchControlsFromActive();
    actions.schedulePlatePreview(55);
  }

  function moveActivePlacement(event, metrics, drag, placement) {
    if (!drag) {
      const point = clientToFlatDomePoint(event);
      if (!point) return;
      placement.azimuth = point.azimuth;
      placement.radius = point.radius;
      return;
    }
    const nextCenter = {
      x: drag.startCenter.x + event.clientX - drag.startClient.x,
      y: drag.startCenter.y + event.clientY - drag.startClient.y,
    };
    if (!drag.started && distance(nextCenter, drag.startCenter) < MOVE_DRAG_THRESHOLD) return;
    drag.started = true;
    const point = screenToFlatDomePoint(nextCenter, metrics);
    if (!point) return;
    placement.azimuth = point.azimuth;
    placement.radius = point.radius;
  }

  function scaleActivePlacement(event, metrics, drag, placement) {
    const direction = screenToDomeDirection(clientToScreenPoint(event), metrics);
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

  function rotateActivePlacement(event, drag, placement) {
    const currentAngle = Math.atan2(event.clientY - drag.center.y, event.clientX - drag.center.x);
    const deltaDegrees = ((currentAngle - drag.startAngle) * 180) / Math.PI;
    if (!drag.started && Math.abs(deltaDegrees) < MOVE_DRAG_THRESHOLD) return;
    drag.started = true;
    placement.spin = normalizeDegrees(drag.startSpin - deltaDegrees);
  }

  function tryHandlePlateWheel(event) {
    if (!controls.editPlacement.checked || state.plates.length < 1 || !["flat", "split"].includes(state.viewMode)) {
      return false;
    }
    const metrics = clientToFlatMapMetrics(event);
    if (!metrics || !screenToFlatDomePoint(clientToScreenPoint(event), metrics)) return false;
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

  function hitTestPlatePlacement(event, metrics) {
    const activeGeometry = placementGeometry(state.activePlateIndex, metrics);
    const point = clientToScreenPoint(event);
    const handle = hitHandle(point, activeGeometry);
    if (handle) return { index: state.activePlateIndex, handle };

    const direction = screenToDomeDirection(point, metrics);
    if (!direction) return null;
    const plateCount = actions.resolvedPlateCount?.() || state.platePlacements.length;
    for (let index = plateCount - 1; index >= 0; index -= 1) {
      if (!hitPlateBodyByDirection(direction, index)) continue;
      return { index, handle: { action: "move" } };
    }
    return null;
  }

  function hitPlateBodyByDirection(direction, index) {
    const placement = state.platePlacements[index];
    if (!placement) return false;
    const prepared = preparePlatePlacement(placement, state.plates[index]);
    const local = directionToPlacementLocal(direction, prepared);
    if (!local) return false;
    const bounds = visiblePlateUvBounds(prepared, controls.plateFit?.value);
    const u = local.x / Math.max(prepared.angularWidth, 0.000001) + 0.5;
    const v = local.y / Math.max(prepared.angularHeight, 0.000001) + 0.5;
    return u >= bounds.minU - PLATE_HIT_LOCAL_PAD &&
      u <= bounds.maxU + PLATE_HIT_LOCAL_PAD &&
      v >= bounds.minV - PLATE_HIT_LOCAL_PAD &&
      v <= bounds.maxV + PLATE_HIT_LOCAL_PAD;
  }

  function hitHandle(point, geometry) {
    if (!geometry?.handles) return null;
    for (const handle of geometry.handles) {
      if (distance(point, handle) <= HANDLE_RADIUS) {
        return handle;
      }
    }
    return null;
  }

  function placementGeometry(index, metrics) {
    const placement = state.platePlacements[index];
    if (!placement) return null;
    const prepared = preparePlatePlacement(placement, state.plates[index]);
    const radius = flatMapRadius(metrics);
    const center = domeDirectionToFlatPoint(prepared.center, metrics.cx, metrics.cy, radius);
    if (!center) return null;
    const bounds = visiblePlateUvBounds(prepared, controls.plateFit?.value);
    const handlePoints = [
      [bounds.minU, bounds.minV],
      [bounds.maxU, bounds.minV],
      [bounds.maxU, bounds.maxV],
      [bounds.minU, bounds.maxV],
    ].map(([u, v]) => plateUvToFlatPoint(prepared, u, v, metrics.cx, metrics.cy, radius));
    const centerU = (bounds.minU + bounds.maxU) * 0.5;
    const rotate = plateUvToFlatPoint(prepared, centerU, bounds.minV - 0.18, metrics.cx, metrics.cy, radius);
    const handles = [
      handlePoints[0] ? { ...handlePoints[0], action: "scale" } : null,
      handlePoints[1] ? { ...handlePoints[1], action: "scale" } : null,
      handlePoints[2] ? { ...handlePoints[2], action: "scale" } : null,
      handlePoints[3] ? { ...handlePoints[3], action: "scale" } : null,
      rotate ? { ...rotate, action: "rotate" } : null,
    ].filter(Boolean);
    return {
      center,
      handles,
    };
  }

  function clientToFlatDomePoint(event) {
    if (!["flat", "split"].includes(state.viewMode)) return null;
    const metrics = clientToFlatMapMetrics(event);
    if (!metrics) return null;
    return screenToFlatDomePoint(clientToScreenPoint(event), metrics);
  }

  function clientToFlatMapMetrics(event) {
    const layout = getCssLayout(canvas.clientWidth, canvas.clientHeight);
    return flatMapMetricsFromClient({ x: event.clientX, y: event.clientY }, layout);
  }

  function canDragView(event) {
    if (state.viewMode === "flat") return false;
    if (state.viewMode !== "split") return true;
    return event.clientX > canvas.clientWidth * 0.5;
  }

  function screenToFlatDomePoint(point, metrics) {
    const radius = flatMapRadius(metrics);
    const dx = (point.x - metrics.cx) / radius;
    const dy = (point.y - metrics.cy) / radius;
    return flatDomePointFromMetrics({ ...metrics, dx, dy });
  }

  function screenToDomeDirection(point, metrics) {
    const radius = flatMapRadius(metrics);
    const dx = (point.x - metrics.cx) / radius;
    const dy = (point.y - metrics.cy) / radius;
    const r = Math.hypot(dx, dy);
    if (r > 1.02) return null;
    const theta = clamp(r, 0, 1) * HALF_PI;
    const azimuth = Math.atan2(dx, -dy);
    const sinTheta = Math.sin(theta);
    return [sinTheta * Math.sin(azimuth), Math.cos(theta), sinTheta * Math.cos(azimuth)];
  }

  function directionToPlacementLocal(direction, placement) {
    return directionToPlateLocal(direction, placement);
  }

  function flatMapRadius(metrics) {
    return metrics.radius * clamp(Number(controls.radiusScale.value) || 1, 0.2, 2);
  }

  function clientToScreenPoint(event) {
    return { x: event.clientX, y: event.clientY };
  }

  function activePlate() {
    return state.plates[state.activePlateIndex] || null;
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function normalizeDegrees(value) {
    return ((((value + 180) % 360) + 360) % 360) - 180;
  }

  function beginPointerCapture(event, mode) {
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

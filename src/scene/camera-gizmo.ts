import {
  addVec3,
  cameraBasisFromRigPose,
  cameraRigDiagnostics,
  lookAtPivot,
  orbitCameraAroundPivot,
  quaternionFromLookAt,
  rotateCameraLocal,
  translateCameraLocal,
} from "../geometry/camera-rig.js";
import { clamp, dot, normalize, scaleVec3, subtract, vectorLength } from "../projection.js";
import { cameraPoseAtTime } from "./camera-path-interpolation.js";
import { defaultRgbdCameraPose, normalizeRgbdCameraPath, normalizeRgbdCameraPose } from "./camera-path.js";
import type { CameraRigBasis } from "../geometry/camera-rig.js";
import type { Point2D, Vec3 } from "../projection.js";
import type { RgbdCameraKeyframe, RgbdCameraPath, RgbdCameraPose, RgbdSceneMap } from "./rgbd-scene-types.js";

export type CameraGizmoDragMode = "select" | "move-camera" | "move-pivot" | "rotate-camera" | "orbit-pivot" | "roll-camera" | "pan-view";
export type CameraGizmoHitKind = "keyframe" | "pivot" | "preview" | "empty";
export type CameraGizmoGuideKind = "axis" | "grid" | "dome" | "cave" | "bounds";
export type CameraGizmoRisk = "low" | "medium" | "high";

export type CameraGizmoViewport = {
  width: number;
  height: number;
  pixelRatio?: number;
};

export type CameraGizmoViewState = {
  target: Vec3;
  yawDegrees: number;
  pitchDegrees: number;
  distanceMeters: number;
  fovDegrees: number;
  showDomeGuide: boolean;
  showCaveGuide: boolean;
  showConfidenceVolume: boolean;
};

export type CameraGizmoProjectedPoint = Point2D & {
  depth: number;
  visible: boolean;
};

export type CameraGizmoLine = {
  id: string;
  kind: CameraGizmoGuideKind | "path" | "frustum" | "axis";
  from: Point2D;
  to: Point2D;
  label?: string;
  tone?: "muted" | "primary" | "selected" | "warning" | "danger" | "x" | "y" | "z";
  risk?: CameraGizmoRisk;
};

export type CameraGizmoHandle = {
  id: string;
  kind: CameraGizmoHitKind;
  keyframeId?: string;
  point: Point2D;
  world: Vec3;
  label: string;
  selected: boolean;
  risk: CameraGizmoRisk;
};

export type CameraGizmoSample = {
  id: string;
  timeSeconds: number;
  pose: RgbdCameraPose;
  point: Point2D | null;
  risk: CameraGizmoRisk;
  expectedDisocclusion: number;
};

export type CameraGizmoModel = {
  viewport: CameraGizmoViewport;
  authorView: CameraGizmoViewState;
  authorBasis: CameraRigBasis;
  lines: CameraGizmoLine[];
  handles: CameraGizmoHandle[];
  pathSamples: CameraGizmoSample[];
  selectedFrustum: CameraGizmoLine[];
  selectedKeyframeId: string | null;
  selectedPose: RgbdCameraPose | null;
  selectedDiagnostics: ReturnType<typeof cameraRigDiagnostics> | null;
};

export type CameraGizmoHit = {
  kind: CameraGizmoHitKind;
  keyframeId?: string;
  distancePixels: number;
};

export type CameraGizmoDragInput = {
  pose: RgbdCameraPose;
  mode: CameraGizmoDragMode;
  delta: Point2D;
  view: CameraGizmoViewState;
  viewport: CameraGizmoViewport;
};

export type CameraGizmoDragResult = {
  pose: RgbdCameraPose;
  view: CameraGizmoViewState;
};

const DEG_TO_RAD = Math.PI / 180;
const DEFAULT_VIEW: CameraGizmoViewState = {
  target: [0, 0.35, 1],
  yawDegrees: 34,
  pitchDegrees: -22,
  distanceMeters: 6.5,
  fovDegrees: 46,
  showDomeGuide: true,
  showCaveGuide: true,
  showConfidenceVolume: true,
};

export function defaultCameraGizmoView(): CameraGizmoViewState {
  return {
    ...DEFAULT_VIEW,
    target: [...DEFAULT_VIEW.target],
  };
}

export function buildCameraGizmoModel(
  path: RgbdCameraPath,
  selectedKeyframeId: string | null,
  view: CameraGizmoViewState,
  viewport: CameraGizmoViewport,
  scene: RgbdSceneMap | null = null,
): CameraGizmoModel {
  const normalizedPath = normalizeRgbdCameraPath(path);
  const authorBasis = authorViewBasis(view);
  const selectedKeyframe = findKeyframe(normalizedPath, selectedKeyframeId);
  const pathSamples = sampleCameraPathForGizmo(normalizedPath, viewport, view, 48);
  const lines: CameraGizmoLine[] = [
    ...buildWorldGuideLines(view, viewport, scene),
    ...buildPathLines(pathSamples),
    ...buildCameraAxisLines(normalizedPath.keyframes, selectedKeyframe?.id || null, view, viewport),
    ...buildCameraFrustumLines(normalizedPath.keyframes, selectedKeyframe?.id || null, view, viewport),
  ];
  const handles = buildCameraHandles(normalizedPath.keyframes, selectedKeyframe?.id || null, view, viewport);
  const selectedPose = selectedKeyframe?.pose || null;
  const selectedFrustum = selectedPose ? buildFrustumLinesForPose(selectedPose, view, viewport, selectedKeyframe?.id || "selected", true) : [];
  return {
    viewport,
    authorView: view,
    authorBasis,
    lines,
    handles,
    pathSamples,
    selectedFrustum,
    selectedKeyframeId: selectedKeyframe?.id || null,
    selectedPose,
    selectedDiagnostics: selectedPose ? cameraRigDiagnostics(selectedPose, defaultRgbdCameraPose()) : null,
  };
}

export function sampleCameraPathForGizmo(
  path: RgbdCameraPath,
  viewport: CameraGizmoViewport,
  view: CameraGizmoViewState,
  sampleCount = 48,
): CameraGizmoSample[] {
  const normalizedPath = normalizeRgbdCameraPath(path);
  const count = Math.max(2, Math.round(sampleCount));
  return Array.from({ length: count }, (_, index) => {
    const amount = count === 1 ? 0 : index / (count - 1);
    const timeSeconds = normalizedPath.durationSeconds * amount;
    const pose = cameraPoseAtTime(normalizedPath, timeSeconds);
    const diagnostics = cameraRigDiagnostics(pose, defaultRgbdCameraPose());
    return {
      id: `path-sample-${index}`,
      timeSeconds,
      pose,
      point: projectWorldPoint(pose.position, view, viewport),
      risk: diagnostics.risk,
      expectedDisocclusion: diagnostics.expectedDisocclusion,
    };
  });
}

export function projectWorldPoint(world: Vec3, view: CameraGizmoViewState, viewport: CameraGizmoViewport): CameraGizmoProjectedPoint | null {
  const basis = authorViewBasis(view);
  const relative = subtract(world, basis.position);
  const depth = dot(relative, basis.forward);
  if (depth <= 0.02) return null;
  const aspect = Math.max(0.0001, viewport.width / Math.max(1, viewport.height));
  const tanHalfFov = Math.tan((view.fovDegrees * DEG_TO_RAD) / 2);
  const ndcX = dot(relative, basis.right) / Math.max(0.0001, depth * tanHalfFov * aspect);
  const ndcY = dot(relative, basis.up) / Math.max(0.0001, depth * tanHalfFov);
  return {
    x: (ndcX * 0.5 + 0.5) * viewport.width,
    y: (0.5 - ndcY * 0.5) * viewport.height,
    depth,
    visible: Math.abs(ndcX) <= 1.08 && Math.abs(ndcY) <= 1.08,
  };
}

export function hitTestCameraGizmo(point: Point2D, model: CameraGizmoModel, radiusPixels = 18): CameraGizmoHit {
  let best: CameraGizmoHit = { kind: "empty", distancePixels: Infinity };
  for (const handle of model.handles) {
    const distance = Math.hypot(handle.point.x - point.x, handle.point.y - point.y);
    if (distance <= radiusPixels && distance < best.distancePixels) {
      best = {
        kind: handle.kind,
        keyframeId: handle.keyframeId,
        distancePixels: distance,
      };
    }
  }
  return best.distancePixels === Infinity ? { kind: "empty", distancePixels: Infinity } : best;
}

export function applyCameraGizmoDrag(input: CameraGizmoDragInput): CameraGizmoDragResult {
  const mode = input.mode;
  const pose = normalizeRgbdCameraPose(input.pose);
  if (mode === "pan-view") {
    const worldDelta = screenDeltaToWorldDelta(input.delta, input.view, input.viewport, vectorLength(subtract(pose.position, authorViewBasis(input.view).position)));
    return {
      pose,
      view: {
        ...input.view,
        target: subtract(input.view.target, worldDelta),
      },
    };
  }
  if (mode === "move-pivot") {
    const pivot = pose.pivot || addVec3(pose.position, cameraBasisFromRigPose(pose).forward);
    const worldDelta = screenDeltaToWorldDelta(input.delta, input.view, input.viewport, vectorLength(subtract(pivot, authorViewBasis(input.view).position)));
    return {
      pose: normalizeRgbdCameraPose({ ...pose, pivot: addVec3(pivot, worldDelta) }),
      view: input.view,
    };
  }
  if (mode === "move-camera") {
    const worldDelta = screenDeltaToWorldDelta(input.delta, input.view, input.viewport, vectorLength(subtract(pose.position, authorViewBasis(input.view).position)));
    return {
      pose: normalizeRgbdCameraPose({ ...pose, position: addVec3(pose.position, worldDelta) }),
      view: input.view,
    };
  }
  if (mode === "rotate-camera") {
    return {
      pose: rotateCameraLocal(pose, input.delta.x * 0.22, input.delta.y * 0.22, 0),
      view: input.view,
    };
  }
  if (mode === "roll-camera") {
    return {
      pose: rotateCameraLocal(pose, 0, 0, input.delta.x * 0.22),
      view: input.view,
    };
  }
  if (mode === "orbit-pivot") {
    return {
      pose: orbitCameraAroundPivot(pose, input.delta.x * 0.18, -input.delta.y * 0.18),
      view: input.view,
    };
  }
  return { pose, view: input.view };
}

export function applyCameraGizmoWheel(view: CameraGizmoViewState, deltaY: number): CameraGizmoViewState {
  const zoom = Math.exp(clamp(deltaY, -1000, 1000) * 0.0012);
  return {
    ...view,
    distanceMeters: clamp(view.distanceMeters * zoom, 0.8, 80),
  };
}

export function orbitAuthorView(view: CameraGizmoViewState, delta: Point2D): CameraGizmoViewState {
  return {
    ...view,
    yawDegrees: view.yawDegrees + delta.x * 0.18,
    pitchDegrees: clamp(view.pitchDegrees + delta.y * 0.16, -84, 84),
  };
}

export function fitCameraGizmoViewToPath(path: RgbdCameraPath, scene: RgbdSceneMap | null = null): CameraGizmoViewState {
  const normalizedPath = normalizeRgbdCameraPath(path);
  const points = normalizedPath.keyframes.map((keyframe) => keyframe.pose.position);
  if (scene?.cameraAssumptions.origin) points.push(scene.cameraAssumptions.origin);
  const center = averageVec3(points.length > 0 ? points : [[0, 0, 0]]);
  const maxDistance = points.reduce((largest, point) => Math.max(largest, vectorLength(subtract(point, center))), 1);
  return {
    ...defaultCameraGizmoView(),
    target: center,
    distanceMeters: clamp(maxDistance * 4.2 + 3.2, 2.5, 40),
  };
}

export function cameraPreviewGuideLines(viewport: CameraGizmoViewport): CameraGizmoLine[] {
  const width = viewport.width;
  const height = viewport.height;
  const thirdX = width / 3;
  const thirdY = height / 3;
  return [
    line("preview-third-x-a", "grid", [thirdX, 0], [thirdX, height], "muted"),
    line("preview-third-x-b", "grid", [thirdX * 2, 0], [thirdX * 2, height], "muted"),
    line("preview-third-y-a", "grid", [0, thirdY], [width, thirdY], "muted"),
    line("preview-third-y-b", "grid", [0, thirdY * 2], [width, thirdY * 2], "muted"),
    line("preview-center-x", "axis", [width * 0.5, height * 0.42], [width * 0.5, height * 0.58], "primary"),
    line("preview-center-y", "axis", [width * 0.42, height * 0.5], [width * 0.58, height * 0.5], "primary"),
  ];
}

export function nudgePoseFromGizmoKeyboard(pose: RgbdCameraPose, key: string, stepMeters = 0.1, stepDegrees = 2): RgbdCameraPose {
  if (key === "ArrowLeft") return translateCameraLocal(pose, -stepMeters, 0, 0);
  if (key === "ArrowRight") return translateCameraLocal(pose, stepMeters, 0, 0);
  if (key === "ArrowUp") return translateCameraLocal(pose, 0, 0, stepMeters);
  if (key === "ArrowDown") return translateCameraLocal(pose, 0, 0, -stepMeters);
  if (key === "w") return rotateCameraLocal(pose, 0, stepDegrees, 0);
  if (key === "s") return rotateCameraLocal(pose, 0, -stepDegrees, 0);
  if (key === "a") return rotateCameraLocal(pose, -stepDegrees, 0, 0);
  if (key === "d") return rotateCameraLocal(pose, stepDegrees, 0, 0);
  if (key === "q") return rotateCameraLocal(pose, 0, 0, -stepDegrees);
  if (key === "e") return rotateCameraLocal(pose, 0, 0, stepDegrees);
  if (key === "l") return lookAtPivot(pose);
  return pose;
}

function buildWorldGuideLines(view: CameraGizmoViewState, viewport: CameraGizmoViewport, scene: RgbdSceneMap | null): CameraGizmoLine[] {
  const lines: CameraGizmoLine[] = [];
  const radius = scene?.projectionProfile === "cave-270" ? 2 : 1.8;
  for (let index = -4; index <= 4; index += 1) {
    lines.push(projectedLine(`grid-x-${index}`, "grid", [-4, 0, index], [4, 0, index], view, viewport, "muted"));
    lines.push(projectedLine(`grid-z-${index}`, "grid", [index, 0, -4], [index, 0, 4], view, viewport, "muted"));
  }
  lines.push(projectedLine("axis-x", "axis", [-4.2, 0, 0], [4.2, 0, 0], view, viewport, "x", "X"));
  lines.push(projectedLine("axis-y", "axis", [0, -0.5, 0], [0, 3.5, 0], view, viewport, "y", "Y"));
  lines.push(projectedLine("axis-z", "axis", [0, 0, -4.2], [0, 0, 4.2], view, viewport, "z", "Z"));
  if (view.showDomeGuide) {
    lines.push(...buildCircleGuide("dome-equator", radius, 0, view, viewport, "dome"));
    lines.push(...buildVerticalArcGuide("dome-meridian-a", radius, 0, view, viewport, "dome"));
    lines.push(...buildVerticalArcGuide("dome-meridian-b", radius, Math.PI * 0.5, view, viewport, "dome"));
  }
  if (view.showCaveGuide) {
    const floor = [
      [-2, 0, -2],
      [2, 0, -2],
      [2, 0, 2],
      [-2, 0, 2],
    ] as Vec3[];
    const top = floor.map((point) => [point[0], 2.4, point[2]] as Vec3);
    for (let index = 0; index < 4; index += 1) {
      const next = (index + 1) % 4;
      lines.push(projectedLine(`cave-floor-${index}`, "cave", floor[index], floor[next], view, viewport, "warning"));
      lines.push(projectedLine(`cave-top-${index}`, "cave", top[index], top[next], view, viewport, "warning"));
      lines.push(projectedLine(`cave-wall-${index}`, "cave", floor[index], top[index], view, viewport, "warning"));
    }
  }
  return lines.filter((item) => item.from.x !== item.to.x || item.from.y !== item.to.y);
}

function buildPathLines(samples: CameraGizmoSample[]): CameraGizmoLine[] {
  const lines: CameraGizmoLine[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (!previous.point || !current.point) continue;
    lines.push({
      id: `path-segment-${index}`,
      kind: "path",
      from: previous.point,
      to: current.point,
      risk: current.risk,
      tone: current.risk === "high" ? "danger" : current.risk === "medium" ? "warning" : "primary",
    });
  }
  return lines;
}

function buildCameraAxisLines(
  keyframes: RgbdCameraKeyframe[],
  selectedKeyframeId: string | null,
  view: CameraGizmoViewState,
  viewport: CameraGizmoViewport,
): CameraGizmoLine[] {
  return keyframes.flatMap((keyframe) => {
    const basis = cameraBasisFromRigPose(keyframe.pose);
    const length = keyframe.id === selectedKeyframeId ? 0.55 : 0.34;
    const origin = keyframe.pose.position;
    return [
      projectedLine(`${keyframe.id}-right`, "axis", origin, addVec3(origin, scaleVec3(basis.right, length)), view, viewport, "x"),
      projectedLine(`${keyframe.id}-up`, "axis", origin, addVec3(origin, scaleVec3(basis.up, length)), view, viewport, "y"),
      projectedLine(`${keyframe.id}-forward`, "axis", origin, addVec3(origin, scaleVec3(basis.forward, length * 1.25)), view, viewport, "z"),
    ];
  });
}

function buildCameraFrustumLines(
  keyframes: RgbdCameraKeyframe[],
  selectedKeyframeId: string | null,
  view: CameraGizmoViewState,
  viewport: CameraGizmoViewport,
): CameraGizmoLine[] {
  return keyframes.flatMap((keyframe) => buildFrustumLinesForPose(keyframe.pose, view, viewport, keyframe.id, keyframe.id === selectedKeyframeId));
}

function buildFrustumLinesForPose(
  pose: RgbdCameraPose,
  view: CameraGizmoViewState,
  viewport: CameraGizmoViewport,
  id: string,
  selected: boolean,
): CameraGizmoLine[] {
  const corners = cameraFrustumCorners(pose, 16 / 9, selected ? 0.95 : 0.55);
  const tone = selected ? "selected" : "muted";
  const segments: [Vec3, Vec3, string][] = [
    [pose.position, corners[0], "ray-a"],
    [pose.position, corners[1], "ray-b"],
    [pose.position, corners[2], "ray-c"],
    [pose.position, corners[3], "ray-d"],
    [corners[0], corners[1], "edge-a"],
    [corners[1], corners[2], "edge-b"],
    [corners[2], corners[3], "edge-c"],
    [corners[3], corners[0], "edge-d"],
  ];
  return segments.map(([from, to, suffix]) => projectedLine(`${id}-frustum-${suffix}`, "frustum", from, to, view, viewport, tone));
}

function buildCameraHandles(
  keyframes: RgbdCameraKeyframe[],
  selectedKeyframeId: string | null,
  view: CameraGizmoViewState,
  viewport: CameraGizmoViewport,
): CameraGizmoHandle[] {
  const handles: CameraGizmoHandle[] = [];
  for (const keyframe of keyframes) {
    const point = projectWorldPoint(keyframe.pose.position, view, viewport);
    if (point?.visible) {
      const diagnostics = cameraRigDiagnostics(keyframe.pose, defaultRgbdCameraPose());
      handles.push({
        id: `${keyframe.id}-camera-handle`,
        kind: "keyframe",
        keyframeId: keyframe.id,
        point,
        world: keyframe.pose.position,
        label: keyframe.label,
        selected: keyframe.id === selectedKeyframeId,
        risk: diagnostics.risk,
      });
    }
    const pivot = keyframe.pose.pivot;
    const pivotPoint = pivot ? projectWorldPoint(pivot, view, viewport) : null;
    if (pivot && pivotPoint?.visible) {
      handles.push({
        id: `${keyframe.id}-pivot-handle`,
        kind: "pivot",
        keyframeId: keyframe.id,
        point: pivotPoint,
        world: pivot,
        label: `${keyframe.label} pivot`,
        selected: keyframe.id === selectedKeyframeId,
        risk: "low",
      });
    }
  }
  return handles;
}

function cameraFrustumCorners(pose: RgbdCameraPose, aspect: number, lengthMeters: number): [Vec3, Vec3, Vec3, Vec3] {
  const basis = cameraBasisFromRigPose(pose);
  const halfHeight = Math.tan((pose.fovDegrees * DEG_TO_RAD) / 2) * lengthMeters;
  const halfWidth = halfHeight * aspect;
  const center = addVec3(pose.position, scaleVec3(basis.forward, lengthMeters));
  return [
    addVec3(addVec3(center, scaleVec3(basis.right, -halfWidth)), scaleVec3(basis.up, halfHeight)),
    addVec3(addVec3(center, scaleVec3(basis.right, halfWidth)), scaleVec3(basis.up, halfHeight)),
    addVec3(addVec3(center, scaleVec3(basis.right, halfWidth)), scaleVec3(basis.up, -halfHeight)),
    addVec3(addVec3(center, scaleVec3(basis.right, -halfWidth)), scaleVec3(basis.up, -halfHeight)),
  ];
}

function authorViewBasis(view: CameraGizmoViewState): CameraRigBasis {
  const yaw = view.yawDegrees * DEG_TO_RAD;
  const pitch = view.pitchDegrees * DEG_TO_RAD;
  const forwardToTarget = normalize([Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)]);
  const position = subtract(view.target, scaleVec3(forwardToTarget, view.distanceMeters));
  return cameraBasisFromRigPose({
    position,
    orientation: quaternionFromLookAt(position, view.target),
    pivot: view.target,
    fovDegrees: view.fovDegrees,
    mode: "orbit",
  });
}

function screenDeltaToWorldDelta(delta: Point2D, view: CameraGizmoViewState, viewport: CameraGizmoViewport, depthMeters: number): Vec3 {
  const basis = authorViewBasis(view);
  const tanHalfFov = Math.tan((view.fovDegrees * DEG_TO_RAD) / 2);
  const metersPerPixel = (Math.max(0.1, depthMeters) * tanHalfFov * 2) / Math.max(1, viewport.height);
  return addVec3(
    scaleVec3(basis.right, delta.x * metersPerPixel),
    scaleVec3(basis.up, -delta.y * metersPerPixel),
  );
}

function projectedLine(
  id: string,
  kind: CameraGizmoLine["kind"],
  fromWorld: Vec3,
  toWorld: Vec3,
  view: CameraGizmoViewState,
  viewport: CameraGizmoViewport,
  tone: CameraGizmoLine["tone"] = "muted",
  label?: string,
): CameraGizmoLine {
  const from = projectWorldPoint(fromWorld, view, viewport);
  const to = projectWorldPoint(toWorld, view, viewport);
  return {
    id,
    kind,
    from: from || { x: 0, y: 0 },
    to: to || { x: 0, y: 0 },
    tone,
    label,
  };
}

function buildCircleGuide(id: string, radius: number, y: number, view: CameraGizmoViewState, viewport: CameraGizmoViewport, kind: CameraGizmoGuideKind): CameraGizmoLine[] {
  const lines: CameraGizmoLine[] = [];
  const points = 48;
  for (let index = 1; index <= points; index += 1) {
    const a0 = ((index - 1) / points) * Math.PI * 2;
    const a1 = (index / points) * Math.PI * 2;
    lines.push(projectedLine(`${id}-${index}`, kind, [Math.cos(a0) * radius, y, Math.sin(a0) * radius], [Math.cos(a1) * radius, y, Math.sin(a1) * radius], view, viewport));
  }
  return lines;
}

function buildVerticalArcGuide(id: string, radius: number, azimuth: number, view: CameraGizmoViewState, viewport: CameraGizmoViewport, kind: CameraGizmoGuideKind): CameraGizmoLine[] {
  const lines: CameraGizmoLine[] = [];
  const points = 24;
  for (let index = 1; index <= points; index += 1) {
    const t0 = ((index - 1) / points) * Math.PI;
    const t1 = (index / points) * Math.PI;
    const p0: Vec3 = [Math.cos(azimuth) * Math.sin(t0) * radius, Math.cos(t0) * radius, Math.sin(azimuth) * Math.sin(t0) * radius];
    const p1: Vec3 = [Math.cos(azimuth) * Math.sin(t1) * radius, Math.cos(t1) * radius, Math.sin(azimuth) * Math.sin(t1) * radius];
    lines.push(projectedLine(`${id}-${index}`, kind, p0, p1, view, viewport));
  }
  return lines;
}

function line(
  id: string,
  kind: CameraGizmoLine["kind"],
  from: [number, number],
  to: [number, number],
  tone: CameraGizmoLine["tone"] = "muted",
): CameraGizmoLine {
  return {
    id,
    kind,
    from: { x: from[0], y: from[1] },
    to: { x: to[0], y: to[1] },
    tone,
  };
}

function findKeyframe(path: RgbdCameraPath, selectedKeyframeId: string | null): RgbdCameraKeyframe | null {
  return path.keyframes.find((keyframe) => keyframe.id === selectedKeyframeId) || path.keyframes[0] || null;
}

function averageVec3(points: Vec3[]): Vec3 {
  const sum = points.reduce<Vec3>((accumulator, point) => addVec3(accumulator, point), [0, 0, 0]);
  return scaleVec3(sum, 1 / Math.max(1, points.length));
}

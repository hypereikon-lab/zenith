import { lookAtLH } from "../projection.js";
import { normalizeSourceProjectionMode } from "../geometry/source-projection.js";
import type { ActiveDomeCamera, ZenithState } from "../app/types.js";
import type { ZenithControls } from "../ui/dom.js";
import type { Vec3 } from "../projection.js";

type ViewCameraOptions = {
  state: ZenithState;
  controls: ZenithControls;
};

export function createViewCamera({ state, controls }: ViewCameraOptions) {
  function activeDomeCamera(): ActiveDomeCamera {
    if (state.viewMode === "theater") return "theater";
    return state.viewMode === "inside" ? "inside" : "orbit";
  }

  function currentCompassYaw() {
    const camera = activeDomeCamera();
    if (camera === "inside") return state.camera.insideYaw;
    if (camera === "theater") return state.camera.theaterYaw;
    return state.camera.orbitYaw;
  }

  function currentDomeViewMatrix() {
    const camera = activeDomeCamera();
    if (camera === "theater") return theaterViewMatrix();
    if (camera === "inside") return insideViewMatrix();
    return orbitViewMatrix();
  }

  function insideViewMatrix() {
    const yaw = state.camera.insideYaw;
    const pitch = state.camera.insidePitch;
    const forward: Vec3 = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
    return lookAtLH([0, 0, 0], forward, [0, 1, 0]);
  }

  function theaterViewMatrix() {
    const yaw = state.camera.theaterYaw;
    const pitch = (Number(controls.theaterPitch.value) * Math.PI) / 180;
    const eyeDrop = Number(controls.theaterEyeDrop.value);
    const seatBack = Number(controls.theaterSeatBack.value);
    const eye: Vec3 = [0, -eyeDrop, -seatBack];
    const forward: Vec3 = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
    return lookAtLH(eye, [eye[0] + forward[0], eye[1] + forward[1], eye[2] + forward[2]], [0, 1, 0]);
  }

  function orbitViewMatrix() {
    const { orbitYaw, orbitPitch, orbitDistance } = state.camera;
    const target: Vec3 = [0, orbitTargetY(), 0];
    const eye: Vec3 = [
      target[0] + orbitDistance * Math.cos(orbitPitch) * Math.sin(orbitYaw),
      target[1] + orbitDistance * Math.sin(orbitPitch),
      target[2] + orbitDistance * Math.cos(orbitPitch) * Math.cos(orbitYaw),
    ];
    return lookAtLH(eye, target, [0, 1, 0]);
  }

  function orbitTargetY(): number {
    if (state.viewMode === "cave") return 0;
    return normalizeSourceProjectionMode(controls.sourceProjection.value).startsWith("nadir") ? -0.42 : 0.42;
  }

  return {
    activeDomeCamera,
    currentCompassYaw,
    currentDomeViewMatrix,
    theaterViewMatrix,
  };
}

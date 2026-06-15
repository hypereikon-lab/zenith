import { describe, expect, test } from "vitest";
import { createViewController } from "./view-controller.js";
import { VIEW_LABELS } from "./app-state.js";
import type { ZenithState } from "./types.js";

describe("view controller projection-aware review modes", () => {
  test("uses lower-facing review labels and camera defaults for nadir projections", () => {
    const { controller, controls, state, readouts, buttons } = createFixture("cave-270");

    controller.updateUiState();
    expect(readouts.view).toBe("CAVE POV - CAVE 270");
    expect(buttons.inside.textContent).toBe("CAVE");
    expect(buttons.theater.textContent).toBe("Theater");
    expect(buttons.orbit.textContent).toBe("Lower orbit");
    expect(buttons.cave.textContent).toBe("CAVE");

    controller.resetCamera();
    expect(state.camera.insidePitch).toBeLessThan(0);
    expect(state.camera.orbitPitch).toBeLessThan(0);
    expect(Number(controls.theaterPitch.value)).toBeLessThan(0);

    controller.lookAtPreset("zenith");
    expect(state.camera.insidePitch).toBeLessThan(-1);
    expect(state.camera.orbitPitch).toBeLessThan(-1);

    controller.lookAtPreset("north");
    expect(state.camera.insidePitch).toBeCloseTo(-0.06, 5);
    expect(Number(controls.theaterPitch.value)).toBeCloseTo(-8, 5);
    expect(state.camera.orbitPitch).toBeCloseTo(-0.18, 5);
  });

  test("keeps upper-dome review labels and camera defaults for zenith projections", () => {
    const { controller, controls, state, readouts, buttons } = createFixture("zenith-230");

    controller.updateUiState();
    expect(readouts.view).toBe("Center POV - Zenith 230");
    expect(buttons.inside.textContent).toBe("Center");
    expect(buttons.theater.textContent).toBe("Theater");
    expect(buttons.orbit.textContent).toBe("Orbit");

    controller.resetCamera();
    expect(state.camera.insidePitch).toBeGreaterThan(0);
    expect(state.camera.orbitPitch).toBeGreaterThan(0);
    expect(Number(controls.theaterPitch.value)).toBeGreaterThan(0);
  });

  test("uses an above-room orbit when entering CAVE inspection", () => {
    const { controller, state, readouts } = createFixture("cave-270");
    state.camera.orbitPitch = -0.5;
    state.camera.orbitDistance = 3;

    controller.setViewMode("cave");

    expect(state.viewMode).toBe("cave");
    expect(readouts.view).toBe("CAVE room - CAVE 270");
    expect(state.camera.orbitPitch).toBeGreaterThan(0.7);
    expect(state.camera.orbitDistance).toBeGreaterThanOrEqual(4.4);
  });
});

function createFixture(sourceProjection: string) {
  const state = {
    viewMode: "inside",
    camera: {
      insideYaw: 0,
      insidePitch: 0.48,
      theaterYaw: 0,
      orbitYaw: -0.72,
      orbitPitch: 0.5,
      orbitDistance: 3,
    },
  } as ZenithState;
  const controls = {
    sourceProjection: { value: sourceProjection },
    fov: { value: "92" },
    theaterEyeDrop: { value: "0.34" },
    theaterSeatBack: { value: "0.58" },
    theaterPitch: { value: "28" },
    renderScale: { value: "1" },
    meshQuality: { value: "1" },
    radiusScale: { value: "1" },
    rotation: { value: "0" },
    domeTilt: { value: "0" },
    shellShade: { value: "0.34" },
    floorOpacity: { value: "0.5" },
    exposure: { value: "1" },
    overlayOpacity: { value: "0.24" },
    mirror: { checked: false },
    showRings: { checked: true },
    showSpokes: { checked: true },
    showHorizon: { checked: true },
    showLabels: { checked: true },
    showSourceCircle: { checked: true },
    showZenith: { checked: true },
    plateFit: { value: "contain" },
    plateFeather: { value: "0" },
  };
  const buttons = {
    inside: fakeButton("inside"),
    theater: fakeButton("theater"),
    orbit: fakeButton("orbit"),
    flat: fakeButton("flat"),
    split: fakeButton("split"),
    cave: fakeButton("cave"),
  };
  const readouts = { view: "" };
  const controller = createViewController({
    state,
    controls: controls as never,
    viewLabels: VIEW_LABELS,
    elements: {
      viewButtons: Object.values(buttons) as never,
    },
    actions: {
      setReadouts(next) {
        Object.assign(readouts, next);
      },
      scheduleWorkspaceAutosave() {},
    },
  });
  return { controller, controls, state, readouts, buttons };
}

function fakeButton(mode: string): HTMLButtonElement {
  return {
    dataset: { view: mode },
    textContent: "",
    classList: {
      toggle() {},
    },
  } as unknown as HTMLButtonElement;
}

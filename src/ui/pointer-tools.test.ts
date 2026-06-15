import { describe, expect, test } from "vitest";
import { physicalDomeDirectionFromSourceDirection, sourceDomeDirectionToScreenPoint } from "../geometry/dome-view.js";
import { sourceCaveDirectionToScreenPoint } from "../geometry/cave-view.js";
import { plateUvToFlatPoint, sourceFlatToDisplayFlatPoint } from "../geometry/flat-domemaster.js";
import { directionFromPlateUv, preparePlatePlacement } from "../plates/plate-placement.js";
import type { PlatePlacementInput } from "../plates/plate-placement.js";
import { lookAtLH } from "../projection.js";
import { createPointerToolController } from "./pointer-tools.js";

describe("pointer placement edit gate", () => {
  test("does not move patch placements while edit placement is unchecked", () => {
    const state = {
      viewMode: "flat",
      plates: [{ name: "plate.png" }],
      activePlateIndex: 0,
      platePlacements: [{ azimuth: 0, radius: 0.35 }],
      pointer: { active: false, mode: null as null, x: 0, y: 0 },
      camera: {},
    };
    const controls = {
      editPlacement: { checked: false },
      activePlate: { value: "0" },
      fov: { value: "92" },
      theaterPitch: { value: "28" },
    };
    const calls = { ensurePlatePlacements: 0, schedulePlatePreview: 0 };
    const controller = createPointerToolController({
      canvas: {
        clientWidth: 100,
        clientHeight: 100,
        setPointerCapture() {
          throw new Error("Pointer capture should not start.");
        },
        releasePointerCapture() {},
        classList: {
          add() {},
          remove() {},
        },
      },
      state,
      controls,
      getCssLayout: () => ({ flatRect: { x: 0, y: 0, width: 100, height: 100 } }),
      activeDomeCamera: () => "orbit",
      actions: {
        ensurePlatePlacements() {
          calls.ensurePlatePlacements += 1;
        },
        updatePatchControlsFromActive() {},
        schedulePlatePreview() {
          calls.schedulePlatePreview += 1;
        },
        scheduleWorkspaceAutosave() {},
      },
    });

    controller.handlePointerDown({ clientX: 50, clientY: 50, pointerId: 1 });

    expect(state.pointer.active).toBe(false);
    expect(state.platePlacements[0]).toEqual({ azimuth: 0, radius: 0.35 });
    expect(calls.ensurePlatePlacements).toBe(0);
    expect(calls.schedulePlatePreview).toBe(0);
  });

  test("does not move the active patch from an empty flat domemaster click", () => {
    const state = {
      viewMode: "flat",
      plates: [{ name: "plate.png" }],
      activePlateIndex: 0,
      platePlacements: [
        {
          azimuth: 0,
          radius: 0.2,
          scale: 0.1,
          spin: 0,
          opacity: 1,
        },
      ],
      pointer: { active: false, mode: null as null, x: 0, y: 0 },
      camera: {},
    };
    const controls = {
      editPlacement: { checked: true },
      activePlate: { value: "0" },
      fov: { value: "92" },
      radiusScale: { value: "1" },
      theaterPitch: { value: "28" },
    };
    const calls = { ensurePlatePlacements: 0, schedulePlatePreview: 0, updatePatchControlsFromActive: 0 };
    const controller = createPointerToolController({
      canvas: {
        clientWidth: 100,
        clientHeight: 100,
        setPointerCapture() {},
        releasePointerCapture() {},
        classList: {
          add() {},
          remove() {},
        },
      },
      state,
      controls,
      getCssLayout: () => ({ flatRect: { x: 0, y: 0, width: 100, height: 100 } }),
      activeDomeCamera: () => "orbit",
      actions: {
        ensurePlatePlacements() {
          calls.ensurePlatePlacements += 1;
        },
        updatePatchControlsFromActive() {
          calls.updatePatchControlsFromActive += 1;
        },
        schedulePlatePreview() {
          calls.schedulePlatePreview += 1;
        },
        scheduleWorkspaceAutosave() {},
      },
    });

    controller.handlePointerDown({ clientX: 75, clientY: 50, pointerId: 1 });
    controller.handlePointerUp({ clientX: 75, clientY: 50, pointerId: 1 });

    expect(state.pointer.active).toBe(false);
    expect(state.pointer.mode).toBe(null);
    expect(state.platePlacements[0].azimuth).toBe(0);
    expect(state.platePlacements[0].radius).toBe(0.2);
    expect(calls.ensurePlatePlacements).toBe(1);
    expect(calls.updatePatchControlsFromActive).toBe(0);
    expect(calls.schedulePlatePreview).toBe(0);
  });

  test("moves a plate from a projected orbit view hit", () => {
    const placement = {
      azimuth: 0,
      radius: 1,
      scale: 1,
      spin: 0,
      opacity: 1,
    };
    const state = {
      viewMode: "orbit",
      plates: [{ name: "plate.png", aspect: 1 }],
      activePlateIndex: 0,
      platePlacements: [placement],
      pointer: { active: false, mode: null as null, x: 0, y: 0 },
      camera: {},
    };
    const controls = {
      editPlacement: { checked: true },
      activePlate: { value: "0" },
      fov: { value: "90" },
      radiusScale: { value: "1" },
      rotation: { value: "0" },
      domeTilt: { value: "0" },
      mirror: { checked: false },
      theaterPitch: { value: "28" },
      plateFit: { value: "contain" },
    };
    const viewMatrix = lookAtLH([0, 0, 3], [0, 0, 0], [0, 1, 0]);
    const center = sourceDomeDirectionToScreenPoint([0, 0, 1], {
      rect: { x: 0, y: 0, width: 100, height: 100 },
      viewMatrix,
      fovDegrees: 90,
      sourceRotationRadians: 0,
      domeTiltRadians: 0,
      mirror: false,
    });
    expect(center).toEqual({ x: 50, y: 50 });

    const controller = createPointerToolController({
      canvas: {
        clientWidth: 100,
        clientHeight: 100,
        setPointerCapture() {},
        releasePointerCapture() {},
        classList: {
          add() {},
          remove() {},
        },
      },
      state,
      controls,
      getCssLayout: () => ({
        fullRect: { x: 0, y: 0, width: 100, height: 100 },
        domeRect: { x: 0, y: 0, width: 100, height: 100 },
      }),
      activeDomeCamera: () => "orbit",
      currentDomeViewMatrix: () => viewMatrix,
      actions: {
        ensurePlatePlacements() {},
        updatePatchControlsFromActive() {},
        updatePlateSelect() {},
        schedulePlatePreview() {},
        scheduleWorkspaceAutosave() {},
      },
    });

    controller.handlePointerDown({ clientX: center.x, clientY: center.y, pointerId: 1 });
    expect(state.pointer.mode).toBe("plate");
    controller.handlePointerMove({ clientX: center.x + 10, clientY: center.y, pointerId: 1 });
    controller.handlePointerUp({ clientX: center.x + 10, clientY: center.y, pointerId: 1 });

    expect(state.platePlacements[0].azimuth).not.toBe(0);
    expect(state.platePlacements[0].radius).toBeCloseTo(1, 5);
  });

  test("moves a plate from projected views with source rotation, mirror, and dome tilt", () => {
    const placement = {
      azimuth: 38,
      radius: 0.48,
      scale: 0.55,
      spin: 0,
      opacity: 1,
    };
    const initialAzimuth = placement.azimuth;
    const state = {
      viewMode: "orbit",
      plates: [{ name: "plate.png", aspect: 1 }],
      activePlateIndex: 0,
      platePlacements: [placement],
      pointer: { active: false, mode: null as null, x: 0, y: 0 },
      camera: {},
    };
    const sourceRotationRadians = (37 * Math.PI) / 180;
    const domeTiltRadians = (-11 * Math.PI) / 180;
    const mirror = true;
    const prepared = preparePlatePlacement(placement, state.plates[0]);
    const physical = physicalDomeDirectionFromSourceDirection(prepared.center, {
      sourceRotationRadians,
      domeTiltRadians,
      mirror,
    });
    const viewMatrix = lookAtLH([physical[0] * 3, physical[1] * 3, physical[2] * 3], physical, [0, 1, 0]);
    const center = sourceDomeDirectionToScreenPoint(prepared.center, {
      rect: { x: 0, y: 0, width: 100, height: 100 },
      viewMatrix,
      fovDegrees: 86,
      sourceRotationRadians,
      domeTiltRadians,
      mirror,
    });
    if (!center) throw new Error("Expected transformed plate center to project");
    const controls = {
      editPlacement: { checked: true },
      activePlate: { value: "0" },
      fov: { value: "86" },
      radiusScale: { value: "1" },
      rotation: { value: "37" },
      domeTilt: { value: "-11" },
      mirror: { checked: true },
      theaterPitch: { value: "28" },
      plateFit: { value: "contain" },
    };
    const controller = createPointerToolController({
      canvas: {
        clientWidth: 100,
        clientHeight: 100,
        setPointerCapture() {},
        releasePointerCapture() {},
        classList: {
          add() {},
          remove() {},
        },
      },
      state,
      controls,
      getCssLayout: () => ({
        fullRect: { x: 0, y: 0, width: 100, height: 100 },
        domeRect: { x: 0, y: 0, width: 100, height: 100 },
      }),
      activeDomeCamera: () => "orbit",
      currentDomeViewMatrix: () => viewMatrix,
      actions: {
        ensurePlatePlacements() {},
        updatePatchControlsFromActive() {},
        updatePlateSelect() {},
        schedulePlatePreview() {},
        scheduleWorkspaceAutosave() {},
      },
    });

    controller.handlePointerDown({ clientX: center.x, clientY: center.y, pointerId: 1 });
    expect(state.pointer.mode).toBe("plate");
    controller.handlePointerMove({ clientX: center.x + 7, clientY: center.y + 3, pointerId: 1 });
    controller.handlePointerUp({ clientX: center.x + 7, clientY: center.y + 3, pointerId: 1 });

    expect(state.platePlacements[0].azimuth).not.toBe(initialAzimuth);
  });

  test("moves a plate from CAVE mode using the cube face ray mapping", () => {
    const placement = {
      azimuth: 0,
      radius: 2 / 3,
      scale: 0.42,
      spin: 0,
      opacity: 1,
    };
    const state = {
      viewMode: "cave",
      plates: [{ name: "plate.png", aspect: 1 }],
      activePlateIndex: 0,
      platePlacements: [placement],
      pointer: { active: false, mode: null as null, x: 0, y: 0, placementDrag: null as null },
      camera: {},
    };
    const controls = {
      editPlacement: { checked: true },
      activePlate: { value: "0" },
      fov: { value: "90" },
      radiusScale: { value: "1" },
      rotation: { value: "0" },
      domeTilt: { value: "0" },
      mirror: { checked: false },
      sourceProjection: { value: "cave-270" },
      theaterPitch: { value: "28" },
      plateFit: { value: "contain" },
    };
    const viewMatrix = lookAtLH([0, 0, 6], [0, 0, 0], [0, 1, 0]);
    const prepared = preparePlatePlacement(placement, state.plates[0], "cave-270");
    const center = sourceCaveDirectionToScreenPoint(prepared.center, {
      rect: { x: 0, y: 0, width: 100, height: 100 },
      viewMatrix,
      fovDegrees: 90,
      sourceRotationRadians: 0,
      domeTiltRadians: 0,
      mirror: false,
      sourceProjectionMode: "cave-270",
    });
    if (!center) throw new Error("Expected CAVE plate center to project");
    const startCorner = sourceCaveDirectionToScreenPoint(directionFromPlateUv(prepared, 1, 0.5), {
      rect: { x: 0, y: 0, width: 100, height: 100 },
      viewMatrix,
      fovDegrees: 90,
      sourceRotationRadians: 0,
      domeTiltRadians: 0,
      mirror: false,
      sourceProjectionMode: "cave-270",
    });
    expect(startCorner).not.toBeNull();
    const controller = createPointerToolController({
      canvas: {
        clientWidth: 100,
        clientHeight: 100,
        setPointerCapture() {},
        releasePointerCapture() {},
        classList: {
          add() {},
          remove() {},
        },
      },
      state,
      controls,
      getCssLayout: () => ({
        fullRect: { x: 0, y: 0, width: 100, height: 100 },
      }),
      activeDomeCamera: () => "orbit",
      currentDomeViewMatrix: () => viewMatrix,
      actions: {
        ensurePlatePlacements() {},
        updatePatchControlsFromActive() {},
        updatePlateSelect() {},
        schedulePlatePreview() {},
        scheduleWorkspaceAutosave() {},
      },
    });

    controller.handlePointerDown({ clientX: center.x, clientY: center.y, pointerId: 1 });
    expect(state.pointer.mode).toBe("plate");
    controller.handlePointerMove({ clientX: center.x + 8, clientY: center.y, pointerId: 1 });
    controller.handlePointerUp({ clientX: center.x + 8, clientY: center.y, pointerId: 1 });

    expect(state.platePlacements[0].azimuth).not.toBe(0);
  });

  test("dragging an empty CAVE surface rotates the view instead of the selected plate", () => {
    const placement = {
      azimuth: 0,
      radius: 2 / 3,
      scale: 0.32,
      spin: 0,
      opacity: 1,
    };
    const state = {
      viewMode: "cave",
      plates: [{ name: "plate.png", aspect: 1 }],
      activePlateIndex: 0,
      platePlacements: [placement],
      pointer: { active: false, mode: null as null, x: 0, y: 0, placementDrag: null as null },
      camera: { orbitYaw: 0, orbitPitch: 0 },
    };
    const controls = {
      editPlacement: { checked: true },
      activePlate: { value: "0" },
      fov: { value: "90" },
      radiusScale: { value: "1" },
      rotation: { value: "0" },
      domeTilt: { value: "0" },
      mirror: { checked: false },
      sourceProjection: { value: "cave-270" },
      theaterPitch: { value: "28" },
      plateFit: { value: "contain" },
    };
    const viewMatrix = lookAtLH([0, 0, 6], [0, 0, 0], [0, 1, 0]);
    const controller = createPointerToolController({
      canvas: {
        clientWidth: 100,
        clientHeight: 100,
        setPointerCapture() {},
        releasePointerCapture() {},
        classList: {
          add() {},
          remove() {},
        },
      },
      state,
      controls,
      getCssLayout: () => ({
        fullRect: { x: 0, y: 0, width: 100, height: 100 },
      }),
      activeDomeCamera: () => "orbit",
      currentDomeViewMatrix: () => viewMatrix,
      actions: {
        ensurePlatePlacements() {},
        updatePatchControlsFromActive() {},
        updatePlateSelect() {},
        schedulePlatePreview() {},
        scheduleWorkspaceAutosave() {},
      },
    });

    controller.handlePointerDown({ clientX: 70, clientY: 50, pointerId: 1 });
    expect(state.pointer.mode).toBe("view");
    controller.handlePointerMove({ clientX: 58, clientY: 62, pointerId: 1 });
    controller.handlePointerUp({ clientX: 58, clientY: 62, pointerId: 1 });

    expect(state.platePlacements[0].azimuth).toBe(0);
    expect(state.platePlacements[0].radius).toBe(2 / 3);
    expect(state.platePlacements[0].spin).toBe(0);
    expect(state.camera.orbitYaw).not.toBe(0);
    expect(state.camera.orbitPitch).not.toBe(0);
  });

  test("dragging empty dome rotates the selected plate", () => {
    const placement = {
      azimuth: 0,
      radius: 0.2,
      scale: 0.1,
      spin: 0,
      opacity: 1,
    };
    const state = {
      viewMode: "flat",
      plates: [{ name: "plate.png", aspect: 1 }],
      activePlateIndex: 0,
      platePlacements: [placement],
      pointer: { active: false, mode: null as null, x: 0, y: 0 },
      camera: {},
    };
    const controls = {
      editPlacement: { checked: true },
      activePlate: { value: "0" },
      fov: { value: "92" },
      radiusScale: { value: "1" },
      theaterPitch: { value: "28" },
    };
    const calls = { schedulePlatePreview: 0, updatePatchControlsFromActive: 0 };
    const controller = createPointerToolController({
      canvas: {
        clientWidth: 100,
        clientHeight: 100,
        setPointerCapture() {},
        releasePointerCapture() {},
        classList: {
          add() {},
          remove() {},
        },
      },
      state,
      controls,
      getCssLayout: () => ({ flatRect: { x: 0, y: 0, width: 100, height: 100 } }),
      activeDomeCamera: () => "orbit",
      actions: {
        ensurePlatePlacements() {},
        updatePatchControlsFromActive() {
          calls.updatePatchControlsFromActive += 1;
        },
        updatePlateSelect() {},
        schedulePlatePreview() {
          calls.schedulePlatePreview += 1;
        },
        scheduleWorkspaceAutosave() {},
      },
    });

    controller.handlePointerDown({ clientX: 80, clientY: 50, pointerId: 1 });
    controller.handlePointerMove({ clientX: 80, clientY: 62, pointerId: 1 });

    expect(state.activePlateIndex).toBe(0);
    expect(state.platePlacements[0].azimuth).toBe(0);
    expect(state.platePlacements[0].radius).toBe(0.2);
    expect(state.platePlacements[0].spin).not.toBe(0);
    expect(calls.updatePatchControlsFromActive).toBeGreaterThan(0);
    expect(calls.schedulePlatePreview).toBeGreaterThan(0);
  });

  test("dragging empty dome rotates selected edge plate with clipped handles", () => {
    const placement = {
      azimuth: 120,
      radius: 0.78,
      scale: 1.7,
      spin: 0,
      opacity: 1,
    };
    const state = {
      viewMode: "flat",
      plates: [{ name: "plate.png", aspect: 1 }],
      activePlateIndex: 0,
      platePlacements: [placement],
      pointer: { active: false, mode: null as null, x: 0, y: 0 },
      camera: {},
    };
    const controls = {
      editPlacement: { checked: true },
      activePlate: { value: "0" },
      fov: { value: "92" },
      radiusScale: { value: "1" },
      theaterPitch: { value: "28" },
      plateFit: { value: "contain" },
    };
    const calls = { schedulePlatePreview: 0 };
    const controller = createPointerToolController({
      canvas: {
        clientWidth: 100,
        clientHeight: 100,
        setPointerCapture() {},
        releasePointerCapture() {},
        classList: {
          add() {},
          remove() {},
        },
      },
      state,
      controls,
      getCssLayout: () => ({ flatRect: { x: 0, y: 0, width: 100, height: 100 } }),
      activeDomeCamera: () => "orbit",
      actions: {
        ensurePlatePlacements() {},
        updatePatchControlsFromActive() {},
        updatePlateSelect() {},
        schedulePlatePreview() {
          calls.schedulePlatePreview += 1;
        },
        scheduleWorkspaceAutosave() {},
      },
    });

    controller.handlePointerDown({ clientX: 36, clientY: 36, pointerId: 1 });
    controller.handlePointerMove({ clientX: 40, clientY: 50, pointerId: 1 });

    expect(state.platePlacements[0].spin).not.toBe(0);
    expect(calls.schedulePlatePreview).toBeGreaterThan(0);
  });

  test("selects and moves only the plate clicked in edit mode", () => {
    const placements = [
      {
        azimuth: 0,
        radius: 0.25,
        scale: 0.25,
        spin: 0,
        opacity: 1,
      },
      {
        azimuth: 90,
        radius: 0.5,
        scale: 0.25,
        spin: 0,
        opacity: 1,
      },
    ];
    const state = {
      viewMode: "flat",
      plates: [
        { name: "one.png", aspect: 1 },
        { name: "two.png", aspect: 1 },
      ],
      activePlateIndex: 0,
      platePlacements: placements,
      pointer: { active: false, mode: null as null, x: 0, y: 0 },
      camera: {},
    };
    const controls = {
      editPlacement: { checked: true },
      activePlate: { value: "0" },
      fov: { value: "92" },
      radiusScale: { value: "1" },
      theaterPitch: { value: "28" },
    };
    const calls = { updatePatchControlsFromActive: 0, updatePlateSelect: 0, schedulePlatePreview: 0 };
    const controller = createPointerToolController({
      canvas: {
        clientWidth: 100,
        clientHeight: 100,
        setPointerCapture() {},
        releasePointerCapture() {},
        classList: {
          add() {},
          remove() {},
        },
      },
      state,
      controls,
      getCssLayout: () => ({ flatRect: { x: 0, y: 0, width: 100, height: 100 } }),
      activeDomeCamera: () => "orbit",
      actions: {
        ensurePlatePlacements() {},
        updatePatchControlsFromActive() {
          calls.updatePatchControlsFromActive += 1;
        },
        updatePlateSelect() {
          calls.updatePlateSelect += 1;
        },
        schedulePlatePreview() {
          calls.schedulePlatePreview += 1;
        },
        scheduleWorkspaceAutosave() {},
        resolvedPlateCount() {
          return 2;
        },
      },
    });
    const secondCenter = plateUvToFlatPoint(
      preparePlatePlacement(placements[1], state.plates[1]),
      0.5,
      0.5,
      50,
      50,
      50,
    );

    controller.handlePointerDown({ clientX: secondCenter.x, clientY: secondCenter.y, pointerId: 1 });
    controller.handlePointerMove({ clientX: secondCenter.x, clientY: secondCenter.y - 10, pointerId: 1 });

    expect(state.activePlateIndex).toBe(1);
    expect(state.platePlacements[0]).toEqual(placements[0]);
    expect(state.platePlacements[1].radius).not.toBe(0.5);
    expect(calls.updatePlateSelect).toBeGreaterThan(0);
    expect(calls.schedulePlatePreview).toBeGreaterThan(0);
  });

  test("clicking a plate selects it without nudging its placement", () => {
    const placements = [
      {
        azimuth: 0,
        radius: 0.25,
        scale: 0.25,
        spin: 0,
        opacity: 1,
      },
      {
        azimuth: 90,
        radius: 0.5,
        scale: 0.25,
        spin: 0,
        opacity: 1,
      },
    ];
    const state = {
      viewMode: "flat",
      plates: [
        { name: "one.png", aspect: 1 },
        { name: "two.png", aspect: 1 },
      ],
      activePlateIndex: 0,
      platePlacements: structuredClone(placements),
      pointer: { active: false, mode: null as null, x: 0, y: 0 },
      camera: {},
    };
    const controls = {
      editPlacement: { checked: true },
      activePlate: { value: "0" },
      fov: { value: "92" },
      radiusScale: { value: "1" },
      theaterPitch: { value: "28" },
    };
    const calls = { updatePatchControlsFromActive: 0, updatePlateSelect: 0, schedulePlatePreview: 0 };
    const controller = createPointerToolController({
      canvas: {
        clientWidth: 100,
        clientHeight: 100,
        setPointerCapture() {},
        releasePointerCapture() {},
        classList: {
          add() {},
          remove() {},
        },
      },
      state,
      controls,
      getCssLayout: () => ({ flatRect: { x: 0, y: 0, width: 100, height: 100 } }),
      activeDomeCamera: () => "orbit",
      actions: {
        ensurePlatePlacements() {},
        updatePatchControlsFromActive() {
          calls.updatePatchControlsFromActive += 1;
        },
        updatePlateSelect() {
          calls.updatePlateSelect += 1;
        },
        schedulePlatePreview() {
          calls.schedulePlatePreview += 1;
        },
        scheduleWorkspaceAutosave() {},
        resolvedPlateCount() {
          return 2;
        },
      },
    });
    const secondCenter = plateUvToFlatPoint(
      preparePlatePlacement(placements[1], state.plates[1]),
      0.5,
      0.5,
      50,
      50,
      50,
    );

    controller.handlePointerDown({ clientX: secondCenter.x, clientY: secondCenter.y, pointerId: 1 });
    controller.handlePointerUp({ clientX: secondCenter.x, clientY: secondCenter.y, pointerId: 1 });

    expect(state.activePlateIndex).toBe(1);
    expect(state.platePlacements).toEqual(placements);
    expect(calls.updatePlateSelect).toBe(1);
    expect(calls.updatePatchControlsFromActive).toBe(1);
    expect(calls.schedulePlatePreview).toBe(0);
  });

  test("clicking a rotated flat display selects the displayed plate", () => {
    const placements = [
      {
        azimuth: 0,
        radius: 0.5,
        scale: 0.25,
        spin: 0,
        opacity: 1,
      },
      {
        azimuth: 180,
        radius: 0.5,
        scale: 0.25,
        spin: 0,
        opacity: 1,
      },
    ];
    const state = {
      viewMode: "flat",
      plates: [
        { name: "north.png", aspect: 1 },
        { name: "south.png", aspect: 1 },
      ],
      activePlateIndex: 1,
      platePlacements: structuredClone(placements),
      pointer: { active: false, mode: null as null, x: 0, y: 0 },
      camera: {},
    };
    const controls = {
      editPlacement: { checked: true },
      activePlate: { value: "1" },
      fov: { value: "92" },
      radiusScale: { value: "1" },
      rotation: { value: "180" },
      theaterPitch: { value: "28" },
    };
    const calls = { updatePatchControlsFromActive: 0, updatePlateSelect: 0 };
    const controller = createPointerToolController({
      canvas: {
        clientWidth: 100,
        clientHeight: 100,
        setPointerCapture() {},
        releasePointerCapture() {},
        classList: {
          add() {},
          remove() {},
        },
      },
      state,
      controls,
      getCssLayout: () => ({ flatRect: { x: 0, y: 0, width: 100, height: 100 } }),
      activeDomeCamera: () => "orbit",
      actions: {
        ensurePlatePlacements() {},
        updatePatchControlsFromActive() {
          calls.updatePatchControlsFromActive += 1;
        },
        updatePlateSelect() {
          calls.updatePlateSelect += 1;
        },
        schedulePlatePreview() {},
        scheduleWorkspaceAutosave() {},
        resolvedPlateCount() {
          return 2;
        },
      },
    });
    const sourceCenter = plateUvToFlatPoint(
      preparePlatePlacement(placements[0], state.plates[0]),
      0.5,
      0.5,
      50,
      50,
      50,
    );
    const displayedCenter = sourceFlatToDisplayFlatPoint(sourceCenter, 50, 50, Math.PI);

    controller.handlePointerDown({ clientX: displayedCenter.x, clientY: displayedCenter.y, pointerId: 1 });
    controller.handlePointerUp({ clientX: displayedCenter.x, clientY: displayedCenter.y, pointerId: 1 });

    expect(state.activePlateIndex).toBe(0);
    expect(state.platePlacements).toEqual(placements);
    expect(calls.updatePlateSelect).toBe(1);
  });

  test("clicking a centered canvas uses canvas-local coordinates", () => {
    const canvasLeft = 280;
    const canvasTop = 40;
    const placements = [
      {
        azimuth: 0,
        radius: 0.5,
        scale: 0.25,
        spin: 0,
        opacity: 1,
      },
      {
        azimuth: 180,
        radius: 0.5,
        scale: 0.25,
        spin: 0,
        opacity: 1,
      },
    ];
    const state = {
      viewMode: "flat",
      plates: [
        { name: "north.png", aspect: 1 },
        { name: "south.png", aspect: 1 },
      ],
      activePlateIndex: 1,
      platePlacements: structuredClone(placements),
      pointer: { active: false, mode: null as null, x: 0, y: 0 },
      camera: {},
    };
    const controls = {
      editPlacement: { checked: true },
      activePlate: { value: "1" },
      fov: { value: "92" },
      radiusScale: { value: "1" },
      rotation: { value: "180" },
      theaterPitch: { value: "28" },
    };
    const calls = { updatePatchControlsFromActive: 0, updatePlateSelect: 0 };
    const controller = createPointerToolController({
      canvas: {
        clientWidth: 100,
        clientHeight: 100,
        getBoundingClientRect() {
          return { left: canvasLeft, top: canvasTop, width: 100, height: 100 };
        },
        setPointerCapture() {},
        releasePointerCapture() {},
        classList: {
          add() {},
          remove() {},
        },
      },
      state,
      controls,
      getCssLayout: () => ({ flatRect: { x: 0, y: 0, width: 100, height: 100 } }),
      activeDomeCamera: () => "orbit",
      actions: {
        ensurePlatePlacements() {},
        updatePatchControlsFromActive() {
          calls.updatePatchControlsFromActive += 1;
        },
        updatePlateSelect() {
          calls.updatePlateSelect += 1;
        },
        schedulePlatePreview() {},
        scheduleWorkspaceAutosave() {},
        resolvedPlateCount() {
          return 2;
        },
      },
    });
    const sourceCenter = plateUvToFlatPoint(
      preparePlatePlacement(placements[0], state.plates[0]),
      0.5,
      0.5,
      50,
      50,
      50,
    );
    const displayedCenter = sourceFlatToDisplayFlatPoint(sourceCenter, 50, 50, Math.PI);

    controller.handlePointerDown({
      clientX: displayedCenter.x + canvasLeft,
      clientY: displayedCenter.y + canvasTop,
      pointerId: 1,
    });
    controller.handlePointerUp({
      clientX: displayedCenter.x + canvasLeft,
      clientY: displayedCenter.y + canvasTop,
      pointerId: 1,
    });

    expect(state.activePlateIndex).toBe(0);
    expect(state.platePlacements).toEqual(placements);
    expect(calls.updatePlateSelect).toBe(1);
  });

  test("dragging a rotated flat display moves the displayed plate with the pointer", () => {
    const placement = {
      azimuth: 90,
      radius: 0.5,
      scale: 1.2,
      spin: 0,
      opacity: 1,
    };
    const state = {
      viewMode: "flat",
      plates: [{ name: "north.png", aspect: 1 }],
      activePlateIndex: 0,
      platePlacements: [placement],
      pointer: { active: false, mode: null as null, x: 0, y: 0 },
      camera: {},
    };
    const controls = {
      editPlacement: { checked: true },
      activePlate: { value: "0" },
      fov: { value: "92" },
      radiusScale: { value: "1" },
      rotation: { value: "180" },
      theaterPitch: { value: "28" },
    };
    const controller = createPointerToolController({
      canvas: {
        clientWidth: 100,
        clientHeight: 100,
        setPointerCapture() {},
        releasePointerCapture() {},
        classList: {
          add() {},
          remove() {},
        },
      },
      state,
      controls,
      getCssLayout: () => ({ flatRect: { x: 0, y: 0, width: 100, height: 100 } }),
      activeDomeCamera: () => "orbit",
      actions: {
        ensurePlatePlacements() {},
        updatePatchControlsFromActive() {},
        updatePlateSelect() {},
        schedulePlatePreview() {},
        scheduleWorkspaceAutosave() {},
        resolvedPlateCount() {
          return 1;
        },
      },
    });
    const startSourceCenter = plateUvToFlatPoint(
      preparePlatePlacement(placement, state.plates[0]),
      0.5,
      0.5,
      50,
      50,
      50,
    );
    const startDisplayedCenter = sourceFlatToDisplayFlatPoint(startSourceCenter, 50, 50, Math.PI);

    controller.handlePointerDown({ clientX: startDisplayedCenter.x, clientY: startDisplayedCenter.y, pointerId: 1 });
    controller.handlePointerMove({
      clientX: startDisplayedCenter.x + 10,
      clientY: startDisplayedCenter.y,
      pointerId: 1,
    });

    const endSourceCenter = plateUvToFlatPoint(
      preparePlatePlacement(state.platePlacements[0], state.plates[0]),
      0.5,
      0.5,
      50,
      50,
      50,
    );
    const endDisplayedCenter = sourceFlatToDisplayFlatPoint(endSourceCenter, 50, 50, Math.PI);

    expect(endDisplayedCenter.x).toBeGreaterThan(startDisplayedCenter.x);
    expect(Math.abs(endDisplayedCenter.y - startDisplayedCenter.y)).toBeLessThan(0.01);
  });

  test("wheel over empty dome does not scale the active plate", () => {
    const placement = {
      azimuth: 0,
      radius: 0.2,
      scale: 0.1,
      spin: 0,
      opacity: 1,
    };
    const state = {
      viewMode: "flat",
      plates: [{ name: "plate.png", aspect: 1 }],
      activePlateIndex: 0,
      platePlacements: [placement],
      pointer: { active: false, mode: null as null, x: 0, y: 0 },
      camera: {},
    };
    const controls = {
      editPlacement: { checked: true },
      activePlate: { value: "0" },
      fov: { value: "92" },
      radiusScale: { value: "1" },
      theaterPitch: { value: "28" },
    };
    const calls = { schedulePlatePreview: 0 };
    const controller = createPointerToolController({
      canvas: {
        clientWidth: 100,
        clientHeight: 100,
        setPointerCapture() {},
        releasePointerCapture() {},
        classList: {
          add() {},
          remove() {},
        },
      },
      state,
      controls,
      getCssLayout: () => ({ flatRect: { x: 0, y: 0, width: 100, height: 100 } }),
      activeDomeCamera: () => "orbit",
      actions: {
        ensurePlatePlacements() {},
        updatePatchControlsFromActive() {},
        updatePlateSelect() {},
        schedulePlatePreview() {
          calls.schedulePlatePreview += 1;
        },
        scheduleWorkspaceAutosave() {},
      },
    });

    controller.handleWheel({
      clientX: 75,
      clientY: 50,
      deltaY: -100,
      preventDefault() {},
    });

    expect(state.platePlacements[0].scale).toBe(0.1);
    expect(calls.schedulePlatePreview).toBe(0);
  });

  test("corner scaling preserves the active patch ratio", () => {
    const placement: PlatePlacementInput = {
      azimuth: 0,
      radius: 0.45,
      scale: 0.4,
      spin: 0,
      opacity: 1,
    };
    const state = {
      viewMode: "flat",
      plates: [{ name: "plate.png", aspect: 2 }],
      activePlateIndex: 0,
      platePlacements: [placement],
      pointer: { active: false, mode: null as null, x: 0, y: 0 },
      camera: {},
    };
    const controls = {
      editPlacement: { checked: true },
      activePlate: { value: "0" },
      fov: { value: "92" },
      radiusScale: { value: "1" },
      theaterPitch: { value: "28" },
    };
    const controller = createPointerToolController({
      canvas: {
        clientWidth: 100,
        clientHeight: 100,
        setPointerCapture() {},
        releasePointerCapture() {},
        classList: {
          add() {},
          remove() {},
        },
      },
      state,
      controls,
      getCssLayout: () => ({ flatRect: { x: 0, y: 0, width: 100, height: 100 } }),
      activeDomeCamera: () => "orbit",
      actions: {
        ensurePlatePlacements() {},
        updatePatchControlsFromActive() {},
        schedulePlatePreview() {},
        scheduleWorkspaceAutosave() {},
      },
    });
    const corner = plateUvToFlatPoint(preparePlatePlacement(placement, state.plates[0]), 1, 0, 50, 50, 50);

    controller.handlePointerDown({ clientX: corner.x, clientY: corner.y, pointerId: 1 });
    controller.handlePointerMove({ clientX: corner.x + 8, clientY: corner.y - 5, pointerId: 1 });

    expect(state.platePlacements[0].scale).toBeGreaterThan(0.4);
    expect(state.platePlacements[0]).not.toHaveProperty("width");
    expect(state.platePlacements[0]).not.toHaveProperty("height");
    expect(state.platePlacements[0]).not.toHaveProperty("cornerOffsets");
  });

  test("modifier dragging a corner warps that corner without resizing the plate", () => {
    const placement: PlatePlacementInput = {
      azimuth: 0,
      radius: 0.45,
      scale: 0.4,
      spin: 0,
      opacity: 1,
    };
    const state = {
      viewMode: "flat",
      plates: [{ name: "plate.png", aspect: 2 }],
      activePlateIndex: 0,
      platePlacements: [placement],
      pointer: { active: false, mode: null as null, x: 0, y: 0 },
      camera: {},
    };
    const controls = {
      editPlacement: { checked: true },
      activePlate: { value: "0" },
      fov: { value: "92" },
      radiusScale: { value: "1" },
      theaterPitch: { value: "28" },
    };
    const controller = createPointerToolController({
      canvas: {
        clientWidth: 100,
        clientHeight: 100,
        setPointerCapture() {},
        releasePointerCapture() {},
        classList: {
          add() {},
          remove() {},
        },
      },
      state,
      controls,
      getCssLayout: () => ({ flatRect: { x: 0, y: 0, width: 100, height: 100 } }),
      activeDomeCamera: () => "orbit",
      actions: {
        ensurePlatePlacements() {},
        updatePatchControlsFromActive() {},
        schedulePlatePreview() {},
        scheduleWorkspaceAutosave() {},
      },
    });
    const corner = plateUvToFlatPoint(preparePlatePlacement(placement, state.plates[0]), 1, 0, 50, 50, 50);

    controller.handlePointerDown({ clientX: corner.x, clientY: corner.y, pointerId: 1, shiftKey: true });
    controller.handlePointerMove({ clientX: corner.x + 8, clientY: corner.y - 5, pointerId: 1, shiftKey: true });

    expect(state.platePlacements[0].scale).toBe(0.4);
    expect(state.platePlacements[0].cornerOffsets?.ne.x).not.toBe(0);
    expect(state.platePlacements[0].cornerOffsets?.ne.y).not.toBe(0);
    expect(state.platePlacements[0].cornerOffsets?.nw).toEqual({ x: 0, y: 0 });
  });

  test("corner warp mode drags a corner without a keyboard modifier", () => {
    const placement: PlatePlacementInput = {
      azimuth: 0,
      radius: 0.45,
      scale: 0.4,
      spin: 0,
      opacity: 1,
    };
    const state = {
      viewMode: "flat",
      plates: [{ name: "plate.png", aspect: 2 }],
      activePlateIndex: 0,
      platePlacements: [placement],
      pointer: { active: false, mode: null as null, x: 0, y: 0 },
      camera: {},
    };
    const controls = {
      editPlacement: { checked: true },
      activePlate: { value: "0" },
      fov: { value: "92" },
      radiusScale: { value: "1" },
      theaterPitch: { value: "28" },
      plateCornerMode: { value: "warp" },
    };
    const controller = createPointerToolController({
      canvas: {
        clientWidth: 100,
        clientHeight: 100,
        setPointerCapture() {},
        releasePointerCapture() {},
        classList: {
          add() {},
          remove() {},
        },
      },
      state,
      controls,
      getCssLayout: () => ({ flatRect: { x: 0, y: 0, width: 100, height: 100 } }),
      activeDomeCamera: () => "orbit",
      actions: {
        ensurePlatePlacements() {},
        updatePatchControlsFromActive() {},
        schedulePlatePreview() {},
        scheduleWorkspaceAutosave() {},
      },
    });
    const corner = plateUvToFlatPoint(preparePlatePlacement(placement, state.plates[0]), 1, 0, 50, 50, 50);

    controller.handlePointerDown({ clientX: corner.x, clientY: corner.y, pointerId: 1 });
    controller.handlePointerMove({ clientX: corner.x + 8, clientY: corner.y - 5, pointerId: 1 });

    expect(state.platePlacements[0].scale).toBe(0.4);
    expect(state.platePlacements[0].cornerOffsets?.ne.x).not.toBe(0);
    expect(state.platePlacements[0].cornerOffsets?.ne.y).not.toBe(0);
    expect(state.platePlacements[0].cornerOffsets?.sw).toEqual({ x: 0, y: 0 });
  });

  test("rotation handle follows screen drag direction", () => {
    const placement = {
      azimuth: 0,
      radius: 0.45,
      scale: 1,
      spin: 0,
      opacity: 1,
    };
    const state = {
      viewMode: "flat",
      plates: [{ name: "plate.png", aspect: 1 }],
      activePlateIndex: 0,
      platePlacements: [placement],
      pointer: { active: false, mode: null as null, x: 0, y: 0 },
      camera: {},
    };
    const controls = {
      editPlacement: { checked: true },
      activePlate: { value: "0" },
      fov: { value: "92" },
      radiusScale: { value: "1" },
      theaterPitch: { value: "28" },
    };
    const controller = createPointerToolController({
      canvas: {
        clientWidth: 100,
        clientHeight: 100,
        setPointerCapture() {},
        releasePointerCapture() {},
        classList: {
          add() {},
          remove() {},
        },
      },
      state,
      controls,
      getCssLayout: () => ({ flatRect: { x: 0, y: 0, width: 100, height: 100 } }),
      activeDomeCamera: () => "orbit",
      actions: {
        ensurePlatePlacements() {},
        updatePatchControlsFromActive() {},
        updatePlateSelect() {},
        schedulePlatePreview() {},
        scheduleWorkspaceAutosave() {},
      },
    });
    const prepared = preparePlatePlacement(placement, state.plates[0]);
    const rotate = plateUvToFlatPoint(prepared, 0.5, -0.18, 50, 50, 50);

    controller.handlePointerDown({ clientX: rotate.x, clientY: rotate.y, pointerId: 1 });
    controller.handlePointerMove({ clientX: rotate.x - 8, clientY: rotate.y, pointerId: 1 });

    expect(state.platePlacements[0].spin).toBeLessThan(0);
  });
});

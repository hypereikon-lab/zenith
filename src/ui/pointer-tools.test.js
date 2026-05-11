import { describe, expect, test } from "vitest";
import { preparePlatePlacement } from "../plates/plate-placement.js";
import { createPointerToolController } from "./pointer-tools.js";
import { plateUvToFlatPoint } from "./hud-renderer.js";

describe("pointer placement edit gate", () => {
  test("does not move patch placements while edit placement is unchecked", () => {
    const state = {
      viewMode: "flat",
      plates: [{ name: "plate.png" }],
      activePlateIndex: 0,
      platePlacements: [{ azimuth: 0, radius: 0.35 }],
      pointer: { active: false, mode: null, x: 0, y: 0 },
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
      pointer: { active: false, mode: null, x: 0, y: 0 },
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
      pointer: { active: false, mode: null, x: 0, y: 0 },
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
      pointer: { active: false, mode: null, x: 0, y: 0 },
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
      pointer: { active: false, mode: null, x: 0, y: 0 },
      camera: {},
    };
    const controls = {
      editPlacement: { checked: true },
      activePlate: { value: "0" },
      fov: { value: "92" },
      radiusScale: { value: "1" },
      theaterPitch: { value: "28" },
    };
    const calls = { updatePlateSelect: 0, schedulePlatePreview: 0 };
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
    const secondCenter = plateUvToFlatPoint(preparePlatePlacement(placements[1], state.plates[1]), 0.5, 0.5, 50, 50, 50);

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
      pointer: { active: false, mode: null, x: 0, y: 0 },
      camera: {},
    };
    const controls = {
      editPlacement: { checked: true },
      activePlate: { value: "0" },
      fov: { value: "92" },
      radiusScale: { value: "1" },
      theaterPitch: { value: "28" },
    };
    const calls = { updatePlateSelect: 0, schedulePlatePreview: 0 };
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
    const secondCenter = plateUvToFlatPoint(preparePlatePlacement(placements[1], state.plates[1]), 0.5, 0.5, 50, 50, 50);

    controller.handlePointerDown({ clientX: secondCenter.x, clientY: secondCenter.y, pointerId: 1 });
    controller.handlePointerUp({ clientX: secondCenter.x, clientY: secondCenter.y, pointerId: 1 });

    expect(state.activePlateIndex).toBe(1);
    expect(state.platePlacements).toEqual(placements);
    expect(calls.updatePlateSelect).toBe(1);
    expect(calls.schedulePlatePreview).toBe(0);
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
      pointer: { active: false, mode: null, x: 0, y: 0 },
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
    const placement = {
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
      pointer: { active: false, mode: null, x: 0, y: 0 },
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
      pointer: { active: false, mode: null, x: 0, y: 0 },
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

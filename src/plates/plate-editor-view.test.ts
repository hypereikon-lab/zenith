import { describe, expect, test } from "vitest";
import { eulerDegreesFromQuaternion, quaternionFromEulerDegrees } from "../geometry/camera-rig.js";
import {
  PLATE_EDITOR_VIEW_MODES,
  defaultPlateEditorCamera,
  normalizePlateEditorCamera,
  plateEditorCaveProjection,
  plateEditorDomeProjection,
  plateEditorOrthographicViewHeight,
  plateEditorProjectionMatrix,
  plateEditorViewDisabledReason,
  plateEditorViewLabel,
  plateEditorViewMatrix,
} from "./plate-editor-view.js";

describe("plate editor projection views", () => {
  test("defines production editing view labels", () => {
    expect(PLATE_EDITOR_VIEW_MODES).toEqual(["source-map", "dome-orbit", "dome-pov", "cave-room"]);
    expect(plateEditorViewLabel("source-map")).toBe("Source Map");
    expect(plateEditorViewLabel("dome-orbit")).toBe("Dome Orbit");
    expect(plateEditorViewLabel("dome-pov")).toBe("Dome POV");
    expect(plateEditorViewLabel("cave-room")).toBe("CAVE Room");
  });

  test("creates finite matrices for dome and CAVE views", () => {
    const camera = defaultPlateEditorCamera("zenith-230");
    for (const mode of ["dome-orbit", "dome-pov"] as const) {
      const matrix = plateEditorViewMatrix(mode, camera, "zenith-230");
      expect(Array.from(matrix).every(Number.isFinite)).toBe(true);
    }
    const caveMatrix = plateEditorViewMatrix("cave-room", defaultPlateEditorCamera("cave-270"), "cave-270");
    expect(Array.from(caveMatrix).every(Number.isFinite)).toBe(true);
  });

  test("limits CAVE Room editing to CAVE 270 source profiles", () => {
    expect(plateEditorViewDisabledReason("cave-room", "cave-270")).toBeNull();
    expect(plateEditorViewDisabledReason("cave-room", "nadir-180")).toBe("CAVE Room is only available for CAVE 270.");
    expect(plateEditorViewDisabledReason("cave-room", "zenith-230")).toBe("CAVE Room is only available for CAVE 270.");
    expect(plateEditorViewDisabledReason("dome-orbit", "zenith-230")).toBeNull();
  });

  test("normalizes camera values into a useful 6DoF editor pose", () => {
    const camera = normalizePlateEditorCamera({
      position: [999, -999, 4],
      orientation: quaternionFromEulerDegrees(30, 12, 6),
      fovDegrees: 999,
    });
    expect(camera.position[0]).toBe(120);
    expect(camera.position[1]).toBe(-120);
    expect(camera.orientation).toHaveLength(4);
    expect(eulerDegreesFromQuaternion(camera.orientation).yawDegrees).toBeCloseTo(30, 5);
    expect(camera.fovDegrees).toBe(170);
  });

  test("migrates legacy yaw/pitch/distance camera values into a quaternion pose", () => {
    const camera = normalizePlateEditorCamera({
      yawRadians: Math.PI / 2,
      pitchRadians: 0,
      distance: 3,
      fovDegrees: 90,
    });
    expect(camera.position[0]).toBeCloseTo(3, 6);
    expect(camera.orientation).toHaveLength(4);
    expect(camera.fovDegrees).toBe(90);
  });

  test("builds projection descriptors from Svelte-owned camera state", () => {
    const rect = { x: 0, y: 0, width: 768, height: 768 };
    const camera = defaultPlateEditorCamera("cave-270");
    const dome = plateEditorDomeProjection("dome-orbit", camera, "cave-270", rect);
    const cave = plateEditorCaveProjection(camera, "cave-270", rect);

    expect(dome.sourceProjectionMode).toBe("cave-270");
    expect(cave.sourceProjectionMode).toBe("cave-270");
    expect(dome.fovDegrees).toBe(camera.fovDegrees);
    expect(dome.projectionMode).toBe("orthographic");
    expect(dome.orthographicViewHeight).toBeCloseTo(plateEditorOrthographicViewHeight(camera, "cave-270"), 6);
    expect(Array.from(plateEditorProjectionMatrix(camera, "cave-270")).every(Number.isFinite)).toBe(true);
    expect(cave.rect).toEqual(rect);
    expect(cave.projectionMode).toBe("orthographic");
  });
});

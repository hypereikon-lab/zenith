import { describe, expect, test } from "vitest";
import { caveFaceDirection } from "../geometry/cave-projection.js";
import { normalize } from "../projection.js";
import { buildCaveRoomGeometry } from "./geometry.js";
import type { CaveFace } from "../geometry/cave-projection.js";
import type { Vec3 } from "../projection.js";

describe("CAVE room geometry", () => {
  test("builds four walls plus floor with face attributes and no ceiling", () => {
    const geometry = buildCaveRoomGeometry();
    const stride = geometry.vertexStrideFloats;
    const vertexCount = geometry.vertices.length / stride;
    const faceIds = new Set<number>();
    const yValues: number[] = [];

    for (let offset = 0; offset < geometry.vertices.length; offset += stride) {
      yValues.push(geometry.vertices[offset + 1]);
      faceIds.add(geometry.vertices[offset + 5]);
    }

    expect(stride).toBe(6);
    expect(vertexCount).toBe(20);
    expect(geometry.indices.length).toBe(30);
    expect([...faceIds].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(Math.max(...yValues)).toBe(2);
    expect(Math.min(...yValues)).toBe(-2);
  });

  test("uses the same eye-relative wall rays as the CAVE export geometry", () => {
    const geometry = buildCaveRoomGeometry();
    const faceNames: CaveFace[] = ["front", "right", "back", "left", "floor"];

    for (let offset = 0; offset < geometry.vertices.length; offset += geometry.vertexStrideFloats) {
      const position: Vec3 = [geometry.vertices[offset], geometry.vertices[offset + 1], geometry.vertices[offset + 2]];
      const uv = { u: geometry.vertices[offset + 3], v: geometry.vertices[offset + 4] };
      const face = faceNames[geometry.vertices[offset + 5]];
      if (!face) throw new Error("Unexpected CAVE face index");

      expectVectorClose(normalize(position), caveFaceDirection(face, uv));
    }
  });
});

function expectVectorClose(actual: Vec3, expected: Vec3): void {
  for (let index = 0; index < 3; index += 1) {
    expect(actual[index]).toBeCloseTo(expected[index], 6);
  }
}

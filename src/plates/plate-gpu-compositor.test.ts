import { describe, expect, test } from "vitest";
import { plateCompositeShader } from "./plate-gpu-compositor.js";

describe("plate GPU compositor shader", () => {
  test("uses the same inverse spin matrix as the placement HUD", () => {
    const mapFunction = plateCompositeShader.match(/fn mapDirectionToLocal[\s\S]*?\n}/)?.[0] || "";

    expect(mapFunction).toContain("map.x * plate.scale.w + map.y * plate.scale.z");
    expect(mapFunction).toContain("-map.x * plate.scale.z + map.y * plate.scale.w");
    expect(mapFunction).not.toMatch(/^\s*map\.x \* plate\.scale\.z \+ map\.y \* plate\.scale\.w/m);
    expect(mapFunction).not.toMatch(/^\s*-map\.x \* plate\.scale\.w \+ map\.y \* plate\.scale\.z/m);
    expect(mapFunction).toContain("dot(direction, plate.right.xyz)");
    expect(mapFunction).toContain("dot(direction, plate.down.xyz)");
    expect(mapFunction).toContain("tangentScale");
  });

  test("inverts the warped quadrilateral before sampling plate uv", () => {
    expect(plateCompositeShader).toContain("warpX: vec4<f32>");
    expect(plateCompositeShader).toContain("warpY: vec4<f32>");
    expect(plateCompositeShader).toContain("fn warpedLocalToUv");
    expect(plateCompositeShader).toContain("let rawUv = warpedLocalToUv(local)");
    expect(plateCompositeShader).toContain("distance(warpedUvToLocal(rawUv), local)");
  });

  test("bakes plate maps with the active source projection curve", () => {
    expect(plateCompositeShader).toContain("projection: vec4<f32>");
    expect(plateCompositeShader).toContain("fn inverseProjectionRadius");
    expect(plateCompositeShader).toContain("return 2.0 * asin");
    expect(plateCompositeShader).toContain("return asin(clamp(r, 0.0, 1.0))");
    expect(plateCompositeShader).toContain("return 2.0 * atan(r)");
    expect(plateCompositeShader).toContain("pow(r, 1.0 / max(plate.projection.y, 0.05)) * HALF_PI");
    expect(plateCompositeShader).toContain("let theta = inverseProjectionRadius(radius)");
  });
});

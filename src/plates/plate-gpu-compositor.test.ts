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
});

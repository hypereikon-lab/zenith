import { describe, expect, test } from "vitest";
import { CAVE_HANDOFF_GUIDE } from "../geometry/cave-handoff-guide.js";
import { DOME_HANDOFF_GUIDE } from "../geometry/dome-handoff-guide.js";
import { plateCompositeShader, plateGuideShader } from "./plate-gpu-compositor.js";

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

  test("bakes plate maps through the shared source-map carrier mapping", () => {
    expect(plateCompositeShader).not.toContain("projection: vec4<f32>");
    expect(plateCompositeShader).not.toContain("inverseProjectionRadius");
    expect(plateCompositeShader).not.toContain("plate.projection");
    expect(plateCompositeShader).toContain("sourceCenterTheta: vec4<f32>");
    expect(plateCompositeShader).toContain("fn sourceDirectionFromUv");
    expect(plateCompositeShader).toContain("let split = clamp(plate.flags.w, 0.18, 0.72)");
    expect(plateCompositeShader).toContain("let theta = physicalRadius * thetaMax");
    expect(plateCompositeShader).toContain("plate.sourceRight.xyz * local.x");
    expect(plateCompositeShader).toContain("plate.sourceUp.xyz * -local.y");
  });

  test("draws radial spokes in the inpaint handoff guide", () => {
    expect(plateGuideShader).toContain("fn spokeGuideLine");
    expect(plateGuideShader).toContain("atan2(local.x, -local.y)");
    expect(plateGuideShader).toContain("let spokeMask = smoothstep(semanticSplit + 0.015, semanticSplit + 0.055, radius)");
    expect(plateGuideShader).toContain("let spoke = spokeGuideLine(local, radiusPixels, 0.5235987756, 1.25) * spokeMask");
    expect(plateGuideShader).toContain("max(max(max(ring, spoke), horizon), sourceCircle)");
  });

  test("separates dome sky and floor guide zones in the inpaint handoff guide", () => {
    expect(plateGuideShader).toContain(`let skyGuideColor = vec3<f32>(0.0, ${(DOME_HANDOFF_GUIDE.colors.sky[1] / 255).toFixed(10).replace(/0+$/, "")}, 1.0)`);
    expect(plateGuideShader).toContain(
      `let horizonGuideColor = vec3<f32>(0.0, 1.0, ${(DOME_HANDOFF_GUIDE.colors.horizon[2] / 255).toFixed(10).replace(/0+$/, "")})`,
    );
    expect(plateGuideShader).toContain(`let floorGuideColor = vec3<f32>(0.0, 1.0, 0.0)`);
    expect(plateGuideShader).toContain("let isNadir = guide.values.w < 0.0");
    expect(plateGuideShader).toContain("let semanticSplit = clamp(guide.semantics.x, 0.18, 0.72)");
    expect(plateGuideShader).toContain("var ring = radialGuideLine(radius, semanticSplit");
    expect(plateGuideShader).toContain("ring = max(ring, radialGuideLine(radius, mix(semanticSplit, outerGuideEnd, 0.5)");
    expect(plateGuideShader).not.toContain("mix(semanticSplit, outerGuideEnd, 0.25)");
    expect(plateGuideShader).not.toContain("mix(semanticSplit, outerGuideEnd, 0.75)");
    expect(plateGuideShader).toContain("guideBackground = mix(floorGuideColor, horizonGuideColor, horizonAmount)");
    expect(plateGuideShader).not.toContain("fn guideLine");
  });

  test("draws CAVE spatial scaffold zones with wall-only octave grid rays", () => {
    expect(plateGuideShader).toContain("let wallColor = select");
    expect(plateGuideShader).not.toContain("let wallColor = mix");
    expect(plateGuideShader).toContain("let floorBand = guide.values.w");
    expect(plateGuideShader).toContain("let horizonBand = clamp(guide.semantics.y, floorBand + 0.0001, 0.9999)");
    expect(plateGuideShader).toContain("let wallRingA = radialGuideLine(rho, mix(floorBand, horizonBand, 0.5)");
    expect(plateGuideShader).toContain("let wallRingB = radialGuideLine(rho, mix(horizonBand, 1.0, 0.5)");
    expect(plateGuideShader).toContain("let horizon = radialGuideLine(rho, horizonBand");
    expect(plateGuideShader).toContain(
      `let wallGrid = spokeGuideLine(local, caveRadiusPixels, ${CAVE_HANDOFF_GUIDE.wallRayIntervalRadians.toFixed(10)}, ${CAVE_HANDOFF_GUIDE.wallRayLineWidthPixels})`,
    );
    expect(plateGuideShader).not.toContain("floorSpoke");
    expect(plateGuideShader).not.toContain("let center = 1.0 - smoothstep");
  });
});

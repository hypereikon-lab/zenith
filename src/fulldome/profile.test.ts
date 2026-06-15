import { describe, expect, test } from "vitest";
import { DEFAULT_CAVE_CONTINUITY_FLOOR_BAND } from "../geometry/cave-continuity-carrier.js";
import { buildFulldomeProfile, summarizeFulldomeProfile } from "./profile.js";

describe("fulldome profile", () => {
  test("describes zenith 230 as an equidistant domemaster with below-horizon coverage", () => {
    const profile = buildFulldomeProfile({
      projectionMode: "zenith-230",
      radiusScale: 1,
      domeTiltDegrees: 7.5,
      masterWidth: 2048,
      masterHeight: 2048,
      fps: 30,
    });

    expect(profile.mapping).toBe("equidistant-fisheye");
    expect(profile.center).toBe("zenith");
    expect(profile.fieldOfViewDegrees).toBe(230);
    expect(profile.horizonRadius).toBeCloseTo(18 / 23, 8);
    expect(profile.belowHorizonDegrees).toBeCloseTo(25, 8);
    expect(profile.master.square).toBe(true);
    expect(summarizeFulldomeProfile(profile)).toContain("Zenith 230 equidistant");
    expect(summarizeFulldomeProfile(profile)).toContain("25 deg below horizon");
  });

  test("describes CAVE 270 as a bottom-centered CAVE continuity carrier", () => {
    const profile = buildFulldomeProfile({
      projectionMode: "cave-270",
      radiusScale: 0.98,
      masterWidth: 1536,
      masterHeight: 1536,
      fps: 24,
    });

    expect(profile.center).toBe("nadir");
    expect(profile.mapping).toBe("cave-continuity-carrier");
    expect(profile.fieldOfViewDegrees).toBe(270);
    expect(profile.thetaStartDegrees).toBeCloseTo(45, 8);
    expect(profile.thetaEndDegrees).toBeCloseTo(180, 8);
    expect(profile.belowHorizonDegrees).toBe(0);
    expect(profile.aboveHorizonDegrees).toBeCloseTo(45, 8);
    expect(profile.horizonRadius).toBeCloseTo(DEFAULT_CAVE_CONTINUITY_FLOOR_BAND, 8);
    expect(profile.mask.circleFillsFrame).toBe(false);
    expect(summarizeFulldomeProfile(profile)).toContain("CAVE 270 continuity carrier");
  });
});

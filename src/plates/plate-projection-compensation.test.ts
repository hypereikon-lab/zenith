import { describe, expect, test } from "vitest";
import {
  compensatePlateSpinsForProjectionCenterChange,
  shouldCompensateProjectionCenterChange,
} from "./plate-projection-compensation.js";

describe("plate projection center compensation", () => {
  test("rotates plate spins by 180 degrees when switching between zenith and nadir", () => {
    const placements = [
      { azimuth: 12, radius: 0.4, spin: 0, scale: 0.5 },
      { azimuth: -80, radius: 0.7, spin: 35, scale: 0.8 },
      { azimuth: 130, radius: 0.2, spin: -140, scale: 0.3 },
    ];

    const compensated = compensatePlateSpinsForProjectionCenterChange(placements, "zenith-230", "cave-270");

    expect(compensated.map((placement) => placement.spin)).toEqual([-180, -145, 40]);
    expect(compensated.map((placement) => placement.azimuth)).toEqual([12, -80, 130]);
    expect(compensated.map((placement) => placement.radius)).toEqual([0.4, 0.7, 0.2]);
  });

  test("does not rotate plate spins for 180/270 changes with the same center", () => {
    expect(shouldCompensateProjectionCenterChange("zenith-180", "zenith-230")).toBe(false);
    expect(shouldCompensateProjectionCenterChange("cave-270", "nadir-180")).toBe(false);

    const placements = [{ azimuth: 0, radius: 0.5, spin: 27 }];
    const compensated = compensatePlateSpinsForProjectionCenterChange(placements, "cave-270", "nadir-180");

    expect(compensated).toEqual(placements);
    expect(compensated).not.toBe(placements);
  });

  test("switching back restores the original spin values", () => {
    const placements = [
      { spin: -82 },
      { spin: 123 },
      { spin: 0 },
    ];

    const nadir = compensatePlateSpinsForProjectionCenterChange(placements, "zenith-180", "nadir-180");
    const zenith = compensatePlateSpinsForProjectionCenterChange(nadir, "nadir-180", "zenith-180");

    expect(zenith.map((placement) => placement.spin)).toEqual(placements.map((placement) => placement.spin));
  });
});

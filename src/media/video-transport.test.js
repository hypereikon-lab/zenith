import { describe, expect, it } from "vitest";
import { formatMediaTime } from "./video-transport.js";

describe("formatMediaTime", () => {
  it("formats finite seconds with milliseconds", () => {
    expect(formatMediaTime(65.4329)).toBe("01:05.432");
  });

  it("clamps invalid and negative inputs to zero", () => {
    expect(formatMediaTime(Number.NaN)).toBe("00:00.000");
    expect(formatMediaTime(-2)).toBe("00:00.000");
  });
});

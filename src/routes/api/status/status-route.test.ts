import { afterEach, describe, expect, test, vi } from "vitest";
import { GET } from "./+server";

describe("app status route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("returns neutral adapter-node readiness without secrets or paid calls", async () => {
    vi.stubEnv("RUNWAYML_API_SECRET", "should-not-affect-app-status");
    vi.stubEnv("RUNWAY_SKILLS_API_SECRET", "should-not-affect-app-status");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("Unexpected network request from app status route."))),
    );

    const response = await GET({} as Parameters<typeof GET>[0]);
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({
      ok: true,
      service: "zenith",
      runtime: "sveltekit-adapter-node",
      adapter: "node",
    });
    expect(Date.parse(body.timestamp)).not.toBeNaN();
    expect(serialized).not.toContain("RUNWAY");
    expect(serialized).not.toContain("should-not-affect-app-status");
  });
});

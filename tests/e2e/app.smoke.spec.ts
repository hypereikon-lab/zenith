import { expect, test } from "@playwright/test";

test("serves the SvelteKit workbench shell", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.ok()).toBe(true);
  expect(response?.headers()["x-sveltekit-page"]).toBe("true");
  await expect(page).toHaveTitle("Zenith");
  await expect(page.getByRole("main")).toContainText("Artifact workbench");
});

test("exposes the Runway status contract", async ({ request }) => {
  const response = await request.get("/api/runway/status");

  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(typeof body.configured).toBe("boolean");
  expect(body.apiBase).toContain("runwayml.com");
  expect(body.apiVersion).toBe("2024-11-06");
  expect(body.models).toMatchObject({
    inpaint: "gpt_image_2",
    depthMap: "gemini_image3_pro",
    seedance: "seedance2",
    seedanceImage: "seedance2",
  });
});

test("rejects invalid Runway payloads before upstream work", async ({ request }) => {
  const response = await request.post("/api/runway/inpaint", {
    data: { prompt: "repair the dome plate" },
  });

  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.error).toContain("Runway inpaint");
  expect(body.error).toContain("imageDataUrl");
});

test("rejects malformed JSON at the API boundary", async ({ request }) => {
  const response = await request.post("/api/runway/inpaint", {
    data: Buffer.from("{"),
    headers: {
      "content-type": "application/json",
    },
  });

  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.error).toBe("Request body must be valid JSON.");
});

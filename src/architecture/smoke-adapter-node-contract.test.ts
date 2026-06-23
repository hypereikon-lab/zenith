import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const smokeScript = readFileSync(path.join(repoRoot, "scripts/smoke-adapter-node.mjs"), "utf8");
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

describe("adapter-node smoke contract", () => {
  test("keeps production smoke wired through build plus the smoke script", () => {
    expect(packageJson.scripts["smoke:prod"]).toBe("npm run build && node scripts/smoke-adapter-node.mjs");
    expect(packageJson.scripts["smoke:prod:built"]).toBe("node scripts/smoke-adapter-node.mjs");
  });

  test("sanitizes the expected paid-service and prompt-planning environment keys", () => {
    const secretEnvKeys = extractStringArray("SECRET_ENV_KEYS");

    expect(secretEnvKeys).toEqual([
      "RUNWAYML_API_SECRET",
      "RUNWAY_SKILLS_API_SECRET",
      "RUNWAY_API_BASE",
      "RUNWAY_API_VERSION",
      "CODEX_PROMPT_MODEL",
      "CODEX_PROMPT_REASONING",
      "SEEDANCE_PROMPT_PACK_DIR",
      "SEEDANCE_IMAGE_PROMPT_PACK_DIR",
    ]);
    for (const key of secretEnvKeys) {
      expect(smokeScript).toContain(`delete env[key]`);
      expect(smokeScript).toContain(key);
    }
  });

  test("probes only safe local status and page endpoints", () => {
    expect(fetchProbePaths()).toEqual(["/api/status", "/api/runway/status", "/"]);

    for (const disallowedPath of [
      "/api/runway/inpaint",
      "/api/runway/depth-map-stream",
      "/api/runway/seedance",
      "/api/codex/",
      "/api/projects/",
      "/api/jobs/",
    ]) {
      expect(smokeScript).not.toContain(disallowedPath);
    }
  });
});

function extractStringArray(name: string): string[] {
  const declaration = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`).exec(smokeScript);
  if (!declaration) throw new Error(`Could not find ${name} declaration.`);
  return [...declaration[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function fetchProbePaths(): string[] {
  return [...smokeScript.matchAll(/fetch\(`\$\{baseUrl\}([^`]+)`\)/g)].map((match) => match[1]);
}

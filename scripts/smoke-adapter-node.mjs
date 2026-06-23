import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

const HOST = "127.0.0.1";
const START_TIMEOUT_MS = 20_000;
const BUILD_ENTRY = "build/index.js";
const SECRET_ENV_KEYS = [
  "RUNWAYML_API_SECRET",
  "RUNWAY_SKILLS_API_SECRET",
  "RUNWAY_API_BASE",
  "RUNWAY_API_VERSION",
  "CODEX_PROMPT_MODEL",
  "CODEX_PROMPT_REASONING",
  "SEEDANCE_PROMPT_PACK_DIR",
  "SEEDANCE_IMAGE_PROMPT_PACK_DIR",
];

if (!existsSync(BUILD_ENTRY)) {
  throw new Error(`Missing ${BUILD_ENTRY}. Run npm run build before smoke:prod:built.`);
}

const port = await freePort();
const baseUrl = `http://${HOST}:${port}`;
const output = [];
const child = spawn("node", ["build"], {
  env: smokeEnv(port),
  stdio: ["ignore", "pipe", "pipe"],
});

child.stdout.on("data", (chunk) => rememberOutput(output, chunk));
child.stderr.on("data", (chunk) => rememberOutput(output, chunk));

try {
  await waitForServer(`${baseUrl}/api/status`, child, output);
  await assertAppStatus(baseUrl);
  await assertRunwayStatus(baseUrl);
  await assertWorkbenchPage(baseUrl);
  console.log(`Adapter-node smoke passed at ${baseUrl}`);
} finally {
  await stopChild(child);
}

function smokeEnv(port) {
  const env = { ...process.env, HOST, PORT: String(port), NODE_ENV: "production" };
  for (const key of SECRET_ENV_KEYS) {
    delete env[key];
  }
  return env;
}

async function assertAppStatus(baseUrl) {
  const response = await fetch(`${baseUrl}/api/status`);
  assert(response.status === 200, `/api/status returned ${response.status}`);
  assert(response.headers.get("cache-control") === "no-store", "/api/status must be no-store");
  const body = await response.json();
  assert(body.ok === true, "/api/status ok must be true");
  assert(body.service === "zenith", "/api/status service must be zenith");
  assert(body.runtime === "sveltekit-adapter-node", "/api/status runtime mismatch");
  assert(body.adapter === "node", "/api/status adapter mismatch");
  assert(!Number.isNaN(Date.parse(body.timestamp)), "/api/status timestamp must be ISO-like");
}

async function assertRunwayStatus(baseUrl) {
  const response = await fetch(`${baseUrl}/api/runway/status`);
  assert(response.status === 200, `/api/runway/status returned ${response.status}`);
  const body = await response.json();
  assert(body.configured === false, "/api/runway/status should be unconfigured in sanitized smoke env");
  assert(String(body.apiBase || "").includes("runwayml.com"), "/api/runway/status apiBase mismatch");
  assert(body.apiVersion === "2024-11-06", "/api/runway/status apiVersion mismatch");
  assert(body.models?.inpaint === "gpt_image_2", "/api/runway/status inpaint model mismatch");
  assert(body.models?.depthMap === "gemini_image3_pro", "/api/runway/status depth model mismatch");
  assert(body.models?.seedance === "seedance2", "/api/runway/status seedance model mismatch");
}

async function assertWorkbenchPage(baseUrl) {
  const response = await fetch(`${baseUrl}/`);
  assert(response.status === 200, `/ returned ${response.status}`);
  assert(response.headers.get("x-sveltekit-page") === "true", "/ must be served as a SvelteKit page");
  assert(String(response.headers.get("content-type") || "").includes("text/html"), "/ content-type must be HTML");
  const html = await response.text();
  assert(html.includes("<title>Zenith</title>"), "/ page title missing");
}

async function waitForServer(url, child, output) {
  const started = Date.now();
  while (Date.now() - started < START_TIMEOUT_MS) {
    if (child.exitCode !== null) {
      throw new Error(`Adapter-node server exited early with code ${child.exitCode}.\n${output.join("")}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for adapter-node server at ${url}.\n${output.join("")}`);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const timeout = delay(3_000).then(() => "timeout");
  if ((await Promise.race([exited, timeout])) === "timeout" && child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

function rememberOutput(output, chunk) {
  output.push(String(chunk));
  while (output.join("").length > 8_000) {
    output.shift();
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") reject(new Error("Could not allocate a local port."));
        else resolve(address.port);
      });
    });
  });
}

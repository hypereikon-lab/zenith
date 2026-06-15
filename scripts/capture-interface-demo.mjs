import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const CHROME = process.env.CHROME_PATH || (await findChromeExecutable());
const APP_URL = process.env.ZENITH_CAPTURE_APP_URL || "http://127.0.0.1:5173";
const DEBUG_PORT = 9223;
const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 6;
const OUT_DIR =
  process.env.ZENITH_CAPTURE_OUT_DIR || path.join(os.homedir(), "Downloads", "zenith-interface-captures");
const PROFILE_DIR = path.join(process.cwd(), ".tmp-chrome-capture-profile");

class CdpPage {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.loadResolvers = [];
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result || {});
      }
      if (message.method === "Page.loadEventFired") {
        const resolvers = this.loadResolvers.splice(0);
        resolvers.forEach((resolve) => resolve());
      }
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "Page evaluation failed.");
    }
    return result.result?.value;
  }

  waitForLoad(timeout = 15000) {
    return Promise.race([
      new Promise((resolve) => this.loadResolvers.push(resolve)),
      delay(timeout),
    ]);
  }
}

await fs.mkdir(OUT_DIR, { recursive: true });

const chrome = spawn(
  CHROME,
  [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    "--new-window",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--autoplay-policy=no-user-gesture-required",
    "--enable-unsafe-webgpu",
    "--window-size=1080,1920",
    APP_URL,
  ],
  { stdio: "ignore", detached: true },
);
chrome.unref();

await delay(1800);
const page = await connectToFirstPage();
await page.send("Page.enable");
await page.send("Runtime.enable");
await page.send("Emulation.setDeviceMetricsOverride", {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: 1,
  mobile: false,
});
await page.send("Page.navigate", { url: APP_URL });
await page.waitForLoad();

await page.evaluate(`
  (async () => {
    const snapshot = await fetch("/zenith-full-state-current.json").then((response) => response.json());
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("fulldome-workspace-state", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots", { keyPath: "id" });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("snapshots", "readwrite");
        tx.objectStore("snapshots").put(snapshot);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  })()
`);
await page.send("Page.navigate", { url: APP_URL });
await page.waitForLoad();
await delay(6000);
const restored = await page.evaluate(`
  (async () => {
    const snapshot = await new Promise((resolve, reject) => {
      const request = indexedDB.open("fulldome-workspace-state", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("snapshots", "readonly");
        const get = tx.objectStore("snapshots").get("current");
        get.onsuccess = () => resolve(get.result || null);
        get.onerror = () => reject(get.error);
      };
    });
    return {
      hasSnapshot: Boolean(snapshot),
      mediaName: snapshot?.media?.name || "",
      sourcePrefix: String(snapshot?.media?.sourceCanvas || "").slice(0, 32),
      sourceReadout: document.querySelector("#sourceReadout")?.textContent || "",
      platesReadout: document.querySelector("#platesReadout")?.textContent || ""
    };
  })()
`);
console.log("Restore check", restored);

await click(page, "[data-workspace-tab='create']");
await delay(800);
await scrollTo(page, "#platesInput");
await delay(400);
await screenshot(page, "01-create-project-open.png");

await scrollTo(page, "#runwayInpaint");
await delay(500);
await screenshot(page, "02-runway-reconstruction-controls.png");

await click(page, "[data-workspace-tab='review']");
await delay(600);
await click(page, "[data-view='flat']");
await delay(600);
await screenshot(page, "03-review-flat-hud.png");

await click(page, "[data-view='orbit']");
await delay(700);
await screenshot(page, "04-review-orbit-view-selectors.png");

await click(page, "[data-view='theater']");
await delay(700);
await screenshot(page, "05-review-theater-hud.png");

await click(page, "[data-workspace-tab='ship']");
await delay(700);
await scrollTo(page, "#runwayDepthMap");
await delay(500);
await screenshot(page, "06-depth-webgpu-controls.png");

await scrollTo(page, "#seedancePromptPreview");
await delay(500);
await screenshot(page, "07-seedance-prompt-handoff.png");

await scrollTo(page, "#imageSeedancePromptPreview");
await delay(500);
await screenshot(page, "08-image-to-video-prompt-handoff.png");

await recordSequence(page, "01-project-open-source-materials", 4, async (frame) => {
  if (frame === 0) await click(page, "[data-workspace-tab='create']");
  if (frame === 0) await scrollTo(page, "#platesInput");
});

await recordSequence(page, "02-runway-reconstruction-ui", 5, async (frame) => {
  if (frame === 0) {
    await click(page, "[data-workspace-tab='create']");
    await scrollTo(page, "#runwayInpaint");
  }
});

await recordSequence(page, "03-review-modes-and-hud", 8, async (frame) => {
  if (frame === 0) {
    await click(page, "[data-workspace-tab='review']");
    await click(page, "[data-view='flat']");
  }
  if (frame === FPS * 2) await click(page, "[data-view='orbit']");
  if (frame === FPS * 4) await click(page, "[data-view='theater']");
  if (frame === FPS * 6) await click(page, "[data-view='inside']");
});

await recordSequence(page, "04-depth-webgpu-controls", 5, async (frame) => {
  if (frame === 0) {
    await click(page, "[data-workspace-tab='ship']");
    await scrollTo(page, "#runwayDepthMap");
  }
});

await recordSequence(page, "05-seedance-prompt-handoff", 5, async (frame) => {
  if (frame === 0) {
    await click(page, "[data-workspace-tab='ship']");
    await scrollTo(page, "#seedancePromptPreview");
  }
});

console.log(`Captured interface material in ${OUT_DIR}`);

async function connectToFirstPage() {
  const targets = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
  const target = targets.find((entry) => entry.type === "page") || targets[0];
  return new CdpPage(target.webSocketDebuggerUrl);
}

async function click(page, selector) {
  await page.evaluate(`
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (element) element.click();
    })()
  `);
  await delay(250);
}

async function screenshot(page, filename) {
  const result = await page.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true,
  });
  await fs.writeFile(path.isAbsolute(filename) ? filename : path.join(OUT_DIR, filename), Buffer.from(result.data, "base64"));
}

async function recordSequence(page, name, seconds, beforeFrame) {
  const dir = path.join(OUT_DIR, name);
  await fs.mkdir(dir, { recursive: true });
  const frames = Math.round(seconds * FPS);
  for (let frame = 0; frame < frames; frame += 1) {
    await beforeFrame?.(frame);
    await screenshot(page, path.join(dir, `${name}-${String(frame).padStart(4, "0")}.png`));
    await delay(1000 / FPS);
  }
  await encodeSequence(dir, name);
}

async function scrollTo(page, selector) {
  await page.evaluate(`
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return;
      element.scrollIntoView({ block: "center", inline: "nearest" });
    })()
  `);
  await delay(250);
}

function encodeSequence(dir, name) {
  return new Promise((resolve, reject) => {
    const input = path.join(dir, `${name}-%04d.png`);
    const output = path.join(OUT_DIR, `${name}.mp4`);
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-framerate",
      String(FPS),
      "-i",
      input,
      "-r",
      "30",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "18",
      "-preset",
      "medium",
      "-movflags",
      "+faststart",
      output,
    ]);
    ffmpeg.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

async function fetchJson(url) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      await delay(250);
    }
  }
  throw new Error(`Could not fetch ${url}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findChromeExecutable() {
  const candidatesByPlatform = {
    darwin: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      path.join(os.homedir(), "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
    ],
    win32: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "Application", "chrome.exe"),
    ],
    linux: ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"],
  };
  const candidates = candidatesByPlatform[process.platform] || candidatesByPlatform.linux;
  for (const candidate of candidates) {
    if (process.platform === "linux" && !path.isAbsolute(candidate)) return candidate;
    if (await fileExists(candidate)) return candidate;
  }
  throw new Error("Could not find Google Chrome. Set CHROME_PATH to the Chrome executable path.");
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

import { afterEach, describe, expect, test, vi } from "vitest";
import { generateRgbdDepthWithApi, reconstructRgbdProxyWithApi } from "../scene/rgbd-scene-commands.js";
import { rgbdLab } from "../scene/rgbd-scene-store.svelte.js";
import { cancelRgbdPaidAction, confirmRgbdPaidAction, requestRgbdPaidAction } from "./rgbd-lab-commands.js";

vi.mock("../scene/rgbd-scene-commands.js", () => ({
  generateRgbdDepthWithApi: vi.fn().mockResolvedValue(undefined),
  reconstructRgbdProxyWithApi: vi.fn().mockResolvedValue(undefined),
}));

describe("RGBD lab command bridge", () => {
  afterEach(() => {
    rgbdLab.pendingPaidAction = null;
    vi.clearAllMocks();
  });

  test("requests and cancels reconstruction without invoking paid scene commands", () => {
    requestRgbdPaidAction("reconstruct-proxy-view");

    expect(rgbdLab.pendingPaidAction).toEqual({
      id: "reconstruct-proxy-view",
      label: "Reconstruct Proxy View",
      body: "This will send the RGBD proxy view, masks, confidence preview, and visible reconstruction prompt to GPT-image-2.",
    });
    expectNoRgbdPaidCalls();

    cancelRgbdPaidAction();

    expect(rgbdLab.pendingPaidAction).toBeNull();
    expectNoRgbdPaidCalls();
  });

  test("confirms the pending reconstruction action once", async () => {
    requestRgbdPaidAction("reconstruct-proxy-view");

    await confirmRgbdPaidAction();

    expect(rgbdLab.pendingPaidAction).toBeNull();
    expect(reconstructRgbdProxyWithApi).toHaveBeenCalledTimes(1);
    expect(generateRgbdDepthWithApi).not.toHaveBeenCalled();
  });

  test("confirms the pending depth action once", async () => {
    requestRgbdPaidAction("generate-proxy-depth");

    await confirmRgbdPaidAction();

    expect(rgbdLab.pendingPaidAction).toBeNull();
    expect(generateRgbdDepthWithApi).toHaveBeenCalledTimes(1);
    expect(reconstructRgbdProxyWithApi).not.toHaveBeenCalled();
  });

  test("confirming without a pending action is a no-op", async () => {
    await confirmRgbdPaidAction();

    expect(rgbdLab.pendingPaidAction).toBeNull();
    expectNoRgbdPaidCalls();
  });
});

function expectNoRgbdPaidCalls(): void {
  expect(reconstructRgbdProxyWithApi).not.toHaveBeenCalled();
  expect(generateRgbdDepthWithApi).not.toHaveBeenCalled();
}

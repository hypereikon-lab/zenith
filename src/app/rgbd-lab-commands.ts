import { generateRgbdDepthWithApi, reconstructRgbdProxyWithApi } from "../scene/rgbd-scene-commands.js";
import { rgbdLab, type RgbdPendingPaidAction } from "../scene/rgbd-scene-store.svelte.js";

export type RgbdPaidActionId = NonNullable<RgbdPendingPaidAction>["id"];

const RGBD_PAID_ACTIONS: Record<RgbdPaidActionId, NonNullable<RgbdPendingPaidAction>> = {
  "reconstruct-proxy-view": {
    id: "reconstruct-proxy-view",
    label: "Reconstruct Proxy View",
    body: "This will send the RGBD proxy view, masks, confidence preview, and visible reconstruction prompt to GPT-image-2.",
  },
  "generate-proxy-depth": {
    id: "generate-proxy-depth",
    label: "Generate Proxy Depth",
    body: "This will send the reconstructed proxy view and visible depth prompt to the configured Gemini depth endpoint.",
  },
};

export function requestRgbdPaidAction(id: RgbdPaidActionId): void {
  rgbdLab.pendingPaidAction = RGBD_PAID_ACTIONS[id];
}

export function cancelRgbdPaidAction(): void {
  rgbdLab.pendingPaidAction = null;
}

export async function confirmRgbdPaidAction(): Promise<void> {
  const pending = rgbdLab.pendingPaidAction;
  rgbdLab.pendingPaidAction = null;
  if (!pending) return;
  if (pending.id === "reconstruct-proxy-view") {
    await reconstructRgbdProxyWithApi();
    return;
  }
  await generateRgbdDepthWithApi();
}

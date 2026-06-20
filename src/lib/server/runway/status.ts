import { API_BASE, API_VERSION, DEPTH_MAP_MODEL, getRunwayApiKey, INPAINT_MODEL, SEEDANCE_MODEL } from "./config";

export function getRunwayStatus() {
  return {
    configured: Boolean(getRunwayApiKey()),
    apiBase: API_BASE,
    apiVersion: API_VERSION,
    models: {
      inpaint: INPAINT_MODEL,
      depthMap: DEPTH_MAP_MODEL,
      seedance: SEEDANCE_MODEL,
      seedanceImage: SEEDANCE_MODEL,
    },
  };
}

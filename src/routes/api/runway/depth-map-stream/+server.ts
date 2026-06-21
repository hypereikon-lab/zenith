import { createDepthMapCompatibilityStreamResponse } from "$lib/server/jobs/depth-map-job";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  return createDepthMapCompatibilityStreamResponse(request);
};

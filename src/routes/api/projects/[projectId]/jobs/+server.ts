import { createProjectJobResponse } from "$lib/server/jobs/depth-map-job";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ params, request }) => {
  return createProjectJobResponse(request, params.projectId);
};

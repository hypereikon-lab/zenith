import { streamPost } from "$lib/server/route-utils";
import { requestRunwayDepthMap } from "$lib/server/runway/runway-jobs";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  return streamPost(request, requestRunwayDepthMap, "Runway depth request failed");
};

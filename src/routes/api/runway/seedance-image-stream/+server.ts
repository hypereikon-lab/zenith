import { streamPost } from "$lib/server/route-utils";
import { requestRunwaySeedanceImageVideo } from "$lib/server/runway/runway-jobs";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  return streamPost(request, requestRunwaySeedanceImageVideo, "Runway Seedance image-to-video request failed");
};

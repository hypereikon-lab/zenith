import { streamPost } from "$lib/server/route-utils";
import { requestRunwaySeedanceVideo } from "$lib/server/runway/runway-jobs";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  return streamPost(request, requestRunwaySeedanceVideo, "Runway Seedance request failed");
};

import { jsonPost } from "$lib/server/route-utils";
import { requestRunwayInpaint } from "$lib/server/runway/runway-jobs";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  return jsonPost(request, (payload, signal) => requestRunwayInpaint(payload, () => {}, { signal }));
};

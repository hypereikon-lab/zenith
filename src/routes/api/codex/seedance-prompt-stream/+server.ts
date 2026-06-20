import { streamPost } from "$lib/server/route-utils";
import { requestCodexSeedancePrompt } from "$lib/server/runway/codex-planner";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  return streamPost(request, requestCodexSeedancePrompt, "Codex prompt planning failed");
};

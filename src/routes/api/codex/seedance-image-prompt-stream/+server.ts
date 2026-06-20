import { streamPost } from "$lib/server/route-utils";
import { requestCodexSeedanceImagePrompt } from "$lib/server/runway/codex-planner";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  return streamPost(request, requestCodexSeedanceImagePrompt, "Codex image prompt planning failed");
};

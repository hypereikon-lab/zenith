import { json } from "@sveltejs/kit";
import { getAppStatus } from "$lib/server/status";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () => {
  return json(getAppStatus(), {
    headers: {
      "cache-control": "no-store",
    },
  });
};

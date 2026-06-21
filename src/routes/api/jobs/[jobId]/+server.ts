import { json } from "@sveltejs/kit";
import { serverJobStore } from "$lib/server/jobs/in-memory-job-store";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params }) => {
  const job = serverJobStore.getJob(params.jobId);
  const headers = { "cache-control": "no-store" };
  return job ? json(job, { headers }) : json({ error: `Job ${params.jobId} was not found.` }, { status: 404, headers });
};

export const DELETE: RequestHandler = async ({ params }) => {
  const job = serverJobStore.cancelJob(params.jobId);
  return job ? json(job) : json({ error: `Job ${params.jobId} was not found.` }, { status: 404 });
};

import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { jobs } from "@/server/db/schema";
import { verifyContinuation } from "@/server/jobs/continue";
import { runImportJob } from "@/server/library/import-job";
import { runResearchJob } from "@/server/research/jobs";

export const maxDuration = 300;

/** A paused job's next run, requested by the job itself (signed; see src/server/jobs/continue.ts). */
export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!verifyContinuation(jobId, token)) return new Response("Not found", { status: 404 });
  const [job] = await db().select({ kind: jobs.kind, status: jobs.status }).from(jobs).where(eq(jobs.id, jobId));
  if (!job || !["queued", "running"].includes(job.status)) return Response.json({ ok: false });
  if (job.kind === "library_import") after(() => runImportJob(jobId));
  else if (job.kind === "research") after(() => runResearchJob(jobId));
  else return Response.json({ ok: false });
  return Response.json({ ok: true }, { status: 202 });
}

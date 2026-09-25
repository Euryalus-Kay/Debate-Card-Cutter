import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { handle, HttpError, requireTeam, requireUser } from "@/server/authz";
import { db } from "@/server/db/client";
import { jobs } from "@/server/db/schema";
import { getImportJob, runImportJob } from "@/server/library/import-job";

export const maxDuration = 300;

type Ctx = { params: Promise<{ jobId: string }> };

/** Status of an import; a poll also resumes it if its last run ended (timeouts, deploys). */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { jobId } = await ctx.params;
  const u = await requireUser();
  const teamId = new URL(req.url).searchParams.get("teamId") ?? "";
  await requireTeam(u.id, teamId);
  const r = await getImportJob(teamId, jobId);
  if (!r) throw new HttpError(404, "Not found.");
  if (r.needsRunner) after(() => runImportJob(jobId));
  const { job } = r;
  return Response.json({ job: { id: job.id, status: job.status, input: job.input, progress: job.progress, result: job.result, error: job.error, updatedAt: job.updatedAt } });
});

/** Stop an import (cards already imported stay). */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { jobId } = await ctx.params;
  const u = await requireUser();
  const teamId = new URL(req.url).searchParams.get("teamId") ?? "";
  await requireTeam(u.id, teamId);
  await db()
    .update(jobs)
    .set({ cancelRequested: true, updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), eq(jobs.teamId, teamId), eq(jobs.kind, "library_import")));
  return Response.json({ ok: true });
});

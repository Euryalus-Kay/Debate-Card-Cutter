import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { handle, HttpError, requireTeam, requireUser } from "@/server/authz";
import { db } from "@/server/db/client";
import { jobs } from "@/server/db/schema";
import { runCheckJob } from "@/server/library/check-job";

export const maxDuration = 300;

/** A check's progress; a poll also resumes it if its last run ended. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ jobId: string }> }) => {
  const { jobId } = await ctx.params;
  const u = await requireUser();
  const teamId = new URL(req.url).searchParams.get("teamId") ?? "";
  await requireTeam(u.id, teamId);
  const [job] = await db().select().from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.teamId, teamId), eq(jobs.kind, "library_check")));
  if (!job) throw new HttpError(404, "Not found.");
  if ((job.status === "queued" || job.status === "running") && (!job.leaseUntil || job.leaseUntil.getTime() < Date.now())) after(() => runCheckJob(jobId));
  return Response.json({ job: { id: job.id, status: job.status, progress: job.progress, result: job.result } });
});

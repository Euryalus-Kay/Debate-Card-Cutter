import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { handle, HttpError, requireTeam, requireUser } from "@/server/authz";
import { db } from "@/server/db/client";
import { jobs } from "@/server/db/schema";
import { approveFileBuild, getFileBuild, runFileBuild } from "@/server/files/build-job";

export const maxDuration = 300;

type Ctx = { params: Promise<{ jobId: string }> };

/** A build's plan and progress; a poll also resumes a build whose last run ended. */
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { jobId } = await ctx.params;
  const u = await requireUser();
  const teamId = new URL(req.url).searchParams.get("teamId") ?? "";
  await requireTeam(u.id, teamId);
  const r = await getFileBuild(teamId, jobId);
  if (!r) throw new HttpError(404, "Not found.");
  if (r.needsRunner) after(() => runFileBuild(jobId));
  const { job } = r;
  return Response.json({ build: { id: job.id, status: job.status, input: job.input, checkpoint: job.checkpoint, progress: job.progress, result: job.result, error: job.error, updatedAt: job.updatedAt } });
});

const Action = z.discriminatedUnion("action", [
  z.object({ teamId: z.string().min(1), action: z.literal("approve"), removed: z.array(z.string().max(40)).max(100).default([]) }),
  z.object({ teamId: z.string().min(1), action: z.literal("cancel") }),
]);

/** Approve the plan (optionally without some cards) and build it, or stop the build. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { jobId } = await ctx.params;
  const u = await requireUser();
  const p = Action.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Invalid request.");
  await requireTeam(u.id, p.data.teamId);
  if (p.data.action === "cancel") {
    await db()
      .update(jobs)
      .set({ cancelRequested: true, updatedAt: new Date() })
      .where(and(eq(jobs.id, jobId), eq(jobs.teamId, p.data.teamId), eq(jobs.kind, "file_build")));
    // A plan waiting for approval has no runner to notice: stop it now.
    await db()
      .update(jobs)
      .set({ status: "cancelled", error: "Stopped.", updatedAt: new Date() })
      .where(and(eq(jobs.id, jobId), eq(jobs.teamId, p.data.teamId), eq(jobs.status, "awaiting_approval")));
    return Response.json({ ok: true });
  }
  const ok = await approveFileBuild(p.data.teamId, jobId, p.data.removed);
  if (!ok) throw new HttpError(409, "This plan isn't waiting for approval.");
  after(() => runFileBuild(jobId));
  return Response.json({ ok: true });
});

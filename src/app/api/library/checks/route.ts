import { after } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { handle, HttpError, requireTeam, requireUser } from "@/server/authz";
import { db } from "@/server/db/client";
import { jobs } from "@/server/db/schema";
import { checkableCards, createCheckJob, runCheckJob } from "@/server/library/check-job";
import { guardAi } from "@/server/limits";

export const maxDuration = 300;

/** How many cards could be checked, and the latest check. */
export const GET = handle(async (req: Request) => {
  const u = await requireUser();
  const teamId = new URL(req.url).searchParams.get("teamId") ?? "";
  await requireTeam(u.id, teamId);
  const [latest] = await db()
    .select({ id: jobs.id, status: jobs.status, progress: jobs.progress, result: jobs.result, createdAt: jobs.createdAt })
    .from(jobs)
    .where(and(eq(jobs.teamId, teamId), eq(jobs.kind, "library_check")))
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  return Response.json({ checkable: (await checkableCards(teamId)).length, latest: latest ?? null });
});

/** Check every imported or unverified card that links to its source. */
export const POST = handle(async (req: Request) => {
  const u = await requireUser();
  const p = z.object({ teamId: z.string().min(1) }).safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Invalid request.");
  await requireTeam(u.id, p.data.teamId);
  await guardAi("library_check", u.id, p.data.teamId);
  const r = await createCheckJob(p.data.teamId, u.id);
  if (!r) throw new HttpError(409, "No imported cards with a link to check.");
  after(() => runCheckJob(r.jobId));
  return Response.json(r, { status: 202 });
});

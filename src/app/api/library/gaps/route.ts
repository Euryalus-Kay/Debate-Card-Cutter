import { after } from "next/server";
import { z } from "zod";
import { handle, HttpError, requireTeam, requireUser } from "@/server/authz";
import { createGapJob, latestGapJob, runGapJob } from "@/server/library/gaps";
import { guardAi } from "@/server/limits";

export const maxDuration = 300;

/** The team's latest library review (partners share it). */
export const GET = handle(async (req: Request) => {
  const u = await requireUser();
  const teamId = new URL(req.url).searchParams.get("teamId") ?? "";
  await requireTeam(u.id, teamId);
  return Response.json({ job: await latestGapJob(teamId) });
});

/** Review the library against the topic: what's covered, what's missing, arguments worth building. */
export const POST = handle(async (req: Request) => {
  const u = await requireUser();
  const p = z.object({ teamId: z.string().min(1), focus: z.string().max(600).optional() }).safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Invalid request.");
  await requireTeam(u.id, p.data.teamId);
  const running = await latestGapJob(p.data.teamId);
  if (running?.status === "running") return Response.json({ jobId: running.id });
  await guardAi("library_gaps", u.id, p.data.teamId);
  const jobId = await createGapJob(p.data.teamId, u.id, p.data.focus?.trim() || undefined);
  after(() => runGapJob(jobId));
  return Response.json({ jobId });
});

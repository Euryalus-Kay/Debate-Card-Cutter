/**
 * Research jobs: POST starts one (runs after the response is sent), GET lists
 * the team's recent jobs.
 */

import { after } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { handle, HttpError, requireAccess, requireTeam, requireUser } from "@/server/authz";
import { db } from "@/server/db/client";
import { rounds } from "@/server/db/schema";
import { aiAllowed } from "@/server/ai/policy";
import { createResearchJob, listResearchJobs, ResearchInput, runResearchJob } from "@/server/research/jobs";

export const maxDuration = 300;

const Body = z.object({ teamId: z.string(), input: ResearchInput, idempotencyKey: z.string().max(80).optional() });

export const POST = handle(async (req: Request) => {
  const u = await requireUser();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid research request.");
  const { teamId, input, idempotencyKey } = parsed.data;
  await requireTeam(u.id, teamId);
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(503, "AI is not configured on the server.");
  if (input.roundId) {
    const roundTeam = await requireAccess(u.id, "round", input.roundId);
    if (roundTeam !== teamId) throw new HttpError(404, "Not found.");
    const [round] = await db().select().from(rounds).where(eq(rounds.id, input.roundId));
    if (!aiAllowed(round)) throw new HttpError(403, "AI is turned off for this round (tournament rules setting).");
  }
  if (!input.search && !input.urls?.length && !input.text) throw new HttpError(400, "Give URLs, paste text, or turn on web search.");
  const jobId = await createResearchJob(teamId, u.id, input, idempotencyKey);
  after(() => runResearchJob(jobId));
  return Response.json({ jobId }, { status: 202 });
});

export const GET = handle(async (req: Request) => {
  const u = await requireUser();
  const teamId = new URL(req.url).searchParams.get("teamId");
  if (!teamId) throw new HttpError(400, "teamId is required.");
  await requireTeam(u.id, teamId);
  return Response.json({ jobs: await listResearchJobs(teamId) });
});

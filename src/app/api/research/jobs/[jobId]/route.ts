/**
 * A research job's progress, log, and resulting cards. Polling this also
 * resumes a job whose runner stopped (timeout, deploy, crash).
 */

import { after } from "next/server";
import { handle, HttpError, requireAccess, requireUser } from "@/server/authz";
import { getCards } from "@/server/cards";
import { getResearchJob, runResearchJob, type ResearchCheckpoint } from "@/server/research/jobs";

export const maxDuration = 300;

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ jobId: string }> }) => {
  const { jobId } = await ctx.params;
  const u = await requireUser();
  const teamId = await requireAccess(u.id, "job", jobId);
  const found = await getResearchJob(teamId, jobId);
  if (!found) throw new HttpError(404, "Not found.");
  if (found.needsRunner && !found.job.cancelRequested) after(() => runResearchJob(jobId));
  const cp = found.job.checkpoint as ResearchCheckpoint;
  const cardIds = cp.items.map((i) => i.cardId).filter((x): x is string => !!x);
  const cards = await getCards(teamId, cardIds);
  return Response.json({
    job: { id: found.job.id, status: found.job.status, input: found.job.input, progress: found.job.progress, checkpoint: cp, result: found.job.result, error: found.job.error, cancelRequested: found.job.cancelRequested, createdAt: found.job.createdAt, updatedAt: found.job.updatedAt, attempts: found.job.attempts },
    events: found.events.map((e) => ({ id: e.id, level: e.level, stage: e.stage, message: e.message, at: e.createdAt })),
    cards,
  });
});

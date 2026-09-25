/**
 * Checking many cards against their sources (B4 follow-up): every imported or unverified card whose citation
 * links to a page is checked word for word (src/server/card-verify.ts), as a job that checkpoints and
 * continues itself. No model writes anything; a page that can't be read leaves its card unchanged.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { cards, jobs } from "@/server/db/schema";
import { newId } from "@/server/ids";
import { checkCardAgainstSource } from "@/server/card-verify";
import { continueJob } from "@/server/jobs/continue";

const LEASE_SECONDS = 90;
const RUN_BUDGET_MS = 200_000;
const PARALLEL = 3;

export interface CheckCheckpoint {
  pending: string[];
  done: { cardId: string; outcome: string }[];
}

/** Cards worth checking: not verified yet, with a link in the citation. */
export async function checkableCards(teamId: string): Promise<string[]> {
  const rows = await db()
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.teamId, teamId), isNull(cards.deletedAt), inArray(cards.verificationStatus, ["imported", "unverified"]), sql`coalesce(${cards.citation}->>'url', '') ~* '^https?://'`))
    .limit(2000);
  return rows.map((r) => r.id);
}

export async function createCheckJob(teamId: string, userId: string): Promise<{ jobId: string; cards: number } | null> {
  const ids = await checkableCards(teamId);
  if (!ids.length) return null;
  const id = newId("job");
  await db().insert(jobs).values({ id, teamId, kind: "library_check", status: "queued", input: { cards: ids.length }, checkpoint: { pending: ids, done: [] } satisfies CheckCheckpoint, progress: [{ done: 0, total: ids.length }], createdBy: userId });
  return { jobId: id, cards: ids.length };
}

export function checkSummary(cp: CheckCheckpoint) {
  const count = (o: string) => cp.done.filter((d) => d.outcome === o).length;
  return { total: cp.pending.length + cp.done.length, done: cp.done.length, verified: count("verified"), close: count("close"), mismatch: count("mismatch"), unreachable: count("unreachable") + count("partial_source") + count("error"), noLink: count("no_link") };
}

export async function runCheckJob(jobId: string): Promise<void> {
  const [job] = await db()
    .update(jobs)
    .set({ status: "running", leaseUntil: sql`now() + make_interval(secs => ${LEASE_SECONDS})`, attempts: sql`${jobs.attempts} + 1`, updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), eq(jobs.kind, "library_check"), sql`${jobs.status} in ('queued','running')`, sql`(${jobs.leaseUntil} is null or ${jobs.leaseUntil} < now())`, eq(jobs.cancelRequested, false)))
    .returning();
  if (!job) return;
  const started = Date.now();
  const cp = job.checkpoint as CheckCheckpoint;
  const save = (extra: Record<string, unknown> = {}) =>
    db()
      .update(jobs)
      .set({ checkpoint: cp, progress: [checkSummary(cp)], leaseUntil: sql`now() + make_interval(secs => ${LEASE_SECONDS})`, updatedAt: new Date(), ...extra })
      .where(eq(jobs.id, jobId));
  while (cp.pending.length && Date.now() - started < RUN_BUDGET_MS) {
    const batch = cp.pending.slice(0, PARALLEL);
    const results = await Promise.all(
      batch.map(async (cardId) => {
        try {
          return { cardId, outcome: (await checkCardAgainstSource(job.teamId, cardId)).outcome as string };
        } catch {
          return { cardId, outcome: "error" };
        }
      }),
    );
    cp.pending = cp.pending.slice(batch.length);
    cp.done.push(...results);
    await save();
    const [{ c }] = await db().select({ c: jobs.cancelRequested }).from(jobs).where(eq(jobs.id, jobId));
    if (c) {
      await save({ status: "cancelled", leaseUntil: null, result: checkSummary(cp) });
      return;
    }
  }
  if (cp.pending.length) {
    await save({ leaseUntil: null });
    await continueJob(jobId, job.attempts);
    return;
  }
  await save({ status: "succeeded", leaseUntil: null, result: checkSummary(cp) });
}

/**
 * Guards on routes that spend AI (Phase G): a per-user burst limit (a runaway client loop can't run up a
 * bill) and the team's monthly budget (the owner sets it; estimated from recorded token counts). Both
 * answer 429 with a plain explanation. Counts live in the database, so they hold across server instances.
 */

import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { rateHits, teams, telemetry } from "@/server/db/schema";
import { costOf } from "@/server/ai/cost";
import { aiFake } from "@/server/ai/run";
import { HttpError } from "@/server/authz";

export const LIMITS = {
  ai_op: { n: 30, sec: 60, what: "AI requests" },
  cx: { n: 20, sec: 60, what: "cross-ex requests" },
  highlight: { n: 30, sec: 60, what: "highlighting requests" },
  library_find: { n: 60, sec: 60, what: "library checks" },
  transcribe: { n: 12, sec: 60, what: "transcription requests" },
  research: { n: 30, sec: 3600, what: "research jobs" },
  file_build: { n: 20, sec: 3600, what: "file plans" },
  library_check: { n: 3, sec: 3600, what: "bulk source checks" },
  card_check: { n: 60, sec: 60, what: "source checks" },
  import: { n: 30, sec: 3600, what: "file imports" },
} as const;
export type LimitKind = keyof typeof LIMITS;

export async function rateLimit(kind: LimitKind, userId: string): Promise<void> {
  // The fake model (tests, local development) spends nothing, so there is nothing to protect.
  if (aiFake()) return;
  const { n, sec, what } = LIMITS[kind];
  const key = `${kind}:${userId}`;
  const [{ c }] = (await db()
    .select({ c: sql<number>`count(*)::int` })
    .from(rateHits)
    .where(and(eq(rateHits.key, key), gte(rateHits.at, sql`now() - make_interval(secs => ${sec})`)))) as { c: number }[];
  if (c >= n) throw new HttpError(429, `Too many ${what} in a short time (limit ${n} per ${sec >= 3600 ? "hour" : "minute"}). Wait a moment and try again.`);
  await db().insert(rateHits).values({ key });
  // Now and then, forget hits older than a day.
  if (Math.random() < 0.02) await db().delete(rateHits).where(lt(rateHits.at, sql`now() - interval '1 day'`)).catch(() => undefined);
}

const spendCache = new Map<string, { at: number; usd: number }>();

/** The team's estimated AI spend since the start of this calendar month (UTC), cached for a minute. */
export async function monthSpendUsd(teamId: string): Promise<number> {
  const hit = spendCache.get(teamId);
  if (hit && Date.now() - hit.at < 60_000) return hit.usd;
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await db()
    .select({ name: telemetry.name, data: telemetry.data })
    .from(telemetry)
    .where(and(eq(telemetry.teamId, teamId), eq(telemetry.kind, "ai"), gte(telemetry.createdAt, start)));
  let usd = 0;
  for (const r of rows) {
    const d = r.data as { usage?: Parameters<typeof costOf>[1]; searches?: number } | null;
    usd += (costOf(r.name.split(":")[1] ?? "", d?.usage) ?? 0) + (d?.searches ?? 0) * 0.01;
  }
  spendCache.set(teamId, { at: Date.now(), usd });
  return usd;
}

export async function teamCapUsd(teamId: string): Promise<number> {
  const [t] = await db().select({ cap: teams.aiMonthlyCapUsd }).from(teams).where(eq(teams.id, teamId));
  return t?.cap ?? 50;
}

/** Refuse new AI work once the month's spend reaches the team's budget. */
export async function assertBudget(teamId: string): Promise<void> {
  const [usd, cap] = await Promise.all([monthSpendUsd(teamId), teamCapUsd(teamId)]);
  if (usd >= cap) throw new HttpError(429, `This month's AI budget is used up (about $${usd.toFixed(2)} of $${cap}). The team owner can raise it in Settings; typed notes, the flow and your cards keep working.`);
}

/** Both guards for a request that spends AI. */
export async function guardAi(kind: LimitKind, userId: string, teamId: string): Promise<void> {
  await assertBudget(teamId);
  await rateLimit(kind, userId);
}

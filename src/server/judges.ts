/**
 * Judge profiles stored with the round. A profile is derived from the judge's
 * paradigm text and refreshed whenever that text changes.
 */

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { rounds } from "@/server/db/schema";
import { extractJudgeProfile, type JudgeProfile } from "@/server/ai/paradigm";

export interface StoredJudge {
  name: string;
  paradigmText: string;
  paradigmUrl: string;
  notes: string;
  profile?: (JudgeProfile & { sourceHash: string; model: string; at: string; dropped: string[] }) | null;
  profileError?: string | null;
  /** set while a profile is being extracted, so parallel requests don't start duplicates */
  profilePendingAt?: string | null;
}

export const paradigmHash = (text: string) => createHash("sha256").update(text.trim()).digest("hex").slice(0, 16);

/** Keep server-derived profiles when a client re-sends judges without them (same paradigm text). */
export function mergeJudges(incoming: Omit<StoredJudge, "profile" | "profileError">[], existing: StoredJudge[]): StoredJudge[] {
  return incoming.map((j) => {
    const same = existing.find((e) => e.paradigmText.trim() === j.paradigmText.trim() && e.profile);
    return same ? { ...j, profile: same.profile, profileError: null } : { ...j, profile: null, profileError: null };
  });
}

const PENDING_MS = 120_000;

/** Judges whose profile is missing or out of date (and not already being extracted). */
export function judgesNeedingProfile(judges: StoredJudge[]): StoredJudge[] {
  return judges.filter(
    (j) =>
      j.paradigmText.trim().length >= 40 &&
      j.profile?.sourceHash !== paradigmHash(j.paradigmText) &&
      !j.profileError &&
      !(j.profilePendingAt && Date.now() - new Date(j.profilePendingAt).getTime() < PENDING_MS),
  );
}

async function markPending(roundId: string, text: string, value: string | null) {
  const [fresh] = await db().select({ judges: rounds.judges }).from(rounds).where(eq(rounds.id, roundId));
  const list = ((fresh?.judges ?? []) as StoredJudge[]).map((x) => (x.paradigmText.trim() === text.trim() ? { ...x, profilePendingAt: value } : x));
  await db().update(rounds).set({ judges: list }).where(eq(rounds.id, roundId));
}

/** Extract profiles for judges whose paradigm changed. Safe to call repeatedly. */
export async function refreshJudgeProfiles(roundId: string): Promise<void> {
  const [round] = await db().select({ judges: rounds.judges, teamId: rounds.teamId }).from(rounds).where(eq(rounds.id, roundId));
  if (!round) return;
  const work = judgesNeedingProfile((round.judges ?? []) as StoredJudge[]).map((j) => ({ j }));
  for (const { j } of work) {
    await markPending(roundId, j.paradigmText, new Date().toISOString());
    let update: Partial<StoredJudge>;
    try {
      const { profile, dropped, model } = await extractJudgeProfile(j.paradigmText, round.teamId);
      update = { profile: { ...profile, sourceHash: paradigmHash(j.paradigmText), model, at: new Date().toISOString(), dropped }, profileError: null };
    } catch (e) {
      update = { profileError: e instanceof Error ? e.message : String(e) };
    }
    // Re-read before writing so concurrent edits to other judges (or this text) aren't lost.
    const [fresh] = await db().select({ judges: rounds.judges }).from(rounds).where(eq(rounds.id, roundId));
    const list = ((fresh?.judges ?? []) as StoredJudge[]).map((x) => (x.paradigmText.trim() === j.paradigmText.trim() ? { ...x, ...update, profilePendingAt: null } : x));
    await db().update(rounds).set({ judges: list, updatedAt: new Date() }).where(eq(rounds.id, roundId));
  }
}

/**
 * Who gives a speech (FMT-2) and whose speaking rates time it. The roster maps
 * speaker positions (1A, 2A, 1N, 2N) to team members' user ids (or names for
 * people without an account); per-speech overrides handle swapped rebuttals.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { teamMembers, userSettings } from "@/server/db/schema";
import { speakerFor, type SpeechId } from "@/domain/format";
import type { RateProfile } from "@/domain/timing";

export async function ratesForSpeech(
  round: { teamId: string; roster: unknown; speakerOverrides: unknown },
  speech: SpeechId,
  requesterId: string,
): Promise<{ rates: RateProfile | null; speakerId: string | null }> {
  const speaker = speakerFor(speech, (round.roster ?? {}) as Record<string, string>, (round.speakerOverrides ?? {}) as Record<string, string>);
  const candidates = [speaker, requesterId].filter((x): x is string => !!x);
  // Only team members' profiles are used (a roster entry may be a plain name).
  const members = await db()
    .select({ userId: teamMembers.userId, rateProfile: userSettings.rateProfile })
    .from(teamMembers)
    .leftJoin(userSettings, eq(userSettings.userId, teamMembers.userId))
    .where(and(eq(teamMembers.teamId, round.teamId), inArray(teamMembers.userId, candidates)));
  const bySpeaker = members.find((m) => m.userId === speaker);
  if (bySpeaker?.rateProfile) return { rates: bySpeaker.rateProfile as RateProfile, speakerId: speaker ?? null };
  const own = members.find((m) => m.userId === requesterId);
  return { rates: (own?.rateProfile as RateProfile | null) ?? null, speakerId: bySpeaker ? speaker ?? null : null };
}

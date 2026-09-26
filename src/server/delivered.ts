/**
 * After a speech is delivered (B3 and the analytics bank): where each library card was read, and the
 * team's answer sections with the arguments they answered, so later drafts can adapt how the team answered
 * similar arguments before. Re-delivering a draft replaces its rows.
 */

import { and, eq, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { analyticsBank, cardUses, cards, rounds } from "@/server/db/schema";
import { allSections, type Draft, type DraftItem } from "@/shared/draft-model";
import type { ArgUnit, Position } from "@/domain/flow";
import { SPEECHES, type SpeechId } from "@/domain/format";
import { contentWords } from "@/server/library/find";

export async function recordDelivery(args: { teamId: string; roundId: string; draftId: string; speech: SpeechId; draft: Draft; flowArgs: ArgUnit[]; positions: Position[] }): Promise<{ cards: number; answers: number }> {
  const { teamId, roundId, draftId, speech, draft } = args;
  const argById = new Map(args.flowArgs.map((a) => [a.id, a]));
  const posName = new Map(args.positions.map((p) => [p.id, p.name]));
  const read = new Set<string>();
  const bank: (typeof analyticsBank.$inferInsert)[] = [];
  for (const s of allSections(draft)) {
    const cardsHere = s.items.filter((i): i is Extract<DraftItem, { type: "card" }> => i.type === "card" && i.read !== "skipped");
    for (const c of cardsHere) if (c.cardId) read.add(c.cardId);
    const analytic = s.items
      .filter((i) => i.type === "paragraph")
      .map((i) => (i as { text: string }).text.trim())
      .filter(Boolean)
      .join("\n");
    const answered = s.targets.map((t) => argById.get(t)).filter((a): a is ArgUnit => !!a);
    if (analytic.split(/\s+/).length < 8 || !answered.length || (s.relation !== "answers" && s.relation !== "group")) continue;
    bank.push({
      id: `ab_${draftId.slice(-10)}_${s.id}`.slice(0, 80),
      teamId,
      roundId,
      draftId,
      sectionId: s.id,
      speech,
      position: posName.get(answered[0].positionId) ?? "",
      answers: answered.map((a) => a.text).join(" | ").slice(0, 2000),
      title: s.title.slice(0, 300),
      analytic: analytic.slice(0, 4000),
      cites: cardsHere.map((c) => c.shortCite).filter(Boolean),
      side: SPEECHES[speech].side,
    });
  }
  // Card uses: only this team's live library cards.
  const ids = read.size ? (await db().select({ id: cards.id }).from(cards).where(and(eq(cards.teamId, teamId), inArray(cards.id, [...read]), isNull(cards.deletedAt)))).map((r) => r.id) : [];
  await db().delete(cardUses).where(and(eq(cardUses.draftId, draftId), ids.length ? notInArray(cardUses.cardId, ids) : sql`true`));
  if (ids.length) await db().insert(cardUses).values(ids.map((cardId) => ({ teamId, cardId, draftId, roundId, speech, deliveredAt: new Date() }))).onConflictDoUpdate({ target: [cardUses.cardId, cardUses.draftId], set: { deliveredAt: new Date(), speech } });
  const sectionIds = bank.map((b) => b.sectionId);
  await db().delete(analyticsBank).where(and(eq(analyticsBank.draftId, draftId), sectionIds.length ? notInArray(analyticsBank.sectionId, sectionIds) : sql`true`));
  for (const b of bank) await db().insert(analyticsBank).values(b).onConflictDoUpdate({ target: [analyticsBank.draftId, analyticsBank.sectionId], set: { position: b.position, answers: b.answers, title: b.title, analytic: b.analytic, cites: b.cites, speech, side: b.side } });
  return { cards: ids.length, answers: bank.length };
}

export interface PastAnswer {
  needId: string;
  speech: string;
  position: string;
  answered: string;
  title: string;
  analytic: string;
  cites: string[];
  where: string;
  /** set for analytics imported from a file: its name */
  source: string;
}

/**
 * The team's past answers to arguments like these, best matches first: from other rounds and from imported
 * files. With a side, only that side's answers (and ones whose side is unknown).
 */
export async function pastAnswers(teamId: string, roundId: string, needs: { id: string; text: string }[], opts: { perNeed?: number; max?: number; side?: "aff" | "neg" } = {}): Promise<PastAnswer[]> {
  const out: PastAnswer[] = [];
  const seen = new Set<string>();
  for (const n of needs) {
    const words = contentWords(n.text, 10);
    if (words.length < 2) continue;
    const q = words.join(" | ");
    const rows = await db()
      .select({ id: analyticsBank.id, speech: analyticsBank.speech, position: analyticsBank.position, answers: analyticsBank.answers, title: analyticsBank.title, analytic: analyticsBank.analytic, cites: analyticsBank.cites, source: analyticsBank.source, tournament: rounds.tournament, roundLabel: rounds.roundLabel, rank: sql<number>`ts_rank_cd(${analyticsBank.search}, to_tsquery('english', ${q}))` })
      .from(analyticsBank)
      .leftJoin(rounds, eq(rounds.id, analyticsBank.roundId))
      .where(
        and(
          eq(analyticsBank.teamId, teamId),
          or(isNull(analyticsBank.roundId), ne(analyticsBank.roundId, roundId)),
          opts.side ? inArray(analyticsBank.side, ["", opts.side]) : undefined,
          sql`${analyticsBank.search} @@ to_tsquery('english', ${q})`,
        ),
      )
      .orderBy(sql`ts_rank_cd(${analyticsBank.search}, to_tsquery('english', ${q})) desc`)
      .limit(opts.perNeed ?? 2);
    for (const r of rows) {
      if (seen.has(r.id) || Number(r.rank) < 0.05) continue;
      seen.add(r.id);
      out.push({ needId: n.id, speech: r.speech, position: r.position, answered: r.answers, title: r.title, analytic: r.analytic, cites: (r.cites as string[]) ?? [], where: [r.tournament, r.roundLabel].filter(Boolean).join(" "), source: r.source });
      if (out.length >= (opts.max ?? 8)) return out;
    }
  }
  return out;
}

/**
 * Finding library cards for what a speech must do (Phase B2). Postgres finds
 * candidates for each need (full text over tag, cite, labels and card text,
 * plus tag similarity, limited to cards our side reads); a cheap model then
 * rates how well each candidate fits (0–3) and says what it proves there.
 * Only cards that fit reach the drafter, each with that reason, so the library
 * is used when it helps and never for its own sake. The model never writes
 * card text; it only rates.
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { cards, evidenceChecks } from "@/server/db/schema";
import { readAloud, type BodyBlock } from "@/domain/card";
import { runStructured } from "@/server/ai/run";

export interface EvidenceNeed {
  /** the flow argument (or other key) the evidence is for */
  id: string;
  text: string;
  /** answer: evidence against their argument; support: evidence for ours */
  intent: "answer" | "support";
  position?: string;
}

export interface EvidenceFit {
  needId: string;
  /** 3 proves it; 2 helps */
  fit: number;
  /** what the card proves for this need, in one sentence */
  use: string;
}

export interface FoundEvidence {
  /** card id → the needs it fits, best first */
  byCard: Map<string, EvidenceFit[]>;
  /** card ids to offer, best first, at most `maxCards` */
  cardIds: string[];
  candidates: number;
  rated: number;
  ms: number;
  /** why nothing was checked (empty library, no needs, timed out) */
  skipped?: string;
  /** needs answered from the cache (checked earlier against the same library) */
  cached?: number;
}

interface Candidate {
  id: string;
  tag: string;
  shortCite: string;
  body: BodyBlock[];
  meta: { side?: string; argType?: string; position?: string; role?: string; claim?: string } | null;
  /** the file headings it was imported under */
  labels: string[] | null;
  rank: number;
}

const STOP = new Set(
  "a about above after again against all also am an and any are as at be because been before being below between both but by can cannot could did do does doing down during each even every few for from further had has have having he her here hers him his how i if in into is it its itself just less more most much must my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yet".split(" "),
);

/** The distinctive words of a need (for the full-text query). */
export function contentWords(text: string, max = 14): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  return [...new Set(words)].slice(0, max);
}

async function candidatesFor(teamId: string, need: EvidenceNeed, side: "aff" | "neg", limit: number): Promise<Candidate[]> {
  const words = contentWords(`${need.position ?? ""} ${need.text}`);
  if (!words.length) return [];
  const tsq = words.join(" | ");
  const position = (need.position ?? "").trim();
  const res = await db().execute(sql`
    with q as (select to_tsquery('english', ${tsq}) as tsq)
    select c.id, c.tag, c.short_cite as "shortCite", c.body, c.meta, c.labels,
      (ts_rank_cd(c.search, q.tsq) + similarity(c.tag, ${need.text}) * 0.5
        + case when ${position} <> '' and coalesce(c.meta->>'position', '') ilike ${`%${position}%`} then 0.3 else 0 end) as rank
    from ${cards} c, q
    where c.team_id = ${teamId} and c.deleted_at is null
      and (c.meta->>'side' is null or c.meta->>'side' in (${side}, 'either'))
      and (c.search @@ q.tsq or c.tag % ${need.text})
    order by rank desc
    limit ${limit}
  `);
  return (res as unknown as { rows: Candidate[] }).rows.map((r) => ({ ...r, rank: Number(r.rank) }));
}

export const FitSchema = z.object({
  cards: z
    .array(z.object({ card: z.string().describe("the card's key, e.g. c3"), side: z.enum(["aff", "neg", "either"]).describe("which side reads this card: from what it argues and its file headings; either = general impact, theory, or framing evidence both sides use") }))
    .describe("First: every card's side"),
  ratings: z
    .array(
      z.object({
        need: z.number().describe("the need's number"),
        card: z.string().describe("the card's key, e.g. c3"),
        fit: z.number().describe("2 helps, 3 proves it"),
        use: z.string().describe("what the card proves for this need, in at most 15 words from its words"),
      }),
    )
    .describe("Only the pairs that fit (2 or 3); leave out every pair rated 0 or 1"),
});

const SYSTEM = `You check whether evidence cards from a policy debate team's library fit what a speech needs. The prompt says which side the team is on. First say which side reads each card (aff, neg, or either). Then, for each need, rate each listed card:
3 = the card's read text itself proves what the need calls for;
2 = it helps (proves part of it, or supports it with one inference a debater can make out loud);
1 = on the topic but doesn't prove it;
0 = irrelevant, or it is the other side's evidence.
List only the pairs rated 2 or 3. Judge from the card's words (tags can overstate). To answer an opponent's argument, a card must be one our side would read against it (e.g. non-unique, no link, a turn, a solvency deficit, an impact defense). A card that makes their argument is 0 even when it is on the same topic: when we answer their counterplan, a card saying the counterplan solves is theirs; when we answer their disad, a card proving its link is theirs. File headings help ("2AC —" and "1AR —" blocks are the aff's answers; "1NC —", "2NC —" and "CP" solvency files are the neg's). For each pair you list, say in at most 15 words what the card proves there, using only its words.`;

function renderCandidate(key: string, c: Candidate): string {
  const read = readAloud(c.body).text.split(/\s+/).slice(0, 70).join(" ");
  const labels = c.meta ? [c.meta.side ? `${c.meta.side} card` : "", c.meta.argType, c.meta.position, c.meta.role].filter(Boolean).join(" · ") : "";
  const file = (c.labels ?? []).filter(Boolean).slice(0, 4).join(" > ");
  return `[${key}] TAG: ${c.tag.slice(0, 240)} | CITE: ${c.shortCite}${file ? ` | FILE: ${file.slice(0, 160)}` : ""}${labels ? ` | LABELS: ${labels}` : ""}${c.meta?.claim ? ` | CLAIM: ${c.meta.claim}` : ""}\n     READS: ${read}`;
}

function describeNeed(n: EvidenceNeed): string {
  const where = n.position ? ` (${n.position})` : "";
  return n.intent === "answer" ? `Answer their argument${where}: "${n.text.slice(0, 300)}"` : `Support our argument${where}: "${n.text.slice(0, 300)}"`;
}

/** Overlap-based ratings for tests and AI_FAKE. */
function fakeRatings(groups: { n: number; need: EvidenceNeed; keys: string[] }[], byKey: Map<string, Candidate>): z.infer<typeof FitSchema> {
  const ratings: z.infer<typeof FitSchema>["ratings"] = [];
  const cards = [...byKey.entries()].map(([key, c]) => ({ card: key, side: (c.meta?.side === "aff" || c.meta?.side === "neg" ? c.meta.side : "either") as "aff" | "neg" | "either" }));
  for (const g of groups) {
    const want = new Set(contentWords(g.need.text, 30));
    for (const key of g.keys) {
      const c = byKey.get(key)!;
      const shared = contentWords(`${c.tag} ${c.meta?.claim ?? ""}`, 40).filter((w) => want.has(w));
      const fit = shared.length >= 3 ? 3 : shared.length === 2 ? 2 : shared.length === 1 ? 1 : 0;
      if (fit >= 2) ratings.push({ need: g.n, card: key, fit, use: `[AI_FAKE] shares ${shared.join(", ")}` });
    }
  }
  return { cards, ratings };
}

/** A need's cache key: the same argument, for the same side, gets the same check. */
function needHash(n: EvidenceNeed, side: string): string {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return createHash("sha256").update(`${side}|${n.intent}|${norm(n.position ?? "")}|${norm(n.text)}`).digest("hex").slice(0, 32);
}

/** The library's state: any card added, changed or removed makes every cached check stale. */
async function libraryStamp(teamId: string): Promise<{ stamp: string; count: number }> {
  const [r] = (await db()
    .select({ n: sql<number>`count(*)::int`, at: sql<string | null>`max(${cards.updatedAt})::text` })
    .from(cards)
    .where(and(eq(cards.teamId, teamId), isNull(cards.deletedAt)))) as { n: number; at: string | null }[];
  return { stamp: `${r.n}:${r.at ?? ""}`, count: r.n };
}

type CachedFit = { cardId: string; fit: number; use: string };

/** Check needs against the library (no cache): candidates, then the model's sides and fits. */
async function checkNeeds(teamId: string, needs: EvidenceNeed[], side: "aff" | "neg", perNeed: number, signal: AbortSignal, onUsage?: (u: { inputTokens?: number; outputTokens?: number } | null) => void): Promise<{ fits: CachedFit[][]; sides: Record<string, string>[]; candidates: number }> {
  const lists = await Promise.all(needs.map((n) => candidatesFor(teamId, n, side, perNeed)));
  const byId = new Map<string, Candidate>();
  for (const l of lists) for (const c of l) byId.set(c.id, c);
  const fits: CachedFit[][] = needs.map(() => []);
  const sides: Record<string, string>[] = needs.map(() => ({}));
  if (!byId.size) return { fits, sides, candidates: 0 };
  // Calls of up to 3 needs, run in parallel: output length sets the time, so smaller is faster.
  const groups = needs.map((need, i) => ({ i, n: i + 1, need, ids: lists[i].map((c) => c.id) })).filter((g) => g.ids.length);
  const batches: (typeof groups)[] = [];
  for (let i = 0; i < groups.length; i += 3) batches.push(groups.slice(i, i + 3));
  await Promise.all(
    batches.map(async (batch) => {
      const ids = [...new Set(batch.flatMap((g) => g.ids))];
      const keyOf = new Map(ids.map((id, i) => [id, `c${i + 1}`]));
      const byKey = new Map(ids.map((id) => [keyOf.get(id)!, byId.get(id)!]));
      const keyed = batch.map((g) => ({ ...g, keys: g.ids.map((id) => keyOf.get(id)!) }));
      const us = side.toUpperCase();
      const them = side === "aff" ? "NEG" : "AFF";
      const prompt = `We are the ${us}; the opponent is the ${them}. Every need is for the ${us}: a card fits only if the ${us} would read it there.\n\nCARDS\n${ids.map((id) => renderCandidate(keyOf.get(id)!, byId.get(id)!)).join("\n")}\n\nNEEDS\n${keyed.map((g) => `N${g.n}. ${describeNeed(g.need)} → rate ${g.keys.join(", ")}`).join("\n")}\n\nList every card's side, then only the pairs that fit.`;
      const res = await runStructured({ task: "evidence_fit", system: SYSTEM, prompt, schema: FitSchema, teamId, abortSignal: signal, fake: () => fakeRatings(keyed, byKey) });
      onUsage?.(res.usage);
      const sideOf = new Map(res.output.cards.map((c) => [c.card, c.side]));
      for (const g of keyed) for (const k of g.keys) sides[g.i][byKey.get(k)!.id] = sideOf.get(k) ?? "unknown";
      for (const r of res.output.ratings) {
        const g = keyed.find((x) => x.n === Math.round(r.need));
        const card = byKey.get(r.card);
        if (!g || !card || !g.keys.includes(r.card) || r.fit < 2) continue;
        // The other side's evidence never fits, however it was rated.
        const cardSide = sideOf.get(r.card);
        if (cardSide && cardSide !== "either" && cardSide !== side) continue;
        if (!fits[g.i].some((f) => f.cardId === card.id)) fits[g.i].push({ cardId: card.id, fit: Math.min(3, Math.round(r.fit)), use: r.use.trim().slice(0, 240) });
      }
    }),
  );
  return { fits, sides, candidates: byId.size };
}

export async function findEvidence(
  teamId: string,
  needs: EvidenceNeed[],
  opts: { side: "aff" | "neg"; exclude?: Set<string>; skip?: (c: { tag: string; shortCite: string }) => boolean; perNeed?: number; maxCards?: number; timeoutMs?: number; abortSignal?: AbortSignal; onUsage?: (u: { inputTokens?: number; outputTokens?: number } | null) => void },
): Promise<FoundEvidence> {
  const t0 = Date.now();
  const empty = (skipped: string, candidates = 0): FoundEvidence => ({ byCard: new Map(), cardIds: [], candidates, rated: 0, ms: Date.now() - t0, skipped });
  if (!needs.length) return empty("nothing to find evidence for");
  const { stamp, count } = await libraryStamp(teamId);
  if (!count) return empty("the library is empty");

  // Cached checks for this library state; the rest are checked now and cached.
  const hashes = needs.map((n) => needHash(n, opts.side));
  const cached = await db()
    .select()
    .from(evidenceChecks)
    .where(and(eq(evidenceChecks.teamId, teamId), inArray(evidenceChecks.needHash, [...new Set(hashes)]), eq(evidenceChecks.libraryStamp, stamp)));
  const cache = new Map(cached.map((r) => [r.needHash, r.fits as CachedFit[]]));
  const todo = needs.map((n, i) => ({ n, i, h: hashes[i] })).filter((x) => !cache.has(x.h));
  let candidates = 0;
  if (todo.length) {
    const timeout = AbortSignal.timeout(opts.timeoutMs ?? 15_000);
    const signal = opts.abortSignal ? AbortSignal.any([opts.abortSignal, timeout]) : timeout;
    try {
      const r = await checkNeeds(teamId, todo.map((x) => x.n), opts.side, opts.perNeed ?? 8, signal, opts.onUsage);
      candidates = r.candidates;
      const unique = new Map(todo.map((x, k) => [x.h, { teamId, needHash: x.h, libraryStamp: stamp, fits: r.fits[k], sides: r.sides[k], checkedAt: new Date() }]));
      const rows = [...unique.values()];
      for (const row of rows) cache.set(row.needHash, row.fits);
      if (rows.length)
        await db()
          .insert(evidenceChecks)
          .values(rows)
          .onConflictDoUpdate({ target: [evidenceChecks.teamId, evidenceChecks.needHash], set: { libraryStamp: sql`excluded.library_stamp`, fits: sql`excluded.fits`, sides: sql`excluded.sides`, checkedAt: sql`excluded.created_at` } });
    } catch (e) {
      if (opts.abortSignal?.aborted) throw e;
      // A slow or failed check never holds up the speech: go on with what was cached.
      if (!cache.size) return empty(timeout.aborted ? "the library check timed out" : `the library check failed: ${(e as Error).message.slice(0, 120)}`, candidates);
    }
  }

  // This round's filters: cards already in the speech or picked by the team, and the other side's own cards.
  const fitIds = [...new Set([...cache.values()].flat().map((f) => f.cardId))];
  const rows = fitIds.length ? await db().select({ id: cards.id, tag: cards.tag, shortCite: cards.shortCite }).from(cards).where(and(eq(cards.teamId, teamId), inArray(cards.id, fitIds), isNull(cards.deletedAt))) : [];
  const usable = new Set(rows.filter((c) => !opts.exclude?.has(c.id) && !opts.skip?.(c)).map((c) => c.id));
  const byCard = new Map<string, EvidenceFit[]>();
  let rated = 0;
  needs.forEach((n, i) => {
    for (const f of cache.get(hashes[i]) ?? []) {
      if (!usable.has(f.cardId)) continue;
      rated++;
      const list = byCard.get(f.cardId) ?? [];
      if (!list.some((x) => x.needId === n.id)) list.push({ needId: n.id, fit: f.fit, use: f.use });
      byCard.set(f.cardId, list);
    }
  });
  for (const list of byCard.values()) list.sort((a, b) => b.fit - a.fit);
  // Offer the best two per need, then no more than maxCards in all.
  const maxCards = opts.maxCards ?? 12;
  const chosen: string[] = [];
  const fitFor = (id: string, needId: string) => byCard.get(id)?.find((f) => f.needId === needId)?.fit ?? 0;
  for (const n of needs) {
    const best = [...byCard.keys()].filter((id) => fitFor(id, n.id) > 0).sort((a, b) => fitFor(b, n.id) - fitFor(a, n.id));
    for (const id of best.slice(0, 2)) if (!chosen.includes(id) && chosen.length < maxCards) chosen.push(id);
  }
  return { byCard, cardIds: chosen, candidates, rated, ms: Date.now() - t0, cached: needs.length - todo.length };
}

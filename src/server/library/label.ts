/**
 * Library labels (Phase B1): side, argument type, the position it belongs to, its role in that argument, what
 * the card proves, and where it fits (which speeches read it and what it answers or sets up), so the team and
 * its AI can find the right card and use it well. When the file's tag doesn't say the card's claim ("Extend
 * Shepherd 22", "AND by impeachment"), a clearer tag is suggested; the file's own tag is never replaced.
 * A cheap model reads the tag, cite, file headings, the tag of the card before it, and the words a debater
 * reads; code then drops any claim or suggested tag with a number, name or author the card doesn't contain.
 */

import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { readAloud, verbatimText, type BodyBlock } from "@/domain/card";
import { retagProblems, spanWarnings } from "@/domain/span-check";
import { tagWarnings } from "@/domain/verify";
import { runStructured } from "@/server/ai/run";
import { ARG_TYPES, CARD_ROLES, SPEECH_NAMES, metaText, type CardMeta } from "@/domain/card-label";

export { ARG_TYPES, CARD_ROLES, SPEECH_NAMES, labelLine, metaText, type CardMeta } from "@/domain/card-label";
import { db } from "@/server/db/client";
import { cards } from "@/server/db/schema";

export const CardLabelSchema = z.object({
  cards: z.array(
    z.object({
      n: z.number().describe("the card's number in the list"),
      side: z.enum(["aff", "neg", "either"]).describe("which side reads it"),
      argType: z.enum(ARG_TYPES),
      position: z.string().describe("the argument it belongs to, in 1–5 words (e.g. 'Politics DA', 'States CP', 'Cap K', 'Heg advantage')"),
      role: z.enum(CARD_ROLES),
      claim: z.string().describe("what the card proves, in one plain sentence of at most 25 words, from its words only"),
      use: z.string().describe("where it fits and how a speech uses it, at most 25 words: the speech(es) and what it answers or sets up"),
      speeches: z.array(z.enum(SPEECH_NAMES)).describe("the speeches that would read it"),
      tagClear: z.boolean().describe("true when the file's tag states the card's claim on its own"),
      suggestedTag: z.string().describe("only when tagClear is false: a clear debate-style tag of at most 15 words from the card's own words; otherwise empty"),
    }),
  ),
});

export interface LabelInput {
  tag: string;
  cite: string;
  path: string[];
  body: BodyBlock[];
  fileName?: string;
  /** the tag of the card just before it in the same block, for tags that point back ("That turns the economy") */
  prevTag?: string;
}

const SYSTEM = `You label policy debate evidence cards for a team's library, so the team and its AI can find each card and use it well in a speech. For each card you see its file, the headings above it, the tag the debaters wrote, the tag of the card just before it in the same block, its cite, and the words a debater reads. Say:
- side: aff, neg, or either (general impact or theory cards). The file's name and headings usually say it ("NEG Core", "1NC", "2NC v …" are neg; "1AC", "2AC", "Aff …" are aff).
- argType: the kind of argument (advantage, solvency, inherency, plan, disad, counterplan, kritik, topicality, theory, case_answer, impact, framework, other).
- position: the main argument it belongs to, in 1–4 words, as its file's headings name it ("Midterms DA", "States CP", "T---Multi Payer", "Costs advantage"); never a sub-part ("Midterms DA", not "Midterms DA - ACA").
- role: what it does in that argument (uniqueness, link, internal_link, impact, solvency, answer, turn, alternative, perm, interpretation, standard, framework, other).
- claim: what the card itself proves, in one plain sentence of at most 25 words, only from its words. Keep its hedges ("may", "likely"); no number, name or date the card doesn't contain.
- use: where the card fits and how a speech uses it, in at most 25 words: the speech(es) and what it answers or sets up (e.g. "2AC answer to the States CP: only federal action gives uniform coverage", "1NC link for the Midterms DA; extend in the 2NC"). Never refer to cards by their number in this list.
- speeches: the speeches of its side that would read it (aff: 1AC, 2AC, 1AR, 2AR; neg: 1NC, 2NC, 1NR, 2NR).
- tagClear: false ONLY when the tag can't be understood without the card or the card before it: a pointer or label ("Extend Shepherd 22", "Ext", "Card 2", "AND by impeachment", "That turns the economy", "It's the top issue"), a bare cite, or a fragment. A tag that states a claim is clear even if it is informal or you would word it differently: tagClear true, suggestedTag "".
- suggestedTag: only when tagClear is false, a clear tag in debate style (a claim, at most 15 words) from the card's own words, never stronger than the evidence; otherwise "".
Headings: "AT: X" or "A2 X" blocks answer the other side's argument X, read by the file's own side (in a neg file, AT blocks are the neg's 2NC/1NR answers to the 2AC; in an aff file, the aff's 2AC/1AR answers). "Link---2NC", "UQ---2NC", "EXT" name the part and the speech. A note like "<<<1NC Jackson>>>" in a tag means the card re-reads the 1NC's Jackson card. Never invent facts.`;

/**
 * A tag that doesn't state a claim on its own: a pointer ("That turns the economy", "AND by impeachment"), an
 * extension label ("Extend Shepherd 22"), a very short label, or a re-read note.
 */
export function unclearTag(tag: string): boolean {
  const t = tag.replace(/<<<[^>]*>>>/g, " ").replace(/^[\s*•\-–—\d.)]+/, "").replace(/^(?:[A-Z]{2,5}\b[\s:\-–—]*)+(?=[A-Z])/, "").trim();
  if (/<<<|>>>/.test(tag) && t.split(/\s+/).length <= 8) return true;
  if (t.split(/\s+/).filter(Boolean).length <= 4) return true;
  return /^(?:that|this|these|those|it|it['’]s|its|they|and|also|plus|which|so|ext|ext\.|extend|extension|extends|card\b|same|more|another|re-?read|reading)\b/i.test(t);
}

/** Keep only what the card's own words support. */
export function checkLabel(meta: CardMeta, card: { tag: string; body: BodyBlock[]; path?: string[]; fileName?: string }): CardMeta {
  const text = verbatimText(card.body);
  const dropped: string[] = [];
  // "Medicare for All" is a name, not an absolute claim.
  const problems = (s: string) => [...retagProblems(s, { tag: card.tag, text }), ...tagWarnings(s.replace(/medicare\s+for\s+all/gi, "M4A"), card.body).map((w) => w.message)];
  const out: CardMeta = { ...meta };
  if (out.claim) {
    const p = problems(out.claim);
    if (p.length) {
      dropped.push(`claim "${out.claim}": ${p[0]}`);
      out.claim = "";
    }
  }
  if (out.suggestedTag) {
    const p = problems(out.suggestedTag);
    if (p.length) {
      dropped.push(`suggested tag "${out.suggestedTag}": ${p[0]}`);
      out.suggestedTag = undefined;
    }
  }
  if (out.use) {
    // Position and speech names come from the file; numbers and authors must be in the card.
    const p = spanWarnings({ replacement: out.use, allowed: `${card.tag}\n${text}\n${(card.path ?? []).join("\n")}\n${card.fileName ?? ""}` });
    if (p.length) {
      dropped.push(`use "${out.use}": ${p[0]}`);
      out.use = undefined;
    }
  }
  if (dropped.length) out.dropped = dropped;
  return out;
}

export async function labelCards(items: LabelInput[], opts: { teamId: string; abortSignal?: AbortSignal; onUsage?: (u: { inputTokens?: number; outputTokens?: number } | null) => void }): Promise<(CardMeta | null)[]> {
  if (!items.length) return [];
  const list = items
    .map((c, i) => {
      const read = readAloud(c.body).text.split(/\s+/).slice(0, 110).join(" ");
      return `${i + 1}. FILE: ${c.fileName ?? ""} ${c.path.filter(Boolean).length ? `> ${c.path.filter(Boolean).join(" > ")}` : ""}\n   TAG: ${c.tag.slice(0, 300)}${c.prevTag ? `\n   CARD BEFORE IT: ${c.prevTag.slice(0, 200)}` : ""}\n   CITE: ${c.cite.slice(0, 160)}\n   READ: ${read}`;
    })
    .join("\n");
  const res = await runStructured({
    task: "card_label",
    system: SYSTEM,
    prompt: `${list}\n\nLabel every card above, by its number.`,
    schema: CardLabelSchema,
    teamId: opts.teamId,
    abortSignal: opts.abortSignal,
    // Side from the file's headings, as a reader would (neg speeches or files → neg; aff ones → aff).
    fake: () => ({
      cards: items.map((c, i) => {
        const where = `${c.fileName ?? ""} ${c.path.join(" ")}`;
        const side = /\b(1NC|2NC|1NR|2NR|neg)\b/i.test(where) ? ("neg" as const) : /\b(1AC|2AC|1AR|2AR|aff)\b/i.test(where) ? ("aff" as const) : ("either" as const);
        const speech = /\b(1AC|1NC|2AC|2NC|1NR|1AR|2NR|2AR)\b/i.exec(where)?.[1].toUpperCase() as (typeof SPEECH_NAMES)[number] | undefined;
        const clear = c.tag.split(/\s+/).length > 4 && !/^(ext(end)?|and|that|this)\b/i.test(c.tag);
        const firstWords = readAloud(c.body).text.split(/\s+/).slice(0, 10).join(" ");
        return { n: i + 1, side, argType: "other" as const, position: c.path.filter(Boolean).slice(-1)[0]?.slice(0, 40) ?? "", role: "other" as const, claim: c.tag.slice(0, 120), use: speech ? `Read in the ${speech}.` : "", speeches: speech ? [speech] : [], tagClear: clear, suggestedTag: clear ? "" : firstWords };
      }),
    }),
  });
  opts.onUsage?.(res.usage);
  const out: (CardMeta | null)[] = items.map(() => null);
  for (const c of res.output.cards) {
    const i = Math.round(c.n) - 1;
    if (i < 0 || i >= items.length || out[i]) continue;
    const ofSide = c.side === "aff" ? /^[12]A/ : c.side === "neg" ? /^[12]N/ : /./;
    const meta: CardMeta = {
      side: c.side,
      argType: c.argType,
      // The main argument only: "Midterms DA - ACA" → "Midterms DA".
      position: c.position.split(/\s+[-–—:]+\s+/)[0].trim().slice(0, 60),
      role: c.role,
      claim: c.claim.slice(0, 280),
      use: c.use.trim().slice(0, 280) || undefined,
      speeches: [...new Set(c.speeches)].filter((sp) => ofSide.test(sp)),
      // A suggestion only for a tag that really needs one; a clear tag is the debaters' own and stays.
      suggestedTag: !c.tagClear && unclearTag(items[i].tag) && c.suggestedTag.trim() ? c.suggestedTag.trim().slice(0, 200) : undefined,
      by: "ai",
    };
    out[i] = checkLabel(meta, { tag: items[i].tag, body: items[i].body, path: items[i].path, fileName: items[i].fileName });
  }
  return out;
}

/**
 * Label (or relabel) library cards and save the labels. Cards are labeled in the order given, and each sees the
 * tag of the card before it when both sit in the same block of the same file.
 */
export async function labelAndSave(teamId: string, ids: string[], opts: { abortSignal?: AbortSignal; fileName?: string; before?: string } = {}): Promise<number> {
  if (!ids.length) return 0;
  const rows = await db()
    .select({ id: cards.id, tag: cards.tag, shortCite: cards.shortCite, body: cards.body, importedFrom: cards.importedFrom })
    .from(cards)
    .where(and(eq(cards.teamId, teamId), inArray(cards.id, opts.before ? [...ids, opts.before] : ids)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
  // The card just before this batch (labeled already) gives the first card its context.
  const before = opts.before ? byId.get(opts.before) : undefined;
  const from = (r: (typeof ordered)[number]) => (r.importedFrom ?? {}) as { path?: string[]; fileName?: string; uploadId?: string };
  const inputs: LabelInput[] = ordered.map((r, i) => {
    const f = from(r);
    const prev = i > 0 ? ordered[i - 1] : before;
    const samePlace = prev && from(prev).uploadId === f.uploadId && (from(prev).path ?? []).join("\u0001") === (f.path ?? []).join("\u0001");
    return { tag: r.tag, cite: r.shortCite, body: r.body as BodyBlock[], path: (f.path ?? []) as string[], fileName: opts.fileName ?? f.fileName, prevTag: samePlace ? prev.tag : undefined };
  });
  const metas = await labelCards(inputs, { teamId, abortSignal: opts.abortSignal });
  await Promise.all(ordered.map((r, i) => (metas[i] ? db().update(cards).set({ meta: metas[i] as CardMeta, metaText: metaText(metas[i]!) }).where(eq(cards.id, r.id)) : Promise.resolve())));
  return metas.filter(Boolean).length;
}

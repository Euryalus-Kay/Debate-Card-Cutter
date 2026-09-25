/**
 * Highlighting: decide what the speaker reads aloud.
 *
 * The model writes the read-aloud text itself — the sentences a judge will
 * hear — using only the card's words in order (a short version to highlight
 * and a longer one to underline). Code aligns those words onto the verbatim
 * text (domain/align.ts), adds back any skipped negation or qualifier, and
 * measures the result. If the read is off target or choppy, the model gets
 * one precise revision request.
 */

import { z } from "zod";
import { runStructured } from "@/server/ai/run";
import type { ModelSpec } from "@/server/ai/models";
import { applyReadPlan, type AppliedPlan, type ReadNote, type ReadPlan } from "@/domain/align";
import { highlightMetrics, type HighlightMetrics } from "@/domain/highlight-metrics";
import { makeText, readAloud, type BodyBlock, type BodyText } from "@/domain/card";

export const ReadPlanSchema = z.object({
  mainPoint: z.string().describe("In your own words (not read aloud): the claim and the reason the read must convey, ≤ 25 words."),
  readShort: z.string().describe("The highlighted read: exactly the words the speaker says, copied from the card in order, skipping words but never adding, changing, or reordering any."),
  readLong: z.string().describe("The underlined read: a longer version (about twice as long) that contains every word of readShort plus the next most important support, same rules."),
  emphasis: z.array(z.string()).describe("Up to 3 of the most important words or short phrases inside readShort."),
});
export type ReadPlanOutput = z.infer<typeof ReadPlanSchema>;

export const HIGHLIGHT_RULES = `How to highlight a debate card (the highlighted words are exactly what the speaker reads aloud; everything else stays in the card, unread). Judges hear only the read words, and opponents check them against the full text.
1. Read in sentences a judge can follow at speed. Each read sentence is grammatical English on its own, with its subject, its verb, and its object or complement: "climate change poses an existential threat to civilization", not "climate existential threat civilization".
2. Read the author's point AND its reason: the claim plus a warrant (the cause, mechanism, data, or evidence behind it). The read alone must support the tag.
3. Cut what doesn't carry the argument: attributions ("he said", "according to"), institutional detail, examples beyond the best one, repetition, and intensifiers that don't change what's true ("very", "dramatically"). Keep load-bearing modifiers: an adjective like "slower-than-expected" can be the whole mechanism.
4. Never make the author say something else:
   - Read every negation that applies to words you read (not, no, never, cannot, without, fail to). Skipping the rejected half of "not X but Y" or "X, not Y" is fine.
   - Read hedges and scope words with the words they govern (may, could, likely, suggests, some, most, often, nearly): "may fear", not "fear".
   - Numbers travel with their frame: the unit, the bound ("as much as", "up to", "at least"), the baseline ("from 52 to 38 minutes"), and the scope or time ("in a pilot at two ports", "by 2030").
   - Don't stop right before a "but / however / although / unless" clause that limits what you read: read it, or leave that claim out.
   - Never read a view the author reports in order to reject it ("critics argue …") as if it were the author's.
5. Read phrases, not scattered words: prefer runs of 3+ words; single words only for a number or a key noun. A read sentence never ends on "the / a / of / to / and / that". After "a" or "an", the next word you read must still take that article.
6. Join sentences only faithfully: skip forward within a paragraph, in order, and never pair a subject from one sentence with a predicate about something else in another.
7. Only whole words; only words that appear in the card; in the card's order.`;

const SYSTEM = `You highlight evidence cards for high school policy debate.

${HIGHLIGHT_RULES}

You will get the card's tag (the debater's claim) and its text in numbered paragraphs. Produce the read-aloud text directly: readShort is what gets highlighted, readLong (a superset of readShort) is what gets underlined. Code will locate your words in the card; words that aren't in the card, or are out of order, are dropped.`;

export interface HighlightRequest {
  tag: string;
  /** the card's verbatim blocks; existing marks are ignored (a fresh highlight) */
  body: BodyBlock[];
  /** how many words the highlighted read should be */
  targetWords: number;
  /** how far the read may stray from the target before it's redone (default 0.3) */
  tolerance?: number;
  models?: ModelSpec[];
  teamId?: string | null;
  signal?: AbortSignal;
  /** allow one revision round when the first result misses the target or reads choppy */
  repair?: boolean;
}

export interface QualityIssue {
  code: "too_long" | "too_short" | "choppy" | "dangling" | "not_in_card" | "no_verb" | "tag_number_unread" | "straw_man" | ReadNote["code"];
  message: string;
  /** shown to the debater but not a reason to redo the highlighting */
  note?: boolean;
}

export interface HighlightResult {
  body: BodyBlock[];
  plan: ReadPlan & { mainPoint: string };
  metrics: HighlightMetrics;
  read: string;
  issues: QualityIssue[];
  protectedWords: string[];
  unmatched: string[];
  runs: { model: string; ms: number; ttftMs: number | null; usage: unknown }[];
  repaired: boolean;
}

/** Word target for a read of `seconds` at `cardWpm`. */
export function wordsForReadSeconds(seconds: number, cardWpm: number): number {
  return Math.max(12, Math.round((seconds * cardWpm) / 60));
}

/** Default target: about a fifth of the card, between 35 and 90 words (roughly 10–20 s for a fast reader). */
export function defaultTargetWords(body: BodyBlock[]): number {
  const words = body.filter((b): b is BodyText => b.kind === "text").reduce((a, b) => a + (b.text.match(/\S+/g)?.length ?? 0), 0);
  return Math.max(35, Math.min(90, Math.round(words * 0.2)));
}

const numbersIn = (t: string) => new Set((t.match(/\d[\d,.]*\d|\d/g) ?? []).map((n) => n.replace(/,/g, "")));

/** `tolerance`: how far the read may stray from the target (a known speech's target is held closer). */
export function assessRead(metrics: HighlightMetrics, targetWords: number, applied: Pick<AppliedPlan, "unmatchedShort" | "notes">, ctx: { tag?: string; cardText?: string } = {}, tolerance = 0.3): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const unmatched = applied.unmatchedShort;
  if (metrics.readWords > targetWords * (1 + tolerance)) issues.push({ code: "too_long", message: `The read is ${metrics.readWords} words; the target is about ${targetWords}. Cut the least important phrases.` });
  if (metrics.readWords < targetWords * (1 - tolerance)) issues.push({ code: "too_short", message: `The read is ${metrics.readWords} words; the target is about ${targetWords}. Add the next most important support.` });
  if (metrics.readWords >= 20 && (metrics.fragmentsPer100 > 30 || (metrics.fragments >= 4 && metrics.oneWordFragmentShare > 0.35)))
    issues.push({ code: "choppy", message: `The read is split into ${metrics.fragments} separate pieces (${metrics.fragmentsPer100.toFixed(0)} per 100 words, ${Math.round(metrics.oneWordFragmentShare * 100)}% single words). Read longer phrases.` });
  if (metrics.danglingEnds >= 2) issues.push({ code: "dangling", message: `${metrics.danglingEnds} read sentences stop on a word like "is/the/of" while the sentence goes on, which leaves the listener hanging.` });
  if (metrics.sentencesWithVerbShare < 0.6) issues.push({ code: "no_verb", message: "Several read sentences have no verb, so they don't say anything happens." });
  if (unmatched.length > 2) issues.push({ code: "not_in_card", message: `These words aren't in the card (or were out of order) and were dropped: ${unmatched.slice(0, 8).join(", ")}.` });
  // The read alone must support the tag: a figure the tag cites (and the card contains) has to be read.
  if (ctx.tag && ctx.cardText) {
    const inCard = numbersIn(ctx.cardText);
    const read = numbersIn(metrics.readText);
    const missing = [...numbersIn(ctx.tag)].filter((n) => inCard.has(n) && !read.has(n));
    if (missing.length) issues.push({ code: "tag_number_unread", message: `The tag cites ${missing.join(", ")}, but the read skips it. Read the figure (with its unit and bound) or the tag isn't supported by what's read.` });
  }
  for (const n of applied.notes) {
    if (n.strawMan) issues.push({ code: "straw_man", message: `${n.message} Read the author's own conclusion instead.` });
    else issues.push({ code: n.code, message: n.message, note: true });
  }
  return issues;
}

/** Problems worth a second attempt (notes are only shown). */
export const fixableIssues = (issues: QualityIssue[]) => issues.filter((i) => !i.note);
const fixable = fixableIssues;

function numbered(blocks: BodyText[]): string {
  return blocks.map((b, i) => `[${i + 1}] ${b.text}`).join("\n\n");
}

/** Highlight a card from scratch (text unchanged; marks replaced). */
export async function highlightCard(req: HighlightRequest): Promise<HighlightResult> {
  const blocks = req.body.filter((b): b is BodyText => b.kind === "text").map((b) => makeText(b.text, { newParagraph: b.newParagraph, sourceRange: b.sourceRange }));
  const runs: HighlightResult["runs"] = [];
  const ask = async (extra: string) => {
    const res = await runStructured({
      task: "card_cut",
      system: SYSTEM,
      prompt: `TAG: ${req.tag}\n\nTarget: readShort about ${req.targetWords} words (±15%); readLong about ${Math.round(req.targetWords * 2)} words.\n\nCARD TEXT:\n${numbered(blocks)}${extra}`,
      schema: ReadPlanSchema,
      abortSignal: req.signal,
      teamId: req.teamId ?? null,
      models: req.models,
    });
    runs.push({ model: res.model, ms: res.totalMs, ttftMs: res.ttftMs, usage: res.usage });
    return res.output;
  };

  const ctx = { tag: req.tag, cardText: blocks.map((b) => b.text).join("\n") };
  let plan = await ask("");
  let applied = applyReadPlan(blocks, plan);
  let body = rebuild(req.body, applied.body);
  let metrics = highlightMetrics(body);
  let issues = assessRead(metrics, req.targetWords, applied, ctx, req.tolerance);
  let repaired = false;
  if (fixable(issues).length && req.repair !== false) {
    const feedback = `\n\nYOUR PREVIOUS readShort, as it lands in the card (… marks skipped text):\n"${metrics.readText}"\n\nFix these problems and return the full plan again:\n${fixable(issues).map((i) => `- ${i.message}`).join("\n")}`;
    const second = await ask(feedback);
    const applied2 = applyReadPlan(blocks, second);
    const body2 = rebuild(req.body, applied2.body);
    const metrics2 = highlightMetrics(body2);
    const issues2 = assessRead(metrics2, req.targetWords, applied2, ctx, req.tolerance);
    // Keep the revision only if it is at least as good.
    if (fixable(issues2).length <= fixable(issues).length) {
      plan = second;
      applied = applied2;
      body = body2;
      metrics = metrics2;
      issues = issues2;
      repaired = true;
    }
  }
  return {
    body,
    plan,
    metrics,
    read: readAloud(body).text,
    issues,
    protectedWords: applied.protectedWords,
    unmatched: applied.unmatchedShort,
    runs,
    repaired,
  };
}

/** Put newly marked text blocks back in place of the originals (omissions/insertions untouched). */
function rebuild(original: BodyBlock[], marked: BodyText[]): BodyBlock[] {
  let k = 0;
  return original.map((b) => (b.kind === "text" ? { ...marked[k++], sourceRange: b.sourceRange } : b));
}

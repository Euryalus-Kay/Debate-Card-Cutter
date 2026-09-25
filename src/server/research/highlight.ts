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
import { applyReadPlan, type ReadPlan } from "@/domain/align";
import { highlightMetrics, type HighlightMetrics } from "@/domain/highlight-metrics";
import { makeText, readAloud, type BodyBlock, type BodyText } from "@/domain/card";

export const ReadPlanSchema = z.object({
  mainPoint: z.string().describe("In your own words (not read aloud): the claim and the reason the read must convey, ≤ 25 words."),
  readShort: z.string().describe("The highlighted read: exactly the words the speaker says, copied from the card in order, skipping words but never adding, changing, or reordering any."),
  readLong: z.string().describe("The underlined read: a longer version (about twice as long) that contains every word of readShort plus the next most important support, same rules."),
  emphasis: z.array(z.string()).describe("Up to 3 of the most important words or short phrases inside readShort."),
});
export type ReadPlanOutput = z.infer<typeof ReadPlanSchema>;

export const HIGHLIGHT_RULES = `How to highlight a debate card (the highlighted words are exactly what the speaker reads aloud; everything else stays in the card, unread):
1. Write the read as sentences a judge can follow at speed. Each read sentence keeps its subject, its verb, and its object or complement, so the words make sense heard in order, e.g. "climate change poses an existential threat to civilization", not "climate existential threat civilization".
2. Carry the author's point AND its reason: the claim plus the warrant (the cause, mechanism, data, or evidence behind it). A card that only asserts the tag is weak.
3. Cut everything that doesn't carry the argument: attributions ("according to the report"), hedging filler that doesn't change the meaning, examples beyond the best one, repetition, adjectives and adverbs that add nothing.
4. Never change what the author says: keep negations (not, no, never, fail) and real qualifiers (may, could, likely, some, only) in any sentence you read, keep numbers with what they measure, and never read a view the author goes on to reject as if it were theirs.
5. Read in phrases, not scattered words: prefer runs of 3+ words; single words only for a number or a key noun; don't end a phrase on "the, a, of, to, and" unless the next phrase finishes it.
6. Only whole words; only words that appear in the card; in the card's order.`;

const SYSTEM = `You highlight evidence cards for high school policy debate.

${HIGHLIGHT_RULES}

You will get the card's tag (the debater's claim) and its text in numbered paragraphs. Produce the read-aloud text directly: readShort is what gets highlighted, readLong (a superset of readShort) is what gets underlined. Code will locate your words in the card; words that aren't in the card, or are out of order, are dropped.`;

export interface HighlightRequest {
  tag: string;
  /** the card's verbatim blocks; existing marks are ignored (a fresh highlight) */
  body: BodyBlock[];
  /** how many words the highlighted read should be */
  targetWords: number;
  models?: ModelSpec[];
  teamId?: string | null;
  signal?: AbortSignal;
  /** allow one revision round when the first result misses the target or reads choppy */
  repair?: boolean;
}

export interface QualityIssue {
  code: "too_long" | "too_short" | "choppy" | "dangling" | "not_in_card" | "no_verb";
  message: string;
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

export function assessRead(metrics: HighlightMetrics, targetWords: number, unmatched: string[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (metrics.readWords > targetWords * 1.3) issues.push({ code: "too_long", message: `The read is ${metrics.readWords} words; the target is about ${targetWords}. Cut the least important phrases.` });
  if (metrics.readWords < targetWords * 0.7) issues.push({ code: "too_short", message: `The read is ${metrics.readWords} words; the target is about ${targetWords}. Add the next most important support.` });
  if (metrics.fragmentsPer100 > 30 && metrics.readWords >= 20) issues.push({ code: "choppy", message: `The read is split into ${metrics.fragments} separate pieces (${metrics.fragmentsPer100.toFixed(0)} per 100 words). Read longer phrases.` });
  if (metrics.danglingShare > 0.3) issues.push({ code: "dangling", message: `${Math.round(metrics.danglingShare * 100)}% of the read phrases end on a word like "the/of/to/and", which leaves the listener hanging.` });
  if (metrics.sentencesWithVerbShare < 0.6) issues.push({ code: "no_verb", message: "Several read sentences have no verb, so they don't say anything happens." });
  if (unmatched.length > 2) issues.push({ code: "not_in_card", message: `These words aren't in the card (or were out of order) and were dropped: ${unmatched.slice(0, 8).join(", ")}.` });
  return issues;
}

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

  let plan = await ask("");
  let applied = applyReadPlan(blocks, plan);
  let body = rebuild(req.body, applied.body);
  let metrics = highlightMetrics(body);
  let issues = assessRead(metrics, req.targetWords, applied.unmatchedShort);
  let repaired = false;
  if (issues.length && req.repair !== false) {
    const feedback = `\n\nYOUR PREVIOUS readShort, as it lands in the card (… marks skipped text):\n"${metrics.readText}"\n\nFix these problems and return the full plan again:\n${issues.map((i) => `- ${i.message}`).join("\n")}`;
    const second = await ask(feedback);
    const applied2 = applyReadPlan(blocks, second);
    const body2 = rebuild(req.body, applied2.body);
    const metrics2 = highlightMetrics(body2);
    const issues2 = assessRead(metrics2, req.targetWords, applied2.unmatchedShort);
    // Keep the revision only if it is at least as good.
    if (issues2.length <= issues.length) {
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

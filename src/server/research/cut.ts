/**
 * Card cutting. The model chooses WHICH source paragraphs to use and WHICH
 * exact phrases to underline and highlight; code copies the text out of the
 * stored source and re-verifies it. The model never writes card text.
 */

import { z } from "zod";
import { runStructured, type RunResult } from "@/server/ai/run";
import type { ModelSpec } from "@/server/ai/models";
import { makeText, readAloud, highlightRatio, type BodyText, type CardIssue, type Span } from "@/domain/card";
import { normalizeWithMap, tagWarnings, verifyAgainstSource, type VerificationResult } from "@/domain/verify";
import { countWords } from "@/domain/timing";
import { applyReadPlan } from "@/domain/align";
import { highlightMetrics } from "@/domain/highlight-metrics";
import { assessRead, defaultTargetWords, highlightCard, HIGHLIGHT_RULES, type QualityIssue } from "./highlight";

export const CardCutSchema = z.object({
  verdict: z.enum(["cut", "no_support"]),
  reason: z.string().describe("One or two sentences: what the chosen passage says, or why the source does not support the claim."),
  startParagraph: z.number().int().describe("Number of the first paragraph of the excerpt."),
  endParagraph: z.number().int().describe("Number of the last paragraph of the excerpt (same as start for one paragraph)."),
  firstWords: z.string().describe("Only if the excerpt starts after the beginning of the first paragraph: its first 5-10 words copied exactly, starting at a sentence start. Otherwise empty."),
  lastWords: z.string().describe("Only if the excerpt ends before the end of the last paragraph: its last 5-10 words copied exactly, ending at a sentence end. Otherwise empty."),
  readShort: z.string().describe("The highlighted read: exactly the words the speaker says, copied from the excerpt in order (skip words freely; never add, change, or reorder). About 20% of the excerpt, 35–90 words."),
  readLong: z.string().describe("The underlined read: about twice as long, containing every word of readShort plus the next most important support; same rules."),
  emphasis: z.array(z.string()).describe("Up to 3 of the most important words or short phrases inside readShort."),
  tag: z.string().describe("The debate tag: one sentence, at most 25 words, no stronger than the highlighted text."),
  support: z.object({
    level: z.enum(["strong", "moderate", "weak"]),
    explanation: z.string(),
    caveats: z.array(z.string()).describe("Qualifications, conditions, or counterpoints in the source that an opponent could use."),
  }),
  byline: z.object({
    title: z.string().describe("The work's title exactly as it appears in the text, if shown; otherwise empty."),
    publication: z.string().describe("The journal, publisher, or report series exactly as the text names it (e.g. 'NBER Working Paper Series'), otherwise empty."),
    authors: z.array(
      z.object({
        name: z.string(),
        nameEvidence: z.string().describe("The exact words from the source text that name this author (e.g. a byline). Empty if the text never names them."),
        qualifications: z.string().describe("The author's qualifications as the source text states them, otherwise empty."),
        qualificationsEvidence: z.string().describe("The exact words from the source text stating the qualifications. Empty if none."),
      }),
    ),
    organization: z.string().describe("Institutional author if no person is named (e.g. a report by an agency), otherwise empty."),
    organizationEvidence: z.string(),
    date: z.string().describe("Publication date as stated in the source text, otherwise empty."),
    dateEvidence: z.string(),
  }),
});
export type CardCutOutput = z.infer<typeof CardCutSchema>;

export const CUT_SYSTEM = `You cut evidence cards for high school policy debate. A card is a verbatim excerpt from a source, with the parts read aloud highlighted, plus a tag (the debater's one-sentence claim).

You are given the claim a debater needs and a source split into numbered paragraphs. Your job is selection, not writing:
- Pick ONE contiguous excerpt: startParagraph..endParagraph (usually 1-4 paragraphs, 120-450 words). Keep whole paragraphs and the sentences around the key claim that give the author's context and reasoning: they stay in the card, shrunk and unread, so a long excerpt costs no speaking time. To trim, give firstWords/lastWords that begin or end a full sentence. Never include page furniture (headings, captions, link labels like "Read more", share buttons): end with lastWords before it.
- The excerpt must fairly represent the author. Do not cut an author describing a view they reject, a hypothetical they dismiss, or a quote of someone else they rebut, as if it were their own view. If the only supporting text is like that, answer "no_support".
- If the source does not actually support the claim, answer "no_support" and explain. Never force a card.

Then write what the speaker reads (code locates your words in the excerpt; words that aren't there, or are out of order, are dropped):
${HIGHLIGHT_RULES}
- readShort (highlighted) ≈ 20% of the excerpt, 35–90 words; readLong (underlined) ≈ twice that and contains readShort.
- In the tag, use numbers exactly as the excerpt writes them (don't merge "7%" and "9%" into "7–9%", round, or convert).
- emphasis: at most three key words inside readShort.

Tag: one sentence, at most 25 words, as strong as the highlighted text honestly supports and no stronger. Any number in the tag must appear in the excerpt. Keep the author's hedges when they matter.

Support: "strong" if the author directly asserts the claim; "moderate" if the support is qualified or partial; "weak" if it only loosely relates. List caveats an opponent could exploit.

Byline: report the title, authors, qualifications, organization, and date ONLY when the provided text states them, with the exact supporting words as evidence (look for "By ..." lines, author bios, and date lines near the top or bottom). Use "organization" only for an institutional report with no personal author, never for a news site or blog that has a byline. Leave fields empty when the text doesn't state them. Never supply qualifications or dates from memory.`;

export interface NumberedSource {
  paragraphs: string[];
  /** indices shown to the model (all, or a relevant subset of a long source) */
  shown: number[];
  text: string;
}

const STOP = new Set("a an and are as at be by for from has have in is it its of on or that the their this to was were will with would can could should not no than then there these those which who whom why how what when where into about over under more most less least also but if so such do does did been being very".split(" "));

function stem(w: string): string {
  return w.replace(/(ies|es|s|ing|ed|ly)$/, "");
}

function terms(s: string): string[] {
  return (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 2 && !STOP.has(w)).map(stem);
}

/** Paragraphs that are navigation, captions, or boilerplate rather than prose. */
function isBoilerplate(p: string): boolean {
  // Keep bylines, date lines, and headings with content words: the model reads the byline and date from them.
  if (/^by[:\s]+\p{Lu}/iu.test(p) || /\b(19|20)\d{2}\b/.test(p)) return false;
  if (p.length < 25 && !/[.!?]["')\]]?$/.test(p)) return true;
  return /^(share|subscribe|sign up|read more|related|advertisement|image|photo|credit|copyright|©|all rights reserved)\b/i.test(p);
}

/**
 * Number the paragraphs the model sees. Long sources are narrowed to the
 * paragraphs most related to the claim (with neighbors for context).
 */
export function numberSource(paragraphs: string[], claim: string, budgetChars = 48_000): NumberedSource {
  const candidates = paragraphs.map((p, i) => ({ p, i })).filter(({ p }) => !isBoilerplate(p));
  const total = candidates.reduce((a, c) => a + c.p.length + 8, 0);
  let shown: number[];
  if (total <= budgetChars) shown = candidates.map((c) => c.i);
  else {
    const q = new Set(terms(claim));
    const df = new Map<string, number>();
    const tf = candidates.map(({ p }) => {
      const t = terms(p);
      for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1);
      return t;
    });
    const N = candidates.length;
    const scored = candidates.map((c, k) => {
      let s = 0;
      for (const w of tf[k]) if (q.has(w)) s += Math.log(1 + N / (df.get(w) ?? 1));
      return { i: c.i, s: s / Math.sqrt(1 + tf[k].length / 60) };
    });
    scored.sort((a, b) => b.s - a.s);
    const pick = new Set<number>();
    const byIndex = new Map(candidates.map((c) => [c.i, c.p]));
    let used = 0;
    // Always show the front matter (title, byline, date) and the end (author bios, notes).
    const front: number[] = [];
    let frontChars = 0;
    for (const c of candidates) {
      if (frontChars > 2500) break;
      front.push(c.i);
      frontChars += c.p.length;
    }
    const back: number[] = [];
    let backChars = 0;
    for (const c of [...candidates].reverse()) {
      if (backChars > 1200) break;
      back.push(c.i);
      backChars += c.p.length;
    }
    for (const i of [...front, ...back]) {
      pick.add(i);
      used += (byIndex.get(i)?.length ?? 0) + 8;
    }
    for (const { i, s } of scored) {
      if (s <= 0 && pick.size > front.length + back.length) break;
      for (const j of [i - 1, i, i + 1]) {
        const p = byIndex.get(j);
        if (p === undefined || pick.has(j)) continue;
        if (used + p.length > budgetChars) continue;
        pick.add(j);
        used += p.length + 8;
      }
      if (used > budgetChars * 0.95) break;
    }
    shown = [...pick].sort((a, b) => a - b);
  }
  const lines: string[] = [];
  let prev = -1;
  for (const i of shown) {
    if (prev >= 0 && i > prev + 1) lines.push(`[… paragraphs ${prev + 2}–${i} not shown …]`);
    lines.push(`[${i + 1}] ${paragraphs[i]}`);
    prev = i;
  }
  return { paragraphs, shown, text: lines.join("\n\n") };
}

/**
 * Find `phrase` in `text` ignoring typographic differences (quotes, dashes,
 * whitespace). Returns offsets in the ORIGINAL text.
 */
export function locatePhrase(text: string, phrase: string, from = 0): Span | null {
  const hay = normalizeWithMap(text);
  const needle = normalizeWithMap(phrase).norm;
  if (!needle) return null;
  // translate `from` (original offset) to normalized offset
  let nFrom = 0;
  while (nFrom < hay.map.length && hay.map[nFrom] < from) nFrom++;
  let at = hay.norm.indexOf(needle, nFrom);
  if (at < 0) at = hay.norm.indexOf(needle);
  if (at < 0) return null;
  const start = hay.map[at];
  const end = hay.map[at + needle.length - 1] + 1;
  return { start, end };
}

export interface BuiltCut {
  body: BodyText[];
  tag: string;
  verification: VerificationResult;
  issues: CardIssue[];
  missingPhrases: string[];
  paragraphRange: [number, number];
  readWords: number;
  highlightRatio: number;
  /** read-aloud quality problems left after the quality gate (empty when fine) */
  readQuality?: QualityIssue[];
}

export class CutRejected extends Error {}

/** Deterministically turn the model's selection into a verified card body. */
export function buildCut(out: CardCutOutput, src: NumberedSource, sourceText: string, dehyphenate: boolean): BuiltCut {
  const n = src.paragraphs.length;
  let s = Math.max(1, Math.min(n, out.startParagraph)) - 1;
  let e = Math.max(1, Math.min(n, out.endParagraph)) - 1;
  if (e < s) [s, e] = [e, s];
  if (!src.shown.includes(s) || !src.shown.includes(e)) throw new CutRejected("The model chose paragraphs it was not shown.");
  if (e - s > 7) e = s + 7;

  const body: BodyText[] = [];
  for (let i = s; i <= e; i++) {
    let text = src.paragraphs[i];
    if (i === s && out.firstWords.trim()) {
      const hit = locatePhrase(text, out.firstWords.trim());
      if (hit) text = text.slice(hit.start);
    }
    if (i === e && out.lastWords.trim()) {
      const hit = locatePhrase(text, out.lastWords.trim());
      if (hit) text = text.slice(0, hit.end);
    }
    body.push(makeText(text.trim(), { newParagraph: i > s }));
  }

  // A trailing link label or caption after the last full sentence ("… by 2050. More on Climate") is not
  // article prose: end the excerpt at the sentence (still contiguous and verbatim) unless it is read.
  const last = body[body.length - 1];
  if (last && !/[.!?:"”’)\]]\s*$/.test(last.text)) {
    const re = /[.!?]["”’)\]]*(?=\s|$)/g;
    let endAt = -1;
    for (let m = re.exec(last.text); m; m = re.exec(last.text)) endAt = m.index + m[0].length;
    const tail = endAt > 0 ? last.text.slice(endAt).trim() : "";
    const lower = (x: string) => x.toLowerCase().replace(/\s+/g, " ");
    const tailRead = !!tail && [out.readShort, out.readLong].some((r) => lower(r).includes(lower(tail).slice(0, 24)));
    if (tail && tail.length < 60 && !tailRead) last.text = last.text.slice(0, endAt);
  }
  // The model planned the read-aloud text; code places it on the verbatim excerpt.
  const applied = applyReadPlan(body, { readShort: out.readShort, readLong: out.readLong, emphasis: out.emphasis });
  body.splice(0, body.length, ...applied.body);
  const missing = applied.unmatchedShort;
  const verification = verifyAgainstSource(body, sourceText, { dehyphenate });
  const tag = out.tag.trim().replace(/\s+/g, " ");
  // Tag and formatting rules (lintCard) run when the card is saved, with its citation.
  const issues: CardIssue[] = [...verification.issues];
  if (missing.length) issues.push({ severity: "info", code: "phrases_not_found", message: `${missing.length} planned read word(s) weren't in the excerpt and were skipped.` });
  if (applied.protectedWords.length) issues.push({ severity: "info", code: "qualifiers_kept", message: `Kept "${[...new Set(applied.protectedWords)].join('", "')}" in the read so the author's meaning isn't changed.` });
  return {
    body,
    tag,
    verification,
    issues,
    missingPhrases: missing,
    paragraphRange: [s + 1, e + 1],
    readWords: countWords(readAloud(body).text),
    highlightRatio: highlightRatio(body),
  };
}

export interface CutRequest {
  claim: string;
  context?: string;
  source: { title?: string; publication?: string; url?: string; knownAuthors?: string[]; published?: string };
  paragraphs: string[];
  sourceText: string;
  dehyphenate: boolean;
  teamId?: string | null;
  signal?: AbortSignal;
  models?: ModelSpec[];
}

export interface CutResult {
  run: RunResult<CardCutOutput>;
  numbered: NumberedSource;
  built: BuiltCut | null;
  rejectedReason?: string;
}

export async function cutCard(req: CutRequest): Promise<CutResult> {
  const numbered = numberSource(req.paragraphs, req.claim);
  const header = [
    `SOURCE`,
    req.source.title ? `Title: ${req.source.title}` : "",
    req.source.publication ? `Publication: ${req.source.publication}` : "",
    req.source.url ? `URL: ${req.source.url}` : "",
    req.source.knownAuthors?.length ? `Authors listed in page metadata: ${req.source.knownAuthors.join("; ")}` : "",
    req.source.published ? `Date in page metadata: ${req.source.published}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const prompt = [
    `CLAIM THE DEBATER NEEDS: ${req.claim}`,
    req.context ? `CONTEXT: ${req.context}` : "",
    ``,
    header,
    ``,
    `NUMBERED SOURCE TEXT:`,
    numbered.text,
  ]
    .filter((l) => l !== "")
    .join("\n");
  const run = await runStructured({ task: "card_cut", system: CUT_SYSTEM, prompt, schema: CardCutSchema, abortSignal: req.signal, teamId: req.teamId ?? null, models: req.models });
  if (run.output.verdict === "no_support") return { run, numbered, built: null, rejectedReason: run.output.reason };
  try {
    const built = buildCut(run.output, numbered, req.sourceText, req.dehyphenate);
    // Read quality gate: if the planned read is off target or choppy, re-highlight the excerpt once.
    const target = defaultTargetWords(built.body);
    const quality = assessRead(highlightMetrics(built.body), target, built.missingPhrases);
    built.readQuality = quality;
    if (quality.length) {
      try {
        const redo = await highlightCard({ tag: built.tag, body: built.body, targetWords: target, models: req.models, teamId: req.teamId, signal: req.signal, repair: false });
        if (redo.issues.length < quality.length && verifyAgainstSource(redo.body, req.sourceText, { dehyphenate: req.dehyphenate }).ok) {
          built.body = redo.body as BodyText[];
          built.readWords = redo.metrics.readWords;
          built.highlightRatio = highlightRatio(redo.body);
          built.readQuality = redo.issues;
        }
      } catch {
        /* keep the first highlighting */
      }
    }
    // Tag honesty: every number in the tag must appear exactly as written in the card.
    if (tagWarnings(built.tag, built.body).some((w) => w.code === "number_not_in_body")) {
      try {
        const cardNumbers = [...new Set(built.body.flatMap((b) => b.text.match(/\$?\d[\d,.]*%?/g) ?? []))].slice(0, 40);
        const fix = await runStructured({
          task: "section_revise",
          system: "You write debate tags: one sentence, at most 25 words, no stronger than the read text. Every number you use must appear exactly as written in the card (never combine, round, or convert numbers).",
          prompt: `Current tag: ${built.tag}\nIts numbers don't all appear in the card. Numbers the card contains: ${cardNumbers.join(", ") || "none"}.\nRead-aloud text: ${readAloud(built.body).text}\nWrite the corrected tag.`,
          schema: z.object({ tag: z.string() }),
          abortSignal: req.signal,
          teamId: req.teamId ?? null,
        });
        const tag = fix.output.tag.trim().replace(/\s+/g, " ");
        if (tag && !tagWarnings(tag, built.body).some((w) => w.code === "number_not_in_body")) built.tag = tag;
      } catch {
        /* keep the tag; lint still flags it */
      }
    }
    return { run, numbered, built };
  } catch (e) {
    return { run, numbered, built: null, rejectedReason: e instanceof Error ? e.message : String(e) };
  }
}

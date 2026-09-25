/**
 * Measurable properties of a card's highlighting (what is read aloud).
 * Used for the human baseline (real Verbatim files), model benchmarks, and
 * in-app checks. Pure, deterministic, dependency-free.
 */

import { normalizeSpans, type BodyBlock, type BodyText, type Span } from "./card";

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’\-.%$]*[\p{L}\p{N}%]|[\p{L}\p{N}]/gu;

/** Words a read fragment shouldn't end on: it leaves the listener hanging mid-phrase. */
export const DANGLING = new Set(["the", "a", "an", "of", "to", "in", "on", "for", "with", "and", "or", "but", "by", "from", "at", "as", "that", "which", "who", "is", "are", "was", "were", "be", "its", "their", "this", "these", "than", "into"]);

const AUX = new Set(["is", "are", "was", "were", "be", "been", "being", "am", "will", "would", "can", "could", "may", "might", "must", "should", "shall", "has", "have", "had", "do", "does", "did"]);
const COMMON_VERBS = new Set(
  "cause causes caused increase increases decrease decreases reduce reduces lead leads led make makes made create creates prevent prevents threaten threatens require requires need needs means mean solve solves fail fails collapse collapses risk risks spur spurs drive drives drove undermine undermines ensure ensures allow allows boost boosts hurt hurts cut cuts trigger triggers destroy destroys spark sparks escalate escalates grow grows rise rises fall falls lose loses win wins say says said find finds found show shows prove proves provide provides help helps harm harms kill kills save saves block blocks stop stops force forces push pushes pull pulls take takes give gives keep keeps become becomes remain remains depend depends matter matters outweigh outweighs turn turns link links spill spills".split(
    " ",
  ),
);

function isVerbish(w: string): boolean {
  const x = w.toLowerCase();
  return AUX.has(x) || COMMON_VERBS.has(x) || (x.length > 4 && (x.endsWith("ed") || x.endsWith("ing"))) || x.endsWith("n't");
}

interface Word {
  text: string;
  start: number;
  end: number;
  read: boolean;
  partial: boolean;
}

function wordsOf(block: BodyText): Word[] {
  const hl = normalizeSpans(block.highlight, block.text.length);
  const inHl = (p: number) => hl.some((s) => p >= s.start && p < s.end);
  const out: Word[] = [];
  for (const m of block.text.matchAll(WORD)) {
    const start = m.index!;
    const end = start + m[0].length;
    let readChars = 0;
    for (let p = start; p < end; p++) if (inHl(p)) readChars++;
    const read = readChars > (end - start) / 2;
    out.push({ text: m[0], start, end, read, partial: readChars > 0 && readChars < end - start });
  }
  return out;
}

export interface HighlightMetrics {
  totalWords: number;
  readWords: number;
  /** share of the card's words that are read */
  ratio: number;
  /** contiguous runs of read words */
  fragments: number;
  meanFragmentWords: number;
  /** share of fragments that are a single word */
  oneWordFragmentShare: number;
  /** share of fragments ending on an article, preposition, or conjunction (normal mid-sentence; kept for comparison) */
  danglingShare: number;
  /** read sentences that stop on such a word while the source sentence goes on (H-4) */
  danglingEnds: number;
  /** highlight edges that fall inside a word */
  partialWordFragments: number;
  /** fragments per 100 read words (choppiness) */
  fragmentsPer100: number;
  /** share of read sentences (split at . ! ?) that contain a verb-like word */
  sentencesWithVerbShare: number;
  readText: string;
}

export function highlightMetrics(body: BodyBlock[]): HighlightMetrics {
  let total = 0;
  let read = 0;
  const fragments: Word[][] = [];
  let partial = 0;
  for (const b of body) {
    if (b.kind !== "text") continue;
    const words = wordsOf(b);
    total += words.length;
    let cur: Word[] | null = null;
    for (const w of words) {
      if (w.read) {
        read++;
        if (w.partial) partial++;
        if (!cur) {
          cur = [];
          fragments.push(cur);
        }
        cur.push(w);
      } else cur = null;
    }
  }
  const lens = fragments.map((f) => f.length);
  const readText = fragments.map((f) => f.map((w) => w.text).join(" ")).join(" … ");
  // Sentences of the read text: split where a read word is followed by sentence punctuation in the source.
  const sentences: string[][] = [];
  let sent: string[] = [];
  let danglingEnds = 0;
  for (const b of body) {
    if (b.kind !== "text") continue;
    const words = wordsOf(b);
    let lastRead: Word | null = null;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.read) {
        sent.push(w.text);
        lastRead = w;
      }
      const after = b.text.slice(w.end, words[i + 1]?.start ?? b.text.length);
      const end = /[.!?]/.test(after) || i === words.length - 1;
      if (end) {
        if (lastRead && lastRead !== w && DANGLING.has(lastRead.text.toLowerCase())) danglingEnds++;
        lastRead = null;
        if (sent.length) {
          sentences.push(sent);
          sent = [];
        }
      }
    }
  }
  if (sent.length) sentences.push(sent);
  const withVerb = sentences.filter((s) => s.some(isVerbish)).length;
  return {
    totalWords: total,
    readWords: read,
    ratio: total ? read / total : 0,
    fragments: fragments.length,
    meanFragmentWords: lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0,
    oneWordFragmentShare: lens.length ? lens.filter((l) => l === 1).length / lens.length : 0,
    danglingShare: fragments.length ? fragments.filter((f) => DANGLING.has(f[f.length - 1].text.toLowerCase())).length / fragments.length : 0,
    danglingEnds,
    partialWordFragments: partial,
    fragmentsPer100: read ? (fragments.length / read) * 100 : 0,
    sentencesWithVerbShare: sentences.length ? withVerb / sentences.length : 0,
    readText,
  };
}

/** Word-level agreement between two highlightings of the same text (e.g. model vs human). */
export function highlightOverlap(a: BodyBlock[], b: BodyBlock[]): { precision: number; recall: number; f1: number } {
  const readSet = (body: BodyBlock[]) => {
    const s = new Set<string>();
    body.forEach((blk, bi) => {
      if (blk.kind !== "text") return;
      for (const w of wordsOf(blk)) if (w.read) s.add(`${bi}:${w.start}`);
    });
    return s;
  };
  const A = readSet(a);
  const B = readSet(b);
  let tp = 0;
  for (const k of A) if (B.has(k)) tp++;
  const precision = A.size ? tp / A.size : 0;
  const recall = B.size ? tp / B.size : 0;
  return { precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0 };
}

export type { Span };

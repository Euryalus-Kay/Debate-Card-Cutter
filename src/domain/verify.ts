/**
 * Deterministic evidence verification.
 *
 * A card's text blocks must appear verbatim in the stored source text, in
 * order, with every gap disclosed by an explicit omission block. Matching
 * tolerates only typographic differences (curly vs straight quotes, dash
 * variants, whitespace, soft hyphens, ligatures, PDF line-break hyphenation);
 * any change to words, case, or order is reported.
 *
 * This check is code, not a model's opinion.
 */

import type { BodyBlock, BodyText, CardIssue, Span } from "./card";
import { normalizeSpans } from "./card";

export interface NormalizeOptions {
  caseFold?: boolean;
  /** join words hyphenated across line breaks ("eco-\nnomic" → "economic") */
  dehyphenate?: boolean;
}

export interface NormalizedText {
  norm: string;
  /** map[i] = index in the original string of normalized char i */
  map: number[];
}

const SINGLE_QUOTES = /[‘’‚‛′`´]/;
const DOUBLE_QUOTES = /[“”„‟″«»]/;
const DASHES = /[‐‑‒–—―−﹘﹣－]/;
const INVISIBLE = /[­​‌‍⁠﻿]/;
const WS = /\s/u;

export function normalizeWithMap(input: string, opts: NormalizeOptions = {}): NormalizedText {
  let s = input;
  const dehyphenMap: number[] | null = opts.dehyphenate ? [] : null;
  if (opts.dehyphenate) {
    // Remove "-<newline + spaces>" between lowercase letters, remembering offsets.
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if ((ch === "-" || ch === "­") && /\p{Ll}/u.test(s[i - 1] ?? "")) {
        let j = i + 1;
        let sawNewline = false;
        while (j < s.length && WS.test(s[j])) {
          if (s[j] === "\n" || s[j] === "\r") sawNewline = true;
          j++;
        }
        if (sawNewline && /\p{Ll}/u.test(s[j] ?? "")) {
          i = j - 1;
          continue;
        }
      }
      out += ch;
      dehyphenMap!.push(i);
    }
    s = out;
  }

  let norm = "";
  const map: number[] = [];
  let lastWasSpace = true; // trims leading whitespace
  const origIndex = (i: number) => (dehyphenMap ? dehyphenMap[i] : i);

  for (let i = 0; i < s.length; ) {
    const cp = s.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const width = ch.length;
    const oi = origIndex(i);
    i += width;

    if (INVISIBLE.test(ch)) continue;
    if (WS.test(ch)) {
      if (!lastWasSpace) {
        norm += " ";
        map.push(oi);
        lastWasSpace = true;
      }
      continue;
    }
    let rep: string;
    if (SINGLE_QUOTES.test(ch)) rep = "'";
    else if (DOUBLE_QUOTES.test(ch)) rep = '"';
    else if (DASHES.test(ch)) rep = "-";
    else rep = ch.normalize("NFKC");
    if (opts.caseFold) rep = rep.toLowerCase();
    for (const r of rep) {
      if (WS.test(r)) {
        if (!lastWasSpace) {
          norm += " ";
          map.push(oi);
          lastWasSpace = true;
        }
        continue;
      }
      norm += r;
      map.push(oi);
      lastWasSpace = false;
    }
  }
  // Trim trailing space
  if (norm.endsWith(" ")) {
    norm = norm.slice(0, -1);
    map.pop();
  }
  return { norm, map };
}

export function normalizeText(s: string, opts: NormalizeOptions = {}): string {
  return normalizeWithMap(s, opts).norm;
}

/**
 * Also collapse whitespace around dashes so "word — word" matches "word—word".
 * Applied to both needle and haystack consistently.
 */
function tightenDashes(t: NormalizedText): NormalizedText {
  let norm = "";
  const map: number[] = [];
  for (let i = 0; i < t.norm.length; i++) {
    const c = t.norm[i];
    if (c === " " && (t.norm[i - 1] === "-" || t.norm[i + 1] === "-")) continue;
    norm += c;
    map.push(t.map[i]);
  }
  return { norm, map };
}

export interface BlockMatch {
  blockIndex: number;
  found: boolean;
  /** offsets in the ORIGINAL source text */
  sourceRange?: Span;
  /** what differs, when not found */
  diff?: { expected: string; actual: string }[];
}

export interface VerificationResult {
  ok: boolean;
  matches: BlockMatch[];
  issues: CardIssue[];
}

interface PreparedSource {
  exact: NormalizedText;
  folded: NormalizedText;
  words: { word: string; start: number; end: number }[];
}

function prepareSource(source: string, dehyphenate: boolean): PreparedSource {
  const exact = tightenDashes(normalizeWithMap(source, { dehyphenate }));
  const folded = tightenDashes(normalizeWithMap(source, { dehyphenate, caseFold: true }));
  const words: PreparedSource["words"] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(folded.norm))) words.push({ word: stripPunct(m[0]), start: m.index, end: m.index + m[0].length });
  return { exact, folded, words };
}

function stripPunct(w: string): string {
  return w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function toOriginalRange(t: NormalizedText, start: number, end: number): Span {
  const s = t.map[start];
  const e = t.map[end - 1] + 1;
  return { start: s, end: e };
}

/**
 * Verify card body blocks against the source text.
 * `dehyphenate` should be true for text extracted from PDFs.
 */
export function verifyAgainstSource(body: BodyBlock[], source: string, opts: { dehyphenate?: boolean } = {}): VerificationResult {
  const src = prepareSource(source, opts.dehyphenate ?? false);
  const matches: BlockMatch[] = [];
  const issues: CardIssue[] = [];
  let cursor = 0; // in normalized exact coordinates
  let prevEnd: number | null = null;
  let omissionSincePrev = false;

  body.forEach((block, blockIndex) => {
    if (block.kind === "omission") {
      omissionSincePrev = true;
      return;
    }
    if (block.kind === "insertion") return;
    const needle = tightenDashes(normalizeWithMap(block.text, { dehyphenate: false })).norm;
    if (!needle) {
      matches.push({ blockIndex, found: true });
      return;
    }

    let at = src.exact.norm.indexOf(needle, cursor);
    let outOfOrder = false;
    if (at < 0) {
      const anywhere = src.exact.norm.indexOf(needle);
      if (anywhere >= 0) {
        at = anywhere;
        outOfOrder = true;
      }
    }

    if (at >= 0) {
      const end = at + needle.length;
      const range = toOriginalRange(src.exact, at, end);
      matches.push({ blockIndex, found: true, sourceRange: range });
      if (outOfOrder) {
        issues.push({
          severity: "error",
          code: "out_of_order",
          blockIndex,
          message: `Paragraph ${blockIndex + 1} appears earlier in the source than the text before it. Card text must keep the source's order.`,
        });
      } else if (prevEnd !== null) {
        const gap = src.exact.norm.slice(prevEnd, at);
        const gapHasWords = /[\p{L}\p{N}]/u.test(gap);
        if (gapHasWords && !omissionSincePrev) {
          issues.push({
            severity: "error",
            code: "undisclosed_omission",
            blockIndex,
            message: `Text between paragraphs ${blockIndex} and ${blockIndex + 1} was left out without an omission marker: "${truncate(gap.trim(), 120)}"`,
          });
        } else if (!gapHasWords && omissionSincePrev) {
          issues.push({
            severity: "info",
            code: "unneeded_omission_marker",
            blockIndex,
            message: `An omission marker precedes paragraph ${blockIndex + 1}, but nothing was omitted there.`,
          });
        }
      }
      cursor = end;
      prevEnd = end;
      omissionSincePrev = false;
      return;
    }

    // Case-insensitive match means capitalization was changed.
    const foldedNeedle = tightenDashes(normalizeWithMap(block.text, { caseFold: true })).norm;
    const fAt = src.folded.norm.indexOf(foldedNeedle);
    if (fAt >= 0) {
      matches.push({ blockIndex, found: false, sourceRange: toOriginalRange(src.folded, fAt, fAt + foldedNeedle.length) });
      issues.push({
        severity: "error",
        code: "case_changed",
        blockIndex,
        message: `Paragraph ${blockIndex + 1} matches the source only if capitalization is ignored. Card text must match the source exactly.`,
      });
      return;
    }

    // Locate the most similar region to explain what changed.
    const approx = approximateLocate(foldedNeedle, src);
    matches.push({ blockIndex, found: false, sourceRange: approx?.range, diff: approx?.diff });
    if (approx && approx.similarity >= 0.6) {
      const shown = approx.diff
        .slice(0, 3)
        .map((d) => `source "${d.actual || "∅"}" vs card "${d.expected || "∅"}"`)
        .join("; ");
      issues.push({
        severity: "error",
        code: "text_altered",
        blockIndex,
        message: `Paragraph ${blockIndex + 1} differs from the source text: ${shown}${approx.diff.length > 3 ? ` (+${approx.diff.length - 3} more)` : ""}.`,
      });
    } else {
      issues.push({
        severity: "error",
        code: "not_in_source",
        blockIndex,
        message: `Paragraph ${blockIndex + 1} was not found in the source text.`,
      });
    }
  });

  const ok = !issues.some((i) => i.severity === "error");
  return { ok, matches, issues };
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/**
 * Find the source window most similar to the needle using word 3-gram
 * anchors, then compute a word-level diff. Case-folded, punctuation-stripped.
 */
function approximateLocate(
  foldedNeedle: string,
  src: PreparedSource,
): { range: Span; similarity: number; diff: { expected: string; actual: string }[] } | null {
  const nWords = foldedNeedle.split(" ").map(stripPunct).filter(Boolean);
  if (nWords.length === 0 || src.words.length === 0) return null;
  const k = Math.min(3, nWords.length);
  const grams = new Map<string, number[]>();
  for (let i = 0; i + k <= nWords.length; i++) {
    const g = nWords.slice(i, i + k).join(" ");
    const arr = grams.get(g) ?? [];
    arr.push(i);
    grams.set(g, arr);
  }
  // Vote for alignment offsets (sourceWordIndex - needleWordIndex).
  const votes = new Map<number, number>();
  for (let j = 0; j + k <= src.words.length; j++) {
    const g = src.words
      .slice(j, j + k)
      .map((w) => w.word)
      .join(" ");
    const hits = grams.get(g);
    if (!hits) continue;
    for (const i of hits) votes.set(j - i, (votes.get(j - i) ?? 0) + 1);
  }
  if (votes.size === 0) return null;
  let bestOffset = 0;
  let bestVotes = -1;
  for (const [off, v] of votes) if (v > bestVotes) [bestOffset, bestVotes] = [off, v];

  const startW = Math.max(0, bestOffset);
  const endW = Math.min(src.words.length, bestOffset + nWords.length + 5);
  const window = src.words.slice(startW, endW).map((w) => w.word);
  const diff = wordDiff(nWords, window);
  const same = diff.sameCount;
  const similarity = same / Math.max(nWords.length, 1);
  const firstW = src.words[startW];
  const lastW = src.words[Math.max(startW, Math.min(endW, startW + diff.consumedB) - 1)];
  const range = toOriginalRange(src.folded, firstW.start, lastW.end);
  return { range, similarity, diff: diff.changes };
}

/** Minimal LCS-based word diff (sizes here are small: a paragraph). */
function wordDiff(a: string[], b: string[]): { sameCount: number; consumedB: number; changes: { expected: string; actual: string }[] } {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const changes: { expected: string; actual: string }[] = [];
  let i = 0;
  let j = 0;
  let pendA: string[] = [];
  let pendB: string[] = [];
  let lastMatchedB = 0;
  const flush = () => {
    if (pendA.length || pendB.length) changes.push({ expected: pendA.join(" "), actual: pendB.join(" ") });
    pendA = [];
    pendB = [];
  };
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      flush();
      i++;
      j++;
      lastMatchedB = j;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      pendA.push(a[i++]);
    } else {
      pendB.push(b[j++]);
    }
  }
  while (i < n) pendA.push(a[i++]);
  // Trailing source words beyond the needle are context, not differences.
  if (pendA.length) flush();
  else {
    pendA = [];
    pendB = [];
  }
  return { sameCount: dp[0][0], consumedB: Math.max(lastMatchedB, 1), changes };
}

// ---------------------------------------------------------------------------
// Meaning checks (heuristic warnings for human review; never auto-fixes)
// ---------------------------------------------------------------------------

const NEGATIONS = ["not", "no", "never", "none", "nor", "neither", "cannot", "can't", "won't", "isn't", "aren't", "doesn't", "didn't", "wasn't", "weren't", "unlikely", "without"];
const HEDGES = ["may", "might", "could", "possibly", "perhaps", "potentially", "some", "if", "unless", "only", "rarely", "seldom", "few", "except", "although", "but", "however", "yet", "arguably"];
const ABSOLUTES = ["will", "certain", "certainly", "guarantee", "guarantees", "inevitable", "inevitably", "always", "every", "all", "extinction", "definitely", "proves", "impossible"];

function sentenceRanges(text: string): Span[] {
  const out: Span[] = [];
  const re = /[^.!?]+(?:[.!?]+["')\]]*|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[0].trim()) out.push({ start: m.index, end: m.index + m[0].length });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

export interface QualifierWarning {
  blockIndex: number;
  word: string;
  sentence: string;
  kind: "negation" | "hedge";
}

/**
 * Flags negations and hedges that sit in the same sentence as highlighted text
 * but are themselves NOT highlighted: reading only the highlight may drop a
 * qualification or reverse meaning. Returns candidates for a human (or a
 * model-assisted reviewer) to check.
 */
export function qualifierWarnings(body: BodyBlock[]): QualifierWarning[] {
  const out: QualifierWarning[] = [];
  body.forEach((b, blockIndex) => {
    if (b.kind !== "text" || b.highlight.length === 0) return;
    const hl = normalizeSpans(b.highlight, b.text.length);
    const inHl = (pos: number) => hl.some((s) => pos >= s.start && pos < s.end);
    for (const sent of sentenceRanges(b.text)) {
      const sentHasHl = hl.some((s) => s.start < sent.end && s.end > sent.start);
      if (!sentHasHl) continue;
      const re = /[\p{L}']+/gu;
      const sentence = b.text.slice(sent.start, sent.end);
      let m: RegExpExecArray | null;
      while ((m = re.exec(sentence))) {
        const w = m[0].toLowerCase();
        const pos = sent.start + m.index;
        if (inHl(pos)) continue;
        if (NEGATIONS.includes(w)) out.push({ blockIndex, word: m[0], sentence: sentence.trim(), kind: "negation" });
        else if (HEDGES.includes(w) && ["may", "might", "could", "unless", "if", "only", "unlikely", "except"].includes(w)) {
          out.push({ blockIndex, word: m[0], sentence: sentence.trim(), kind: "hedge" });
        }
      }
    }
  });
  return out;
}

export interface TagWarning {
  code: "number_not_in_body" | "possible_overclaim";
  message: string;
}

/** Tag claims that the card text does not obviously support. */
export function tagWarnings(tag: string, body: BodyBlock[]): TagWarning[] {
  const out: TagWarning[] = [];
  const texts = body.filter((b): b is BodyText => b.kind === "text");
  const bodyText = texts.map((t) => t.text).join(" ");
  const bodyNorm = normalizeText(bodyText, { caseFold: true });
  const numbers = tag.match(/\d[\d,.]*%?/g) ?? [];
  for (const n of numbers) {
    const bare = n.replace(/[,]/g, "");
    if (!bodyNorm.includes(n.toLowerCase()) && !bodyNorm.replace(/,/g, "").includes(bare.toLowerCase())) {
      out.push({ code: "number_not_in_body", message: `The tag says "${n}", but that figure does not appear in the card text.` });
    }
  }
  const tagWords = new Set(normalizeText(tag, { caseFold: true }).split(" ").map(stripPunct));
  const absolutes = ABSOLUTES.filter((w) => tagWords.has(w));
  if (absolutes.length) {
    const read = texts
      .map((t) => normalizeSpans(t.highlight, t.text.length).map((s) => t.text.slice(s.start, s.end)).join(" "))
      .join(" ");
    const readWords = new Set(normalizeText(read || bodyText, { caseFold: true }).split(" ").map(stripPunct));
    const hedgesInRead = ["may", "might", "could", "possibly", "potentially", "likely"].filter((h) => readWords.has(h));
    if (hedgesInRead.length) {
      out.push({
        code: "possible_overclaim",
        message: `The tag uses "${absolutes.join('", "')}" but the read text hedges ("${hedgesInRead.join('", "')}"). Check the tag doesn't overstate the evidence.`,
      });
    }
  }
  return out;
}

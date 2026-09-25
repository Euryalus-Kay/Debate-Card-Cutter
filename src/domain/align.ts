/**
 * Read-aloud alignment: turn "the words the speaker will say" (a subsequence of
 * the card's words) into highlight spans on the verbatim text.
 *
 * The model plans the read-aloud text; code decides where it sits in the card.
 * Alignment picks the in-order occurrence of each word that makes the fewest,
 * longest fragments (so "the" matches next to its phrase, not three lines up).
 * Words that don't occur in the card are dropped and reported: the card text
 * is never changed.
 */

import { normalizeHighlights, normalizeSpans, type BodyText, type HighlightColor, type HighlightSpan, type Span } from "./card";

const TOKEN = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;

interface Tok {
  norm: string;
  block: number;
  start: number;
  end: number;
}

function norm(w: string): string {
  return w.toLowerCase().replace(/’/g, "'");
}

export function tokenizeBody(blocks: BodyText[]): Tok[] {
  const out: Tok[] = [];
  blocks.forEach((b, block) => {
    for (const m of b.text.matchAll(TOKEN)) out.push({ norm: norm(m[0]), block, start: m.index!, end: m.index! + m[0].length });
  });
  return out;
}

function tokenizeRead(read: string): string[] {
  return [...read.matchAll(TOKEN)].map((m) => norm(m[0]));
}

export interface Alignment {
  /** indices into the body token list, in order */
  matched: number[];
  /** read-aloud words that could not be placed (not in the card, or out of order) */
  unmatched: string[];
  fragments: number;
}

/**
 * Minimize fragments: dp over (read word i, source token j) where source[j]
 * equals read[i]. Continuing a run (j = prev + 1) is free; starting a new
 * fragment costs 1; skipping a read word costs SKIP. O(n·m).
 * `allowed` optionally restricts which source tokens may be used.
 */
export function alignRead(tokens: Tok[], read: string, allowed?: Set<number>): Alignment {
  const words = tokenizeRead(read);
  const n = words.length;
  const m = tokens.length;
  if (!n || !m) return { matched: [], unmatched: words, fragments: 0 };
  const SKIP = 4;
  const INF = 1e9;
  // cost[i][j]: best cost with read word i placed at source j (i placed, j used). Keep full tables for backtracking.
  const cost: Float64Array[] = [];
  const back: Int32Array[] = []; // previous source index (-1 = start, -2 = previous word skipped chain handled via skipCost)
  // bestUpTo[i][j]: min over j' <= j of state after i words ending at j' (for "new fragment" transitions).
  let prevCost = new Float64Array(m).fill(INF);
  let prevSkipCost = 0; // cost if all words so far were skipped (no placement yet)
  const skipBase: number[] = []; // cost of "nothing placed" after i words
  for (let i = 0; i < n; i++) {
    const cur = new Float64Array(m).fill(INF);
    const bk = new Int32Array(m).fill(-3);
    // prefix minimum of prevCost for new-fragment transitions (j' < j - 1 or any j' < j)
    let bestPrev = INF;
    let bestPrevIdx = -1;
    for (let j = 0; j < m; j++) {
      if (j - 2 >= 0 && prevCost[j - 2] < bestPrev) {
        bestPrev = prevCost[j - 2];
        bestPrevIdx = j - 2;
      }
      if (allowed && !allowed.has(j)) continue;
      if (tokens[j].norm !== words[i]) continue;
      // start here (all earlier words placed before, or none placed yet)
      let c = (i === 0 ? 0 : prevSkipCost) + 1;
      let b = -1;
      // continue a run
      if (j > 0 && prevCost[j - 1] < INF && prevCost[j - 1] < c) {
        c = prevCost[j - 1];
        b = j - 1;
      }
      // new fragment after a gap
      if (bestPrev + 1 < c) {
        c = bestPrev + 1;
        b = bestPrevIdx;
      }
      // same-block adjacency across a single skipped token is still a new fragment (handled above)
      cur[j] = c;
      bk[j] = b;
    }
    // Option: skip word i entirely (keep previous states, add SKIP).
    for (let j = 0; j < m; j++) {
      const skipped = prevCost[j] + SKIP;
      if (skipped < cur[j]) {
        cur[j] = skipped;
        bk[j] = -2; // same j carried over, word skipped
      }
    }
    skipBase.push(prevSkipCost);
    prevSkipCost += SKIP;
    cost.push(cur);
    back.push(bk);
    prevCost = cur;
  }
  // Pick the best final state.
  let bestJ = -1;
  let best = prevSkipCost; // everything skipped
  for (let j = 0; j < m; j++) if (prevCost[j] < best) {
    best = prevCost[j];
    bestJ = j;
  }
  const matched: number[] = [];
  const unmatched: string[] = [];
  if (bestJ < 0) return { matched: [], unmatched: words, fragments: 0 };
  let j = bestJ;
  for (let i = n - 1; i >= 0; i--) {
    const b = back[i][j];
    if (b === -2) {
      unmatched.unshift(words[i]);
      continue; // word i skipped; j unchanged
    }
    matched.unshift(j);
    if (b === -1) {
      // placed first: all earlier words were skipped
      for (let k = i - 1; k >= 0; k--) unmatched.unshift(words[k]);
      break;
    }
    j = b;
  }
  let fragments = 0;
  for (let k = 0; k < matched.length; k++) if (k === 0 || matched[k] !== matched[k - 1] + 1 || tokens[matched[k]].block !== tokens[matched[k - 1]].block) fragments++;
  return { matched, unmatched, fragments };
}

/** Spans (per block) covering matched tokens; neighbors in the same block merge across the gap between them. */
export function spansFor(tokens: Tok[], matched: number[]): Map<number, Span[]> {
  const out = new Map<number, Span[]>();
  let run: { block: number; start: number; end: number; last: number } | null = null;
  const flush = () => {
    if (!run) return;
    const list = out.get(run.block) ?? [];
    list.push({ start: run.start, end: run.end });
    out.set(run.block, list);
    run = null;
  };
  for (const idx of matched) {
    const t = tokens[idx];
    if (run && t.block === run.block && idx === run.last + 1) {
      run.end = t.end;
      run.last = idx;
    } else {
      flush();
      run = { block: t.block, start: t.start, end: t.end, last: idx };
    }
  }
  flush();
  return out;
}

export const NEGATIONS = new Set(["not", "no", "never", "none", "nor", "neither", "cannot", "without", "unlikely", "hardly", "rarely", "seldom", "fail", "fails", "failed"]);
export const HEDGES = new Set(["may", "might", "could", "possibly", "perhaps", "potentially", "probably", "likely", "some", "suggests", "appears", "seems", "if", "unless", "except", "only"]);

/**
 * Keep the author's meaning: inside any sentence that is partly read, a
 * negation or meaning-changing hedge between read words (or right before the
 * first read word of the sentence) is added to the read set.
 */
export function protectQualifiers(tokens: Tok[], matched: Set<number>, blocks: BodyText[]): number[] {
  const added: number[] = [];
  // Sentence boundaries: token index ranges per sentence (split at . ! ? in the text between tokens, and at block edges).
  let sentStart = 0;
  const flushSentence = (endExclusive: number) => {
    const idxs: number[] = [];
    for (let k = sentStart; k < endExclusive; k++) idxs.push(k);
    const read = idxs.filter((k) => matched.has(k));
    if (read.length) {
      const first = read[0];
      const last = read[read.length - 1];
      for (const k of idxs) {
        if (matched.has(k)) continue;
        const w = tokens[k].norm;
        const q = NEGATIONS.has(w) || w.endsWith("n't") || HEDGES.has(w);
        const between = k > first && k < last;
        const justBefore = k < first && first - k <= 2;
        if (q && (between || justBefore)) {
          matched.add(k);
          added.push(k);
        }
      }
    }
    sentStart = endExclusive;
  };
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    const next = tokens[k + 1];
    const gap = next && next.block === t.block ? blocks[t.block].text.slice(t.end, next.start) : ".";
    if (/[.!?]/.test(gap)) flushSentence(k + 1);
  }
  flushSentence(tokens.length);
  return added;
}

export interface ReadPlan {
  /** the longer read (underlined): what you'd read with more time */
  readLong: string;
  /** the read-aloud text (highlighted); should be a subsequence of readLong */
  readShort: string;
  /** 0–3 key words or short phrases inside readShort (emphasis style) */
  emphasis: string[];
}

export interface AppliedPlan {
  body: BodyText[];
  unmatchedShort: string[];
  unmatchedLong: string[];
  protectedWords: string[];
  shortFragments: number;
}

/** Apply a read plan to verbatim blocks: underline = long read ∪ short read, highlight = short read (+ protected qualifiers). */
export function applyReadPlan(blocks: BodyText[], plan: ReadPlan, color: HighlightColor = "yellow"): AppliedPlan {
  const tokens = tokenizeBody(blocks);
  const long = alignRead(tokens, plan.readLong);
  // The short read must sit inside the long read where possible.
  const longSet = new Set(long.matched);
  let short = alignRead(tokens, plan.readShort, longSet.size ? longSet : undefined);
  if (short.unmatched.length && longSet.size) {
    const free = alignRead(tokens, plan.readShort);
    if (free.unmatched.length < short.unmatched.length) short = free;
  }
  const shortSet = new Set(short.matched);
  const protectedIdx = protectQualifiers(tokens, shortSet, blocks);
  const ordered = [...shortSet].sort((a, b) => a - b);
  const hl = spansFor(tokens, ordered);
  const ul = spansFor(tokens, [...new Set([...long.matched, ...ordered])].sort((a, b) => a - b));
  // Emphasis: each phrase located inside the highlighted words.
  const emph = new Map<number, Span[]>();
  for (const phrase of plan.emphasis.slice(0, 3)) {
    const a = alignRead(tokens, phrase, shortSet);
    if (a.unmatched.length) continue;
    for (const [block, spans] of spansFor(tokens, a.matched)) emph.set(block, [...(emph.get(block) ?? []), ...spans]);
  }
  const body = blocks.map((b, i) => {
    const h: HighlightSpan[] = (hl.get(i) ?? []).map((s) => ({ ...s, color }));
    return {
      ...b,
      highlight: normalizeHighlights(h, b.text.length),
      underline: normalizeSpans(ul.get(i) ?? [], b.text.length),
      emphasis: normalizeSpans(emph.get(i) ?? [], b.text.length),
    };
  });
  let fragments = 0;
  for (let k = 0; k < ordered.length; k++) if (k === 0 || ordered[k] !== ordered[k - 1] + 1 || tokens[ordered[k]].block !== tokens[ordered[k - 1]].block) fragments++;
  return { body, unmatchedShort: short.unmatched, unmatchedLong: long.unmatched, protectedWords: protectedIdx.map((k) => tokens[k].norm), shortFragments: fragments };
}

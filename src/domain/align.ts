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

/** Spans (per block) covering matched tokens; neighbors in the same block merge across the gap between them.
 * With `blocks`, a symbol attached to a number is included ("$40", "40%", "30°") so the read shows the whole figure. */
export function spansFor(tokens: Tok[], matched: number[], blocks?: BodyText[]): Map<number, Span[]> {
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
    let start = t.start;
    let end = t.end;
    if (blocks && /^\d/.test(t.norm)) {
      const text = blocks[t.block].text;
      if (start > 0 && /[$£€¥]/.test(text[start - 1])) start--;
      if (end < text.length && /[%‰°]/.test(text[end])) end++;
    }
    if (run && t.block === run.block && idx === run.last + 1) {
      run.end = end;
      run.last = idx;
    } else {
      flush();
      run = { block: t.block, start, end, last: idx };
    }
  }
  flush();
  return out;
}

// ---- Meaning protection ----------------------------------------------------------------
// The model chooses what to read; these rules make sure the read can't say something the author
// didn't: docs/research/highlighting.md §6 (H-4 dangling ends, H-5 articles, H-7 negation heads,
// H-8 hedge scope, H-9 numbers, H-10/H-11 attribution and limiting clauses). Every fix only adds
// back (or drops) the card's own words; the text itself never changes.

const DETERMINERS = new Set(["a", "an", "the", "this", "that", "these", "those", "any", "its", "their", "his", "her", "our", "my", "your", "such"]);
const AUXES = new Set(["do", "does", "did", "is", "are", "was", "were", "will", "would", "can", "could", "should", "shall", "may", "might", "must", "has", "have", "had"]);
export const NEGATORS = new Set(["not", "no", "never", "nor", "neither", "none", "cannot", "without", "nobody", "nothing", "nowhere", "fail", "fails", "failed", "failing"]);
const isNegator = (w: string) => NEGATORS.has(w) || w.endsWith("n't");
/** Epistemic hedges and scope words: skipping one right before the word it governs raises certainty or scope. */
export const HEDGES = new Set([
  ...["may", "might", "could", "would", "possibly", "perhaps", "probably", "likely", "unlikely", "potentially", "arguably", "appear", "appears", "appeared", "seem", "seems", "seemed", "suggest", "suggests", "suggested", "allegedly", "reportedly", "apparently", "presumably"],
  ...["some", "most", "many", "few", "several", "often", "sometimes", "rarely", "seldom", "hardly", "usually", "typically", "generally", "largely", "mostly", "partly", "partially", "nearly", "almost", "roughly", "approximately", "frequently", "occasionally", "somewhat"],
]);
/** Words a hedge may reach across to the word it governs ("might have sued", "some of the states", "suggests that …"). */
const HEDGE_REACH = new Set([...DETERMINERS, "have", "has", "had", "be", "been", "being", "to", "also", "still", "even", "well", "eventually", "ultimately", "soon", "actually", "already", "further", "of", "that"]);
const NUMBER_WORDS = new Set(["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "hundreds", "thousand", "thousands", "dozen", "dozens", "half", "third", "quarter", "twice", "double", "triple", "tenfold"]);
const isNumber = (w: string) => /^\d/.test(w) || NUMBER_WORDS.has(w);
const BOUNDS: string[][] = [
  ["as", "much", "as"], ["as", "many", "as"], ["as", "few", "as"], ["as", "little", "as"], ["as", "high", "as"], ["as", "low", "as"], ["no", "more", "than"], ["no", "less", "than"], ["no", "fewer", "than"],
  ["up", "to"], ["at", "least"], ["at", "most"], ["more", "than"], ["less", "than"], ["fewer", "than"], ["greater", "than"], ["an", "estimated"],
  ["over"], ["under"], ["nearly"], ["almost"], ["about"], ["roughly"], ["approximately"], ["around"], ["only"], ["just"], ["some"], ["below"], ["above"], ["upwards"], ["exceeding"],
];
const MAGNITUDES = new Set(["hundred", "thousand", "million", "billion", "trillion", "percent", "percentage", "fold"]);
/** A read sentence shouldn't stop on these when the source sentence goes on (H-4). */
const DANGLING_END = new Set(["a", "an", "the", "of", "to", "in", "on", "at", "by", "for", "with", "from", "into", "onto", "upon", "and", "or", "but", "nor", "that", "which", "who", "whom", "whose", "as", "than", "because", "while", "if", "its", "their", "his", "her", "our", "my", "your", "this", "these", "those"]);
const LIMITERS = new Set(["but", "however", "although", "though", "yet", "except", "unless", "whereas"]);
const REBUTTAL_OPENERS = new Set(["but", "however", "yet", "nevertheless", "nonetheless", "still", "instead", "conversely"]);
const REBUTTAL = /\b(?:(?:does|do|did)(?: not|n't) (?:support|hold|survive|bear)|(?:is|are|was|were) (?:wrong|mistaken|false|incorrect|misguided|overstated|exaggerated)|the (?:evidence|record|data) (?:shows? otherwise|(?:does|do)(?: not|n't)))/i;
const ATTR_SUBJECTS = new Set(["critics", "opponents", "proponents", "skeptics", "sceptics", "advocates", "supporters", "some", "many", "others", "detractors"]);
const ATTR_VERBS = new Set(["argue", "argues", "argued", "claim", "claims", "claimed", "contend", "contends", "believe", "believes", "insist", "insists", "assert", "asserts", "maintain", "maintains", "allege", "alleges"]);

interface Doc {
  tokens: Tok[];
  blocks: BodyText[];
  sentences: number[][];
  /** first / last token index of the sentence containing each token */
  first: Int32Array;
  last: Int32Array;
}

function gapAfter(d: Doc, k: number): string {
  const t = d.tokens[k];
  const next = d.tokens[k + 1];
  return next && next.block === t.block ? d.blocks[t.block].text.slice(t.end, next.start) : "\n";
}

function analyze(tokens: Tok[], blocks: BodyText[]): Doc {
  const sentences: number[][] = [];
  let cur: number[] = [];
  const d: Doc = { tokens, blocks, sentences, first: new Int32Array(tokens.length), last: new Int32Array(tokens.length) };
  for (let k = 0; k < tokens.length; k++) {
    cur.push(k);
    if (/[.!?]["'”’)\]]*(\s|$)|\n/.test(gapAfter(d, k))) {
      sentences.push(cur);
      cur = [];
    }
  }
  if (cur.length) sentences.push(cur);
  for (const s of sentences) for (const k of s) {
    d.first[k] = s[0];
    d.last[k] = s[s.length - 1];
  }
  return d;
}

/** A clause boundary between token k and k+1: ; : — or a comma that opens a new clause. */
function clauseBreak(d: Doc, k: number): boolean {
  const g = gapAfter(d, k);
  if (/[;:—–]|\s-\s/.test(g)) return true;
  return g.includes(",") && ["which", "who", "whom", "whose", "where", "when", "while", "although", "though", "but", "however", "because", "since", "unless", "whereas"].includes(d.tokens[k + 1]?.norm ?? "");
}

/** The word a qualifier at k governs: the first token after it (within its clause) that isn't in `reach`. */
function headAfter(d: Doc, k: number, reach: Set<string>, maxReach: number): number | null {
  let skipped = 0;
  for (let j = k + 1; j <= d.last[k]; j++) {
    if (clauseBreak(d, j - 1)) return null;
    if (reach.has(d.tokens[j].norm) && skipped < maxReach) {
      skipped++;
      continue;
    }
    return j;
  }
  return null;
}

function vowelSound(word: string): boolean | null {
  const w = word.replace(/^[^\p{L}\p{N}]+/u, "");
  if (/^\d/.test(w)) return /^(8|11|18)(\D|$)|^8\d/.test(w);
  if (w.length > 1 && w === w.toUpperCase()) return null; // acronyms: "an FBI" vs "a NATO", can't tell
  const l = w.toLowerCase();
  if (/^(hour|honest|honor|honour|heir)/.test(l)) return true;
  if (/^(uni|use|usu|uti|ubiq|eu|ewe|one|once|ura|uro)/.test(l)) return false;
  return /^[aeiou]/.test(l);
}

/**
 * Add back words whose omission would change what the read says: a negator whose governed word is
 * read, a hedge or scope word before the word it governs, the bound/magnitude of a read number, and
 * the words between an article and a read noun that no longer takes it. Returns the added indices.
 */
export function protectQualifiers(tokens: Tok[], matched: Set<number>, blocks: BodyText[]): number[] {
  const d = analyze(tokens, blocks);
  const added: number[] = [];
  const add = (k: number) => {
    if (k >= 0 && k < tokens.length && !matched.has(k)) {
      matched.add(k);
      added.push(k);
    }
  };
  const norm = (k: number) => (k >= 0 && k < tokens.length ? tokens[k].norm : "");
  const readBetween = (a: number, b: number) => {
    for (let i = a; i < b; i++) if (matched.has(i)) return true;
    return false;
  };

  const negator = (k: number) => {
    const w = norm(k);
    const inSent = (i: number) => i >= d.first[k] && i <= d.last[k];
    const next = inSent(k + 1) ? norm(k + 1) : "";
    const prev = inSent(k - 1) ? norm(k - 1) : "";
    if (["only", "merely", "just", "simply", "least", "question", "doubt", "but", "rather", "instead"].includes(next)) return; // not only…, without question, no doubt
    if (w === "not" && (prev === "or" || prev === "as")) return; // "or not", "often as not"
    if (w === "no" && prev === "to" && matched.has(k - 2)) return; // "little to no" with "little" read
    // "not X but Y": skipping the rejected half keeps the author's assertion.
    for (let j = k + 1; j <= Math.min(d.last[k], k + 10); j++) {
      if (clauseBreak(d, j - 1)) break;
      if (["but", "rather", "instead"].includes(norm(j))) {
        if (!readBetween(k + 1, j) && readBetween(j + 1, d.last[k] + 1)) return;
        break;
      }
    }
    const reach = w.startsWith("fail") ? new Set([...DETERMINERS, "to"]) : DETERMINERS;
    const h = headAfter(d, k, reach, 2);
    if (h === null || !matched.has(h)) return;
    for (let j = k; j < h; j++) add(j);
    if (w === "not" && prev === "if") {
      add(k - 1); // "most if not all": the weaker bound is part of the claim
      if (inSent(k - 2)) add(k - 2);
    }
    // Keep the verb group grammatical: "did not increase", not "not increase".
    if (AUXES.has(prev) && !/[,;:]/.test(gapAfter(d, k - 1))) add(k - 1);
  };

  const hedge = (k: number) => {
    const h = headAfter(d, k, HEDGE_REACH, 3);
    if (h === null || !matched.has(h)) return;
    for (let j = k; j < h; j++) add(j);
  };

  const numberFrame = (n: number) => {
    // The whole numeral ("1,200", "40.5") …
    let a = n;
    let b = n;
    while (a - 1 >= d.first[n] && isNumber(norm(a - 1)) && /^[.,]$/.test(gapAfter(d, a - 1))) a--;
    while (b + 1 <= d.last[n] && isNumber(norm(b + 1)) && /^[.,]$/.test(gapAfter(d, b))) b++;
    for (let j = a; j <= b; j++) add(j);
    // … its bound ("as much as 40", "up to 40", "nearly 40") …
    for (const phrase of BOUNDS) {
      const start = a - phrase.length;
      if (start < d.first[n]) continue;
      if (phrase.every((p, i) => norm(start + i) === p)) {
        for (let j = start; j < a; j++) add(j);
        break;
      }
    }
    // … and its magnitude ("40 billion", "12 percent", "percentage points").
    if (b + 1 <= d.last[n] && MAGNITUDES.has(norm(b + 1))) {
      add(b + 1);
      if (norm(b + 1) === "percentage" && norm(b + 2) === "points") add(b + 2);
    }
  };

  const article = (k: number) => {
    let r = k + 1;
    while (r <= d.last[k] && !matched.has(r)) r++;
    if (r > d.last[k] || r === k + 1 || r - k - 1 > 3) return;
    const t = tokens[r];
    const v = vowelSound(blocks[t.block].text.slice(t.start, t.end));
    if (v === null || (norm(k) === "an") === v) return;
    for (let j = k + 1; j < r; j++) add(j);
  };

  for (const s of d.sentences) {
    if (!s.some((k) => matched.has(k))) continue;
    for (const k of s) if (!matched.has(k) && isNegator(norm(k))) negator(k);
    for (const k of s) if (!matched.has(k) && HEDGES.has(norm(k))) hedge(k);
    for (const k of s) if (matched.has(k) && isNumber(norm(k)) && /^\d/.test(norm(k))) numberFrame(k);
    for (const k of s) if (matched.has(k) && (norm(k) === "a" || norm(k) === "an")) article(k);
  }
  return added;
}

/** A skipped attribution frame ("critics argue that") before read words, as [first, last] token indices. */
function attributionFrame(d: Doc, s: number[], matched: Set<number>): [number, number] | null {
  for (const k of s) {
    if (!ATTR_SUBJECTS.has(d.tokens[k].norm) || matched.has(k)) continue;
    const v = [k + 1, k + 2, k + 3].find((j) => j <= d.last[k] && ATTR_VERBS.has(d.tokens[j]?.norm ?? ""));
    if (v === undefined || matched.has(v) || !s.some((r) => r > v && matched.has(r))) continue;
    return [k, d.tokens[v + 1]?.norm === "that" && v + 1 <= d.last[k] ? v + 1 : v];
  }
  return null;
}

function rebuts(d: Doc, sentence: number[] | undefined): boolean {
  if (!sentence) return false;
  const a = d.tokens[sentence[0]];
  const b = d.tokens[sentence[sentence.length - 1]];
  return REBUTTAL_OPENERS.has(a.norm) || (a.block === b.block && REBUTTAL.test(d.blocks[a.block].text.slice(a.start, b.end)));
}

/**
 * H-10: when the read includes a view the author attributes to others and then the author's rebuttal,
 * the attribution ("Some analysts argue that") is read too, so the listener hears whose view it is.
 */
export function protectAttribution(tokens: Tok[], matched: Set<number>, blocks: BodyText[]): number[] {
  const d = analyze(tokens, blocks);
  const added: number[] = [];
  d.sentences.forEach((s, si) => {
    const frame = attributionFrame(d, s, matched);
    const next = d.sentences[si + 1];
    if (!frame || !next || !next.some((k) => matched.has(k)) || !rebuts(d, next)) return;
    for (let j = frame[0]; j <= frame[1]; j++) if (!matched.has(j)) {
      matched.add(j);
      added.push(j);
    }
  });
  return added;
}

/** Drop function words a read sentence would otherwise stop on mid-phrase ("… the rise of"). Returns the dropped indices. */
export function trimDanglingEnds(tokens: Tok[], matched: Set<number>, blocks: BodyText[]): number[] {
  const d = analyze(tokens, blocks);
  const dropped: number[] = [];
  for (const s of d.sentences) {
    const read = s.filter((k) => matched.has(k));
    while (read.length > 1) {
      const k = read[read.length - 1];
      if (k === s[s.length - 1] || !DANGLING_END.has(tokens[k].norm)) break;
      matched.delete(k);
      dropped.push(k);
      read.pop();
    }
  }
  return dropped;
}

export interface ReadNote {
  code: "limit_skipped" | "rebuttal_skipped" | "attribution_skipped" | "baseline_skipped";
  message: string;
  /** the author rejects what is read (attribution frame skipped and the next sentence rebuts it) */
  strawMan?: boolean;
}

/** Things an opponent could use against the read: context it leaves out that may limit or reverse it (H-9–H-11). */
export function readNotes(tokens: Tok[], matched: Set<number>, blocks: BodyText[]): ReadNote[] {
  const d = analyze(tokens, blocks);
  const notes: ReadNote[] = [];
  const text = (a: number, b: number) => blocks[tokens[a].block].text.slice(tokens[a].start, tokens[Math.min(b, d.last[a])].end);
  const quote = (a: number, words = 12) => `“${text(a, a + words - 1)}${a + words - 1 < d.last[a] ? " …" : ""}”`;
  d.sentences.forEach((s, si) => {
    const read = s.filter((k) => matched.has(k));
    if (!read.length) return;
    const lastRead = read[read.length - 1];
    const nextSent = d.sentences[si + 1];
    const nextUnread = nextSent && tokens[nextSent[0]].block === tokens[s[0]].block && !nextSent.some((k) => matched.has(k));
    const rebutted = nextUnread && rebuts(d, nextSent);
    // H-11: a limiting clause right after the read part of the sentence.
    const lim = s.find((k) => k > lastRead && !matched.has(k) && LIMITERS.has(tokens[k].norm));
    if (lim !== undefined) notes.push({ code: "limit_skipped", message: `Leaves out ${quote(lim)} right after what's read. If it limits the claim, read it or narrow the tag.` });
    // H-10: a view attributed to others, read without the attribution.
    const frame = attributionFrame(d, s, matched);
    if (frame) {
      const [k, v] = frame;
      notes.push({
        code: "attribution_skipped",
        message: rebutted ? `Reads what ${quote(k, v - k + 1)} while the next sentence rebuts it: that's the author's opponents' view, not the author's.` : `Reads a view the card attributes to ${quote(k, v - k + 1)} without the attribution. Make sure the author holds it.`,
        strawMan: rebutted || undefined,
      });
    }
    // H-9: a read end value whose baseline ("from 52 … to 38") is skipped.
    const from = s.find((k) => tokens[k].norm === "from" && !matched.has(k) && /^\d/.test(tokens[k + 1]?.norm ?? "") && !matched.has(k + 1));
    if (from !== undefined && s.some((k) => k > from + 1 && tokens[k].norm === "to" && matched.has(k + 1) && /^\d/.test(tokens[k + 1]?.norm ?? ""))) notes.push({ code: "baseline_skipped", message: `Reads a change without its starting point (${quote(from, 3)}).` });
    // H-10 (second half): the next sentence rebuts the read one.
    if (rebutted && !notes.some((n) => n.code === "attribution_skipped")) notes.push({ code: "rebuttal_skipped", message: `The next sentence, ${quote(nextSent[0])}, may qualify or reverse what's read.` });
  });
  return notes;
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
  /** function words dropped from the end of a read sentence */
  trimmedWords: string[];
  notes: ReadNote[];
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
  const protectedIdx = [...protectQualifiers(tokens, shortSet, blocks), ...protectAttribution(tokens, shortSet, blocks)];
  const trimmedIdx = trimDanglingEnds(tokens, shortSet, blocks);
  const notes = readNotes(tokens, shortSet, blocks);
  const ordered = [...shortSet].sort((a, b) => a - b);
  const hl = spansFor(tokens, ordered, blocks);
  const ul = spansFor(tokens, [...new Set([...long.matched, ...ordered])].sort((a, b) => a - b), blocks);
  // Emphasis: each phrase located inside the highlighted words.
  const emph = new Map<number, Span[]>();
  for (const phrase of plan.emphasis.slice(0, 3)) {
    const a = alignRead(tokens, phrase, shortSet);
    if (a.unmatched.length) continue;
    for (const [block, spans] of spansFor(tokens, a.matched, blocks)) emph.set(block, [...(emph.get(block) ?? []), ...spans]);
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
  return { body, unmatchedShort: short.unmatched, unmatchedLong: long.unmatched, protectedWords: protectedIdx.map((k) => tokens[k].norm), trimmedWords: trimmedIdx.map((k) => tokens[k].norm), notes, shortFragments: fragments };
}

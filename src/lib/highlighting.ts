/**
 * Highlighting algorithm — turn raw evidence text into well-marked debate cards.
 *
 * The "highlight" is the portion of the card a debater reads aloud. Reading the
 * highlighted spans in sequence MUST form coherent, grammatical sentences
 * (top-circuit standard). Non-highlighted text is in the card so the judge can
 * read it after the round.
 *
 * Why this lives here, and not just inside the prompt: we want a deterministic
 * fallback / repair pass that works even when the LLM produces sub-optimal
 * highlighting (mid-word marks, broken-sentence runs, no warrants, etc.).
 *
 * The exported helpers run on plain HTML strings — they don't need a DOM.
 */

const MARK_RE = /<mark[^>]*>([\s\S]*?)<\/mark>/gi;
const SENTENCE_END = /[.!?…]\s*$/;
const WORD_RE = /\b[\w'-]+\b/g;
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "in", "to", "for", "on", "by",
  "with", "as", "is", "are", "was", "were", "be", "been", "being",
  "this", "that", "these", "those", "it", "its", "their", "they", "them",
  "his", "her", "him", "she", "he", "we", "us", "our", "you", "your",
  "i", "me", "my", "from", "at", "into", "than", "then", "so", "such",
]);

export interface HighlightAnalysis {
  totalChars: number;
  highlightedChars: number;
  highlightRatio: number;
  totalWords: number;
  highlightedWords: number;
  highlightSpans: number;
  averageSpanLength: number;
  /**
   * The reconstructed read-aloud text — what the highlights say when read in
   * order. If this isn't grammatical, the card is broken.
   */
  readAloud: string;
  /** True if the read-aloud sentences appear grammatical. */
  readAloudCoherent: boolean;
  /** Issues a coach would flag. */
  warnings: string[];
}

export function analyzeHighlights(html: string): HighlightAnalysis {
  const stripped = html.replace(/<[^>]+>/g, "");
  const totalChars = stripped.length;
  const totalWords = (stripped.match(WORD_RE) || []).length;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = MARK_RE.exec(html)) !== null) {
    matches.push(m[1].replace(/<[^>]+>/g, "").trim());
  }
  const highlightedSpans = matches.filter(Boolean);
  const highlightedChars = highlightedSpans.reduce((s, t) => s + t.length, 0);
  const highlightedWords = highlightedSpans.reduce(
    (s, t) => s + (t.match(WORD_RE) || []).length,
    0
  );
  const ratio = totalChars > 0 ? highlightedChars / totalChars : 0;
  const avgSpan =
    highlightedSpans.length > 0
      ? highlightedChars / highlightedSpans.length
      : 0;
  const readAloud = highlightedSpans.join(" ").replace(/\s+/g, " ").trim();
  const readAloudCoherent = isReadAloudCoherent(readAloud);

  const warnings: string[] = [];
  if (highlightedSpans.length === 0)
    warnings.push("Card has no highlighting — the debater wouldn't know what to read.");
  if (ratio < 0.08 && totalChars > 200)
    warnings.push("Less than 8% highlighted — likely missing the warrant.");
  if (ratio > 0.7)
    warnings.push("Over 70% highlighted — non-strategic, defeats the purpose of underlining.");
  if (highlightedSpans.length > 0 && avgSpan < 12)
    warnings.push("Spans average under 12 chars — likely word-fragment highlighting that won't read aloud.");
  if (!readAloudCoherent && readAloud.length > 50)
    warnings.push("Highlighted spans don't form coherent sentences when read in order.");
  if (highlightedSpans.some((s) => /^\s*[a-z]/.test(s)))
    warnings.push("Some highlights start mid-sentence (lowercase opener) — re-anchor to sentence starts.");

  return {
    totalChars,
    highlightedChars,
    highlightRatio: ratio,
    totalWords,
    highlightedWords,
    highlightSpans: highlightedSpans.length,
    averageSpanLength: Math.round(avgSpan),
    readAloud,
    readAloudCoherent,
    warnings,
  };
}

/**
 * Lightweight grammaticality heuristic for the assembled read-aloud text.
 * Real grammar checking would need a parser, but the typical failure modes are
 * detectable with simple rules:
 *   - sentence ends with terminal punctuation
 *   - sentence has a verb-like word
 *   - average sentence length is human-shaped
 */
export function isReadAloudCoherent(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 30) return false;
  const sentences = trimmed
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length === 0) return false;
  const longEnough = sentences.every((s) => s.split(/\s+/).length >= 4);
  const verbHints = /\b(is|are|was|were|has|have|had|will|would|can|could|should|may|might|must|do|does|did|cause|fail|prevent|trigger|reduce|increase|argue|show|prove|demonstrate|find|confirm|establish|state|claim)\b/i;
  const verbHeavy = sentences.filter((s) => verbHints.test(s)).length / sentences.length;
  return longEnough && verbHeavy >= 0.5 && SENTENCE_END.test(trimmed);
}

/**
 * Repair common highlight bugs without changing the underlying evidence text.
 *
 * - Drop empty <mark></mark> pairs
 * - Trim whitespace inside marks (keeps space outside)
 * - Merge adjacent <mark>X</mark> <mark>Y</mark> into <mark>X Y</mark> when only
 *   whitespace separates them (a common LLM artifact that breaks read-aloud)
 * - Promote partial-word marks to full-word marks (e.g. <mark>importan</mark>t →
 *   <mark>important</mark>)
 */
export function repairHighlights(html: string): string {
  let out = html;
  // 1. Drop empty marks
  out = out.replace(/<mark[^>]*>\s*<\/mark>/gi, "");
  // 2. Trim inner whitespace
  out = out.replace(/<mark>\s+/g, "<mark>");
  out = out.replace(/\s+<\/mark>/g, "</mark>");
  // 3. Merge whitespace-separated marks
  for (let i = 0; i < 4; i++) {
    const next = out.replace(/<\/mark>(\s*)<mark>/gi, "$1");
    if (next === out) break;
    out = next;
  }
  // 4. Walk the string and extend partial-word marks to full word boundaries.
  out = extendMarksToWordBoundaries(out);
  return out;
}

function extendMarksToWordBoundaries(html: string): string {
  // Build a list of mark spans with index positions, then operate on the
  // string in reverse so earlier indices stay valid.
  type Span = { start: number; end: number; openLen: number; closeLen: number };
  const spans: Span[] = [];
  const openTag = /<mark[^>]*>/gi;
  const closeTag = /<\/mark>/gi;
  let m: RegExpExecArray | null;
  const opens: Array<{ idx: number; len: number }> = [];
  while ((m = openTag.exec(html)) !== null) {
    opens.push({ idx: m.index, len: m[0].length });
  }
  const closes: Array<{ idx: number; len: number }> = [];
  while ((m = closeTag.exec(html)) !== null) {
    closes.push({ idx: m.index, len: m[0].length });
  }
  // Pair open/close in document order
  const len = Math.min(opens.length, closes.length);
  for (let i = 0; i < len; i++) {
    spans.push({
      start: opens[i].idx,
      end: closes[i].idx,
      openLen: opens[i].len,
      closeLen: closes[i].len,
    });
  }
  if (spans.length === 0) return html;

  let cur = html;
  for (let i = spans.length - 1; i >= 0; i--) {
    const span = spans[i];
    // Find the new boundaries
    const before = cur.slice(0, span.start);
    const innerStart = span.start + span.openLen;
    const innerEnd = span.end;
    const inner = cur.slice(innerStart, innerEnd);
    const after = cur.slice(span.end + span.closeLen);

    // If marks already align with word boundaries, skip.
    const charBefore = before.slice(-1);
    const charAfter = after.slice(0, 1);
    let leftExtend = 0;
    let rightExtend = 0;
    if (/[A-Za-z0-9]/.test(charBefore) && /[A-Za-z0-9]/.test(inner.slice(0, 1) || "")) {
      // We're starting mid-word — pull left until whitespace/punct
      let i2 = before.length - 1;
      while (i2 >= 0 && /[A-Za-z0-9'\-]/.test(before[i2])) {
        i2--;
        leftExtend++;
      }
    }
    if (/[A-Za-z0-9]/.test(charAfter) && /[A-Za-z0-9]/.test(inner.slice(-1) || "")) {
      let j2 = 0;
      while (j2 < after.length && /[A-Za-z0-9'\-]/.test(after[j2])) {
        j2++;
        rightExtend++;
      }
    }

    if (leftExtend === 0 && rightExtend === 0) continue;
    const newBefore = before.slice(0, before.length - leftExtend);
    const newPrefix = before.slice(before.length - leftExtend);
    const newSuffix = after.slice(0, rightExtend);
    const newAfter = after.slice(rightExtend);
    cur =
      newBefore +
      "<mark>" +
      newPrefix +
      inner +
      newSuffix +
      "</mark>" +
      newAfter;
  }
  return cur;
}

/**
 * Heuristic auto-highlight — used as a fallback when the LLM returns evidence
 * with no marks at all. We pick sentences that contain claim/warrant verbs and
 * key topic words from the query.
 *
 * Returns a copy of `evidenceHtml` with `<mark>` added around chosen sentences.
 */
export function autoHighlightFallback(evidenceHtml: string, query: string): string {
  if (MARK_RE.test(evidenceHtml)) return evidenceHtml;
  MARK_RE.lastIndex = 0;
  const queryWords = (query.toLowerCase().match(WORD_RE) || []).filter(
    (w) => !STOPWORDS.has(w) && w.length > 3
  );
  if (queryWords.length === 0) return evidenceHtml;

  // Naive sentence split. Good enough for fallback.
  const sentences = evidenceHtml.split(/(?<=[.!?])\s+/);
  const scored = sentences.map((s) => {
    const lower = s.toLowerCase();
    let score = 0;
    for (const w of queryWords) if (lower.includes(w)) score += 2;
    if (/\b(because|therefore|thus|since|leads to|causes|results in|prevents|fails|solves|empirically)\b/i.test(s))
      score += 3;
    if (/\b\d+(\.\d+)?\s*(%|percent|years?|million|billion|trillion)\b/i.test(s)) score += 2;
    if (s.length > 60 && s.length < 280) score += 1;
    return { s, score };
  });

  // Pick top ~3 sentences, cap at 35% of total content
  const totalLen = sentences.reduce((acc, s) => acc + s.length, 0);
  const target = totalLen * 0.35;
  const chosen = new Set<number>();
  const indexed = scored
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => b.score - a.score);
  let acc = 0;
  for (const item of indexed) {
    if (item.score <= 1) break;
    chosen.add(item.i);
    acc += item.s.length;
    if (acc >= target) break;
  }

  return sentences
    .map((s, i) => (chosen.has(i) ? `<mark>${s}</mark>` : s))
    .join(" ");
}

/**
 * Score a card's highlighting on a 0-100 scale. Intended for the eval pipeline.
 */
export function scoreHighlighting(html: string): { score: number; analysis: HighlightAnalysis } {
  const a = analyzeHighlights(html);
  let score = 50;
  // Ratio sweet spot 18-45%
  if (a.highlightRatio >= 0.18 && a.highlightRatio <= 0.45) score += 25;
  else if (a.highlightRatio < 0.08) score -= 25;
  else if (a.highlightRatio > 0.7) score -= 20;
  else score += 10;

  if (a.averageSpanLength >= 25) score += 10;
  if (a.averageSpanLength < 12) score -= 15;

  if (a.readAloudCoherent) score += 20;
  else if (a.readAloud.length > 50) score -= 25;

  if (a.highlightSpans >= 4 && a.highlightSpans <= 14) score += 5;

  score -= Math.min(20, a.warnings.length * 5);

  return { score: Math.max(0, Math.min(100, score)), analysis: a };
}

/**
 * Full repair + score pipeline. Use this as the final pass before saving a
 * card. Returns the repaired HTML and final score.
 */
export function repairAndScore(html: string, query?: string): {
  html: string;
  score: number;
  analysis: HighlightAnalysis;
} {
  let cur = html;
  if (!MARK_RE.test(html)) {
    MARK_RE.lastIndex = 0;
    if (query) cur = autoHighlightFallback(cur, query);
  } else {
    MARK_RE.lastIndex = 0;
  }
  cur = repairHighlights(cur);
  const { score, analysis } = scoreHighlighting(cur);
  return { html: cur, score, analysis };
}

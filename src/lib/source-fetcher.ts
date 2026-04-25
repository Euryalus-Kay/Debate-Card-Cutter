/**
 * Strict source fetcher — verbatim source text only.
 *
 * Hard rules (per user instruction):
 *   1. NEVER use Perplexity's prose summary (`answer`) as evidence.
 *   2. NEVER use deep-search results unless they verbatim-match a direct scrape.
 *   3. If we can't get real source text from at least one candidate URL, FAIL.
 *
 * The fetcher tries each candidate URL in ranked order, keeps the longest
 * direct-scrape result, and only returns when we have at least
 * MIN_DIRECT_SCRAPE_CHARS of real article text.
 */

import { scrapeArticle } from "./scraper";

export const MIN_DIRECT_SCRAPE_CHARS = 800;
export const PREFERRED_SCRAPE_CHARS = 2500;

export type SourcePath = "direct-scrape" | "fallback-deep-search" | "failed";

export interface FetchedSource {
  /** The URL whose text we ended up using. */
  url: string;
  /** The verbatim article text. */
  text: string;
  /** How we got it. Cards from anything other than "direct-scrape" should
   * be flagged for manual review. */
  path: SourcePath;
  /** Other URLs we tried and how many chars they returned. */
  attempts: Array<{ url: string; chars: number; path: SourcePath; error?: string }>;
  /** Domain of the chosen URL — used in the citation. */
  domain: string;
}

interface Candidate {
  url: string;
  title?: string;
}

/**
 * Try a list of candidate URLs in order. Return the first that yields enough
 * direct-scrape text. If NONE work, throw an error — callers must handle this
 * by surfacing a meaningful message to the user, not by silently producing a
 * card from a summary.
 */
export async function fetchSourceText(
  candidates: Candidate[],
  options: {
    minChars?: number;
    preferred?: number;
    timeoutMs?: number;
    onAttempt?: (attempt: { url: string; chars: number; path: SourcePath; error?: string }) => void;
  } = {}
): Promise<FetchedSource> {
  const minChars = options.minChars ?? MIN_DIRECT_SCRAPE_CHARS;
  const preferred = options.preferred ?? PREFERRED_SCRAPE_CHARS;
  const attempts: FetchedSource["attempts"] = [];

  if (candidates.length === 0) {
    throw new SourceFetchError(
      "No candidate URLs to fetch — search returned no sources.",
      attempts
    );
  }

  let best: { url: string; text: string; path: SourcePath } | null = null;

  for (const cand of candidates) {
    const url = cand.url;
    if (!url) continue;
    let text = "";
    let attemptError: string | undefined;
    try {
      text = await scrapeArticle(url);
    } catch (err) {
      attemptError = err instanceof Error ? err.message : "fetch failed";
    }

    // Trim the metadata header (TITLE/AUTHOR/DATE/URL) when measuring whether
    // we got real article body. The header is ~120-300 chars.
    const bodyOnly = text.replace(/^TITLE:[\s\S]*?\n\n/, "");
    const chars = bodyOnly.length;

    const attempt = {
      url,
      chars,
      path: "direct-scrape" as SourcePath,
      ...(attemptError ? { error: attemptError } : {}),
    };
    attempts.push(attempt);
    options.onAttempt?.(attempt);

    if (chars >= minChars) {
      if (!best || chars > best.text.length) {
        best = { url, text, path: "direct-scrape" };
      }
      // Good enough — don't keep paying scrape latency for diminishing returns.
      if (chars >= preferred) break;
    }
  }

  if (!best) {
    throw new SourceFetchError(
      `Could not retrieve verbatim article text from any of ${candidates.length} candidate URL(s). ` +
        `Sources may be paywalled, JS-rendered, or anti-bot-protected. ` +
        `Try a different query, or paste the source text manually.`,
      attempts
    );
  }

  let domain = "";
  try {
    domain = new URL(best.url).hostname.replace(/^www\./, "");
  } catch {
    /* ignore */
  }

  return {
    url: best.url,
    text: best.text,
    path: best.path,
    attempts,
    domain,
  };
}

export class SourceFetchError extends Error {
  attempts: FetchedSource["attempts"];
  constructor(msg: string, attempts: FetchedSource["attempts"]) {
    super(msg);
    this.name = "SourceFetchError";
    this.attempts = attempts;
  }
}

/**
 * Verbatim-match check. After Claude generates a card, every highlighted span
 * (and most of the surrounding evidence) MUST appear verbatim in the source
 * text we passed in. If not, Claude probably hallucinated quotes.
 *
 * Returns 0-1 where 1.0 means perfect verbatim match.
 *
 * The check is case-insensitive and whitespace-tolerant. It also strips
 * non-letter punctuation since articles and the LLM tend to disagree on
 * smart-quotes, em-dashes, etc.
 */
export function verbatimMatchScore(
  evidenceHtml: string,
  sourceText: string
): {
  score: number;
  totalSpans: number;
  matchedSpans: number;
  unmatchedSamples: string[];
} {
  const normalize = (s: string) =>
    s
      .replace(/[‘’‚‛]/g, "'")
      .replace(/[“”„‟]/g, '"')
      .replace(/[–—−]/g, "-")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .toLowerCase()
      .trim();

  const normalizedSource = normalize(sourceText);
  if (!normalizedSource) {
    return { score: 0, totalSpans: 0, matchedSpans: 0, unmatchedSamples: [] };
  }

  // Pull out highlighted spans first — those are what the debater reads.
  const markRe = /<mark[^>]*>([\s\S]*?)<\/mark>/gi;
  const spans: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = markRe.exec(evidenceHtml)) !== null) {
    const t = m[1].replace(/<[^>]+>/g, "").trim();
    if (t) spans.push(t);
  }

  // Also sample 8 random sentences from the un-marked body so we cover the
  // full evidence, not just the highlights.
  const stripped = evidenceHtml.replace(/<[^>]+>/g, " ");
  const sentences = stripped
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40);
  const sampleCount = Math.min(8, sentences.length);
  const sampled: string[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const idx = Math.floor((i / sampleCount) * sentences.length);
    sampled.push(sentences[idx]);
  }
  const allFragments = [...spans, ...sampled].filter(Boolean);

  let matchedSpans = 0;
  const unmatched: string[] = [];

  for (const span of allFragments) {
    const norm = normalize(span);
    if (norm.length < 6) {
      // Tiny spans — give them the benefit of the doubt; they're often
      // single-word marks that may not survive normalization.
      matchedSpans += 1;
      continue;
    }
    if (normalizedSource.includes(norm)) {
      matchedSpans += 1;
    } else {
      // Try a fuzzier match: split into ~6-word chunks and require >= 80% to
      // appear in the source. This handles small ellipses or punctuation
      // differences that survived normalization.
      const chunkScore = chunkContainmentRatio(norm, normalizedSource);
      if (chunkScore >= 0.8) matchedSpans += 1;
      else unmatched.push(span);
    }
  }

  const total = allFragments.length;
  return {
    score: total === 0 ? 0 : matchedSpans / total,
    totalSpans: total,
    matchedSpans,
    unmatchedSamples: unmatched.slice(0, 4),
  };
}

function chunkContainmentRatio(needle: string, haystack: string): number {
  const words = needle.split(" ").filter(Boolean);
  if (words.length < 6) return haystack.includes(needle) ? 1 : 0;
  const chunks: string[] = [];
  for (let i = 0; i < words.length - 5; i += 3) {
    chunks.push(words.slice(i, i + 6).join(" "));
  }
  if (chunks.length === 0) return 0;
  let hits = 0;
  for (const c of chunks) if (haystack.includes(c)) hits += 1;
  return hits / chunks.length;
}

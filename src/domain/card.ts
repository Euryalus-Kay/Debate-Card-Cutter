/**
 * Evidence card model.
 *
 * The body is a list of blocks. Text blocks hold VERBATIM source text only;
 * formatting (underline / emphasis / highlight) is stored as character spans
 * over that text, never as edits to it. Omissions and editorial insertions are
 * explicit blocks so they can never be confused with source text.
 */

import { countWords, type WordLoad } from "./timing";
import type { Citation } from "./citation";
import { shortCite } from "./citation";

export type HighlightColor = "yellow" | "cyan" | "green" | "magenta" | "gray" | "red" | "blue" | "darkYellow" | "lightGray";
export const DEFAULT_HIGHLIGHT: HighlightColor = "yellow";

export interface Span {
  start: number;
  end: number;
}

export interface HighlightSpan extends Span {
  color: HighlightColor;
}

export interface BodyText {
  kind: "text";
  /** verbatim source text */
  text: string;
  /** true when this block begins a new paragraph */
  newParagraph: boolean;
  underline: Span[];
  emphasis: Span[];
  highlight: HighlightSpan[];
  /** location in the stored source text, set by verification */
  sourceRange?: Span;
}

export interface BodyOmission {
  kind: "omission";
  /** how the omission is displayed, e.g. "…" or "[…]" */
  marker: string;
}

export interface BodyInsertion {
  kind: "insertion";
  /** editorial text shown in [brackets]; never part of the source */
  text: string;
  /** whether the reader reads it aloud */
  read: boolean;
}

export type BodyBlock = BodyText | BodyOmission | BodyInsertion;

export type CardOrigin = "ai_cut" | "user_cut" | "imported" | "legacy_import";

export type VerificationStatus =
  /** every text block matched the stored source verbatim, in order, gaps disclosed */
  | "verified"
  /** body matched, but citation fields are incomplete or partly unverified */
  | "verified_quote_only"
  /** came from a user document; not independently checked against the original */
  | "imported"
  /** original source could not be accessed */
  | "unverified"
  /** checked and did NOT match the source */
  | "mismatch";

export interface Card {
  id: string;
  tag: string;
  citation: Citation;
  body: BodyBlock[];
  origin: CardOrigin;
  verification: {
    status: VerificationStatus;
    checkedAt?: string;
    sourceId?: string;
    sourceTextHash?: string;
    issues: CardIssue[];
  };
  /** AI or human explanation of the card; never rendered as evidence */
  commentary?: string;
}

export interface CardIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  blockIndex?: number;
}

// ---------------------------------------------------------------------------
// Span utilities
// ---------------------------------------------------------------------------

export function normalizeSpans<T extends Span>(spans: T[], length: number, sameKey: (a: T, b: T) => boolean = () => true): T[] {
  const clamped = spans
    .map((s) => ({ ...s, start: Math.max(0, Math.min(length, s.start)), end: Math.max(0, Math.min(length, s.end)) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out: T[] = [];
  for (const s of clamped) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end && sameKey(last, s)) {
      last.end = Math.max(last.end, s.end);
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

export function normalizeHighlights(spans: HighlightSpan[], length: number): HighlightSpan[] {
  return normalizeSpans(spans, length, (a, b) => a.color === b.color);
}

export function spanText(text: string, spans: Span[]): string[] {
  return spans.map((s) => text.slice(s.start, s.end));
}

/** Total characters covered by spans (after merging). */
export function coverage(spans: Span[], length: number): number {
  return normalizeSpans(spans, length).reduce((a, s) => a + (s.end - s.start), 0);
}

export function textBlocks(body: BodyBlock[]): BodyText[] {
  return body.filter((b): b is BodyText => b.kind === "text");
}

export function makeText(text: string, opts: Partial<Omit<BodyText, "kind" | "text">> = {}): BodyText {
  return {
    kind: "text",
    text,
    newParagraph: opts.newParagraph ?? true,
    underline: opts.underline ?? [],
    emphasis: opts.emphasis ?? [],
    highlight: opts.highlight ?? [],
    sourceRange: opts.sourceRange,
  };
}

// ---------------------------------------------------------------------------
// Derived text
// ---------------------------------------------------------------------------

/** Full body as plain text with explicit omission/insertion markers. */
export function plainBody(body: BodyBlock[]): string {
  let out = "";
  for (const b of body) {
    if (b.kind === "text") {
      out += (out && b.newParagraph ? "\n\n" : out ? " " : "") + b.text;
    } else if (b.kind === "omission") {
      out += (out ? " " : "") + b.marker;
    } else {
      out += (out ? " " : "") + `[${b.text}]`;
    }
  }
  return out;
}

/** Only the verbatim source text, paragraphs separated by blank lines. */
export function verbatimText(body: BodyBlock[]): string {
  return textBlocks(body)
    .map((b, i) => (i > 0 && b.newParagraph ? "\n\n" : i > 0 ? " " : "") + b.text)
    .join("");
}

export type ReadBasis = "highlight" | "underline" | "full";

/**
 * What the speaker reads aloud. Highlighted text if the card has any
 * highlighting; otherwise underlined text; otherwise the whole body.
 */
export function readAloud(body: BodyBlock[]): { text: string; basis: ReadBasis } {
  const texts = textBlocks(body);
  const anyHighlight = texts.some((t) => t.highlight.length > 0);
  const anyUnderline = texts.some((t) => t.underline.length > 0 || t.emphasis.length > 0);
  const basis: ReadBasis = anyHighlight ? "highlight" : anyUnderline ? "underline" : "full";
  const parts: string[] = [];
  for (const b of body) {
    if (b.kind === "insertion") {
      if (b.read) parts.push(b.text);
      continue;
    }
    if (b.kind !== "text") continue;
    if (basis === "full") {
      parts.push(b.text);
      continue;
    }
    const spans = basis === "highlight" ? b.highlight : [...b.underline, ...b.emphasis];
    for (const s of normalizeSpans(spans, b.text.length)) parts.push(b.text.slice(s.start, s.end));
  }
  return { text: parts.map((p) => p.trim()).filter(Boolean).join(" "), basis };
}

export function cardLoad(card: Pick<Card, "tag" | "citation" | "body">): WordLoad {
  const read = readAloud(card.body);
  return {
    cardWords: countWords(read.text),
    tagWords: countWords(card.tag) + countWords(shortCite(card.citation)),
    analyticWords: 0,
    cards: 1,
    transitions: 0,
  };
}

// ---------------------------------------------------------------------------
// Structural validation (independent of the source)
// ---------------------------------------------------------------------------

export function structuralIssues(card: Pick<Card, "tag" | "body" | "citation">): CardIssue[] {
  const issues: CardIssue[] = [];
  if (!card.tag.trim()) issues.push({ severity: "error", code: "missing_tag", message: "The card has no tag." });
  const texts = textBlocks(card.body);
  if (texts.length === 0) issues.push({ severity: "error", code: "empty_body", message: "The card has no evidence text." });
  card.body.forEach((b, i) => {
    if (b.kind !== "text") return;
    for (const s of [...b.underline, ...b.emphasis, ...b.highlight]) {
      if (s.start < 0 || s.end > b.text.length || s.end <= s.start) {
        issues.push({ severity: "error", code: "bad_span", message: `Formatting span out of range in paragraph ${i + 1}.`, blockIndex: i });
      }
    }
  });
  if (card.body[0]?.kind === "omission") {
    issues.push({ severity: "info", code: "leading_omission", message: "Card body starts with an omission marker." });
  }
  const read = readAloud(card.body);
  if (read.basis === "full" && countWords(read.text) > 120) {
    issues.push({
      severity: "warning",
      code: "no_highlighting",
      message: "Nothing is underlined or highlighted, so the time estimate assumes the entire card is read.",
    });
  }
  if (!card.citation.authors.length && !card.citation.organization) {
    issues.push({ severity: "warning", code: "missing_author", message: "Citation has no author or organization." });
  }
  if (!card.citation.date?.year) {
    issues.push({ severity: "warning", code: "missing_date", message: "Citation has no publication date." });
  }
  return issues;
}

/** Stable content hash of the verbatim text (for dedupe and integrity checks). */
export async function bodyHash(body: BodyBlock[]): Promise<string> {
  const norm = verbatimText(body).normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  const data = new TextEncoder().encode(norm);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Highlight helpers
// ---------------------------------------------------------------------------

/** Fraction of verbatim characters that are highlighted (0..1). */
export function highlightRatio(body: BodyBlock[]): number {
  const texts = textBlocks(body);
  const total = texts.reduce((a, t) => a + t.text.length, 0);
  if (!total) return 0;
  const hl = texts.reduce((a, t) => a + coverage(t.highlight, t.text.length), 0);
  return hl / total;
}

/**
 * Apply a list of verbatim phrases as highlight spans on a text block, in
 * order, each phrase located after the previous one. Used to turn a model's
 * phrase selections into spans without ever letting the model alter text.
 * Returns the phrases that could not be located.
 */
export function highlightPhrases(block: BodyText, phrases: string[], color: HighlightColor = DEFAULT_HIGHLIGHT): { block: BodyText; missing: string[] } {
  const spans: HighlightSpan[] = [...block.highlight];
  const missing: string[] = [];
  let cursor = 0;
  for (const phrase of phrases) {
    const p = phrase.trim();
    if (!p) continue;
    let at = block.text.indexOf(p, cursor);
    if (at < 0) at = block.text.indexOf(p); // tolerate out-of-order phrase
    if (at < 0) {
      missing.push(phrase);
      continue;
    }
    spans.push({ start: at, end: at + p.length, color });
    cursor = at + p.length;
  }
  return { block: { ...block, highlight: normalizeHighlights(spans, block.text.length) }, missing };
}

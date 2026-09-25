/**
 * Turn parsed paragraphs into debate structure: headings (Pocket/Hat/Block),
 * cards (tag + cite + body with formatting spans), and analytics.
 * Deterministic; ambiguous cases are reported, not guessed silently.
 */

import type { BodyText, HighlightSpan, Span } from "@/domain/card";
import { normalizeHighlights, normalizeSpans } from "@/domain/card";
import type { Citation } from "@/domain/citation";
import type { DocParagraph } from "./docx";

export interface ImportedHeading {
  kind: "heading";
  level: 1 | 2 | 3;
  text: string;
  paragraphIndex: number;
}

export interface ImportedCard {
  kind: "card";
  tag: string;
  tagParagraph: number;
  cite: { short: string; rest: string; raw: string; paragraphIndex: number } | null;
  citation: Citation;
  body: BodyText[];
  paragraphRange: [number, number];
  path: string[];
  issues: string[];
}

export interface ImportedAnalytic {
  kind: "analytic";
  text: string;
  /** additional explanatory paragraphs under the analytic tag */
  detail: string[];
  paragraphIndex: number;
  path: string[];
}

export type ImportedItem = ImportedHeading | ImportedCard | ImportedAnalytic;

export interface StructuredDoc {
  items: ImportedItem[];
  counts: { headings: number; cards: number; analytics: number };
  issues: string[];
  /** true when the document uses heading styles (Verbatim-like) */
  styled: boolean;
}

const CITE_START = /^\s*[\p{Lu}][\p{L}'’.\-]+(?:\s(?:&|and)\s[\p{Lu}][\p{L}'’.\-]+|\s(?:et\.?\s?al\.?))?(?:[\s,]+(?:'?\d{2}|\d{4}|ND|N\.D\.|n\.d\.))\b/u;
const URL_RE = /\bhttps?:\/\/[^\s)\]}>"]+/i;

function isBlank(p: DocParagraph): boolean {
  return p.text.trim().length === 0;
}

/** A paragraph that looks like a citation line. */
export function looksLikeCite(p: DocParagraph): boolean {
  const text = p.text.trim();
  if (!text || text.length > 1500) return false;
  const first = p.runs.find((r) => r.text.trim());
  const firstBold = !!first && (!!first.props.bold || /cite/i.test(first.charStyleName ?? ""));
  const patterned = CITE_START.test(text);
  const hasCiteSignals = URL_RE.test(text) || /\b(19|20)\d{2}\b/.test(text) || /\/\/\s*\w{1,4}\s*$/.test(text);
  return (firstBold && (patterned || hasCiteSignals)) || (patterned && hasCiteSignals && text.length < 900);
}

function hasCardFormatting(p: DocParagraph): boolean {
  return p.runs.some((r) => r.props.underline || r.props.highlight || r.emphasis);
}

export function paragraphToBody(p: DocParagraph): BodyText {
  let text = "";
  const underline: Span[] = [];
  const emphasis: Span[] = [];
  const highlight: HighlightSpan[] = [];
  for (const r of p.runs) {
    const start = text.length;
    text += r.text;
    const end = text.length;
    if (end === start) continue;
    if (r.props.underline || r.emphasis) underline.push({ start, end });
    if (r.emphasis) emphasis.push({ start, end });
    if (r.props.highlight) highlight.push({ start, end, color: r.props.highlight });
  }
  // Trim leading/trailing whitespace while keeping spans aligned.
  const lead = text.length - text.trimStart().length;
  const trimmed = text.trim();
  const shift = (s: Span) => ({ ...s, start: s.start - lead, end: s.end - lead });
  const len = trimmed.length;
  return {
    kind: "text",
    text: trimmed,
    newParagraph: true,
    underline: normalizeSpans(underline.map(shift), len),
    emphasis: normalizeSpans(emphasis.map(shift), len),
    highlight: normalizeHighlights(highlight.map((h) => ({ ...shift(h), color: h.color })), len),
  };
}

/** Split a cite paragraph into the bold short cite and the rest. */
export function splitCite(p: DocParagraph): { short: string; rest: string; raw: string } {
  const raw = p.text.trim();
  let short = "";
  for (const r of p.runs) {
    if (!r.text.trim() && !short) continue;
    if (r.props.bold || /cite/i.test(r.charStyleName ?? "")) short += r.text;
    else break;
  }
  short = short.trim().replace(/[,;:]\s*$/, "");
  if (!short || short.length > 80) {
    const m = CITE_START.exec(raw);
    short = m ? m[0].trim() : "";
  }
  const rest = raw.slice(raw.indexOf(short) + short.length).replace(/^[\s,;:]+/, "");
  return { short, rest, raw };
}

/**
 * Best-effort citation fields from an imported cite. Everything is marked
 * provenance "imported"; the raw text is preserved for display and export.
 */
export function citationFromImported(short: string, rest: string, raw: string): Citation {
  const c: Citation = { authors: [], provenance: {}, raw };
  const yearM = /(?:^|\s)'?(\d{2}|\d{4})\b/.exec(short);
  const name = short.replace(/(?:^|\s)'?(\d{2}|\d{4}|ND|N\.D\.)\b.*$/i, "").trim();
  if (name) {
    c.authors = [{ name, family: name.replace(/\s+(et\.?\s?al\.?)$/i, "") }];
    c.provenance.authors = "imported";
    c.shortOverride = short;
  }
  const fullYear = /\b(19|20)\d{2}\b/.exec(rest);
  if (yearM) {
    const y = yearM[1].length === 2 ? (Number(yearM[1]) > 50 ? 1900 : 2000) + Number(yearM[1]) : Number(yearM[1]);
    c.date = { year: fullYear && Number(fullYear[0]) % 100 === y % 100 ? Number(fullYear[0]) : y, raw: undefined };
    c.provenance.date = "imported";
  }
  const url = URL_RE.exec(rest);
  if (url) {
    c.url = url[0].replace(/[.,;]+$/, "");
    c.provenance.url = "imported";
  }
  const title = /["“]([^"”]{4,300})[,.]?["”]/.exec(rest);
  if (title) {
    c.title = title[1].replace(/[,.]$/, "");
    c.provenance.title = "imported";
  }
  const initials = /\/\/\s*([A-Za-z]{1,4})\s*$/.exec(rest);
  if (initials) c.cutterInitials = initials[1];
  return c;
}

export function structureDocument(paragraphs: DocParagraph[]): StructuredDoc {
  const items: ImportedItem[] = [];
  const issues: string[] = [];
  const styled = paragraphs.some((p) => p.headingLevel > 0);
  const path: string[] = [];

  // Fallback tag detection for unstyled docs: short, fully bold paragraph followed by a cite-like paragraph.
  const isTag = (i: number): boolean => {
    const p = paragraphs[i];
    if (p.headingLevel === 4) return true;
    if (styled || p.headingLevel !== 0 || isBlank(p)) return false;
    const allBold = p.runs.filter((r) => r.text.trim()).every((r) => r.props.bold);
    if (!allBold || p.text.length > 400) return false;
    const next = nextNonBlank(paragraphs, i + 1);
    return next !== -1 && looksLikeCite(paragraphs[next]);
  };

  let i = 0;
  while (i < paragraphs.length) {
    const p = paragraphs[i];
    if (isBlank(p)) {
      i++;
      continue;
    }
    if (p.headingLevel >= 1 && p.headingLevel <= 3) {
      const level = p.headingLevel as 1 | 2 | 3;
      path.length = level - 1;
      path[level - 1] = p.text.trim();
      items.push({ kind: "heading", level, text: p.text.trim(), paragraphIndex: i });
      i++;
      continue;
    }
    if (isTag(i)) {
      const tagText = p.text.trim();
      const next = nextNonBlank(paragraphs, i + 1);
      const nextIsBoundary = next === -1 || paragraphs[next].headingLevel > 0 || isTag(next);
      if (nextIsBoundary) {
        items.push({ kind: "analytic", text: tagText, detail: [], paragraphIndex: i, path: [...path] });
        i++;
        continue;
      }
      const citeP = paragraphs[next];
      const citeLike = looksLikeCite(citeP);
      // Collect following body paragraphs until the next boundary.
      let j = citeLike ? next + 1 : next;
      const bodyParas: DocParagraph[] = [];
      while (j < paragraphs.length && paragraphs[j].headingLevel === 0 && !isTag(j)) {
        if (!isBlank(paragraphs[j])) bodyParas.push(paragraphs[j]);
        j++;
      }
      const anyFormatting = bodyParas.some(hasCardFormatting);
      if (!citeLike && !anyFormatting) {
        // Tag with explanation paragraphs: an analytic.
        items.push({ kind: "analytic", text: tagText, detail: bodyParas.map((b) => b.text.trim()), paragraphIndex: i, path: [...path] });
        i = j;
        continue;
      }
      const cardIssues: string[] = [];
      let cite: ImportedCard["cite"] = null;
      let citation: Citation = { authors: [], provenance: {} };
      if (citeLike) {
        const s = splitCite(citeP);
        cite = { ...s, paragraphIndex: next };
        citation = citationFromImported(s.short, s.rest, s.raw);
      } else {
        cardIssues.push("No citation line found under this tag.");
      }
      if (bodyParas.length === 0) cardIssues.push("Tag and cite have no card text beneath them.");
      items.push({
        kind: "card",
        tag: tagText,
        tagParagraph: i,
        cite,
        citation,
        body: bodyParas.map(paragraphToBody),
        paragraphRange: [i, Math.max(i, j - 1)],
        path: [...path],
        issues: cardIssues,
      });
      i = j;
      continue;
    }
    // Loose body text outside a tag: treat as an analytic paragraph under the current heading.
    items.push({ kind: "analytic", text: p.text.trim(), detail: [], paragraphIndex: i, path: [...path] });
    i++;
  }

  const counts = {
    headings: items.filter((x) => x.kind === "heading").length,
    cards: items.filter((x) => x.kind === "card").length,
    analytics: items.filter((x) => x.kind === "analytic").length,
  };
  if (!styled && counts.cards === 0 && paragraphs.length > 5) {
    issues.push("No heading styles or card structure found. The text was imported as plain paragraphs; you can mark tags and cites manually.");
  }
  return { items, counts, issues, styled };
}

function nextNonBlank(ps: DocParagraph[], from: number): number {
  for (let k = from; k < ps.length; k++) if (!isBlank(ps[k])) return k;
  return -1;
}

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

const YEAR = "['’‘`]?(?:\\d{2}|\\d{4})";
// "Smith 22", "Jane Smith 22", "Andreas von Gunten, 15", "Smith and Lee 22", "Smith et al. 22".
const NAME = String.raw`[\p{Lu}][\p{L}'’.\-]+`;
const PARTICLES = String.raw`(?:von|van|der|den|de|la|le|del|da|di|du|bin|al)`;
const CITE_START = new RegExp(String.raw`^\s*${NAME}(?:\s(?:${PARTICLES}\s)*${NAME})?(?:\s(?:&|and)\s${NAME}|\s(?:et\.?\s?al\.?))?(?:[\s,]+(?:${YEAR}|ND|N\.D\.|n\.d\.))\b`, "u");
const SHORT_CITE = new RegExp(String.raw`^[\p{Lu}][\p{L}'’.\-&, ]{0,60}?[\s,]+(?:${YEAR}|ND)\b`, "u");
const URL_RE = /\bhttps?:\/\/[^\s)\]}>"]+/i;

let junkParagraphs: Set<number> | undefined;
function isBlank(p: DocParagraph): boolean {
  return p.text.trim().length === 0 || !!junkParagraphs?.has(p.index);
}

function isCiteStyle(name: string | undefined, id: string | undefined): boolean {
  return /cite|13\s?pt bold|bold\s?12\s?pt|style13ptbold|stylestylebold12pt/i.test(`${name ?? ""} ${id ?? ""}`);
}

/** Index of the first run that is the short cite (Cite style, or a bold "Name YY" run). */
function shortCiteRun(p: DocParagraph): number {
  let offset = 0;
  for (let i = 0; i < p.runs.length; i++) {
    const r = p.runs[i];
    if (offset > 120) break;
    if (r.text.trim()) {
      if (isCiteStyle(r.charStyleName, r.charStyle)) return i;
      if (r.props.bold) {
        // Bold run(s) that read like "Lastname 21"
        let joined = "";
        for (let j = i; j < p.runs.length && (p.runs[j].props.bold || isCiteStyle(p.runs[j].charStyleName, p.runs[j].charStyle)); j++) joined += p.runs[j].text;
        if (SHORT_CITE.test(joined.trim())) return i;
      }
    }
    offset += r.text.length;
  }
  return -1;
}

/** A paragraph that looks like a citation line. */
export function looksLikeCite(p: DocParagraph): boolean {
  const text = p.text.trim();
  if (!text || text.length > 1500) return false;
  if (shortCiteRun(p) >= 0) return true;
  const patterned = CITE_START.test(text);
  const hasCiteSignals = URL_RE.test(text) || /\b(19|20)\d{2}\b/.test(text) || /\/\/\s*\w{1,4}\s*$/.test(text);
  return patterned && hasCiteSignals && text.length < 900;
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

/** Split a cite paragraph into the short cite ("Deighton 19"), the text before it, and the rest. */
export function splitCite(p: DocParagraph): { short: string; rest: string; raw: string; prefix: string } {
  const raw = p.text.trim();
  const at = shortCiteRun(p);
  if (at >= 0) {
    let prefix = "";
    for (let i = 0; i < at; i++) prefix += p.runs[i].text;
    let short = "";
    let j = at;
    for (; j < p.runs.length && (p.runs[j].props.bold || isCiteStyle(p.runs[j].charStyleName, p.runs[j].charStyle)); j++) short += p.runs[j].text;
    let rest = "";
    for (; j < p.runs.length; j++) rest += p.runs[j].text;
    short = short.trim().replace(/[,;:]\s*$/, "");
    return { short, rest: rest.replace(/^[\s,;:]+/, "").trim(), raw, prefix: prefix.trim() };
  }
  const m = CITE_START.exec(raw);
  const short = m ? m[0].trim() : "";
  return { short, rest: raw.slice(short.length).replace(/^[\s,;:]+/, ""), raw, prefix: "" };
}

/**
 * Best-effort citation fields from an imported cite. Everything is marked
 * provenance "imported"; the raw text is preserved for display and export.
 */
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

function fullYear(token: string, nowYY = new Date().getFullYear() % 100): number | undefined {
  const t = token.replace(/['’‘`]/g, "").trim().toUpperCase();
  if (/^\d{4}$/.test(t)) return Number(t);
  // "2K" = 2000, "2K5" = 2005 (debate shorthand)
  const k = /^2K(\d)?$/.exec(t);
  if (k) return 2000 + Number(k[1] ?? 0);
  if (/^\d{2}$/.test(t)) return Number(t) <= nowYY + 1 ? 2000 + Number(t) : 1900 + Number(t);
  if (/^\d$/.test(t)) return 2000 + Number(t);
  return undefined;
}

/** Year token at the end of a short cite: "Smith 21", "Smith ’21", "Bracey 6", "Reed 2K", "Segall 3/12/21". */
function shortCiteYear(short: string): { year?: number; month?: number; day?: number } {
  const md = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/.exec(short);
  if (md) return { month: Number(md[1]), day: Number(md[2]), year: fullYear(md[3]) };
  const m = /(?:^|[\s,])(['’‘`]?(?:2K\d?|\d{1,4}))\s*$/i.exec(short);
  return m ? { year: fullYear(m[1]) } : {};
}

/** First explicit date in the cite text: 9-18-2019, 9/18/19, September 18, 2019, Winter 2007. */
function findDate(text: string): { year: number; month?: number; day?: number; raw: string } | null {
  let m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/.exec(text);
  if (m) {
    const y = fullYear(m[3]);
    if (y && Number(m[1]) >= 1 && Number(m[1]) <= 12) return { year: y, month: Number(m[1]), day: Number(m[2]), raw: m[0] };
  }
  m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i.exec(text);
  if (m) return { year: Number(m[3]), month: MONTHS[m[1].toLowerCase().slice(0, 4)] ?? MONTHS[m[1].toLowerCase().slice(0, 3)], day: Number(m[2]), raw: m[0] };
  m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b/i.exec(text);
  if (m) return { year: Number(m[2]), month: MONTHS[m[1].toLowerCase().slice(0, 3)], raw: m[0] };
  m = /\b(19[5-9]\d|20[0-4]\d)\b/.exec(text);
  if (m) return { year: Number(m[1]), raw: m[0] };
  return null;
}

/**
 * Best-effort citation fields from an imported cite. Everything is marked
 * provenance "imported"; the raw text is preserved for display and export.
 */
export function citationFromImported(short: string, rest: string, raw: string, prefix = ""): Citation {
  const c: Citation = { authors: [], provenance: {}, raw, rawRest: raw && short && raw.includes(short) ? raw.slice(raw.indexOf(short) + short.length).replace(/^[\s]+/, "") : rest };
  if (prefix) c.rawRest = raw.slice(raw.indexOf(short) + short.length).replace(/^\s+/, "");
  // Year may sit just outside the bold short cite: "Newburger" + " 21, …"
  let shortFull = short;
  const lead = /^\s*(['’‘`]?(?:2K\d?|\d{1,4}))\b[\s,]*/i.exec(rest);
  if (!Object.keys(shortCiteYear(short)).length && lead) {
    shortFull = `${short} ${lead[1]}`;
    rest = rest.slice(lead[0].length);
  }
  const sy = shortCiteYear(shortFull);
  const name = shortFull.replace(/[\s,]*(?:['’‘`]?(?:2K\d?|\d{1,4})|\d{1,2}\/\d{1,2}\/\d{2,4}|ND|N\.D\.)\s*$/i, "").replace(/,\s*$/, "").trim();
  if (name) {
    const family = name.replace(/\s+(et\.?\s?al\.?)$/i, "");
    const full = prefix && /^[\p{Lu}][\p{L}.'’\- ]{0,40}$/u.test(prefix) ? `${prefix} ${name}` : name;
    c.authors = [{ name: full, family }];
    c.provenance.authors = "imported";
    c.shortOverride = shortFull.trim();
  }
  const found = findDate(rest);
  if (sy.year || found) {
    // Prefer the full date in the cite text when it agrees with the short cite's year.
    if (found && (!sy.year || found.year === sy.year)) c.date = { year: found.year, month: found.month ?? sy.month, day: found.day ?? sy.day, raw: found.raw };
    else c.date = { year: sy.year, month: sy.month, day: sy.day };
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

/**
 * `hints` come from AI splitting of files without Verbatim styles (src/server/library/segment.ts):
 * paragraphs it identified as citations, and paragraphs that are neither evidence nor argument.
 */
export function structureDocument(paragraphs: DocParagraph[], hints: { cites?: Set<number>; junk?: Set<number> } = {}): StructuredDoc {
  const items: ImportedItem[] = [];
  const issues: string[] = [];
  junkParagraphs = hints.junk;
  const styled = paragraphs.some((p) => p.headingLevel > 0);
  const path: string[] = [];

  // Tags without the Tag style: a short, fully bold paragraph followed by a cite-like paragraph. In a styled
  // file (a tag pasted in without its style) the citation line must not be all bold itself, and the bold line
  // must not be a short cite on its own line.
  const allBold = (p: DocParagraph) => {
    const runs = p.runs.filter((r) => r.text.trim());
    return runs.length > 0 && runs.every((r) => r.props.bold);
  };
  // A short plain line between a tag and its cite ("---also AT: …") is the cutter's note, not card text. A line
  // that opens bold ("Ho 2 --- Assistant Professor…") is the first line of a cite, not a note.
  const isNote = (k: number): boolean => {
    const q = paragraphs[k];
    const first = q.runs.find((r) => r.text.trim());
    const opensBold = !!first && (!!first.props.bold || isCiteStyle(first.charStyleName, first.charStyle));
    return q.headingLevel === 0 && q.text.trim().length <= 200 && !opensBold && !hasCardFormatting(q) && !looksLikeCite(q) && !hints.cites?.has(q.index);
  };
  const isTag = (i: number): boolean => {
    const p = paragraphs[i];
    if (p.headingLevel === 4) return true;
    if (p.headingLevel !== 0 || isBlank(p) || !allBold(p) || p.text.length > 400) return false;
    let next = nextNonBlank(paragraphs, i + 1);
    if (next !== -1 && isNote(next)) next = nextNonBlank(paragraphs, next + 1);
    if (next === -1) return false;
    const n = paragraphs[next];
    if (!styled) return looksLikeCite(n);
    return n.headingLevel === 0 && looksLikeCite(n) && !allBold(n) && !looksLikeCite(p);
  };
  const isCiteAt = (k: number) => !!hints.cites?.has(paragraphs[k].index) || looksLikeCite(paragraphs[k]);

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
      let tagText = p.text.trim();
      let next = nextNonBlank(paragraphs, i + 1);
      const nextIsBoundary = next === -1 || paragraphs[next].headingLevel > 0 || isTag(next);
      if (nextIsBoundary) {
        items.push({ kind: "analytic", text: tagText, detail: [], paragraphIndex: i, path: [...path] });
        i++;
        continue;
      }
      // A note line between the tag and its cite joins the tag, so the cite is still found and the card text
      // stays exactly the source's words.
      if (isNote(next)) {
        const after = nextNonBlank(paragraphs, next + 1);
        if (after !== -1 && paragraphs[after].headingLevel === 0 && isCiteAt(after) && !isTag(after)) {
          tagText = `${tagText} ${paragraphs[next].text.trim()}`;
          next = after;
        }
      }
      const citeP = paragraphs[next];
      const citeLike = isCiteAt(next);
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
        cite = { short: s.short, rest: s.rest, raw: s.raw, paragraphIndex: next };
        citation = citationFromImported(s.short, s.rest, s.raw, s.prefix);
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
  junkParagraphs = undefined;
  return { items, counts, issues, styled };
}

function nextNonBlank(ps: DocParagraph[], from: number): number {
  for (let k = from; k < ps.length; k++) if (!isBlank(ps[k])) return k;
  return -1;
}

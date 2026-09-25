/**
 * Card linting: evidence-ethics and formatting rules that can be checked
 * deterministically (docs/research/evidence-formatting.md §12, rules V-2…V-19).
 * Source-text verification (V-1) lives in verify.ts.
 *
 * Severity: error = not tournament-compliant as written; warning = a human
 * should look; info = context.
 */

import type { BodyBlock, BodyText, Card, CardIssue, Span } from "./card";
import { normalizeSpans, readAloud, textBlocks } from "./card";
import type { Citation } from "./citation";
import { normalizeText } from "./verify";

export type OmissionPolicy = "nsda" | "permissive";

const NEG = new Set(["not", "no", "never", "none", "nor", "neither", "cannot", "can't", "won't", "isn't", "aren't", "doesn't", "didn't", "wasn't", "weren't", "without", "unlikely", "hardly", "rarely", "seldom"]);
const HEDGE = new Set(["may", "might", "could", "possibly", "perhaps", "potentially", "probably", "likely", "some", "suggests", "appears", "seems", "if", "unless", "except", "only"]);
const ABSOLUTE = ["all", "every", "always", "never", "guarantees", "guarantee", "certain", "certainly", "inevitable", "inevitably", "only", "extinction", "collapse", "definitely", "proves"];
const STRAW_CUES = /\b(critics|opponents|skeptics|some (argue|claim|say|contend)|it is (often )?(claimed|argued|said)|myth|conventional wisdom|proponents claim)\b/i;
const REBUTTAL_CUES = /\b(however|but|yet|in fact|in reality|actually|this is wrong|this misses)\b/i;

function sentences(text: string): Span[] {
  const out: Span[] = [];
  const re = /[^.!?]+(?:[.!?]+["')\]]*|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[0].trim()) out.push({ start: m.index, end: m.index + m[0].length });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

function words(text: string, offset = 0): { w: string; start: number; end: number }[] {
  const out: { w: string; start: number; end: number }[] = [];
  const re = /[\p{L}\p{N}']+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ w: m[0].toLowerCase().replace(/’/g, "'"), start: offset + m.index, end: offset + m.index + m[0].length });
  return out;
}

const inSpans = (spans: Span[], pos: number) => spans.some((s) => pos >= s.start && pos < s.end);

/** V-7: negations/hedges skipped inside a read sentence. */
function skippedQualifiers(b: BodyText, blockIndex: number, tagHasNegation: boolean): CardIssue[] {
  const issues: CardIssue[] = [];
  const hl = normalizeSpans(b.highlight, b.text.length);
  if (!hl.length) return issues;
  for (const s of sentences(b.text)) {
    const inSent = hl.filter((h) => h.start < s.end && h.end > s.start);
    if (!inSent.length) continue;
    const first = Math.max(s.start, inSent[0].start);
    const last = Math.min(s.end, inSent[inSent.length - 1].end);
    const sentence = b.text.slice(s.start, s.end).trim();
    for (const w of words(b.text.slice(s.start, s.end), s.start)) {
      if (inSpans(hl, w.start)) continue;
      // between the first and last highlighted span, or in the same clause just before the first one
      const between = w.start > first && w.end < last;
      const clauseStart = b.text.lastIndexOf(",", first) > s.start ? b.text.lastIndexOf(",", first) : s.start;
      const justBefore = w.start < first && w.start >= clauseStart && first - w.end < 40;
      if (!between && !justBefore) continue;
      if (NEG.has(w.w) || w.w.endsWith("n't")) {
        issues.push({
          severity: tagHasNegation ? "warning" : "error",
          code: "skipped_negation",
          blockIndex,
          message: `"${w.w}" is not highlighted but sits inside a read sentence: "${truncate(sentence, 160)}". Reading only the highlights may reverse the author's meaning.`,
        });
      } else if (HEDGE.has(w.w)) {
        issues.push({
          severity: "warning",
          code: "skipped_hedge",
          blockIndex,
          message: `The qualifier "${w.w}" is skipped in a read sentence: "${truncate(sentence, 160)}".`,
        });
      }
    }
  }
  return issues;
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

const NUMBER_WORDS: Record<string, string> = { percent: "%", "per cent": "%" };

function numbersIn(text: string): string[] {
  // A trailing % covers the whole range: "7–9%" and "7 to 9 percent" mean 7% and 9%.
  const t = text
    .toLowerCase()
    .replace(/per ?cent/g, "%")
    .replace(/(\d[\d,.]*)(\s*(?:[–—-]|to)\s*)(\d[\d,.]*)\s?%/g, "$1%$2$3%");
  return (t.match(/\$?\d[\d,.]*\s?%?/g) ?? []).map((n) => n.replace(/[,\s]/g, "").replace(/\.$/, "")).filter((n) => n.replace(/[^\d]/g, "").length > 0);
}

export function lintCard(card: Pick<Card, "tag" | "body" | "citation">, opts: { omissionPolicy?: OmissionPolicy; inSpeech?: boolean } = {}): CardIssue[] {
  const policy = opts.omissionPolicy ?? "nsda";
  const issues: CardIssue[] = [];
  const body = card.body;
  const texts = textBlocks(body);
  const tagNorm = normalizeText(card.tag, { caseFold: true });
  const tagHasNegation = words(tagNorm).some((w) => NEG.has(w.w) || w.w.endsWith("n't"));

  // V-2 / V-3: omissions
  body.forEach((b, i) => {
    if (b.kind !== "omission") return;
    const next = body.slice(i + 1).find((x) => x.kind === "text") as BodyText | undefined;
    const midParagraph = next && !next.newParagraph;
    if (policy === "nsda") {
      issues.push(
        midParagraph
          ? { severity: "error", code: "ellipsis_prohibited", blockIndex: i, message: "NSDA 7.1.E prohibits inserted ellipses. Keep the skipped words in the card and leave them unhighlighted instead." }
          : { severity: "warning", code: "paragraphs_omitted", blockIndex: i, message: "Paragraphs between read portions were omitted. NSDA 7.1.E expects skipped text to stay present in the card." },
      );
    }
  });

  // V-4: insertions
  body.forEach((b, i) => {
    if (b.kind !== "insertion") return;
    const w = words(b.text);
    if (w.some((x) => NEG.has(x.w) || HEDGE.has(x.w))) {
      issues.push({ severity: "error", code: "insertion_changes_meaning", blockIndex: i, message: `The bracketed insertion "[${b.text}]" adds a negation or qualifier. That changes the author's meaning (NSDA 7.2.A).` });
    } else {
      issues.push({ severity: "warning", code: "insertion_present", blockIndex: i, message: `Bracketed insertion "[${b.text}]". Norm: only for grammar or clarity.` });
    }
  });

  // V-5: mark containment; V-19 boundaries; V-7 qualifiers
  let highlightOutsideUnderline = 0;
  body.forEach((b, i) => {
    if (b.kind !== "text") return;
    const ul = normalizeSpans([...b.underline, ...b.emphasis], b.text.length);
    for (const h of b.highlight) {
      for (let p = h.start; p < h.end; p++) {
        if (!/\s/.test(b.text[p]) && !inSpans(ul, p)) {
          highlightOutsideUnderline++;
          break;
        }
      }
    }
    issues.push(...skippedQualifiers(b, i, tagHasNegation));
  });
  if (highlightOutsideUnderline && texts.some((t) => t.underline.length > 0)) {
    issues.push({ severity: "warning", code: "highlight_not_underlined", message: "Some highlighted text is not underlined. Usually everything read is also underlined." });
  }
  const firstText = texts[0];
  const lastText = texts[texts.length - 1];
  if (firstText && /^[\p{Ll}\p{N}]/u.test(firstText.text) && !/^[a-z]\)/.test(firstText.text)) {
    issues.push({ severity: "warning", code: "starts_mid_sentence", message: "The card starts mid-sentence. Full paragraphs give the reader the author's context." });
  }
  if (lastText && !/[.!?"'”’)\]]\s*$/.test(lastText.text)) {
    issues.push({ severity: "warning", code: "ends_mid_sentence", message: "The card ends mid-sentence." });
  }

  // V-6: something is marked as read
  const read = readAloud(body);
  if (opts.inSpeech && read.basis === "full") {
    issues.push({ severity: "warning", code: "nothing_marked", message: "Nothing is highlighted or underlined, so there is no record of what will be read (NSDA 7.1.G)." });
  }

  // V-8: tag vs body
  const bodyText = texts.map((t) => t.text).join(" ");
  const bodyNums = new Set(numbersIn(bodyText));
  for (const n of numbersIn(card.tag)) {
    const bare = n.replace(/^\$/, "");
    if (![...bodyNums].some((b) => b.replace(/^\$/, "") === bare)) {
      issues.push({ severity: "error", code: "tag_number_not_in_body", message: `The tag says "${n}", but that number is not in the card text.` });
    }
  }
  const readNorm = normalizeText(read.text || bodyText, { caseFold: true });
  const readWords = new Set(words(readNorm).map((w) => w.w));
  const abs = ABSOLUTE.filter((a) => words(tagNorm).some((w) => w.w === a) && !readWords.has(a));
  if (abs.length) {
    issues.push({ severity: "warning", code: "possible_power_tag", message: `The tag uses "${abs.join('", "')}", which the read text doesn't say. Check the tag doesn't overclaim.` });
  }

  // V-9: straw argument cue
  for (const t of texts) {
    if (!t.highlight.length) continue;
    for (const s of sentences(t.text)) {
      const sentence = t.text.slice(s.start, s.end);
      if (STRAW_CUES.test(sentence) && t.highlight.some((h) => h.start < s.end && h.end > s.start)) {
        const after = t.text.slice(s.end, s.end + 300);
        if (REBUTTAL_CUES.test(after)) {
          issues.push({ severity: "warning", code: "possible_straw_argument", message: `Highlighted text may be a view the author goes on to reject: "${truncate(sentence.trim(), 140)}".` });
        }
      }
    }
  }

  issues.push(...citationIssues(card.citation));
  return issues;
}

/** V-10, V-12, V-13: citation completeness and qualification provenance. */
export function citationIssues(c: Citation): CardIssue[] {
  const issues: CardIssue[] = [];
  if (!c.authors.length && !c.organization) issues.push({ severity: "warning", code: "cite_no_author", message: "No author or organization. NSDA 7.1.C requires the author's full name when the source gives one." });
  if (!c.date?.year) issues.push({ severity: "warning", code: "cite_no_date", message: "No publication date (write ND only if the source truly has none)." });
  if (!c.title) issues.push({ severity: "warning", code: "cite_no_title", message: "No article title." });
  if (!c.publication) issues.push({ severity: "warning", code: "cite_no_publication", message: "No source/publication name." });
  if (c.url && !c.accessed) issues.push({ severity: "warning", code: "cite_no_accessed", message: "Digital evidence needs a date accessed (NSDA 7.1.C)." });
  for (const a of c.authors) {
    if (a.qualifications && (!a.qualificationsProvenance || a.qualificationsProvenance === "ai_unverified")) {
      issues.push({ severity: "error", code: "unverified_qualifications", message: `Qualifications for ${a.name} are unverified. Confirm them from the source or remove them.` });
    }
  }
  if (c.authors.length && !c.authors.some((a) => a.qualifications)) {
    issues.push({ severity: "info", code: "cite_no_quals", message: "No author qualifications recorded." });
  }
  if (c.date?.year && c.accessed) {
    const pub = new Date(c.date.year, (c.date.month ?? 1) - 1, c.date.day ?? 1).getTime();
    if (pub > new Date(c.accessed).getTime() + 86400_000) issues.push({ severity: "warning", code: "cite_date_after_accessed", message: "Publication date is after the accessed date." });
  }
  return issues;
}

export function worstSeverity(issues: CardIssue[]): "error" | "warning" | "info" | null {
  if (issues.some((i) => i.severity === "error")) return "error";
  if (issues.some((i) => i.severity === "warning")) return "warning";
  if (issues.length) return "info";
  return null;
}

export { NUMBER_WORDS };
export type { BodyBlock };

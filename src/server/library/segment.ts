/**
 * Splitting a file that has no debate structure (a Google Doc export, a PDF,
 * plain text) into cards (Phase B1). A cheap model only says which paragraphs
 * are headings, tags, citations, card text, analytics, or other; code then
 * builds the cards from the file's own paragraphs (src/server/ingest/structure.ts),
 * so every word and its formatting is the file's own. Runs in chunks that a
 * job can checkpoint.
 */

import { z } from "zod";
import type { DocParagraph } from "@/server/ingest/docx";
import { looksLikeCite } from "@/server/ingest/structure";
import { runStructured } from "@/server/ai/run";

export const SEGMENT_KINDS = ["pocket", "hat", "block", "tag", "cite", "card_text", "analytic", "other"] as const;
export type SegmentKind = (typeof SEGMENT_KINDS)[number];

export const SegmentSchema = z.object({
  spans: z.array(
    z.object({
      from: z.number().describe("first paragraph number of the run"),
      to: z.number().describe("last paragraph number of the run (inclusive)"),
      kind: z.enum(SEGMENT_KINDS),
    }),
  ),
});

/** Runs of labels, [from, to, kind], compact enough to keep in a job checkpoint. */
export type LabelRuns = [number, number, SegmentKind][];

export const CHUNK = 120;

const SYSTEM = `You label the paragraphs of a policy debate evidence file so software can split it into cards. You never rewrite text; you only say what each paragraph is.
Kinds:
- pocket / hat / block: headings, from the biggest division (pocket: a whole side or argument) to the smallest (block: one set of answers, e.g. "AT: Perm" or "2AC — Politics DA").
- tag: the short claim written above a card (usually bold, one or two sentences).
- cite: the citation line under a tag (author, year, credentials, source, date, URL).
- card_text: the quoted evidence under a cite (often long, with underlining or highlighting).
- analytic: a debater's own argument with no evidence (a numbered point, a perm, a theory argument).
- other: tables of contents, file notes, page headers, instructions, blank-ish lines.
Return runs of consecutive paragraphs with the same kind, covering every numbered paragraph you were given. Lines marked "(context, don't label)" come from just before this part: use them to tell whether the part starts in the middle of a card, but don't label them.`;

function flags(p: DocParagraph): string {
  const chars = p.runs.reduce((a, r) => a + r.text.length, 0) || 1;
  const share = (f: (r: DocParagraph["runs"][number]) => boolean) => p.runs.filter(f).reduce((a, r) => a + r.text.length, 0) / chars;
  const out: string[] = [];
  if (share((r) => !!r.props.bold) > 0.9) out.push("bold");
  const u = share((r) => !!r.props.underline || r.emphasis);
  if (u > 0.05) out.push(`underlined ${Math.round(u * 100)}%`);
  const h = share((r) => !!r.props.highlight);
  if (h > 0.02) out.push(`highlighted ${Math.round(h * 100)}%`);
  const size = Math.max(0, ...p.runs.map((r) => r.props.size ?? 0));
  if (size) out.push(`${size / 2}pt`);
  if (p.styleName && !/^normal$/i.test(p.styleName)) out.push(`style "${p.styleName.slice(0, 30)}"`);
  if (looksLikeCite(p)) out.push("cite-like");
  return out.length ? `(${out.join(", ")}) ` : "";
}

/**
 * The chunk's non-blank paragraphs as the model sees them: number, formatting, first words. The few
 * paragraphs before the chunk come first, marked as context, so a chunk that starts in the middle of a card
 * is read as its continuation.
 */
export function renderChunk(paragraphs: DocParagraph[], from: number, to: number, contextBefore = 4): { text: string; indices: number[] } {
  const lines: string[] = [];
  const indices: number[] = [];
  const before: number[] = [];
  for (let i = from - 1; i >= 0 && before.length < contextBefore; i--) if (paragraphs[i].text.trim()) before.unshift(i);
  for (const i of before) {
    const t = paragraphs[i].text.replace(/\s+/g, " ").trim();
    lines.push(`(context, don't label) [${i}] ${flags(paragraphs[i])}${t.slice(0, 120)}${t.length > 120 ? "…" : ""}`);
  }
  for (let i = from; i <= to && i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (!p.text.trim()) continue;
    indices.push(i);
    const t = p.text.replace(/\s+/g, " ").trim();
    lines.push(`[${i}] ${flags(p)}${t.length > 220 ? `${t.slice(0, 220)}… (${t.split(" ").length} words)` : t}`);
  }
  return { text: lines.join("\n"), indices };
}

/** A formatting-only guess, used without the model (tests, AI_FAKE) and to fill gaps the model leaves. */
export function guessKind(p: DocParagraph): SegmentKind {
  if (p.headingLevel >= 1 && p.headingLevel <= 3) return (["pocket", "hat", "block"] as const)[p.headingLevel - 1];
  if (p.headingLevel === 4) return "tag";
  if (looksLikeCite(p)) return "cite";
  const bold = p.runs.filter((r) => r.text.trim()).every((r) => r.props.bold);
  if (bold && p.text.length <= 400) return "tag";
  if (p.runs.some((r) => r.props.underline || r.props.highlight || r.emphasis)) return "card_text";
  return p.text.length > 300 ? "card_text" : "analytic";
}

/** Guesses in order: whatever follows a citation (or card text) and isn't a tag or cite is card text. */
export function guessKinds(paragraphs: DocParagraph[], indices: number[]): Map<number, SegmentKind> {
  const out = new Map<number, SegmentKind>();
  let prev: SegmentKind | null = null;
  indices.forEach((i, n) => {
    let k = guessKind(paragraphs[i]);
    const next = indices[n + 1];
    // A short paragraph right before a citation is that card's tag.
    if (k !== "cite" && next !== undefined && looksLikeCite(paragraphs[next]) && paragraphs[i].text.length <= 400) k = "tag";
    else if ((prev === "cite" || prev === "card_text") && (k === "analytic" || k === "card_text")) k = "card_text";
    out.set(i, k);
    prev = k;
  });
  return out;
}

/** Label one chunk of paragraphs [from, to]. */
export async function segmentChunk(paragraphs: DocParagraph[], from: number, to: number, opts: { teamId: string; abortSignal?: AbortSignal; onUsage?: (u: { inputTokens?: number; outputTokens?: number } | null) => void }): Promise<LabelRuns> {
  const { text, indices } = renderChunk(paragraphs, from, to);
  if (!indices.length) return [];
  const res = await runStructured({
    task: "file_segment",
    system: SYSTEM,
    prompt: `PARAGRAPHS ${indices[0]}–${indices[indices.length - 1]} (blank ones omitted):\n${text}\n\nReturn the runs.`,
    schema: SegmentSchema,
    teamId: opts.teamId,
    abortSignal: opts.abortSignal,
    fake: () => {
      const g = guessKinds(paragraphs, indices);
      return { spans: indices.map((i) => ({ from: i, to: i, kind: g.get(i)! })) };
    },
  });
  opts.onUsage?.(res.usage);
  const guessed = guessKinds(paragraphs, indices);
  // Keep only runs inside this chunk; paragraphs the model skipped get the formatting guess.
  const kind = new Map<number, SegmentKind>();
  for (const s of res.output.spans) {
    const a = Math.max(from, Math.min(s.from, s.to));
    const b = Math.min(to, Math.max(s.from, s.to));
    for (let i = a; i <= b; i++) kind.set(i, s.kind);
  }
  const runs: LabelRuns = [];
  for (const i of indices) {
    const k = kind.get(i) ?? guessed.get(i)!;
    const last = runs[runs.length - 1];
    if (last && last[2] === k && last[1] === i - 1) last[1] = i;
    else runs.push([i, i, k]);
  }
  return runs;
}

/**
 * Repairs to the model's labels that follow from how cards are laid out (measured on real camp files with
 * their styles stripped, docs/evals/results/library-import-run*.json):
 * - a short, bold line right before a line that reads as a citation is a tag, and that line its cite;
 * - two tag lines in a row before a citation are one tag;
 * - whatever sits directly above a citation (a heading, an analytic, a note) is that card's tag;
 * - a citation is at most two lines, so a longer run of "cite" lines is card text;
 * - inside a card, a subheading, note or stray heading followed by more card text is part of the card, and
 *   a long paragraph labeled heading or tag there is card text when it carries card formatting.
 * Returns the repaired labels and tag paragraphs to merge into the one before them.
 */
export function repairLabels(order: number[], kind: Map<number, SegmentKind>, paragraphs?: Map<number, DocParagraph>): { kind: Map<number, SegmentKind>; mergeIntoPrev: Set<number> } {
  const k = new Map(kind);
  const mergeIntoPrev = new Set<number>();
  const para = (i: number | undefined) => (i === undefined ? undefined : paragraphs?.get(i));
  const text = (i: number | undefined) => para(i)?.text.trim() ?? "";
  const heading = (x?: SegmentKind) => x === "pocket" || x === "hat" || x === "block";
  const allBold = (i: number) => {
    const runs = para(i)?.runs.filter((r) => r.text.trim()) ?? [];
    return runs.length > 0 && runs.every((r) => r.props.bold);
  };
  const citeShaped = (i: number) => {
    const p = para(i);
    return !!p && looksLikeCite(p);
  };
  const formatted = (i: number) => !!para(i)?.runs.some((r) => r.text.trim() && (r.props.underline || r.props.highlight || r.emphasis));
  const numbered = (s: string) => /^\s*(?:\[\w{1,2}\]|\(\w{1,2}\)|\w{1,2}[.)]|\d+\s*[-–—:]+)/.test(s);

  // Formatting that settles it: a bold line (not itself a short cite) right above a citation-shaped line
  // that isn't all bold (a bold line there would be another tag).
  if (paragraphs) {
    for (let n = 0; n < order.length - 1; n++) {
      const i = order[n];
      const j = order[n + 1];
      const t = text(i);
      if (!t || t.length > 400 || !allBold(i) || citeShaped(i) || !citeShaped(j) || allBold(j)) continue;
      if (k.get(i) === "tag" && k.get(j) === "cite") continue;
      k.set(i, "tag");
      k.set(j, "cite");
    }
  }

  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    const set = (i: number, v: SegmentKind) => {
      if (k.get(i) === v) return;
      k.set(i, v);
      changed = true;
    };
    for (let n = 0; n < order.length; n++) {
      const i = order[n];
      const prev = n > 0 ? k.get(order[n - 1]) : undefined;
      const prev2 = n > 1 ? k.get(order[n - 2]) : undefined;
      const cur = k.get(i);
      const next = n < order.length - 1 ? k.get(order[n + 1]) : undefined;
      const len = text(i).length;
      // Two tag lines before one citation: one tag.
      if (prev === "tag" && next === "cite" && !mergeIntoPrev.has(i) && (cur === "tag" || cur === "analytic" || (cur === "card_text" && len <= 200 && !formatted(i)))) {
        set(i, "tag");
        mergeIntoPrev.add(i);
        changed = true;
        continue;
      }
      // Directly above a citation: the tag.
      if (next === "cite" && cur !== "tag" && cur !== "cite" && len <= 400 && (heading(cur) || cur === "analytic" || cur === "other" || (cur === "card_text" && !formatted(i) && citeShaped(order[n + 1])))) {
        set(i, "tag");
        continue;
      }
      // A citation runs at most two lines; the second must still read like one. A "cite" after card text
      // that doesn't read like one is more card text.
      if (cur === "cite" && prev === "cite") {
        const second = prev2 !== "cite" && len <= 400 && /\b(?:19|20)\d{2}\b|https?:|www\.|["“]/.test(text(i));
        if (!second) set(i, "card_text");
        continue;
      }
      if (cur === "cite" && prev === "card_text" && paragraphs && !citeShaped(i)) {
        set(i, "card_text");
        continue;
      }
      // Inside a card: subheadings, notes and stray headings between card text belong to the card.
      if ((prev === "cite" || prev === "card_text") && next === "card_text") {
        if (cur === "analytic" || cur === "other" || heading(cur)) {
          set(i, "card_text");
          continue;
        }
        if (cur === "tag" && text(i).split(/\s+/).length <= 8 && !numbered(text(i))) {
          set(i, "card_text");
          continue;
        }
      }
      // A "heading" or "tag" too long to be one, with no citation under it.
      if ((heading(cur) || cur === "tag") && len > 400 && next !== "cite") set(i, formatted(i) && (prev === "cite" || prev === "card_text" || prev === "other") ? "card_text" : "analytic");
    }
    if (!changed) break;
  }
  return { kind: k, mergeIntoPrev };
}

/** Apply labels: headings and tags become heading levels; cites and "other" become hints for the structurer. */
export function applyLabels(paragraphs: DocParagraph[], runs: LabelRuns): { paragraphs: DocParagraph[]; cites: Set<number>; junk: Set<number> } {
  const raw = new Map<number, SegmentKind>();
  for (const [a, b, k] of runs) for (let i = a; i <= b; i++) raw.set(i, k);
  const order = paragraphs.filter((p) => p.text.trim() && raw.has(p.index)).map((p) => p.index);
  const byIndex = new Map(paragraphs.map((p) => [p.index, p]));
  const { kind, mergeIntoPrev } = repairLabels(order, raw, byIndex);
  // A tag written on two lines: join the second line onto the first (tags aren't evidence text).
  const joined = new Map<number, DocParagraph>();
  for (let n = 1; n < order.length; n++) {
    if (!mergeIntoPrev.has(order[n])) continue;
    let first = n - 1;
    while (first > 0 && mergeIntoPrev.has(order[first])) first--;
    const head = joined.get(order[first]) ?? byIndex.get(order[first])!;
    const extra = byIndex.get(order[n])!;
    joined.set(order[first], { ...head, text: `${head.text.trim()} ${extra.text.trim()}`, runs: [...head.runs, { text: " ", props: {}, emphasis: false }, ...extra.runs] });
  }
  const cites = new Set<number>();
  const junk = new Set<number>();
  const level: Partial<Record<SegmentKind, 1 | 2 | 3 | 4>> = { pocket: 1, hat: 2, block: 3, tag: 4 };
  const out = paragraphs.map((p0) => {
    const p = joined.get(p0.index) ?? p0;
    const k = kind.get(p.index);
    if (!k) return p;
    if (mergeIntoPrev.has(p.index)) {
      junk.add(p.index);
      return { ...p, headingLevel: 0 as const };
    }
    if (k === "cite") cites.add(p.index);
    if (k === "other") junk.add(p.index);
    // An analytic stands alone as a tag with nothing under it, which the structurer reads as an analytic.
    const h = level[k] ?? (k === "analytic" ? 4 : 0);
    return { ...p, headingLevel: h as DocParagraph["headingLevel"] };
  });
  return { paragraphs: out, cites, junk };
}

/**
 * Does the deterministic parse need the model? Files with Verbatim styles parse on their own; unstyled
 * documents, PDFs and text files whose structure found few cards for their length get split by the model.
 */
export function needsSegmentation(q: { characters: number; cards: number; headings: number }, styled: boolean, kind: string): boolean {
  if (q.characters < 1500) return false;
  const perTenK = (q.cards / q.characters) * 10_000;
  if (kind === "docx" && styled) return q.cards === 0 && q.headings === 0;
  return perTenK < 1.5;
}

/**
 * Checks on an AI reading of heard lines, before anything reaches the flow.
 * The rule mirrors evidence integrity: an argument on the flow must quote the
 * line it came from. The AI may split a line, name its role, and link it to
 * our arguments, but it cannot add claims the debater didn't write down.
 */

import { isArgRole, type ArgRole, type ArgUnit, type Position, type PositionKind } from "./flow";
import { expandShorthand } from "./heard-parse";
import { guessKind } from "./positions";
import { normalizeText } from "./verify";

export interface ExtractLine {
  /** 1-based number shown to the model */
  n: number;
  key: string;
  line: number;
  text: string;
}

export interface ExtractArgOut {
  quote: string;
  text: string;
  warrant: string;
  role: string;
  evidence: "card" | "analytic";
  label: string;
  positionId: string;
  newPositionName: string;
  newPositionKind: string;
  answers: string[];
  confidence: number;
}

export interface ExtractLineOut {
  line: number;
  action: "create" | "same_as" | "not_argument";
  category: string;
  sameAs: string;
  args: ExtractArgOut[];
}

export interface ValidatedArg {
  quote: string;
  text: string;
  warrant?: string;
  role: ArgRole;
  evidence: "card" | "analytic";
  label?: string;
  position: { id: string } | { name: string; kind: PositionKind } | null;
  answers: string[];
  confidence: number;
  /** the AI's wording when it went beyond the quote (kept apart from the argument text) */
  aiReading?: string;
  /** an existing argument this one duplicates */
  sameAs?: string;
}

export interface ValidatedLine {
  n: number;
  key: string;
  line: number;
  /** the line's text when it was read (apply skips the line if it has changed since) */
  text: string;
  action: "create" | "same_as" | "not_argument";
  category?: string;
  sameAs?: string;
  /** for header lines: the position that the lines under it belong to */
  position?: ValidatedArg["position"];
  args: ValidatedArg[];
}

const STOP = new Set(
  "a an the of to in on at by for with from and or but not no is are was were be been it its this that these those they their them we our us you your i as so if then than because b/c also just very more less can could would should will may might do does did has have had into over under".split(" "),
);

function words(s: string): string[] {
  return normalizeText(s, { caseFold: true })
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function contentWords(s: string): Set<string> {
  return new Set(words(s).filter((w) => !STOP.has(w) && w.length > 1));
}

export function jaccard(a: string, b: string): number {
  const A = contentWords(a);
  const B = contentWords(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

const MAX_ARGS_PER_LINE = 3;
const MIN_QUOTE_COVERAGE = 0.6;
const MAX_NOVEL_WORDS = 3;
const SAME_AS = 0.5;

/**
 * Keep what is provably from the line; reject the rest. Lines the output
 * doesn't account for (or that fail) are simply not returned: they stay
 * unflowed, and the caller can fall back to the no-AI parser for them.
 */
export function validateExtraction(
  input: { lines: ExtractLine[]; positions: Position[]; existing: ArgUnit[]; ours: Set<string> },
  out: { lines: ExtractLineOut[] },
): { lines: ValidatedLine[]; rejected: { n: number; reason: string }[] } {
  const byN = new Map(input.lines.map((l) => [l.n, l]));
  const positionIds = new Set(input.positions.map((p) => p.id));
  const existingIds = new Set(input.existing.map((a) => a.id));
  const accepted: ValidatedLine[] = [];
  const rejected: { n: number; reason: string }[] = [];
  const seen = new Set<number>();

  for (const o of out.lines) {
    const src = byN.get(o.line);
    if (!src) {
      rejected.push({ n: o.line, reason: "no such line" });
      continue;
    }
    if (seen.has(o.line)) continue;
    seen.add(o.line);
    const base = { n: src.n, key: src.key, line: src.line, text: src.text };

    if (o.action === "not_argument") {
      accepted.push({ ...base, action: "not_argument", category: o.category || "other", args: [] });
      continue;
    }
    if (o.action === "same_as") {
      if (existingIds.has(o.sameAs)) accepted.push({ ...base, action: "same_as", sameAs: o.sameAs, args: [] });
      else rejected.push({ n: o.line, reason: "same_as points to an argument that doesn't exist" });
      continue;
    }

    const lineNorm = normalizeText(src.text, { caseFold: true });
    const lineWords = words(src.text).length || 1;
    const args: ValidatedArg[] = [];
    let quotedWords = 0;
    for (const a of o.args.slice(0, MAX_ARGS_PER_LINE)) {
      const q = a.quote.trim();
      if (!q || !lineNorm.includes(normalizeText(q, { caseFold: true }))) continue; // not from this line: dropped
      quotedWords += words(q).length;
      const position = positionIds.has(a.positionId)
        ? { id: a.positionId }
        : a.newPositionName.trim()
          ? { name: a.newPositionName.trim(), kind: (["advantage", "harms", "inherency", "solvency", "plan", "case_other", "da", "cp", "k", "t", "theory", "framework", "other"].includes(a.newPositionKind) ? a.newPositionKind : guessKind(a.newPositionName)) as PositionKind }
          : null;
      // Novelty: an AI "text" that adds more than a few content words beyond the quote isn't the debater's words.
      const allowed = new Set([...contentWords(q), ...contentWords(expandShorthand(q)), ...("name" in (position ?? {}) ? contentWords((position as { name: string }).name) : [])]);
      const novel = [...contentWords(a.text)].filter((w) => !allowed.has(w)).length;
      const text = a.text.trim() && novel <= MAX_NOVEL_WORDS ? a.text.trim() : q;
      const arg: ValidatedArg = {
        quote: q,
        text,
        warrant: a.warrant.trim() && novel <= MAX_NOVEL_WORDS ? a.warrant.trim() : undefined,
        role: isArgRole(a.role) ? a.role : "claim",
        evidence: a.evidence === "card" ? "card" : "analytic",
        label: a.label.trim() || undefined,
        position,
        answers: a.answers.filter((id) => input.ours.has(id)),
        confidence: Math.max(0, Math.min(1, Number.isFinite(a.confidence) ? a.confidence : 0.5)),
        aiReading: novel > MAX_NOVEL_WORDS ? a.text.trim() : undefined,
      };
      // Already on the flow (e.g. their doc had it): alias it instead of adding a duplicate.
      const posId = position && "id" in position ? position.id : null;
      const dup = input.existing.find((e) => !e.sameAs && (!posId || e.positionId === posId) && jaccard(e.text, q) >= SAME_AS);
      if (dup) arg.sameAs = dup.id;
      args.push(arg);
    }
    if (!args.length) {
      rejected.push({ n: o.line, reason: "no argument quoted this line" });
      continue;
    }
    if (quotedWords / lineWords < MIN_QUOTE_COVERAGE) {
      rejected.push({ n: o.line, reason: "the quotes cover too little of the line" });
      continue;
    }
    accepted.push({ ...base, action: "create", args });
  }
  return { lines: accepted, rejected };
}

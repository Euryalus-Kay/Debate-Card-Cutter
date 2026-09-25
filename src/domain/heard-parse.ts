/**
 * Deterministic reading of what a debater typed while listening. No AI: it
 * runs offline, when the round's rules turn AI off, and as the fallback for
 * any line the AI extraction can't account for. Each line becomes a header
 * (sets the current position), a roadmap/filler line, or one argument whose
 * text is the line itself, so nothing is invented.
 */

import type { ArgRole, Position, PositionKind } from "./flow";
import { guessKind, matchPosition } from "./positions";

export interface HeardInputLine {
  key: string;
  line: number;
  text: string;
}

export interface ParsedArg {
  /** the exact text it came from (the line minus its label) */
  quote: string;
  text: string;
  label?: string;
  role: ArgRole;
  evidence: "card" | "analytic";
  cite?: string;
}

export type ParsedPosition = { id: string } | { name: string; kind: PositionKind };

export interface ParsedLine {
  key: string;
  line: number;
  action: "create" | "not_argument";
  category?: "header" | "roadmap" | "filler";
  position: ParsedPosition | null;
  args: ParsedArg[];
}

/** Common flow shorthand, used only to recognize roles (the argument text stays as typed). */
const ABBREV: [RegExp, string][] = [
  [/\buq\b/g, "uniqueness"],
  [/\bnu\b/g, "non-unique"],
  [/\blt\b/g, "link turn"],
  [/\bit\b(?=\s*[-–:])/g, "impact turn"],
  [/\bil\b/g, "internal link"],
  [/\bwm\b/g, "we meet"],
  [/\bc\/i\b|\bci\b/g, "counter interpretation"],
  [/\bfw\b/g, "framework"],
  [/\bcondo\b/g, "conditionality"],
  [/\bsq\b/g, "status quo"],
  [/\bb\/c\b/g, "because"],
  [/\bw\/o\b/g, "without"],
];

const ROLE_RULES: [RegExp, ArgRole][] = [
  [/\blink turn\b/, "link_turn"],
  [/\bimpact turn\b/, "impact_turn"],
  [/\bnon[- ]?unique\b|\bnot unique\b/, "non_unique"],
  [/\bno internal link\b/, "no_internal_link"],
  [/\bno link\b/, "no_link"],
  [/\bno impact\b|\bimpact d(efense)?\b/, "no_impact"],
  [/\bperm(utation)?\b/, "perm"],
  [/\bwe meet\b/, "we_meet"],
  [/\bcounter[- ]?interpretation\b/, "counter_interpretation"],
  [/\binterp(retation)?\b/, "interpretation"],
  [/\bviolation\b|\bviol\b/, "violation"],
  [/\bvoter\b|\bvoting issue\b/, "voter"],
  [/\bconditionality\b|\bpics? bad\b|\bdispo(sitionality)?\b|\btheory\b/, "theory"],
  [/\bframework\b/, "framework"],
  [/\balt(ernative)?\b/, "alternative"],
  [/\bcase outweighs\b|\boutweighs?\b/, "impact_calc"],
  [/\bsolvency\b|\bsolves?\b|\bcan'?t solve\b|\bsolvency deficit\b/, "solvency"],
  [/\buniqueness\b/, "uniqueness"],
  [/\binternal link\b/, "internal_link"],
  [/\blinks?\b/, "link"],
  [/\bimpacts?\b|\bextinction\b|\bnuclear war\b/, "impact"],
];

const CITE = /\b([A-Z][a-zA-Z'-]+(?:\s(?:and|&)\s[A-Z][a-zA-Z'-]+)?(?:\set al\.?)?)\s?[’']?(\d{2}|\d{4})\b/;
const LABEL = /^\s*(?:\(?(\d{1,2}|[A-Za-z])[.)]|(\d{1,2})\s*[-–—:]|[-–•*]+)\s+/;
const ROADMAP = /^(road ?map|order)\b|^\d+\s*off\b|\boff[- ]?case\b.*\bthen\b/i;
const FILLER = /^[?!.…\-–—\s]*$|^(missed|didn'?t catch|idk|\?+)\b/i;

export function expandShorthand(text: string): string {
  let t = ` ${text.toLowerCase()} `;
  for (const [re, full] of ABBREV) t = t.replace(re, full);
  return t.trim();
}

export function guessRole(text: string): ArgRole {
  const t = expandShorthand(text);
  for (const [re, role] of ROLE_RULES) if (re.test(t)) return role;
  return "claim";
}

function looksLikeHeader(text: string, positions: Position[]): { id: string } | { name: string; kind: PositionKind } | null {
  if (LABEL.test(text)) return null;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 6 || /[.!?]$/.test(text) || /\bbecause\b|\bb\/c\b/i.test(text)) return null;
  const existing = matchPosition(text, positions);
  const kind = guessKind(text);
  if (existing && (kind !== "other" || words.length <= 4)) return { id: existing.id };
  if (kind !== "other") return { name: text.replace(/^on (the )?/i, "").trim(), kind };
  if (/^on (the )?case$|^case$/i.test(text)) return { name: "Case", kind: "case_other" };
  return null;
}

/**
 * Parse lines in order. `current` is the position in effect before the first
 * line (e.g. the last header above them in the pad).
 */
export function parseHeard(lines: HeardInputLine[], ctx: { positions: Position[]; current?: ParsedPosition | null }): ParsedLine[] {
  const out: ParsedLine[] = [];
  let current: ParsedPosition | null = ctx.current ?? null;
  const positions = [...ctx.positions];
  for (const l of lines) {
    const text = l.text.trim();
    if (!text) continue;
    if (ROADMAP.test(text)) {
      out.push({ key: l.key, line: l.line, action: "not_argument", category: "roadmap", position: null, args: [] });
      continue;
    }
    if (FILLER.test(text)) {
      out.push({ key: l.key, line: l.line, action: "not_argument", category: "filler", position: null, args: [] });
      continue;
    }
    const header = looksLikeHeader(text, positions);
    if (header) {
      current = header;
      if ("name" in header) positions.push({ id: `pending:${header.name}`, kind: header.kind, name: header.name, side: "aff", introducedIn: "1AC", order: 1e6 });
      out.push({ key: l.key, line: l.line, action: "not_argument", category: "header", position: header, args: [] });
      continue;
    }
    const m = LABEL.exec(text);
    const label = m ? (m[1] ?? m[2]) : undefined;
    const body = m ? text.slice(m[0].length).trim() : text;
    const cite = CITE.exec(body)?.[0];
    const analyticHint = /\(analytic\)|\banalytic\b/i.test(body);
    out.push({
      key: l.key,
      line: l.line,
      action: "create",
      position: current,
      args: [{ quote: body, text: body, label: label || undefined, role: guessRole(body), evidence: cite && !analyticHint ? "card" : "analytic", cite }],
    });
  }
  return out;
}

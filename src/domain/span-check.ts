/**
 * Integrity checks for AI edits of a few selected words (A7). An analytic is
 * the debater's own reasoning: an edit must not slip in an author, a date, or
 * a number that the section, its cards, and the flow don't already contain.
 * These are flagged for the debater, never silently kept.
 */

import { numbersIn } from "./lint";

/** Author–year citations: "Lee 26", "Smith '19", "Creed et al. 2017", "(Roper 2015)". */
export function citesIn(text: string): string[] {
  const out: string[] = [];
  const re = /\b([A-Z][A-Za-z'’-]+)(?:\s+(?:et al\.?|and|&)\s*(?:[A-Z][A-Za-z'’-]+)?)?,?\s+[’']?(\d{2}|\d{4})\b/g;
  for (const m of text.matchAll(re)) out.push(`${m[1]} ${m[2].slice(-2)}`.toLowerCase());
  return out;
}

/** Warnings for words the edit introduces that nothing it may rely on contains. */
export function spanWarnings(input: { replacement: string; allowed: string }): string[] {
  const warnings: string[] = [];
  const allowedCites = new Set(citesIn(input.allowed));
  const newCites = [...new Set(citesIn(input.replacement))].filter((c) => !allowedCites.has(c));
  if (newCites.length) warnings.push(`Mentions ${newCites.map((c) => c.replace(/\b\w/, (x) => x.toUpperCase())).join(", ")}, which isn't a card in this speech or on the flow. Check it before reading it.`);
  const allowedNumbers = new Set(numbersIn(input.allowed).map((n) => n.replace(/^\$/, "")));
  const newNumbers = [...new Set(numbersIn(input.replacement).map((n) => n.replace(/^\$/, "")))].filter((n) => !allowedNumbers.has(n) && !/^\d$/.test(n));
  if (newNumbers.length) warnings.push(`Adds ${newNumbers.join(", ")}, which isn't in this section, its cards, or the flow. Check the number before reading it.`);
  return warnings;
}

/**
 * Remove internal ids (the bracketed codes models see in their context, like
 * "arg_mugr…" or "dl_ope0…_sec_7kv…") from text shown to debaters, with the
 * brackets or commas around them.
 */
export function stripIds(text: string): string {
  const id = String.raw`(?:[a-z]{2,5}_)+[a-z0-9]{6,}(?:_[a-z0-9]+)*`;
  return text
    .replace(new RegExp(String.raw`\s*\[${id}\]`, "g"), "")
    .replace(new RegExp(String.raw`,\s*${id}\b`, "g"), "")
    .replace(new RegExp(String.raw`\b${id}\b,?\s*`, "g"), "")
    .replace(/\(\s*\)/g, "")
    .replace(/ {2,}/g, " ")
    .replace(/\s+([,.;:)])/g, "$1")
    .trim();
}

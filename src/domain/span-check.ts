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

/** Words a tag may use without the card saying them (debate vocabulary, not claims about the world). */
const TAG_VOCAB = new Set("aff affirmative neg negative plan counterplan cp da disad disadvantage perm permutation squo status quo usfg alt alternative kritik extend extension even turn turns link links impact impacts uniqueness unique non no yes not the and but or so because only also both nhi m4a aca u.s us usa america american americans".split(" "));

/**
 * Problems with a new tag the AI proposes for a library card (B3): it may say what the card proves here,
 * but nothing the card's own words don't: no author, number or name the text lacks.
 */
export function retagProblems(tag: string, card: { tag: string; text: string }): string[] {
  const allowed = `${card.tag}\n${card.text}`;
  const out = spanWarnings({ replacement: tag, allowed }).map((w) => w.replace(" isn't a card in this speech or on the flow", " isn't in the card").replace(" isn't in this section, its cards, or the flow", " isn't in the card"));
  const lower = allowed.toLowerCase().replace(/[’‘`]/g, "'");
  const known = new Set(lower.split(/[^a-z']+/).filter(Boolean).map((w) => w.replace(/'s$/, "")));
  // "Democratic" is in a card that says "Democrats": the same word stem (first six letters) counts.
  const stemIn = (w: string) => lower.includes(w) || (w.length >= 6 && [...known].some((k) => k.length >= 6 && k.slice(0, 6) === w.slice(0, 6)));
  const names = new Set<string>();
  const words = tag.split(/\s+/);
  words.forEach((w, i) => {
    const bare = w.replace(/^[^A-Za-z]+|[^A-Za-z.]+$/g, "").replace(/[’‘`]/g, "'").replace(/'s$/i, "").replace(/\.$/, "");
    const sentenceStart = i === 0 || /[.!?:—–-]$/.test(words[i - 1] ?? "");
    if (bare.length < 3 || sentenceStart || !/^[A-Z]/.test(bare) || TAG_VOCAB.has(bare.toLowerCase())) return;
    if (!stemIn(bare.toLowerCase())) names.add(bare);
  });
  if (names.size) out.push(`Names ${[...names].join(", ")}, which the card doesn't mention.`);
  return out;
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

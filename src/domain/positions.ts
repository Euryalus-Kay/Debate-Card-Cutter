/**
 * Position names across speeches and sources: guess a position's kind from its
 * heading, and match a heading ("A2 Politics DA", "2AC — Politics") to an
 * existing position. Shared by document import, typed-notes parsing, and AI
 * flow extraction.
 */

import type { Position, PositionKind } from "./flow";

export function guessKind(name: string): PositionKind {
  const n = name.toLowerCase();
  // Case components first: "Advantage 1 — Water Security" is not a security K.
  if (/\b(advantage|adv\.?)\s*(\d|i{1,3}\b|iv\b)?/.test(n) && !/\b(cp|counterplan|disad|da)\b/.test(n)) return "advantage";
  if (/\bsolvency\b/.test(n)) return "solvency";
  if (/\binherency\b/.test(n)) return "inherency";
  if (/\bharms?\b/.test(n)) return "harms";
  if (/^plan\b|\bplan text\b/.test(n)) return "plan";
  if (/\b(topicality)\b|^t\s*[-–—:]|^t$/.test(n)) return "t";
  if (/\b(condo|conditionality|theory|pics? bad|dispo|vagueness|spec)\b/.test(n)) return "theory";
  if (/\b(counterplan|cp)\b/.test(n)) return "cp";
  if (/\b(disad|disadvantage|da)\b/.test(n)) return "da";
  if (/\bframework\b/.test(n)) return "framework";
  if (/\b(kritik|critique|k)\b/.test(n)) return "k";
  if (/\bcase\b/.test(n)) return "case_other";
  return "other";
}

const STOP = new Set(["the", "a", "an", "of", "and", "on", "to", "vs", "v", "da", "disad", "disadvantage", "cp", "counterplan", "k", "kritik", "case", "adv", "advantage", "a2", "at", "ext", "extend", "extension", "extensions", "answers", "answer", "1ac", "1nc", "2ac", "2nc", "1nr", "1ar", "2nr", "2ar", "block", "frontline", "frontlines", "overview"]);

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t) && !/^\d+$/.test(t) && !/^(i|ii|iii|iv|v)$/.test(t));
}

/** Core name used to match headings across speeches: "A2 Politics DA" / "2AC — Politics" → "politics". */
export function positionKey(name: string): string {
  return tokens(name).join(" ");
}

function advantageNumber(name: string): number | null {
  const m = /\b(?:adv(?:antage)?)\.?\s*(\d+|i{1,3}|iv)\b/i.exec(name);
  if (!m) return null;
  const r: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4 };
  return /^\d+$/.test(m[1]) ? Number(m[1]) : r[m[1].toLowerCase()] ?? null;
}

/** Find an existing position that a heading refers to (exact core name, advantage number, then token overlap). */
export function matchPosition(name: string, positions: Position[]): Position | null {
  const key = positionKey(name);
  if (key) {
    const exact = positions.find((p) => positionKey(p.name) === key);
    if (exact) return exact;
  }
  const adv = advantageNumber(name);
  if (adv !== null) {
    const hit = positions.find((p) => advantageNumber(p.name) === adv);
    if (hit) return hit;
  }
  const t = new Set(tokens(name));
  if (t.size === 0) return null;
  let best: { p: Position; score: number } | null = null;
  for (const p of positions) {
    const pt = new Set(tokens(p.name));
    if (!pt.size) continue;
    const inter = [...t].filter((x) => pt.has(x)).length;
    const score = inter / Math.min(t.size, pt.size);
    if (score >= 0.66 && (!best || score > best.score)) best = { p, score };
  }
  return best?.p ?? null;
}

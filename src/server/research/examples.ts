/**
 * Style examples for cutting (Phase D, "look at examples"): up to two cards from the team's own imported
 * files on a similar claim, shown to the cutter so its tags and highlighting follow the team's files (how
 * a tag is worded, how much is read). Only style: the new card's words come from its own source and are
 * verified against it, and its tag is checked against its own text.
 */
import { getCards, searchCards } from "@/server/cards";
import { readAloud, type BodyBlock } from "@/domain/card";
import { contentWords } from "@/server/library/find";

export interface StyleExample {
  tag: string;
  readWords: number;
  /** the opening of the read, to show how it is highlighted */
  readOpening: string;
}

const memo = new Map<string, Promise<StyleExample[]>>();

export function styleExamples(teamId: string, claim: string): Promise<StyleExample[]> {
  const key = `${teamId}|${claim}`;
  if (!memo.has(key)) {
    if (memo.size > 200) memo.clear();
    memo.set(key, find(teamId, claim).catch(() => []));
  }
  return memo.get(key)!;
}

async function find(teamId: string, claim: string): Promise<StyleExample[]> {
  const words = contentWords(claim, 10);
  if (!words.length) return [];
  const hits = (await searchCards(teamId, words.join(" or "), { limit: 12 })).filter((h) => h.origin === "imported");
  const rows = await getCards(teamId, hits.map((h) => h.id));
  const out: StyleExample[] = [];
  for (const h of hits) {
    const c = rows.find((r) => r.id === h.id);
    if (!c) continue;
    const read = readAloud(c.body as BodyBlock[]);
    const n = read.text.split(/\s+/).filter(Boolean).length;
    // Real highlighting of a normal length only (not an unhighlighted card or a whole-card read).
    if (read.basis !== "highlight" || n < 25 || n > 140 || c.tag.length > 300) continue;
    out.push({ tag: c.tag.trim(), readWords: n, readOpening: read.text.split(/\s+/).slice(0, 22).join(" ") });
    if (out.length === 2) break;
  }
  return out;
}

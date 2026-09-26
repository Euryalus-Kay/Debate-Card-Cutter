/**
 * Arguments the way the team's files arrange them. For a position, the block a speech reads — the 1NC shell,
 * the 2NC/1NR extension blocks, the 2AC frontline against it, the 1AR extensions — with its cards and analytics
 * in the file's order. A speech that runs a position reads its whole shell rather than two cards out of it, and
 * later speeches extend it from the file's own extension blocks.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { cards, uploadBlocks, uploads } from "@/server/db/schema";
import type { CardMeta } from "@/domain/card-label";
import { bodyHash, type BodyBlock } from "@/domain/card";
import type { SpeechId } from "@/domain/format";
import { sideOf, speechOf } from "./analytics-import";

export interface FileBlock {
  key: string;
  uploadId: string;
  fileName: string;
  path: string[];
  title: string;
  speech: string;
  side: "aff" | "neg" | "";
  items: ({ kind: "card"; cardId: string | null; tag: string } | { kind: "analytic"; text: string })[];
  cards: number;
  /** which position of the round or of the team's choice it serves, and how */
  position: string;
  purpose: "shell" | "extend" | "answer";
}

const GENERIC = new Set("da disad disadvantage cp counterplan k kritik critique t topicality adv advantage the a an of and to on in at a2 file core neg aff blocks block ext extension extensions shell off case 1nc 2nc 1nr 2nr 1ac 2ac 1ar 2ar vs v".split(" "));

/** The words that name a position ("T---Multi Payer" → multi, payer; "Midterms DA" → midterms). */
export function positionTokens(name: string): string[] {
  return [...new Set(name.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 1 && !GENERIC.has(w)))];
}

/** The team's positions, from its cards' labels (for choosing what a speech runs). */
export async function libraryPositions(teamId: string): Promise<{ side: string; name: string; cards: number }[]> {
  const rows = (await db().execute(sql`
    select coalesce(meta->>'side', '') as side, meta->>'position' as name, count(*)::int as cards
    from ${cards} where team_id = ${teamId} and deleted_at is null and coalesce(meta->>'position', '') <> ''
    group by 1, 2 having count(*) >= 2 order by 3 desc limit 120`)) as unknown as { rows: { side: string; name: string; cards: number }[] };
  return rows.rows;
}

/** Library positions named in a speech's instructions or strategy notes. */
export function namedPositions(text: string, positions: { side: string; name: string }[], side?: "aff" | "neg"): string[] {
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const out: string[] = [];
  for (const p of positions) {
    if (side && p.side && p.side !== side && p.side !== "either") continue;
    const toks = positionTokens(p.name);
    if (toks.length && toks.every((t) => hay.includes(` ${t} `)) && !out.some((o) => positionTokens(o).join(" ") === toks.join(" "))) out.push(p.name);
  }
  return out;
}

/** Every block of the team's files whose headings name the position, with cards resolved to library cards. */
async function blocksFor(teamId: string, position: string): Promise<Omit<FileBlock, "position" | "purpose">[]> {
  const toks = positionTokens(position);
  if (!toks.length) return [];
  const files = await db()
    .select({ id: uploads.id, fileName: uploads.fileName })
    .from(uploads)
    .where(and(eq(uploads.teamId, teamId), eq(uploads.purpose, "library_file")));
  if (!files.length) return [];
  const names = new Map(files.map((f) => [f.id, f.fileName]));
  // A block matches when its headings (or, for a file about one argument, the file name) name the position.
  const like = toks.map((t) => sql`(lower(${uploadBlocks.path}::text) like ${`%${t}%`})`);
  const rows = await db()
    .select({ uploadId: uploadBlocks.uploadId, idx: uploadBlocks.idx, kind: uploadBlocks.kind, text: uploadBlocks.text, path: uploadBlocks.path, data: uploadBlocks.data })
    .from(uploadBlocks)
    .where(and(inArray(uploadBlocks.uploadId, [...names.keys()]), sql`${uploadBlocks.kind} <> 'heading'`, sql.join(like, sql` and `)))
    .orderBy(uploadBlocks.uploadId, uploadBlocks.idx)
    .limit(1500);
  if (!rows.length) return [];
  const imported = await db()
    .select({ id: cards.id, from: cards.importedFrom })
    .from(cards)
    .where(and(eq(cards.teamId, teamId), isNull(cards.deletedAt), inArray(sql`${cards.importedFrom}->>'uploadId'`, [...new Set(rows.map((r) => r.uploadId))])));
  const cardAt = new Map(imported.map((c) => { const f = c.from as { uploadId?: string; blockIdx?: number }; return [`${f.uploadId}:${f.blockIdx}`, c.id] as const; }));
  // A card skipped at import as a duplicate is the library's copy of the same words.
  const missing = rows.filter((r) => r.kind === "card" && !cardAt.has(`${r.uploadId}:${r.idx}`) && (r.data as { body?: BodyBlock[] } | null)?.body?.length);
  if (missing.length) {
    const hashes = new Map(await Promise.all(missing.map(async (r) => [`${r.uploadId}:${r.idx}`, await bodyHash((r.data as { body: BodyBlock[] }).body)] as const)));
    const same = await db()
      .select({ id: cards.id, bodyHash: cards.bodyHash })
      .from(cards)
      .where(and(eq(cards.teamId, teamId), isNull(cards.deletedAt), inArray(cards.bodyHash, [...new Set(hashes.values())])));
    const byHash = new Map(same.map((c) => [c.bodyHash, c.id]));
    for (const [at, h] of hashes) if (byHash.has(h)) cardAt.set(at, byHash.get(h)!);
  }
  const out: Omit<FileBlock, "position" | "purpose">[] = [];
  let cur: (typeof out)[number] | null = null;
  let lastIdx = -2;
  for (const r of rows) {
    const path = ((r.path as string[]) ?? []).filter(Boolean);
    const key = `${r.uploadId}\u0001${path.join("\u0001")}`;
    if (!cur || `${cur.uploadId}\u0001${cur.path.join("\u0001")}` !== key || r.idx !== lastIdx + 1) {
      const fileName = names.get(r.uploadId) ?? "";
      const speech = speechOf(path, fileName);
      cur = { key: `${r.uploadId}:${r.idx}`, uploadId: r.uploadId, fileName, path, title: path[path.length - 1] ?? fileName, speech, side: sideOf(speech, fileName, path), items: [], cards: 0 };
      out.push(cur);
    }
    lastIdx = r.idx;
    if (r.kind === "card") {
      cur.items.push({ kind: "card", cardId: cardAt.get(`${r.uploadId}:${r.idx}`) ?? null, tag: r.text });
      cur.cards++;
    } else {
      const detail = ((r.data as { detail?: string[] } | null)?.detail ?? []).join(" ");
      cur.items.push({ kind: "analytic", text: `${r.text}${detail ? ` ${detail}` : ""}`.slice(0, 1200) });
    }
  }
  return out;
}

const EXTENDS: Partial<Record<SpeechId, string[]>> = { "2NC": ["2NC", "1NR"], "1NR": ["1NR", "2NC"], "2NR": ["2NR", "1NR", "2NC"], "1AR": ["1AR", "2AC"], "2AR": ["2AR", "1AR"] };

/**
 * The file blocks a speech should work from:
 * - positions it introduces (named by the team for the 1NC or 1AC): the whole shell, one per position;
 * - our positions already in the round: the file's extension blocks for this speech;
 * - their positions: our file's answers (the 2AC frontline, the 1AR's extensions of it).
 */
export async function blocksForSpeech(teamId: string, args: { speech: SpeechId; ourSide: "aff" | "neg"; introduce: string[]; ours: string[]; theirs: string[]; maxCards?: number }): Promise<FileBlock[]> {
  const out: FileBlock[] = [];
  let budget = args.maxCards ?? 30;
  // Files repeat blocks (a core file and the speech docs cut from it): the same heading and cards count once.
  const signature = (b: Omit<FileBlock, "position" | "purpose">) => `${b.title.toLowerCase()}|${b.items.map((i) => (i.kind === "card" ? i.cardId ?? i.tag : i.text.slice(0, 60))).join("|")}`;
  const take = (b: Omit<FileBlock, "position" | "purpose">, position: string, purpose: FileBlock["purpose"]) => {
    if (out.some((x) => x.key === b.key || signature(x) === signature(b)) || (b.cards > budget && out.length)) return;
    out.push({ ...b, position, purpose });
    budget -= b.cards;
  };
  const constructive = args.speech === "1AC" || args.speech === "1NC";
  for (const name of args.introduce) {
    const blocks = (await blocksFor(teamId, name)).filter((b) => b.side !== (args.ourSide === "aff" ? "neg" : "aff"));
    // The shell: this speech's block (e.g. "1NC"), the one with the most cards.
    const shell = blocks.filter((b) => b.speech === args.speech && b.cards > 0).sort((a, b) => b.cards - a.cards)[0] ?? (constructive ? blocks.filter((b) => !b.speech && b.cards >= 2).sort((a, b) => b.cards - a.cards)[0] : undefined);
    if (shell) take(shell, name, "shell");
  }
  const wants = EXTENDS[args.speech];
  if (wants) {
    for (const name of args.ours) {
      const blocks = (await blocksFor(teamId, name)).filter((b) => b.side === args.ourSide && wants.includes(b.speech));
      for (const b of blocks.slice(0, 4)) take(b, name, "extend");
    }
  }
  if (!constructive) {
    const answerSpeeches = args.ourSide === "aff" ? ["2AC", "1AR", "2AR"] : ["2NC", "1NR", "2NR"];
    for (const name of args.theirs) {
      const blocks = (await blocksFor(teamId, name)).filter((b) => b.side === args.ourSide && answerSpeeches.includes(b.speech));
      const here = blocks.filter((b) => b.speech === args.speech);
      for (const b of (here.length ? here : blocks).slice(0, 3)) take(b, name, "answer");
    }
  }
  return out;
}

export type { CardMeta };

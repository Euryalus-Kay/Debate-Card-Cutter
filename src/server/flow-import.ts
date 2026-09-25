/**
 * Deterministic "add document to flow": headings become positions, cards and
 * analytics become argument units with document provenance and delivery
 * "documented" (never "confirmed" just because a document exists).
 * No relations are invented here; linking responses needs interpretation
 * (AI-assisted or manual).
 */

import * as Y from "yjs";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { rounds, uploadBlocks, uploads } from "@/server/db/schema";
import { applyServerChange, loadDoc } from "@/server/docs/store";
import { readArgs, readPositions, upsertArg, upsertPosition } from "@/shared/round-doc";
import { opposite, SPEECHES, type Side, type SpeechId } from "@/domain/format";
import type { ArgUnit, Position, PositionKind } from "@/domain/flow";
import { newId } from "@/server/ids";

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

export interface FlowImportResult {
  positionsCreated: number;
  positionsMatched: number;
  argsCreated: number;
  argsSkipped: number;
}

export async function importUploadToFlow(roundId: string, uploadId: string, userId: string): Promise<FlowImportResult> {
  const [round] = await db().select().from(rounds).where(eq(rounds.id, roundId));
  const [up] = await db().select().from(uploads).where(eq(uploads.id, uploadId));
  if (!round || !up || up.roundId !== roundId) throw new Error("upload does not belong to this round");
  const attribution = (up.attribution ?? {}) as { speech?: SpeechId; owner?: "opponent" | "us" };
  if (!attribution.speech) throw new Error("upload has no speech attribution");
  const speech = attribution.speech;
  const side: Side = attribution.owner === "us" ? (round.ourSide as Side) : opposite(round.ourSide as Side);
  if (SPEECHES[speech].side !== side) throw new Error(`The ${speech} is a ${SPEECHES[speech].side} speech, but this document is attributed to the ${side}.`);
  const blocks = await db().select().from(uploadBlocks).where(eq(uploadBlocks.uploadId, uploadId)).orderBy(uploadBlocks.idx);

  const { doc: current } = await loadDoc(round.stateDocId);
  const existingPositions = readPositions(current);
  const existingArgs = readArgs(current);
  const already = new Set(existingArgs.filter((a) => a.provenance.type === "document" && a.provenance.documentId === uploadId).map((a) => (a.provenance as { blockId?: string }).blockId));

  const result: FlowImportResult = { positionsCreated: 0, positionsMatched: 0, argsCreated: 0, argsSkipped: 0 };
  const newPositions: Position[] = [];
  const newArgs: ArgUnit[] = [];
  let order = existingPositions.length;
  let current_pos: Position | null = null;
  const counters = new Map<string, number>();

  const known: Position[] = [...existingPositions];
  const ensurePosition = (name: string): Position => {
    const hit = matchPosition(name, known);
    if (hit) {
      result.positionsMatched++;
      return hit;
    }
    const p: Position = { id: newId("pos"), kind: guessKind(name), name: name.trim().slice(0, 120), side, introducedIn: speech, order: order++ };
    known.push(p);
    newPositions.push(p);
    result.positionsCreated++;
    return p;
  };

  for (const b of blocks) {
    const path = (b.path as string[]) ?? [];
    if (b.kind === "heading") {
      // Pocket (level 1) is usually the speech name; Hat/Block name positions.
      if ((b.level ?? 0) >= 2 || !/^(1ac|1nc|2ac|2nc|1nr|1ar|2nr|2ar)\b/i.test(b.text)) {
        if ((b.level ?? 0) <= 2 || !current_pos) current_pos = ensurePosition(b.text);
      }
      continue;
    }
    const blockId = String(b.idx);
    if (already.has(blockId)) {
      result.argsSkipped++;
      continue;
    }
    const posName = path.filter((p) => !/^(1ac|1nc|2ac|2nc|1nr|1ar|2nr|2ar)\b/i.test(p))[0] ?? current_pos?.name ?? `${speech} (unsorted)`;
    const pos = current_pos && (current_pos.name === posName || positionKey(current_pos.name) === positionKey(posName)) ? current_pos : ensurePosition(posName);
    const n = (counters.get(pos.id) ?? 0) + 1;
    counters.set(pos.id, n);
    const data = (b.data ?? {}) as { cite?: { short?: string } | null };
    newArgs.push({
      id: newId("arg"),
      positionId: pos.id,
      speech,
      side,
      order: n,
      label: String(n),
      text: b.text.slice(0, 400),
      role: "claim",
      cardIds: [],
      cites: b.kind === "card" && data.cite?.short ? [data.cite.short] : [],
      provenance: { type: "document", documentId: uploadId, blockId, excerpt: b.text.slice(0, 200) },
      delivery: "documented",
    });
    result.argsCreated++;
  }

  if (newPositions.length || newArgs.length) {
    await applyServerChange(
      round.stateDocId,
      (d: Y.Doc) => {
        for (const p of newPositions) upsertPosition(d, p);
        for (const a of newArgs) upsertArg(d, a);
      },
      { userId, origin: `import:${uploadId}` },
    );
  }
  await db()
    .update(uploads)
    .set({ attribution: { ...(up.attribution as object), flowedAt: new Date().toISOString(), flowedBy: userId } })
    .where(eq(uploads.id, uploadId));
  return result;
}

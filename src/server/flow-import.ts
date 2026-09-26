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
import type { ArgUnit, Position } from "@/domain/flow";
import { newId } from "@/server/ids";

export { guessKind, matchPosition, positionKey } from "@/domain/positions";
import { guessKind, matchPosition, positionKey } from "@/domain/positions";
import { jaccard } from "@/domain/flow-extract";
import { ROADMAP } from "@/server/drafts";

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
  // Continue numbering after arguments already on the flow for this speech (a second doc, or typed notes).
  const counters = new Map<string, number>();
  for (const a of existingArgs) if (a.speech === speech && Number.isFinite(Number(a.label))) counters.set(a.positionId, Math.max(counters.get(a.positionId) ?? 0, Number(a.label)));
  // Lines typed while listening that this doc's cards repeat: the typed unit becomes an alias of the card.
  const heardHere = existingArgs.filter((a) => a.speech === speech && a.provenance.type === "heard" && !a.sameAs);
  const aliases: { heardId: string; docArgId: string }[] = [];

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
    // A roadmap in the doc is the speech's order, not an argument.
    if (path.some((h) => h && ROADMAP.test(h)) || (b.kind === "heading" && ROADMAP.test(b.text))) continue;
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
    const argId = newId("arg");
    const twin = heardHere.find((h) => h.positionId === pos.id && !aliases.some((x) => x.heardId === h.id) && (jaccard(h.text, b.text) >= 0.5 || (!!data.cite?.short && (h.cites ?? []).some((c) => c.toLowerCase() === data.cite!.short!.toLowerCase()))));
    if (twin) aliases.push({ heardId: twin.id, docArgId: argId });
    newArgs.push({
      id: argId,
      positionId: pos.id,
      speech,
      side,
      order: n,
      label: String(n),
      // An analytic's own explanation (the paragraphs under its tag) is part of the argument to answer.
      text: [b.text, ...((b.data as { detail?: string[] } | null)?.detail ?? [])].join(" ").replace(/\s+/g, " ").trim().slice(0, 600),
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
        for (const x of aliases) upsertArg(d, { id: x.heardId, sameAs: x.docArgId });
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

/**
 * Server-side storage for collaborative Yjs documents.
 *
 * Model: documents.snapshot holds the merged state up to snapshotSeq;
 * doc_updates holds later updates (append-only, deduplicated by hash).
 * Clients pull by sequence number and push raw Yjs updates. Because Yjs
 * updates are idempotent and commutative, duplicates and reordering are safe.
 */

import * as Y from "yjs";
import { and, asc, eq, gt, lte, sql } from "drizzle-orm";
import { atomic, db } from "@/server/db/client";
import { documents, docUpdates, docVersions } from "@/server/db/schema";
import { newId } from "@/server/ids";

export const MAX_UPDATE_BYTES = 4 * 1024 * 1024;
export const COMPACT_THRESHOLD = 150;

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Buffer.from(d).toString("hex");
}

export function isValidUpdate(update: Uint8Array): boolean {
  if (update.byteLength === 0 || update.byteLength > MAX_UPDATE_BYTES) return false;
  try {
    Y.decodeUpdate(update);
    return true;
  } catch {
    return false;
  }
}

export interface PullResult {
  headSeq: number;
  snapshot?: Uint8Array;
  snapshotSeq: number;
  updates: { seq: number; update: Uint8Array }[];
}

/** Everything a client with `since` needs to catch up. */
export async function pull(docId: string, since: number): Promise<PullResult> {
  const [doc] = await db().select({ snapshot: documents.snapshot, snapshotSeq: documents.snapshotSeq }).from(documents).where(eq(documents.id, docId));
  if (!doc) throw new Error("document not found");
  const fromSeq = since < doc.snapshotSeq ? doc.snapshotSeq : since;
  const rows = await db()
    .select({ seq: docUpdates.seq, update: docUpdates.update })
    .from(docUpdates)
    .where(and(eq(docUpdates.docId, docId), gt(docUpdates.seq, fromSeq)))
    .orderBy(asc(docUpdates.seq));
  const headSeq = rows.length ? rows[rows.length - 1].seq : Math.max(since, doc.snapshotSeq);
  const result: PullResult = { headSeq, snapshotSeq: doc.snapshotSeq, updates: rows };
  if (since < doc.snapshotSeq && doc.snapshot) result.snapshot = doc.snapshot;
  return result;
}

export interface PushResult {
  accepted: number;
  duplicates: number;
  rejected: number;
  seqs: number[];
}

export async function push(
  docId: string,
  updates: Uint8Array[],
  meta: { clientId: string; userId: string | null; origin: string },
): Promise<PushResult> {
  let rejected = 0;
  const valid: { update: Uint8Array; hash: string }[] = [];
  for (const u of updates) {
    if (!isValidUpdate(u)) {
      rejected++;
      continue;
    }
    valid.push({ update: u, hash: await sha256Hex(u) });
  }
  if (valid.length === 0) return { accepted: 0, duplicates: 0, rejected, seqs: [] };
  const inserted = await db()
    .insert(docUpdates)
    .values(valid.map((v) => ({ docId, update: v.update, hash: v.hash, clientId: meta.clientId, userId: meta.userId, origin: meta.origin })))
    .onConflictDoNothing({ target: [docUpdates.docId, docUpdates.hash] })
    .returning({ seq: docUpdates.seq });
  await db().update(documents).set({ updatedAt: new Date() }).where(eq(documents.id, docId));
  return { accepted: inserted.length, duplicates: valid.length - inserted.length, rejected, seqs: inserted.map((r) => r.seq) };
}

/** Load the full current document on the server. */
export async function loadDoc(docId: string): Promise<{ doc: Y.Doc; headSeq: number }> {
  const r = await pull(docId, -1);
  const doc = new Y.Doc({ gc: true });
  Y.transact(doc, () => {
    if (r.snapshot) Y.applyUpdate(doc, r.snapshot);
    for (const u of r.updates) Y.applyUpdate(doc, u.update);
  });
  return { doc, headSeq: r.headSeq };
}

export async function stateVector(docId: string): Promise<{ sv: Uint8Array; headSeq: number }> {
  const { doc, headSeq } = await loadDoc(docId);
  return { sv: Y.encodeStateVector(doc), headSeq };
}

/**
 * Apply a server-side change (AI apply, import, system) as a normal update.
 * Returns the produced update (empty when the mutation changed nothing).
 */
export async function applyServerChange(
  docId: string,
  mutate: (doc: Y.Doc) => void,
  meta: { userId: string | null; origin: string },
): Promise<Uint8Array | null> {
  const { doc } = await loadDoc(docId);
  const before = Y.encodeStateVector(doc);
  const captured: Uint8Array[] = [];
  const handler = (u: Uint8Array) => captured.push(u);
  doc.on("update", handler);
  doc.transact(() => mutate(doc), meta.origin);
  doc.off("update", handler);
  if (captured.length === 0) return null;
  const update = Y.encodeStateAsUpdate(doc, before);
  await push(docId, [captured.length === 1 ? captured[0] : Y.mergeUpdates(captured)], { clientId: `server:${meta.origin}`, userId: meta.userId, origin: meta.origin });
  return update;
}

/** Merge old updates into the snapshot. Safe under concurrent pushes. */
export async function compact(docId: string, extractText?: (doc: Y.Doc) => string): Promise<{ compacted: number }> {
  const [doc] = await db().select({ snapshot: documents.snapshot, snapshotSeq: documents.snapshotSeq }).from(documents).where(eq(documents.id, docId));
  if (!doc) return { compacted: 0 };
  const rows = await db()
    .select({ seq: docUpdates.seq, update: docUpdates.update })
    .from(docUpdates)
    .where(and(eq(docUpdates.docId, docId), gt(docUpdates.seq, doc.snapshotSeq)))
    .orderBy(asc(docUpdates.seq));
  if (rows.length < COMPACT_THRESHOLD) return { compacted: 0 };
  const upTo = rows[rows.length - 1].seq;
  const parts = [...(doc.snapshot ? [doc.snapshot] : []), ...rows.map((r) => r.update)];
  const merged = Y.mergeUpdates(parts);
  let searchText: string | undefined;
  if (extractText) {
    const y = new Y.Doc();
    Y.applyUpdate(y, merged);
    searchText = extractText(y).slice(0, 200_000);
  }
  await atomic((d) => [
    d
      .update(documents)
      .set({ snapshot: merged, snapshotSeq: upTo, ...(searchText !== undefined ? { searchText } : {}), updatedAt: new Date() })
      .where(and(eq(documents.id, docId), eq(documents.snapshotSeq, doc.snapshotSeq))),
    d.delete(docUpdates).where(and(eq(docUpdates.docId, docId), lte(docUpdates.seq, upTo), sql`exists (select 1 from ${documents} where ${documents.id} = ${docId} and ${documents.snapshotSeq} >= ${upTo})`)),
  ]);
  return { compacted: rows.length };
}

export async function saveVersion(docId: string, reason: (typeof docVersions.$inferInsert)["reason"], label: string, userId: string | null): Promise<string> {
  const { doc, headSeq } = await loadDoc(docId);
  const id = newId("ver");
  await db().insert(docVersions).values({ id, docId, reason, label, state: Y.encodeStateAsUpdate(doc), seqAt: headSeq, createdBy: userId });
  return id;
}

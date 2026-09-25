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
export const COMPACT_THRESHOLD = Number(process.env.COMPACT_THRESHOLD ?? 150);

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

function bytesFromDriver(v: unknown): Uint8Array {
  if (v instanceof Uint8Array) return v;
  if (typeof v === "string") return new Uint8Array(Buffer.from(v.startsWith("\\x") ? v.slice(2) : v, "hex"));
  throw new Error("unexpected bytea value");
}

/**
 * Everything a client with `since` needs to catch up.
 *
 * One statement, so the snapshot pointer and the update rows come from the same
 * MVCC snapshot: a compaction committing concurrently is seen entirely or not
 * at all (two separate reads could skip the rows it just folded in).
 */
export async function pull(docId: string, since: number): Promise<PullResult> {
  const res = await db().execute(sql`
    with d as (select snapshot, snapshot_seq from ${documents} where id = ${docId})
    select 0 as k, d.snapshot_seq as seq, case when ${since}::bigint < d.snapshot_seq then d.snapshot end as data from d
    union all
    select 1 as k, u.seq, u.update as data from ${docUpdates} u, d
      where u.doc_id = ${docId} and u.seq > greatest(${since}::bigint, d.snapshot_seq)
    order by k, seq
  `);
  const rows = (res as unknown as { rows: { k: number | string; seq: number | string; data: unknown }[] }).rows;
  if (rows.length === 0 || Number(rows[0].k) !== 0) throw new Error("document not found");
  const snapshotSeq = Number(rows[0].seq);
  const snapshot = rows[0].data == null ? undefined : bytesFromDriver(rows[0].data);
  const updates = rows.slice(1).map((r) => ({ seq: Number(r.seq), update: bytesFromDriver(r.data) }));
  const headSeq = updates.length ? updates[updates.length - 1].seq : Math.max(since, snapshotSeq);
  const result: PullResult = { headSeq, snapshotSeq, updates };
  if (snapshot && since < snapshotSeq) result.snapshot = snapshot;
  return result;
}

export interface PushResult {
  accepted: number;
  duplicates: number;
  rejected: number;
  seqs: number[];
}

/**
 * Append updates. A single statement bumps documents.head_seq (taking the
 * row lock) and inserts rows numbered from it, so for each document the
 * sequence order equals commit order: a client that has seen seq N has
 * necessarily been able to see every committed seq < N. Duplicates (same
 * hash) are skipped; they may leave harmless gaps in the numbering.
 */
export async function push(
  docId: string,
  updates: Uint8Array[],
  meta: { clientId: string; userId: string | null; origin: string },
): Promise<PushResult> {
  let rejected = 0;
  const valid: { update: Uint8Array; hash: string }[] = [];
  const seen = new Set<string>();
  for (const u of updates) {
    if (!isValidUpdate(u)) {
      rejected++;
      continue;
    }
    const hash = await sha256Hex(u);
    if (seen.has(hash)) continue;
    seen.add(hash);
    valid.push({ update: u, hash });
  }
  if (valid.length === 0) return { accepted: 0, duplicates: updates.length - rejected, rejected, seqs: [] };
  const rows = sql.join(
    valid.map((v, i) => sql`(${v.hash}::text, ${Buffer.from(v.update)}::bytea, ${i + 1}::int)`),
    sql`, `,
  );
  const result = await db().execute(sql`
    with incoming(hash, upd, ord) as (values ${rows}),
    fresh as (
      select i.hash, i.upd, row_number() over (order by i.ord) as rn
      from incoming i
      where not exists (select 1 from ${docUpdates} d where d.doc_id = ${docId} and d.hash = i.hash)
    ),
    bump as (
      update ${documents} set head_seq = head_seq + (select count(*) from fresh), updated_at = now()
      where id = ${docId}
      returning head_seq
    )
    insert into ${docUpdates} (doc_id, seq, update, hash, client_id, user_id, origin)
    select ${docId}, (select head_seq from bump) - (select count(*) from fresh) + f.rn, f.upd, f.hash, ${meta.clientId}, ${meta.userId}, ${meta.origin}
    from fresh f
    on conflict (doc_id, hash) do nothing
    returning seq
  `);
  const seqs = (result as unknown as { rows: { seq: string | number }[] }).rows.map((r) => Number(r.seq));
  return { accepted: seqs.length, duplicates: valid.length - seqs.length + (updates.length - rejected - valid.length), rejected, seqs };
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

/**
 * Merge old updates into the snapshot.
 *
 * Safe under concurrent pushes: because seq order equals commit order, every
 * row with seq <= upTo is already committed and was read here, and the
 * guarded writes below only succeed if nobody compacted in between.
 */
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
  const y = new Y.Doc({ gc: true });
  Y.transact(y, () => {
    if (doc.snapshot) Y.applyUpdate(y, doc.snapshot);
    for (const r of rows) Y.applyUpdate(y, r.update);
  });
  // Updates whose dependencies are missing would be dropped by re-encoding: skip.
  const store = (y as unknown as { store: { pendingStructs: unknown; pendingDs: unknown } }).store;
  if (store.pendingStructs || store.pendingDs) return { compacted: 0 };
  const merged = Y.encodeStateAsUpdate(y);
  const searchText = extractText ? extractText(y).slice(0, 200_000) : undefined;
  await atomic((d) => [
    d
      .update(documents)
      .set({ snapshot: merged, snapshotSeq: upTo, ...(searchText !== undefined ? { searchText } : {}) })
      .where(and(eq(documents.id, docId), eq(documents.snapshotSeq, doc.snapshotSeq))),
    d.delete(docUpdates).where(
      and(
        eq(docUpdates.docId, docId),
        lte(docUpdates.seq, upTo),
        gt(docUpdates.seq, doc.snapshotSeq),
        sql`exists (select 1 from ${documents} where ${documents.id} = ${docId} and ${documents.snapshotSeq} = ${upTo})`,
      ),
    ),
  ]);
  return { compacted: rows.length };
}

export async function saveVersion(docId: string, reason: (typeof docVersions.$inferInsert)["reason"], label: string, userId: string | null): Promise<string> {
  const { doc, headSeq } = await loadDoc(docId);
  const id = newId("ver");
  await db().insert(docVersions).values({ id, docId, reason, label, state: Y.encodeStateAsUpdate(doc), seqAt: headSeq, createdBy: userId });
  return id;
}

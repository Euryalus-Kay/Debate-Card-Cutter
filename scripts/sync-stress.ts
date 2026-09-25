/**
 * Concurrency stress test against the real Neon database.
 * 4 writers push 200 updates in parallel while 3 pullers poll with their own
 * cursors. Every puller must end with exactly the server's content (no skipped
 * sequence numbers), and compaction running mid-stream must not lose updates.
 */
import * as Y from "yjs";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { documents, teams } from "@/server/db/schema";
import { compact, loadDoc, pull, push } from "@/server/docs/store";

const stamp = Date.now();
const team = `t_stress_${stamp}`;
const docId = `d_stress_${stamp}`;
await db().insert(teams).values({ id: team, name: "stress" });
await db().insert(documents).values({ id: docId, teamId: team, kind: "notes" });

const WRITERS = 4;
const PER_WRITER = 50;
let failures = 0;
try {
  const writers = Array.from({ length: WRITERS }, (_, w) => {
    const d = new Y.Doc();
    return (async () => {
      for (let i = 0; i < PER_WRITER; i++) {
        const ups: Uint8Array[] = [];
        const h = (u: Uint8Array) => ups.push(u);
        d.on("update", h);
        d.getArray("items").push([`w${w}-${i}`]);
        d.off("update", h);
        await push(docId, ups, { clientId: `w${w}`, userId: null, origin: "user" });
      }
    })();
  });

  let done = false;
  const pullers = Array.from({ length: 3 }, (_, p) => {
    const d = new Y.Doc();
    let since = 0;
    let polls = 0;
    return (async () => {
      while (!done) {
        const r = await pull(docId, since);
        if (r.snapshot) Y.applyUpdate(d, r.snapshot);
        for (const u of r.updates) Y.applyUpdate(d, u.update);
        since = Math.max(since, r.headSeq);
        polls++;
      }
      const r = await pull(docId, since);
      if (r.snapshot) Y.applyUpdate(d, r.snapshot);
      for (const u of r.updates) Y.applyUpdate(d, u.update);
      return { p, polls, count: d.getArray("items").length };
    })();
  });

  // Compact concurrently a few times while writes are in flight.
  const compactor = (async () => {
    let compactions = 0;
    while (!done) {
      const r = await compact(docId);
      if (r.compacted) compactions++;
      await new Promise((res) => setTimeout(res, 150));
    }
    return compactions;
  })();

  const t0 = Date.now();
  await Promise.all(writers);
  done = true;
  const results = await Promise.all(pullers);
  const compactions = await compactor;
  const { doc } = await loadDoc(docId);
  const expected = WRITERS * PER_WRITER;
  const server = doc.getArray("items").length;
  for (const r of results) if (r.count !== expected) failures++;
  console.log({ ms: Date.now() - t0, expected, server, pullers: results, compactions, ok: server === expected && failures === 0 });
} finally {
  await db().delete(teams).where(eq(teams.id, team));
}
process.exit(failures ? 1 : 0);

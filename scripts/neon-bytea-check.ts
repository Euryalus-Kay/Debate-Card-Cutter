/** Verifies bytea round-trips and the doc store against the real Neon database, then cleans up. */
import * as Y from "yjs";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { documents, teams } from "@/server/db/schema";
import { compact, loadDoc, pull, push } from "@/server/docs/store";

const team = `t_check_${Date.now()}`;
const docId = `d_check_${Date.now()}`;
await db().insert(teams).values({ id: team, name: "bytea check" });
await db().insert(documents).values({ id: docId, teamId: team, kind: "notes" });
try {
  const a = new Y.Doc();
  const ups: Uint8Array[] = [];
  a.on("update", (u: Uint8Array) => ups.push(u));
  a.getText("t").insert(0, "héllo — “quotes” ✓");
  const t0 = Date.now();
  const r = await push(docId, ups, { clientId: "check", userId: null, origin: "user" });
  const t1 = Date.now();
  const p = await pull(docId, 0);
  const t2 = Date.now();
  const same = Buffer.compare(Buffer.from(p.updates[0].update), Buffer.from(ups[0])) === 0;
  const { doc } = await loadDoc(docId);
  console.log({ accepted: r.accepted, bytesEqual: same, text: doc.getText("t").toString(), pushMs: t1 - t0, pullMs: t2 - t1 });
  await compact(docId);
} finally {
  await db().delete(teams).where(eq(teams.id, team));
  console.log("cleaned up");
}

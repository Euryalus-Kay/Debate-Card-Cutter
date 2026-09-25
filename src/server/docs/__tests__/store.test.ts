import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { freshDb } from "../../../../tests/helpers/pglite";
import { db } from "@/server/db/client";
import { documents, teams, user } from "@/server/db/schema";
import { applyServerChange, compact, COMPACT_THRESHOLD, loadDoc, pull, push, saveVersion } from "../store";

let close: () => Promise<void>;

beforeEach(async () => {
  ({ close } = await freshDb());
  await db().insert(user).values({ id: "u1", name: "Ann", email: "ann@example.test" });
  await db().insert(teams).values({ id: "t1", name: "Team" });
  await db().insert(documents).values({ id: "d1", teamId: "t1", kind: "speech_draft", title: "2AC" });
});
afterEach(async () => close());

function edit(doc: Y.Doc, fn: (d: Y.Doc) => void): Uint8Array {
  const updates: Uint8Array[] = [];
  const h = (u: Uint8Array, origin: unknown) => origin !== "remote" && updates.push(u);
  doc.on("update", h);
  doc.transact(() => fn(doc));
  doc.off("update", h);
  return Y.mergeUpdates(updates);
}

describe("doc store", () => {
  it("two clients converge through push/pull, including concurrent edits", async () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const ua = edit(a, (d) => d.getText("t").insert(0, "Hello"));
    await push("d1", [ua], { clientId: "A", userId: "u1", origin: "user" });
    // B pulls A's change
    let pb = await pull("d1", 0);
    for (const u of pb.updates) Y.applyUpdate(b, u.update, "remote");
    expect(b.getText("t").toString()).toBe("Hello");
    // Concurrent edits at both ends
    const ua2 = edit(a, (d) => d.getText("t").insert(5, " world"));
    const ub2 = edit(b, (d) => d.getText("t").insert(0, ">> "));
    await push("d1", [ub2], { clientId: "B", userId: "u1", origin: "user" });
    await push("d1", [ua2], { clientId: "A", userId: "u1", origin: "user" });
    const pa = await pull("d1", 1);
    for (const u of pa.updates) Y.applyUpdate(a, u.update, "remote");
    pb = await pull("d1", pb.headSeq);
    for (const u of pb.updates) Y.applyUpdate(b, u.update, "remote");
    expect(a.getText("t").toString()).toBe(b.getText("t").toString());
    expect(a.getText("t").toString()).toContain("world");
    expect(a.getText("t").toString()).toContain(">> ");
  });

  it("deduplicates identical updates and rejects garbage", async () => {
    const a = new Y.Doc();
    const u = edit(a, (d) => d.getMap("m").set("k", 1));
    const r1 = await push("d1", [u, u], { clientId: "A", userId: "u1", origin: "user" });
    const r2 = await push("d1", [u, new Uint8Array([1, 2, 3, 250])], { clientId: "A", userId: "u1", origin: "user" });
    expect(r1.accepted).toBe(1);
    expect(r2).toMatchObject({ accepted: 0, duplicates: 1, rejected: 1 });
  });

  it("compaction preserves content and clients behind the snapshot catch up", async () => {
    const a = new Y.Doc();
    for (let i = 0; i < COMPACT_THRESHOLD + 5; i++) {
      await push("d1", [edit(a, (d) => d.getArray("arr").push([i]))], { clientId: "A", userId: "u1", origin: "user" });
    }
    const res = await compact("d1", (d) => d.getArray("arr").toArray().join(","));
    expect(res.compacted).toBe(COMPACT_THRESHOLD + 5);
    const later = edit(a, (d) => d.getArray("arr").push(["last"]));
    await push("d1", [later], { clientId: "A", userId: "u1", origin: "user" });
    const p = await pull("d1", 3); // behind snapshot → gets snapshot + tail
    expect(p.snapshot).toBeTruthy();
    const c = new Y.Doc();
    Y.applyUpdate(c, p.snapshot!);
    for (const u of p.updates) Y.applyUpdate(c, u.update);
    expect(c.getArray("arr").length).toBe(COMPACT_THRESHOLD + 6);
    const [row] = await db().select().from(documents);
    expect(row.searchText.startsWith("0,1,2")).toBe(true);
  });

  it("server-side changes merge with client edits without overwriting them", async () => {
    const a = new Y.Doc();
    await push("d1", [edit(a, (d) => d.getMap("sections").set("s1", "human text"))], { clientId: "A", userId: "u1", origin: "user" });
    await applyServerChange("d1", (d) => d.getMap("sections").set("s2", "ai text"), { userId: null, origin: "ai:op1" });
    const { doc } = await loadDoc("d1");
    expect(doc.getMap("sections").toJSON()).toEqual({ s1: "human text", s2: "ai text" });
    const vid = await saveVersion("d1", "manual", "before 2AC", "u1");
    expect(vid.startsWith("ver_")).toBe(true);
  });
});

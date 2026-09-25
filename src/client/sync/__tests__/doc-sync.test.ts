import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { freshDb } from "../../../../tests/helpers/pglite";
import { db } from "@/server/db/client";
import { documents, teams } from "@/server/db/schema";
import { pull, push, stateVector } from "@/server/docs/store";
import { DocSync } from "../doc-sync";
import { resetDbForTests } from "../idb";

let close: () => Promise<void>;
let dbCounter = 0;

beforeEach(async () => {
  ({ close } = await freshDb());
  await db().insert(teams).values({ id: "t1", name: "T" });
  await db().insert(documents).values({ id: "d1", teamId: "t1", kind: "speech_draft" });
  // Isolate IndexedDB between tests.
  (globalThis as { indexedDB: unknown }).indexedDB = new (await import("fake-indexeddb")).IDBFactory();
  resetDbForTests();
  dbCounter++;
});
afterEach(async () => close());

const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));

/** A fake network that talks to the real store; can go offline or drop responses. */
function network() {
  const state = { offline: false, dropResponses: 0, requests: 0 };
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    state.requests++;
    if (state.offline) throw new TypeError("fetch failed");
    const body = JSON.parse(String(init?.body));
    const pushed = await push("d1", body.updates.map(unb64), { clientId: body.clientId, userId: null, origin: "user" });
    const pulled = await pull("d1", body.since);
    const sv = body.wantStateVector ? b64((await stateVector("d1")).sv) : undefined;
    if (state.dropResponses > 0) {
      state.dropResponses--;
      throw new TypeError("connection reset after server processed the request");
    }
    return new Response(
      JSON.stringify({
        headSeq: pulled.headSeq,
        snapshotSeq: pulled.snapshotSeq,
        snapshot: pulled.snapshot ? b64(pulled.snapshot) : undefined,
        updates: pulled.updates.filter((x) => !pushed.seqs.includes(x.seq)).map((x) => ({ seq: x.seq, u: b64(x.update) })),
        accepted: pushed.accepted,
        duplicates: pushed.duplicates,
        rejected: pushed.rejected,
        serverTime: Date.now(),
        presence: [],
        stateVector: sv,
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  return { state, fetchImpl };
}

function client(net: ReturnType<typeof network>, persistence = true) {
  return new DocSync("d1", new Y.Doc(), { fetch: net.fetchImpl, persistence, idleIntervalMs: 60_000, debounceMs: 5 });
}

async function settle(s: DocSync) {
  await new Promise((r) => setTimeout(r, 20));
  await s.flush();
  await s.sync();
}

describe("DocSync", () => {
  it("syncs two clients and reports synced only after acknowledgement", async () => {
    const net = network();
    const a = client(net);
    const b = client(net);
    await a.start();
    await b.start();
    a.doc.getText("t").insert(0, "2AC: extend Smith");
    expect(a.snapshot.pending).toBeGreaterThan(0);
    await settle(a);
    expect(a.snapshot.status).toBe("synced");
    expect(a.snapshot.pending).toBe(0);
    await b.sync();
    expect(b.doc.getText("t").toString()).toBe("2AC: extend Smith");
    a.stop();
    b.stop();
  });

  it("keeps offline edits on the device across a restart and pushes them later", async () => {
    const net = network();
    const a = client(net);
    await a.start();
    net.state.offline = true;
    a.doc.getText("t").insert(0, "written offline");
    await settle(a);
    expect(a.snapshot.status).toBe("offline");
    expect(a.snapshot.pending).toBe(1);
    expect(a.snapshot.localPersistence).toBe(true);
    a.stop(); // browser closed while offline

    // Reopen later on the same device, back online.
    net.state.offline = false;
    const a2 = client(net);
    await a2.start();
    expect(a2.doc.getText("t").toString()).toBe("written offline");
    await settle(a2);
    expect(a2.snapshot.status).toBe("synced");
    const b = client(network(), false);
    // b uses a fresh network wrapper pointing at the same store
    await b.start();
    expect(b.doc.getText("t").toString()).toBe("written offline");
    a2.stop();
    b.stop();
  });

  it("does not duplicate content when a response is lost after the server applied it", async () => {
    const net = network();
    const a = client(net);
    await a.start();
    net.state.dropResponses = 1;
    a.doc.getText("t").insert(0, "once");
    await settle(a);
    await settle(a);
    const b = client(network(), false);
    await b.start();
    expect(b.doc.getText("t").toString()).toBe("once");
    a.stop();
    b.stop();
  });

  it("merges concurrent edits from both partners", async () => {
    const net = network();
    const a = client(net);
    const b = client(net);
    await a.start();
    await b.start();
    a.doc.getText("t").insert(0, "overview ");
    b.doc.getText("t").insert(0, "line-by-line ");
    await Promise.all([settle(a), settle(b)]);
    await a.sync();
    await b.sync();
    expect(a.doc.getText("t").toString()).toBe(b.doc.getText("t").toString());
    expect(a.doc.getText("t").toString()).toContain("overview");
    expect(a.doc.getText("t").toString()).toContain("line-by-line");
    a.stop();
    b.stop();
  });

  it("repairs content the server never received via the state-vector handshake", async () => {
    const net = network();
    // Simulate content that exists locally but was never queued (e.g. a lost outbox write).
    const doc = new Y.Doc();
    Y.applyUpdate(
      doc,
      (() => {
        const tmp = new Y.Doc();
        tmp.getText("t").insert(0, "orphaned local text");
        return Y.encodeStateAsUpdate(tmp);
      })(),
      "idb",
    );
    const a = new DocSync("d1", doc, { fetch: net.fetchImpl, persistence: false, idleIntervalMs: 60_000, debounceMs: 5 });
    await a.start();
    await settle(a);
    const b = client(network(), false);
    await b.start();
    expect(b.doc.getText("t").toString()).toBe("orphaned local text");
    a.stop();
    b.stop();
  });
});

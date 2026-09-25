import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { readArgs, readGraph, readSlots, togglePrep, prepUsedMs, readTimers, updateSlot, upsertArg, upsertPosition } from "../round-doc";

function sync(a: Y.Doc, b: Y.Doc) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}

describe("round doc", () => {
  it("keeps both partners' fields when they update the same slot concurrently offline", () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    a.transact(() => updateSlot(a, "2NC", { notes: "They read 3 new link cards" }));
    b.transact(() => updateSlot(b, "2NC", { status: "delivered", readConfirmed: true }));
    sync(a, b);
    const s = readSlots(a)["2NC"];
    expect(s).toMatchObject({ notes: "They read 3 new link cards", status: "delivered", readConfirmed: true });
    expect(readSlots(b)["2NC"]).toEqual(s);
  });

  it("never lets an automated refresh overwrite a human correction", () => {
    const d = new Y.Doc();
    upsertPosition(d, { id: "p1", kind: "da", name: "Politics", side: "neg", introducedIn: "1NC", order: 0 });
    upsertArg(d, { id: "a1", positionId: "p1", speech: "1NC", side: "neg", text: "AI reading", role: "link", order: 0, cardIds: [], provenance: { type: "ai_inferred", confidence: 0.7 }, delivery: "documented" });
    upsertArg(d, { id: "a1", text: "Human correction: this is actually a uniqueness card", role: "uniqueness" }, { byHuman: true });
    upsertArg(d, { id: "a1", text: "AI re-extraction", role: "link", warrant: "new field is fine" });
    const a = readArgs(d)[0];
    expect(a.text).toBe("Human correction: this is actually a uniqueness card");
    expect(a.role).toBe("uniqueness");
    expect(a.warrant).toBe("new field is fine");
    expect(readGraph(d, "aff").positions).toHaveLength(1);
  });

  it("prep clock accumulates by server time", () => {
    const d = new Y.Doc();
    togglePrep(d, "aff", 1_000);
    expect(prepUsedMs(readTimers(d), "aff", 61_000)).toBe(60_000);
    togglePrep(d, "aff", 31_000);
    expect(prepUsedMs(readTimers(d), "aff", 999_999)).toBe(30_000);
  });
});

describe("cross-ex notes", () => {
  it("merge both partners' concurrent typing and stay out of the flow", async () => {
    const { applyTextDiff, cxText, readCxNotes, readArgs } = await import("../round-doc");
    const Y = await import("yjs");
    const a = new Y.Doc();
    const b = new Y.Doc();
    applyTextDiff(cxText(a, "CX1"), "Q: solvency?\n");
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    // Both type at the same time in different places.
    applyTextDiff(cxText(a, "CX1"), "Q: solvency?\nA: plan takes 10 years.\n");
    applyTextDiff(cxText(b, "CX1"), "Q (2N): solvency?\n");
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const text = cxText(a, "CX1").toString();
    expect(text).toContain("A: plan takes 10 years.");
    expect(text).toContain("(2N)");
    expect(cxText(b, "CX1").toString()).toBe(text);
    expect(readCxNotes(a).CX1).toBe(text);
    expect(readArgs(a)).toHaveLength(0);
  });
});

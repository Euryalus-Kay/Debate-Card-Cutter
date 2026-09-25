import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { mentionsAi, patchReply, putReply, putThread, readThreads } from "../comments";
import { putActivity, pruneActivity, readActivity } from "../round-doc";

// SYNTHETIC FIXTURE: two partners' copies of one draft document.
function pair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  return { a, b, sync: () => (Y.applyUpdate(b, Y.encodeStateAsUpdate(a)), Y.applyUpdate(a, Y.encodeStateAsUpdate(b))) };
}

describe("comment threads", () => {
  it("partners replying at the same time keep both replies, in order", () => {
    const { a, b, sync } = pair();
    putThread(a, { id: "t1", start: null, end: null, quote: "No link", sectionId: "s1", by: "u1", byName: "Sam", at: 1, resolved: false });
    putReply(a, { id: "r1", threadId: "t1", by: "u1", byName: "Sam", at: 1, text: "Is this enough? @AI" });
    sync();
    // Both reply while offline from each other.
    putReply(a, { id: "r2", threadId: "t1", by: "u1", byName: "Sam", at: 5, text: "I think we need the warrant." });
    putReply(b, { id: "r3", threadId: "t1", by: "u2", byName: "Alex", at: 4, text: "Agreed." });
    patchReply(b, "t1", "r1", { text: "Is this enough? @AI (edited)" });
    sync();
    for (const d of [a, b]) {
      const [t] = readThreads(d);
      expect(t.replies.map((r) => r.id)).toEqual(["r1", "r3", "r2"]);
      expect(t.replies[0].text).toContain("(edited)");
    }
  });

  it("knows when the AI is asked", () => {
    expect(mentionsAi("what do you think @AI")).toBe(true);
    expect(mentionsAi("@ai sharpen this")).toBe(true);
    expect(mentionsAi("email me at sam@aim.org")).toBe(false);
  });
});

describe("AI activity", () => {
  it("keeps running jobs, and drops finished ones after a while", () => {
    const d = new Y.Doc();
    const base = { by: "u1", byName: "Sam", kind: "draft", label: "writing the 1AR", speech: "1AR" as const, draftId: "d1", stage: "", done: 0, total: null, etaMs: null, fraction: 0, startedAt: 0 };
    putActivity(d, { ...base, id: "run", status: "running", at: 1_000 });
    putActivity(d, { ...base, id: "old", status: "ready", at: 1_000 });
    putActivity(d, { ...base, id: "new", status: "ready", at: 20 * 60_000 });
    pruneActivity(d, 20 * 60_000);
    expect(readActivity(d).map((a) => a.id).sort()).toEqual(["new", "run"]);
  });
});

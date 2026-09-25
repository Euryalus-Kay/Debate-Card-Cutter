import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { confirmDocumented, readArgs, upsertArg } from "../round-doc";
import type { ArgUnit } from "@/domain/flow";

// SYNTHETIC FIXTURE: arguments imported from their 1NC document.
const docArg = (id: string, extra: Partial<ArgUnit> = {}): ArgUnit => ({ id, positionId: "p", speech: "1NC", side: "neg", order: 1, text: id, role: "claim", cardIds: [], provenance: { type: "document", documentId: "u1" }, delivery: "documented", ...extra });

describe("argument writes that respect people", () => {
  it("marking a card not read protects only that choice; the AI can still refine the rest", () => {
    const d = new Y.Doc();
    upsertArg(d, docArg("a"));
    upsertArg(d, { id: "a", delivery: "not_read" }, { humanField: true });
    // An automated refresh: re-import says documented, the AI reads the role.
    upsertArg(d, { id: "a", delivery: "documented", role: "link" });
    const a = readArgs(d)[0];
    expect(a.delivery).toBe("not_read");
    expect(a.role).toBe("link");
    expect(a.humanEdited).toBeFalsy();
  });

  it("confirming their speech was read as documented marks its document arguments delivered, and undoing reverts", () => {
    const d = new Y.Doc();
    upsertArg(d, docArg("a"));
    upsertArg(d, docArg("b", { delivery: "not_read" }));
    upsertArg(d, docArg("c", { provenance: { type: "user_note", by: "u" }, delivery: "confirmed" }));
    expect(confirmDocumented(d, "1NC", true)).toBe(1);
    const by = () => Object.fromEntries(readArgs(d).map((x) => [x.id, x.delivery]));
    expect(by()).toEqual({ a: "confirmed", b: "not_read", c: "confirmed" });
    confirmDocumented(d, "1NC", false);
    expect(by()).toEqual({ a: "documented", b: "not_read", c: "confirmed" });
  });
});

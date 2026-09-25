import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { applyHeard, parsedToValidated, revertHeard } from "../heard-apply";
import { applyTextDiff, heardKey, heardLines, heardText, readArgs, readGraph, readHeardMarks, upsertArg, upsertPosition } from "../round-doc";
import { parseHeard } from "@/domain/heard-parse";
import { computeCoverage } from "@/domain/flow";

// SYNTHETIC FIXTURE: we are aff; the 1NC read a Politics DA; the neg partner-typed 2NC notes are ours to answer in the 1AR.
function setup() {
  const doc = new Y.Doc();
  upsertPosition(doc, { id: "pos_pol", kind: "da", name: "Politics DA", side: "neg", introducedIn: "1NC", order: 1 });
  upsertArg(doc, { id: "arg_2ac_1", positionId: "pos_pol", speech: "2AC", side: "aff", order: 1, label: "1", text: "Non-unique: the bill already failed", role: "non_unique", cardIds: [], provenance: { type: "user_note", by: "u1" }, delivery: "confirmed" });
  applyTextDiff(heardText(doc, "2NC", "u1"), "Politics DA\n1. uq - bill passes now (Lee 26)\n2. perm doesn't solve, condo fine (analytic)\nCase\nalt causes - china");
  return doc;
}

function parseAll(doc: Y.Doc) {
  const lines = heardLines(doc, "2NC").filter((l) => l.status !== "flowed").map((l) => ({ key: l.textKey, line: l.line, text: l.text }));
  const parsed = parseHeard(lines, { positions: [{ id: "pos_pol", kind: "da", name: "Politics DA", side: "neg", introducedIn: "1NC", order: 1 }] });
  return parsedToValidated(parsed, lines);
}

describe("applyHeard", () => {
  it("puts every typed line on the flow (headers and arguments) and nothing twice", () => {
    const doc = setup();
    const r1 = applyHeard(doc, { speech: "2NC", side: "neg", lines: parseAll(doc), opId: null, by: "u1" });
    expect(r1.created).toHaveLength(3);
    expect(heardLines(doc, "2NC").every((l) => l.status === "flowed")).toBe(true);
    const heard = readArgs(doc).filter((a) => a.provenance.type === "heard");
    expect(heard.map((a) => [a.label, a.positionId === "pos_pol" ? "pol" : "case"])).toEqual([
      ["1", "pol"],
      ["2", "pol"],
      ["1", "case"],
    ]);
    // Idempotent: a second run over the same text writes nothing new.
    const r2 = applyHeard(doc, { speech: "2NC", side: "neg", lines: parseAll(doc), opId: null, by: "u1" });
    expect(r2.created).toHaveLength(0);
    expect(readArgs(doc).filter((a) => a.provenance.type === "heard")).toHaveLength(3);
    expect(readHeardMarks(doc).length).toBe(5);
  });

  it("makes typed analytics show up as things the 1AR must answer", () => {
    const doc = setup();
    applyHeard(doc, { speech: "2NC", side: "neg", lines: parseAll(doc), opId: null, by: "u1" });
    const cov = computeCoverage(readGraph(doc, "aff"), "1AR", [], new Set(["2NC", "1NR"]));
    const texts = cov.items.map((i) => i.arg.text);
    expect(texts).toContain("perm doesn't solve, condo fine (analytic)");
    expect(texts).toContain("alt causes - china");
    expect(cov.items.every((i) => i.status === "uncertain" || i.status === "unanswered")).toBe(true);
  });

  it("skips a line that was edited after it was read", () => {
    const doc = setup();
    const validated = parseAll(doc);
    applyTextDiff(doc.getText(heardKey("2NC", "u1")), doc.getText(heardKey("2NC", "u1")).toString().replace("alt causes - china", "alt causes - china and india"));
    const r = applyHeard(doc, { speech: "2NC", side: "neg", lines: validated, opId: null, by: "u1" });
    expect(r.skipped).toBe(1);
    expect(heardLines(doc, "2NC").find((l) => l.text.startsWith("alt causes"))!.status).toBe("unflowed");
  });

  it("undo removes what a run created, keeps a partner's edit, and re-opens the lines", () => {
    const doc = setup();
    const r = applyHeard(doc, { speech: "2NC", side: "neg", lines: parseAll(doc), opId: "aop_x", by: "u1" });
    const edited = r.created[0];
    upsertArg(doc, { id: edited, text: "Uniqueness: the bill passes now (Lee 26)" }, { byHuman: true });
    const undo = revertHeard(doc, r);
    expect(undo).toEqual({ removed: 2, kept: 1 });
    expect(readArgs(doc).filter((a) => a.provenance.type === "heard").map((a) => a.id)).toEqual([edited]);
    expect(heardLines(doc, "2NC").every((l) => l.status === "unflowed")).toBe(true);
  });

  it("an edited line is re-read in place: same argument, new words, on the flow again; undo restores the old reading", () => {
    const doc = setup();
    applyHeard(doc, { speech: "2NC", side: "neg", lines: parseAll(doc), opId: null, by: "u1" });
    const before = readArgs(doc).find((a) => a.text === "alt causes - china")!;
    const t = doc.getText(heardKey("2NC", "u1"));
    applyTextDiff(t, t.toString().replace("alt causes - china", "alt causes - china and india"));
    expect(heardLines(doc, "2NC").find((l) => l.text.startsWith("alt causes"))!.status).toBe("changed");
    const r = applyHeard(doc, { speech: "2NC", side: "neg", lines: parseAll(doc), opId: "aop_e", by: "u1" });
    expect(r.created).toEqual([]);
    expect(r.updated!.map((u) => u.id)).toEqual([before.id]);
    const after = readArgs(doc).filter((a) => a.provenance.type === "heard");
    expect(after).toHaveLength(3);
    expect(after.find((a) => a.id === before.id)).toMatchObject({ text: "alt causes - china and india", positionId: before.positionId });
    expect(heardLines(doc, "2NC").every((l) => l.status === "flowed")).toBe(true);
    revertHeard(doc, r);
    expect(readArgs(doc).find((a) => a.id === before.id)!.text).toBe("alt causes - china");
    expect(heardLines(doc, "2NC").find((l) => l.text.startsWith("alt causes"))!.status).toBe("changed");
  });

  it("a line added later under a header joins that header's position, not an unsorted one", () => {
    const doc = setup();
    applyHeard(doc, { speech: "2NC", side: "neg", lines: parseAll(doc), opId: null, by: "u1" });
    const t = doc.getText(heardKey("2NC", "u1"));
    applyTextDiff(t, t.toString().replace("2. perm doesn't solve, condo fine (analytic)", "2. perm doesn't solve, condo fine (analytic)\n3. link - plan costs capital"));
    // Only the new line is sent (as the pad does); the parser alone doesn't know the header above it.
    const lines = heardLines(doc, "2NC").filter((l) => l.status !== "flowed").map((l) => ({ key: l.textKey, line: l.line, text: l.text }));
    expect(lines.map((l) => l.text)).toEqual(["3. link - plan costs capital"]);
    const r = applyHeard(doc, { speech: "2NC", side: "neg", lines: parsedToValidated(parseHeard(lines, { positions: [] }), lines), opId: null, by: "u1" });
    expect(r.positions).toEqual([]);
    expect(readArgs(doc).find((a) => a.id === r.created[0])!.positionId).toBe("pos_pol");
  });

  it("a line flowed again after an undo comes back", () => {
    const doc = setup();
    const r = applyHeard(doc, { speech: "2NC", side: "neg", lines: parseAll(doc), opId: "aop_y", by: "u1" });
    revertHeard(doc, r);
    expect(readArgs(doc).filter((a) => a.provenance.type === "heard")).toHaveLength(0);
    applyHeard(doc, { speech: "2NC", side: "neg", lines: parseAll(doc), opId: "aop_z", by: "u1" });
    expect(readArgs(doc).filter((a) => a.provenance.type === "heard")).toHaveLength(3);
  });
});

import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { applyTextDiff, heardKey, heardLines, heardText, lineAnchors, lineHash, putHeardMark, recordedSpeeches, transcriptText, type HeardMark } from "../round-doc";

// SYNTHETIC FIXTURE: what a debater might type during a 2NC.
const NOTES = "Politics DA\n1. uq - bill passes now, whip count\n2. no link turn b/c plan is popular (analytic)\n\nCase\nalt causes - china";

function sync(a: Y.Doc, b: Y.Doc) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}

function flow(doc: Y.Doc, key: string, lineText: string, opId = "aop_1"): HeardMark {
  const text = doc.getText(key).toString();
  const from = text.indexOf(lineText);
  const { id, start, end } = lineAnchors(doc, "2NC", key, from, from + lineText.length);
  const mark: HeardMark = { id, speech: "2NC", textKey: key, start, end, quoteHash: lineHash(lineText), kind: "args", argIds: [`ha_${id}_0`], category: "", opId, by: "u1" };
  putHeardMark(doc, mark);
  return mark;
}

describe("heard pads and line marks", () => {
  it("lists every non-empty line as unflowed until it is flowed", () => {
    const doc = new Y.Doc();
    applyTextDiff(heardText(doc, "2NC", "u1"), NOTES);
    const lines = heardLines(doc, "2NC");
    expect(lines.map((l) => l.text)).toEqual(["Politics DA", "1. uq - bill passes now, whip count", "2. no link turn b/c plan is popular (analytic)", "Case", "alt causes - china"]);
    expect(lines.every((l) => l.status === "unflowed")).toBe(true);
    flow(doc, heardKey("2NC", "u1"), "1. uq - bill passes now, whip count");
    expect(heardLines(doc, "2NC").find((l) => l.text.startsWith("1. uq"))!.status).toBe("flowed");
  });

  it("keeps a mark on its line when a partner inserts text above it", () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const key = heardKey("2NC", "u1");
    applyTextDiff(heardText(a, "2NC", "u1"), NOTES);
    sync(a, b);
    flow(a, key, "alt causes - china");
    sync(a, b);
    // Partner (same pad, e.g. after a device switch) inserts a line at the top.
    applyTextDiff(b.getText(key), `Roadmap: politics, case\n${b.getText(key).toString()}`);
    sync(a, b);
    for (const doc of [a, b]) {
      const line = heardLines(doc, "2NC").find((l) => l.text === "alt causes - china")!;
      expect(line.status).toBe("flowed");
      expect(heardLines(doc, "2NC").find((l) => l.text.startsWith("Roadmap"))!.status).toBe("unflowed");
    }
  });

  it("flags a flowed line as changed when its words are edited", () => {
    const doc = new Y.Doc();
    const key = heardKey("2NC", "u1");
    applyTextDiff(heardText(doc, "2NC", "u1"), NOTES);
    flow(doc, key, "alt causes - china");
    applyTextDiff(doc.getText(key), NOTES.replace("alt causes - china", "alt causes - china, india"));
    expect(heardLines(doc, "2NC").find((l) => l.text.startsWith("alt causes"))!.status).toBe("changed");
  });

  it("gives the same mark id when two runs flow the same line (idempotent)", () => {
    const doc = new Y.Doc();
    const key = heardKey("2NC", "u1");
    applyTextDiff(heardText(doc, "2NC", "u1"), NOTES);
    const m1 = flow(doc, key, "Case");
    const m2 = flow(doc, key, "Case", "aop_2");
    expect(m1.id).toBe(m2.id);
    expect([...doc.getMap("heard_marks").keys()]).toHaveLength(1);
  });

  it("keeps partners' pads apart and includes the transcript", () => {
    const doc = new Y.Doc();
    applyTextDiff(heardText(doc, "2NC", "u1"), "Politics DA");
    applyTextDiff(heardText(doc, "2NC", "u2"), "T - subsets");
    transcriptText(doc, "2NC").insert(0, "they say the plan is not topical");
    const lines = heardLines(doc, "2NC");
    expect(lines.map((l) => [l.source, l.text])).toEqual([
      ["typed", "Politics DA"],
      ["typed", "T - subsets"],
      ["transcript", "they say the plan is not topical"],
    ]);
  });

  it("counts a speech with only heard notes as recorded", () => {
    const doc = new Y.Doc();
    expect(recordedSpeeches(doc).has("2NC")).toBe(false);
    applyTextDiff(heardText(doc, "2NC", "u1"), "Politics DA");
    expect(recordedSpeeches(doc).has("2NC")).toBe(true);
    expect(recordedSpeeches(doc, ["1NR"]).has("1NR")).toBe(true);
  });
});

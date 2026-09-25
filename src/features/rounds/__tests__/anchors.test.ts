// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import * as Y from "yjs";
import { DRAFT_FRAGMENT, editorExtensions } from "@/shared/editor/schema";
import { anchorRange, rangeText, resolveRange, touchesCard } from "../editor/anchors";

// SYNTHETIC FIXTURE: two partners editing one draft; updates pass between their Y.Docs.
function partner(doc: Y.Doc) {
  return new Editor({ extensions: [...editorExtensions({ collaborative: true }), Collaboration.configure({ document: doc, field: DRAFT_FRAGMENT })] });
}
function link(a: Y.Doc, b: Y.Doc) {
  a.on("update", (u: Uint8Array, origin: unknown) => origin !== "remote" && Y.applyUpdate(b, u, "remote"));
  b.on("update", (u: Uint8Array, origin: unknown) => origin !== "remote" && Y.applyUpdate(a, u, "remote"));
}
function find(ed: Editor, text: string): { from: number; to: number } {
  let hit = { from: -1, to: -1 };
  ed.state.doc.descendants((node, pos) => {
    if (hit.from >= 0 || !node.isText) return hit.from < 0;
    const i = node.text!.indexOf(text);
    if (i >= 0) hit = { from: pos + i, to: pos + i + text.length };
    return hit.from < 0;
  });
  return hit;
}

describe("anchored spans", () => {
  it("stay on the same words while the partner types above and inside the paragraph", () => {
    const da = new Y.Doc();
    const db = new Y.Doc();
    link(da, db);
    const a = partner(da);
    const b = partner(db);
    a.commands.setContent({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "No link because the plan is regulation, not spending." }] }] });
    const r = find(a, "the plan is regulation");
    const anchor = anchorRange(a, r.from, r.to)!;
    expect(anchor).not.toBeNull();
    // The partner adds a paragraph above and a word at the start of the sentence.
    b.commands.insertContentAt(0, { type: "paragraph", content: [{ type: "text", text: "Politics DA" }] });
    const at = find(b, "No link");
    b.commands.insertContentAt(at.from, "First, ");
    const now = resolveRange(a, anchor)!;
    expect(rangeText(a, now.from, now.to)).toBe("the plan is regulation");
    // Deleting the words entirely leaves nothing to resolve to.
    const gone = find(b, "the plan is regulation");
    b.commands.deleteRange(gone);
    const after = resolveRange(a, anchor);
    expect(after === null || rangeText(a, after.from, after.to) === "").toBe(true);
    a.destroy();
    b.destroy();
  });

  it("knows card text from the debater's own words", () => {
    const d = new Y.Doc();
    const ed = partner(d);
    ed.commands.setContent({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Our analytic." }] },
        { type: "card", attrs: { id: "cin_1" }, content: [{ type: "cardTag", content: [{ type: "text", text: "Tag" }] }, { type: "cardCite", attrs: { short: "Lee 26", full: "Lee 26" } }, { type: "cardBody", content: [{ type: "cardPara", content: [{ type: "text", text: "Verbatim card words." }] }] }] },
      ],
    });
    const own = find(ed, "Our analytic");
    const card = find(ed, "Verbatim card");
    expect(touchesCard(ed, own.from, own.to)).toBe(false);
    expect(touchesCard(ed, card.from, card.to)).toBe(true);
    ed.destroy();
  });
});

// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { ALLOW_CARD_TEXT_EDIT, BYPASS_LOCKS, editorExtensions, type BlockedReason } from "../editor/schema";
import { cardToPM, draftFromPM, pmCardBody, sectionLoad, type PMNodeJSON } from "../draft-model";
import { makeText, type BodyBlock } from "@/domain/card";

// SYNTHETIC FIXTURE
const text = "Sanctions rarely change regime behavior quickly, but multilateral sanctions sustained for years can succeed.";
const i = text.indexOf("multilateral");
const body: BodyBlock[] = [
  makeText(text, {
    underline: [{ start: i, end: text.length }],
    emphasis: [{ start: i, end: i + 12 }],
    highlight: [{ start: i, end: text.length - 1, color: "yellow" }],
  }),
  { kind: "omission", marker: "[…]" },
  makeText("Second paragraph of evidence.", { highlight: [{ start: 0, end: 6, color: "cyan" }] }),
];

function doc(locked = false): PMNodeJSON {
  return {
    type: "doc",
    content: [
      {
        type: "section",
        attrs: { id: "sec_a", kind: "response", relation: "answers", targets: ["arg_1"], locked },
        content: [
          { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Politics — non-unique" }] },
          { type: "paragraph", content: [{ type: "text", text: "They have no uniqueness evidence after the vote." }] },
          cardToPM({ instanceId: "cin_1", tag: "Sanctions work when sustained", shortCite: "Smith 23", fullCite: "Jane Smith, Yale", body, verification: "verified" }),
        ],
      },
    ],
  };
}

function editor(content: PMNodeJSON, blocked: BlockedReason[] = []) {
  return new Editor({ extensions: editorExtensions({ onBlocked: (r) => blocked.push(r) }), content });
}

function findText(ed: Editor, needle: string): number {
  let at = -1;
  ed.state.doc.descendants((n, pos) => {
    if (at >= 0) return false;
    if (n.isText && n.text!.includes(needle)) at = pos + n.text!.indexOf(needle);
    return true;
  });
  return at;
}

describe("card conversion", () => {
  it("round-trips body blocks through the editor schema", () => {
    const ed = editor(doc());
    const json = ed.getJSON() as PMNodeJSON;
    const card = json.content![0].content![2];
    const back = pmCardBody(card);
    expect(back).toHaveLength(3);
    expect(back[0]).toMatchObject({ kind: "text", text });
    expect((back[0] as { highlight: unknown[] }).highlight).toEqual([{ start: i, end: text.length - 1, color: "yellow" }]);
    expect((back[0] as { emphasis: unknown[] }).emphasis).toEqual([{ start: i, end: i + 12 }]);
    expect(back[1]).toEqual({ kind: "omission", marker: "[…]" });
    expect(back[2]).toMatchObject({ kind: "text", text: "Second paragraph of evidence.", newParagraph: true });
    ed.destroy();
  });

  it("extracts sections with targets and computes time loads", () => {
    const ed = editor(doc());
    const d = draftFromPM(ed.getJSON() as PMNodeJSON);
    const s = (d.items[0] as { section: import("../draft-model").DraftSection }).section;
    expect(s).toMatchObject({ id: "sec_a", relation: "answers", targets: ["arg_1"], title: "Politics — non-unique" });
    const load = sectionLoad(s);
    expect(load.cards).toBe(1);
    expect(load.analyticWords).toBe(8);
    expect(load.cardWords).toBeGreaterThan(5);
    ed.destroy();
  });
});

describe("integrity guards", () => {
  it("blocks typing inside card evidence but allows re-highlighting", () => {
    const blocked: BlockedReason[] = [];
    const ed = editor(doc(), blocked);
    const pos = findText(ed, "rarely");
    const before = ed.getText();
    ed.chain().insertContentAt(pos, "NEVER ").run();
    expect(ed.getText()).toBe(before);
    expect(blocked).toContain("card_text");
    // Mark changes are fine
    ed.chain().setTextSelection({ from: pos, to: pos + 6 }).setHighlight({ color: "#5ce1ff" }).run();
    const card = (ed.getJSON() as PMNodeJSON).content![0].content![2];
    const hl = (pmCardBody(card)[0] as { highlight: { color: string }[] }).highlight;
    expect(hl.some((h) => h.color === "cyan")).toBe(true);
    ed.destroy();
  });

  it("allows card text edits only with the explicit meta flag", () => {
    const ed = editor(doc());
    const pos = findText(ed, "rarely");
    const tr = ed.state.tr.insertText("often ", pos).setMeta(ALLOW_CARD_TEXT_EDIT, true);
    ed.view.dispatch(tr);
    expect(ed.getText()).toContain("often rarely");
    ed.destroy();
  });

  it("allows editing the tag and analytics, and deleting a whole card", () => {
    const ed = editor(doc());
    const tagPos = findText(ed, "Sanctions work");
    ed.chain().insertContentAt(tagPos, "Extend: ").run();
    expect(ed.getText()).toContain("Extend: Sanctions work");
    let cardPos = -1;
    let size = 0;
    ed.state.doc.descendants((n, p) => {
      if (n.type.name === "card") {
        cardPos = p;
        size = n.nodeSize;
      }
      return true;
    });
    ed.chain().deleteRange({ from: cardPos, to: cardPos + size }).run();
    expect(ed.getText()).not.toContain("rarely");
    ed.destroy();
  });

  it("blocks edits inside a locked section unless bypassed", () => {
    const blocked: BlockedReason[] = [];
    const ed = editor(doc(true), blocked);
    const pos = findText(ed, "They have");
    ed.chain().insertContentAt(pos, "X ").run();
    expect(ed.getText()).not.toContain("X They have");
    expect(blocked).toContain("locked_section");
    ed.view.dispatch(ed.state.tr.insertText("Y ", pos).setMeta(BYPASS_LOCKS, true));
    expect(ed.getText()).toContain("Y They have");
    ed.destroy();
  });

  it("assigns fresh ids to duplicated sections", () => {
    const ed = editor(doc());
    const sec = (ed.getJSON() as PMNodeJSON).content![0];
    ed.chain().insertContentAt(ed.state.doc.content.size, sec).run();
    const ids = ((ed.getJSON() as PMNodeJSON).content ?? []).filter((n) => n.type === "section").map((n) => n.attrs!.id);
    expect(new Set(ids).size).toBe(2);
    ed.destroy();
  });
});

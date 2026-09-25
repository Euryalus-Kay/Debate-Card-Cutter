// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { editorExtensions, type BlockedReason } from "@/shared/editor/schema";
import { cardToPM, isHumanEdited, sectionOwnHash, type PMNodeJSON } from "@/shared/draft-model";
import { makeText } from "@/domain/card";
import { applyRevision, findSectionNode, insertSectionAt, removeSection, sectionNodes } from "../proposals";
import { sectionContentHash } from "@/shared/draft-model";
import type { SpeechDraftOutput } from "@/server/ai/schemas";

// SYNTHETIC FIXTURE
const para = (text: string): PMNodeJSON => ({ type: "paragraph", content: [{ type: "text", text }] });
const heading = (text: string, level = 3): PMNodeJSON => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });
const section = (id: string, content: PMNodeJSON[], attrs: Record<string, unknown> = {}): PMNodeJSON => ({ type: "section", attrs: { id, kind: "response", relation: "answers", targets: [], ...attrs }, content });

function doc(childLocked: boolean, parentLocked = false): PMNodeJSON {
  return {
    type: "doc",
    content: [
      section("sec_parent", [heading("Politics DA"), para("Group the politics answers."), section("sec_child", [heading("1. Non-unique", 4), para("The bill already died in committee.")], { locked: childLocked })], { kind: "position", locked: parentLocked }),
      section("sec_other", [heading("Case"), para("Extend the advantage.")]),
    ],
  };
}

function editor(content: PMNodeJSON, blocked: BlockedReason[] = []) {
  return new Editor({ extensions: editorExtensions({ onBlocked: (r) => blocked.push(r) }), content });
}

const json = (ed: Editor) => JSON.stringify(ed.getJSON());

describe("lock guard", () => {
  it("blocks a zero-width insert at the very start of a locked section's content", () => {
    const blocked: BlockedReason[] = [];
    const ed = editor(doc(false, true), blocked);
    const before = json(ed);
    const found = findSectionNode(ed as never, "sec_parent")!;
    ed.view.dispatch(ed.state.tr.insert(found.pos + 1, ed.schema.nodeFromJSON(para("sneaky"))));
    expect(json(ed)).toBe(before);
    expect(blocked).toContain("locked_section");
  });

  it("allows attribute-only changes on a parent with a locked child; setNodeMarkup is blocked", () => {
    const ed = editor(doc(true));
    const found = findSectionNode(ed as never, "sec_parent")!;
    ed.view.dispatch(ed.state.tr.setNodeAttribute(found.pos, "budgetSec", 30));
    expect(findSectionNode(ed as never, "sec_parent")!.node.attrs.budgetSec).toBe(30);
    const again = findSectionNode(ed as never, "sec_parent")!;
    ed.view.dispatch(ed.state.tr.setNodeMarkup(again.pos, undefined, { ...again.node.attrs, budgetSec: 45 }));
    expect(findSectionNode(ed as never, "sec_parent")!.node.attrs.budgetSec).toBe(30);
  });
});

describe("apply functions report what really happened", () => {
  it("applyRevision on a parent with a locked child returns locked and changes nothing", () => {
    const ed = editor(doc(true));
    const before = json(ed);
    const node = findSectionNode(ed as never, "sec_parent")!.node;
    const r = applyRevision(ed as never, "sec_parent", { title: "Politics DA", analytic: "New text.", cardIds: [] }, sectionContentHash(node.toJSON() as PMNodeJSON), new Map(), "aop_1");
    expect(r).toBe("locked");
    expect(json(ed)).toBe(before);
  });

  it("removeSection refuses when a nested section is locked", () => {
    const ed = editor(doc(true));
    const node = findSectionNode(ed as never, "sec_parent")!.node;
    expect(removeSection(ed as never, "sec_parent", sectionContentHash(node.toJSON() as PMNodeJSON))).toBe("locked");
    expect(findSectionNode(ed as never, "sec_parent")).not.toBeNull();
  });

  it("applyRevision on an unlocked section applies and stamps the own-hash", () => {
    const ed = editor(doc(false));
    const node = findSectionNode(ed as never, "sec_other")!.node;
    const r = applyRevision(ed as never, "sec_other", { title: "Case", analytic: "Extend the advantage: the plan solves.", cardIds: [] }, sectionContentHash(node.toJSON() as PMNodeJSON), new Map(), "aop_2");
    expect(r).toBe("applied");
    const after = findSectionNode(ed as never, "sec_other")!.node.toJSON() as PMNodeJSON;
    expect(after.attrs!.appliedHash).toBe(sectionOwnHash(after));
    expect(isHumanEdited(after)).toBe(false);
  });

  it("insertSectionAt refuses a locked destination and places sections under or after", () => {
    const ed = editor(doc(true, false));
    expect(insertSectionAt(ed as never, section("sec_new1", [heading("2. No link", 4)]), { under: "sec_child" })).toBe("locked");
    expect(insertSectionAt(ed as never, section("sec_new2", [heading("2. No link", 4)]), { under: "sec_parent" })).toBe("applied");
    const parent = findSectionNode(ed as never, "sec_parent")!.node;
    expect(parent.lastChild!.attrs.id).toBe("sec_new2");
    expect(insertSectionAt(ed as never, section("sec_new3", [heading("Impact calc")]), { after: "sec_other" })).toBe("applied");
    const ids: string[] = [];
    ed.state.doc.forEach((n) => ids.push(String(n.attrs.id ?? n.type.name)));
    expect(ids[ids.indexOf("sec_other") + 1]).toBe("sec_new3");
    expect(insertSectionAt(ed as never, section("sec_new4", [heading("x")]), { under: "nope" })).toBe("missing");
  });
});

describe("section ownership", () => {
  const base = (): PMNodeJSON =>
    section("sec_p", [
      heading("Politics DA"),
      para("Group the politics answers."),
      cardToPM({ instanceId: "cin_1", cardId: "card_1", tag: "Bill dead", shortCite: "Lee 26", fullCite: "Lee", body: [makeText("The bill is dead.", { highlight: [{ start: 0, end: 8, color: "yellow" }] })], verification: "verified" }),
      section("sec_c", [heading("1. Non-unique", 4), para("Already dead.")]),
    ]);

  it("ignores child edits and card re-highlighting, but not the section's own words", () => {
    const h = sectionOwnHash(base());
    const childEdited = base();
    (childEdited.content![3].content![1].content![0] as { text: string }).text = "Already dead, twice.";
    expect(sectionOwnHash(childEdited)).toBe(h);
    const rehighlighted = base();
    const body = rehighlighted.content![2].content![2];
    body.content = body.content!.map((p) => ({ ...p, content: (p.content ?? []).map((t) => ({ ...t, marks: [] })) }));
    expect(sectionOwnHash(rehighlighted)).toBe(h);
    const ownEdit = base();
    (ownEdit.content![1].content![0] as { text: string }).text = "Group them, all of them.";
    expect(sectionOwnHash(ownEdit)).not.toBe(h);
  });

  it("treats sections without an AI stamp as human", () => {
    expect(isHumanEdited(base())).toBe(true);
    const ai = base();
    ai.attrs = { ...ai.attrs, origin: "ai", appliedHash: sectionOwnHash(ai) };
    expect(isHumanEdited(ai)).toBe(false);
  });
});

describe("sectionNodes", () => {
  const out = (sections: Partial<SpeechDraftOutput["sections"][number]>[]): SpeechDraftOutput => ({
    strategy: { summary: "", choices: [], risks: [] },
    omitted: [],
    questions: [],
    sections: sections.map((s, i) => ({ ref: `s${i}`, parentRef: "", kind: "response", title: `S${i}`, relation: "answers", targets: [], crossApplyFrom: "", role: "", analytic: "Text.", cardIds: [], needsEvidence: "", budgetSeconds: 20, priority: 2, ...s })),
  });

  it("keeps sections whose parent is missing, and stamps each AI section's own-hash", () => {
    const nodes = sectionNodes(out([{ ref: "a" }, { ref: "b", parentRef: "ghost" }, { ref: "c", parentRef: "a", crossApplyFrom: "arg_9", priority: 1 }]), new Map(), "aop_3");
    expect(nodes).toHaveLength(2);
    const child = nodes[0].content!.find((n) => n.type === "section")!;
    expect(child.attrs!.crossApplyFrom).toBe("arg_9");
    expect(child.attrs!.priority).toBe(1);
    for (const n of nodes) expect(n.attrs!.appliedHash).toBe(sectionOwnHash(n));
  });
});

// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { editorExtensions, type BlockedReason } from "@/shared/editor/schema";
import { cardToPM, isHumanEdited, sectionOwnHash, type PMNodeJSON } from "@/shared/draft-model";
import { makeText } from "@/domain/card";
import { applyPatch, applyRevision, findSectionNode, insertSectionAt, removeSection, sectionNodes, type PatchResult } from "../proposals";
import { patchSectionId } from "@/domain/patch";
import type { ArgUnit, RoundGraph } from "@/domain/flow";
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

describe("applyPatch: only what changed, placed by code", () => {
  const a = (id: string, positionId: string, text: string): ArgUnit => ({ id, positionId, speech: "1NC", side: "neg", order: 1, text, role: "claim", cardIds: [], provenance: { type: "user_note", by: "u" }, delivery: "confirmed" });
  const g: RoundGraph = {
    ourSide: "aff",
    positions: [
      { id: "pol", kind: "da", name: "Politics DA", side: "neg", introducedIn: "1NC", order: 1 },
      { id: "cp", kind: "cp", name: "States CP", side: "neg", introducedIn: "1NC", order: 2 },
    ],
    args: [a("n1", "pol", "Plan drains capital"), a("n2", "pol", "Bill passes now"), a("n3", "pol", "Capital is key"), a("c1", "cp", "States solve"), a("c2", "cp", "Avoids federal politics")],
    relations: [],
    decisions: [],
  };
  const draftDoc = (locked = false): PMNodeJSON => ({
    type: "doc",
    content: [
      section("sec_pol", [heading("Politics DA"), section("sec_n1", [heading("1. No link", 4), para("They say capital. No link because the plan is bipartisan, so nothing is spent.")], { targets: ["n1"] })], { kind: "position", relation: "none", locked }),
      section("sec_case", [heading("Case"), para("Extend the advantage because uninsurance kills.")], { kind: "position", relation: "none" }),
    ],
  });
  type Add = PatchResult["output"]["adds"][number];
  const add = (ref: string, targets: string[], extra: Partial<Add> = {}): Add => ({ ref, parentRef: "", anchor: "", kind: "response", title: `${ref}. Answer`, relation: "answers", targets, crossApplyFrom: "", role: "", analytic: `Answer ${ref} because reasons, so it matters.`, cardIds: [], needsEvidence: "", budgetSeconds: 10, priority: 2, ...extra });
  const result = (output: Partial<PatchResult["output"]>, positions: Record<string, string>): PatchResult => ({
    kind: "patch",
    upToDate: false,
    output: { summary: "", adds: [], retargets: [], edits: [], notAddressed: [], questions: [], ...output },
    changes: { unanswered: [], uncertain: [], otherFlows: [], stale: [], vanished: [] },
    titles: {},
    addInfo: Object.fromEntries(Object.entries(positions).map(([ref, positionId]) => [ref, { positionId, where: "", seconds: 10 }])),
    editInfo: {},
    argHashes: { n1: "h1", n2: "h2", n3: "h3", c1: "hc1", c2: "hc2" },
    positionNames: { pol: "Politics DA", cp: "States CP" },
    previousSeconds: 0,
    estimatedSeconds: 0,
    limitSeconds: 480,
    checks: [],
    remaining: [],
    dropped: { targets: 0, cards: 0, duplicates: [], linksInPlace: 0 },
    run: null,
  });
  const opts = (selected: string[], extra: Partial<Parameters<typeof applyPatch>[2]> = {}) => ({ opKey: "aop_p", opId: "aop_p", selected: new Set(selected), prior: {}, cards: new Map(), graph: g, partnerSections: new Set<string>(), ...extra });
  const hashes = (ed: Editor, ids: string[]) => ids.map((id) => sectionContentHash(findSectionNode(ed as never, id)!.node.toJSON() as PMNodeJSON));
  const count = (ed: Editor, id: string) => (JSON.stringify(ed.getJSON()).match(new RegExp(`"id":"${id}"`, "g")) ?? []).length;

  it("adds one answer under its position; every other section is untouched; applying again adds nothing", () => {
    const ed = editor(draftDoc());
    const before = hashes(ed, ["sec_n1", "sec_case"]);
    const r = result({ adds: [add("a1", ["n2"])] }, { a1: "pol" });
    const out = applyPatch(ed as never, r, opts(["add:a1"]));
    expect(out["add:a1"]).toBe("applied");
    const id = patchSectionId("aop_p", "a1");
    const parent = findSectionNode(ed as never, "sec_pol")!.node;
    const kids: string[] = [];
    parent.forEach((c) => {
      if (c.type.name === "section") kids.push(String(c.attrs.id));
    });
    expect(kids).toEqual(["sec_n1", id]);
    expect(hashes(ed, ["sec_n1", "sec_case"])).toEqual(before);
    const added = findSectionNode(ed as never, id)!.node.toJSON() as PMNodeJSON;
    expect(added.attrs!.basis).toEqual({ n2: "h2" });
    expect(added.attrs!.positionId).toBe("pol");
    expect(isHumanEdited(added)).toBe(false);
    const again = applyPatch(ed as never, r, opts(["add:a1"]));
    expect(again["add:a1"]).toBe("applied");
    expect(count(ed, id)).toBe(1);
  });

  it("puts the answer right after a locked position section instead of inside it", () => {
    const ed = editor(draftDoc(true));
    applyPatch(ed as never, result({ adds: [add("a1", ["n2"])] }, { a1: "pol" }), opts(["add:a1"]));
    expect(ed.state.doc.child(0).attrs.id).toBe("sec_pol");
    expect(ed.state.doc.child(1).attrs.id).toBe(patchSectionId("aop_p", "a1"));
    expect(ed.state.doc.child(0).childCount).toBe(2);
  });

  it("gives a flow the draft doesn't engage one new position section, shared by its answers", () => {
    const ed = editor(draftDoc());
    const out = applyPatch(ed as never, result({ adds: [add("a1", ["c1"]), add("a2", ["c2"])] }, { a1: "cp", a2: "cp" }), opts(["add:a1", "add:a2"]));
    expect(out).toMatchObject({ "add:a1": "applied", "add:a2": "applied" });
    const wrapper = findSectionNode(ed as never, patchSectionId("aop_p", "pos:cp"))!.node;
    expect(wrapper.attrs.kind).toBe("position");
    expect(wrapper.firstChild!.textContent).toBe("States CP");
    const inside: string[] = [];
    wrapper.forEach((c) => {
      if (c.type.name === "section") inside.push(String(c.attrs.id));
    });
    expect(inside).toEqual([patchSectionId("aop_p", "a1"), patchSectionId("aop_p", "a2")]);
  });

  it("skips a new answer to something the draft already answers (a partner got there first)", () => {
    const ed = editor(draftDoc());
    const before = JSON.stringify(ed.getJSON());
    const out = applyPatch(ed as never, result({ adds: [add("a1", ["n1"])] }, { a1: "pol" }), opts(["add:a1"]));
    expect(out["add:a1"]).toBe("answered");
    expect(JSON.stringify(ed.getJSON())).toBe(before);
  });

  it("links are attribute-only: they work inside a locked section and stamp the basis", () => {
    const ed = editor(draftDoc(true));
    const out = applyPatch(ed as never, result({ retargets: [{ sectionId: "sec_n1", addTargets: ["n3"], removeTargets: [], reason: "same answer" }] }, {}), opts(["link:sec_n1"]));
    expect(out["link:sec_n1"]).toBe("applied");
    const n = findSectionNode(ed as never, "sec_n1")!.node;
    expect(n.attrs.targets).toEqual(["n1", "n3"]);
    expect(n.attrs.relation).toBe("group");
    expect(n.attrs.basis).toEqual({ n3: "h3" });
  });

  it("edits refuse stale sections and sections the partner is typing in", () => {
    const ed = editor(draftDoc());
    const edit = { sectionId: "sec_case", title: "Case", analytic: "Extend the advantage because uninsurance kills 26,000 people a year.", cardIds: [], reason: "sharper" };
    const r = result({ edits: [edit] }, {});
    r.editInfo = { sec_case: { baseHash: "not-the-current-hash", share: 0.3, humanEdited: false, large: false, previousSeconds: 5, seconds: 6 } };
    expect(applyPatch(ed as never, r, opts(["edit:sec_case"]))["edit:sec_case"]).toBe("stale");
    expect(applyPatch(ed as never, r, opts(["edit:sec_case"], { partnerSections: new Set(["sec_case"]) }))["edit:sec_case"]).toBe("partner");
    r.editInfo.sec_case.baseHash = hashes(ed, ["sec_case"])[0];
    expect(applyPatch(ed as never, r, opts(["edit:sec_case"]))["edit:sec_case"]).toBe("applied");
    expect(findSectionNode(ed as never, "sec_case")!.node.textContent).toContain("26,000");
  });
});

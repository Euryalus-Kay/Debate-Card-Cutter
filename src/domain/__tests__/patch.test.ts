import { describe, expect, it } from "vitest";
import { alreadyAnswered, argBasisHash, changedShare, changeSet, isUpToDate, patchSectionId, placeAnswer, type PatchSection } from "../patch";
import type { ArgUnit, Position, RoundGraph } from "../flow";
import type { SpeechId } from "../format";
import type { Draft, DraftSection } from "@/shared/draft-model";

// SYNTHETIC FIXTURE: we are aff. The 1NC read a Politics DA and a States CP; the 2AC draft answers the DA.
const pos = (id: string, kind: Position["kind"], name: string, side: "aff" | "neg" = "neg", introducedIn: SpeechId = "1NC"): Position => ({ id, kind, name, side, introducedIn, order: 1 });
const arg = (id: string, positionId: string, speech: SpeechId, side: "aff" | "neg", text: string, extra: Partial<ArgUnit> = {}): ArgUnit => ({ id, positionId, speech, side, order: 1, text, role: "claim", cardIds: [], provenance: { type: "user_note", by: "u" }, delivery: "confirmed", ...extra });

function graph(args: ArgUnit[] = []): RoundGraph {
  return {
    ourSide: "aff",
    positions: [pos("pol", "da", "Politics DA"), pos("cp", "cp", "States CP"), pos("adv", "advantage", "Advantage 1", "aff", "1AC")],
    args: [arg("n1", "pol", "1NC", "neg", "Plan drains political capital"), arg("n2", "pol", "1NC", "neg", "Bill passes now"), arg("c1", "cp", "1NC", "neg", "The fifty states should establish NHI"), ...args],
    relations: [],
    decisions: [],
  };
}

const sec = (id: string, extra: Partial<DraftSection> = {}, items: DraftSection["items"] = []): DraftSection => ({
  id,
  kind: "response",
  relation: "answers",
  targets: [],
  positionId: null,
  role: null,
  locked: false,
  owner: null,
  budgetSec: null,
  origin: "ai",
  aiOpId: null,
  appliedHash: null,
  crossApplyFrom: null,
  priority: null,
  basis: null,
  title: id,
  items: [{ type: "paragraph", text: "An answer because reasons, so it matters." }, ...items],
  ...extra,
});

function draft(opts: { lockPolitics?: boolean; basis?: Record<string, string> | null } = {}): Draft {
  const a1 = sec("s_a1", { targets: ["n1"], title: "1. No link", basis: opts.basis === undefined ? { n1: argBasisHash({ text: "Plan drains political capital" }) } : opts.basis });
  const a2 = sec("s_a2", { targets: ["n2"], title: "2. Non-unique" });
  const politics = sec("s_pol", { kind: "position", relation: "none", locked: !!opts.lockPolitics, title: "Politics DA" }, [
    { type: "section", section: a1 },
    { type: "section", section: a2 },
  ]);
  return { items: [{ type: "section", section: politics }] };
}

const patchSec = (id: string, extra: Partial<PatchSection> = {}): PatchSection => ({ id, parentId: null, title: id, kind: "response", relation: "answers", targets: [], positionId: null, basis: null, locked: false, hasChildren: false, ...extra });

describe("changeSet", () => {
  it("lists their new arguments nothing answers, and nothing else, for a line-by-line speech", () => {
    const cs = changeSet({ graph: graph(), speech: "2AC", draft: draft(), recorded: new Set() });
    expect(cs.unanswered.map((a) => a.id)).toEqual(["c1"]);
    expect(cs.stale).toEqual([]);
    expect(cs.vanished).toEqual([]);
    expect(isUpToDate(cs)).toBe(false);
  });

  it("flags an answer whose argument's words changed since it was written", () => {
    const g = graph();
    g.args[0] = { ...g.args[0], text: "Plan drains political capital with moderates" };
    const cs = changeSet({ graph: g, speech: "2AC", draft: draft(), recorded: new Set() });
    expect(cs.stale).toEqual([{ sectionId: "s_a1", title: "1. No link", argIds: ["n1"] }]);
  });

  it("flags links to arguments no longer on the flow", () => {
    const g = graph();
    g.args[1] = { ...g.args[1], delivery: "not_read" };
    const cs = changeSet({ graph: g, speech: "2AC", draft: draft({ basis: null }), recorded: new Set() });
    expect(cs.vanished).toEqual([{ sectionId: "s_a2", title: "2. Non-unique", argIds: ["n2"] }]);
  });

  it("a final rebuttal only owes answers on the flows it goes for", () => {
    const g = graph([arg("r1", "pol", "1AR", "aff", "Link turn: plan is popular"), arg("r2", "cp", "1AR", "aff", "Perm do both")]);
    g.ourSide = "neg";
    const d: Draft = { items: [{ type: "section", section: sec("s_2nr", { targets: ["n1", "r1"], title: "Politics" }) }] };
    const cs = changeSet({ graph: g, speech: "2NR", draft: d, recorded: new Set() });
    expect(cs.unanswered.map((a) => a.id)).toEqual([]);
    expect(cs.otherFlows.map((a) => a.id)).toEqual(["r2"]);
    expect(isUpToDate(cs)).toBe(true);
  });
});

describe("placeAnswer", () => {
  const g = graph([arg("n3", "pol", "1NC", "neg", "Capital is key to the bill")]);
  const nested = [patchSec("s_pol", { kind: "position", hasChildren: true }), patchSec("s_a1", { parentId: "s_pol", targets: ["n1"] }), patchSec("s_case", { kind: "position" })];

  it("goes under the section that holds that position's answers", () => {
    expect(placeAnswer(nested, g, "pol")).toEqual({ under: "s_pol" });
  });

  it("goes right after that section when it is locked", () => {
    expect(placeAnswer(nested.map((s) => (s.id === "s_pol" ? { ...s, locked: true } : s)), g, "pol")).toEqual({ after: "s_pol" });
  });

  it("follows flat drafts: after the last top-level answer on that position", () => {
    const flat = [patchSec("x1", { targets: ["n1"] }), patchSec("x2", { targets: ["n2"] }), patchSec("x3", { targets: ["c1"] })];
    expect(placeAnswer(flat, g, "pol")).toEqual({ after: "x2" });
  });

  it("a position the draft doesn't engage goes at the end; the model's anchor is only a fallback", () => {
    expect(placeAnswer(nested, g, "cp")).toEqual({ end: true });
    expect(placeAnswer(nested, g, null, "s_case")).toEqual({ under: "s_case" });
    expect(placeAnswer(nested, g, "pol", "s_case")).toEqual({ under: "s_pol" });
  });
});

describe("alreadyAnswered, changedShare, ids", () => {
  it("counts an alias as the argument it repeats", () => {
    const g = graph([arg("n1b", "pol", "1NC", "neg", "plan drains capital", { sameAs: "n1" })]);
    expect(alreadyAnswered([patchSec("s", { targets: ["n1"] })], g, ["n1b"])).toBe(true);
    expect(alreadyAnswered([patchSec("s", { targets: ["n1"] })], g, ["n1b", "n2"])).toBe(false);
    // An extension linked to their argument answers it; extending our own argument doesn't answer theirs.
    expect(alreadyAnswered([patchSec("s", { targets: ["n1"], relation: "extend" })], g, ["n1"])).toBe(true);
    const ours = graph([arg("x1", "adv", "1AC", "aff", "Uninsurance kills")]);
    expect(alreadyAnswered([patchSec("s", { targets: ["x1"], relation: "extend" })], ours, ["n1"])).toBe(false);
  });

  it("measures how much of a section an edit rewrites", () => {
    const before = "No link: the plan is funded by the states, so it never touches the federal budget fight.";
    expect(changedShare(before, before)).toBe(0);
    expect(changedShare(before, before.replace("the states", "state taxes"))).toBeLessThan(0.2);
    expect(changedShare(before, "Totally different words about something else entirely here.")).toBeGreaterThan(0.9);
  });

  it("gives an update's new sections the same id every time", () => {
    expect(patchSectionId("aop_1", "n1")).toBe(patchSectionId("aop_1", "n1"));
    expect(patchSectionId("aop_1", "n1")).not.toBe(patchSectionId("aop_2", "n1"));
    expect(patchSectionId("aop_1", "n1")).toMatch(/^sec_[0-9a-f]{14}$/);
  });
});

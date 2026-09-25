import { describe, expect, it } from "vitest";
import { validateExtraction, type ExtractArgOut, type ExtractLineOut } from "../flow-extract";
import type { ArgUnit, Position } from "../flow";

// SYNTHETIC FIXTURE
const positions: Position[] = [{ id: "pos_pol", kind: "da", name: "Politics DA", side: "neg", introducedIn: "1NC", order: 1 }];
const existing: ArgUnit[] = [
  { id: "arg_doc1", positionId: "pos_pol", speech: "2NC", side: "neg", order: 1, text: "Bill passes now — whip count shows 218 votes", role: "uniqueness", cardIds: [], provenance: { type: "document", documentId: "d1" }, delivery: "documented" },
];
const lines = [
  { n: 1, key: "k", line: 0, text: "1. uq - bill passes now, whip count shows 218 votes" },
  { n: 2, key: "k", line: 1, text: "2. LT - plan is popular so it helps the bill" },
  { n: 3, key: "k", line: 2, text: "Roadmap politics then case" },
  { n: 4, key: "k", line: 3, text: "perm doesn't solve the net benefit, and condo is fine" },
];
const arg = (a: Partial<ExtractArgOut>): ExtractArgOut => ({ quote: "", text: "", warrant: "", role: "claim", evidence: "analytic", label: "", positionId: "pos_pol", newPositionName: "", newPositionKind: "", answers: [], confidence: 0.9, ...a });
const line = (l: Partial<ExtractLineOut>): ExtractLineOut => ({ line: 1, action: "create", category: "", sameAs: "", args: [], ...l });
const run = (outLines: ExtractLineOut[]) => validateExtraction({ lines, positions, existing, ours: new Set(["aff_1"]) }, { lines: outLines });

describe("validateExtraction", () => {
  it("rejects arguments whose quote isn't in the line", () => {
    const r = run([line({ line: 2, args: [arg({ quote: "the plan saves the economy", text: "plan saves economy" })] })]);
    expect(r.lines).toHaveLength(0);
    expect(r.rejected[0].reason).toMatch(/no argument quoted/);
  });

  it("keeps the debater's words when the AI adds its own claims", () => {
    const r = run([line({ line: 2, args: [arg({ quote: "LT - plan is popular so it helps the bill", text: "Link turn: the plan's popularity with moderate senators builds political capital for passage", role: "link_turn" })] })]);
    expect(r.lines[0].args[0].text).toBe("LT - plan is popular so it helps the bill");
    expect(r.lines[0].args[0].aiReading).toMatch(/political capital/);
    expect(r.lines[0].args[0].role).toBe("link_turn");
  });

  it("aliases a line that repeats an argument already on the flow", () => {
    const r = run([line({ line: 1, args: [arg({ quote: "uq - bill passes now, whip count shows 218 votes", text: "uq - bill passes now, whip count shows 218 votes", role: "uniqueness", label: "1" })] })]);
    expect(r.lines[0].args[0].sameAs).toBe("arg_doc1");
  });

  it("splits a line into up to three arguments that each quote it", () => {
    const r = run([line({ line: 4, args: [arg({ quote: "perm doesn't solve the net benefit", text: "perm doesn't solve the net benefit", role: "perm" }), arg({ quote: "condo is fine", text: "condo is fine", role: "theory" })] })]);
    expect(r.lines[0].args.map((a) => a.role)).toEqual(["perm", "theory"]);
  });

  it("refuses lines the quotes barely cover, unknown lines, and dangling same_as", () => {
    const r = run([
      line({ line: 4, args: [arg({ quote: "condo", text: "condo", role: "theory" })] }),
      line({ line: 99, action: "not_argument", category: "roadmap" }),
      line({ line: 2, action: "same_as", sameAs: "ghost" }),
      line({ line: 3, action: "not_argument", category: "roadmap" }),
    ]);
    expect(r.lines.map((l) => [l.n, l.action])).toEqual([[3, "not_argument"]]);
    expect(r.rejected.map((x) => x.n).sort()).toEqual([2, 4, 99]);
  });

  it("only links to our arguments and clamps roles and confidence", () => {
    const r = run([line({ line: 2, args: [arg({ quote: "plan is popular so it helps the bill", text: "plan is popular so it helps the bill", role: "made_up_role", answers: ["aff_1", "not_ours"], confidence: 7 })] })]);
    const a = r.lines[0].args[0];
    expect(a.role).toBe("claim");
    expect(a.answers).toEqual(["aff_1"]);
    expect(a.confidence).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { analyticChecks, prepGuide } from "../analytic-checks";
import type { ArgUnit, Position, RoundGraph } from "../flow";
import type { SpeechId } from "../format";
import type { CheckSection } from "../speech-checks";

// SYNTHETIC FIXTURE: we are aff; the 1NC read a States CP, a Cap K, and T.
const pos = (id: string, kind: Position["kind"], name: string): Position => ({ id, kind, name, side: "neg", introducedIn: "1NC", order: 1 });
const arg = (id: string, positionId: string, text: string, extra: Partial<ArgUnit> = {}): ArgUnit => ({ id, positionId, speech: "1NC", side: "neg", order: 1, text, role: "claim", cardIds: [], provenance: { type: "user_note", by: "u" }, delivery: "confirmed", ...extra });
const graph: RoundGraph = {
  ourSide: "aff",
  positions: [pos("cp", "cp", "States CP"), pos("k", "k", "Cap K"), pos("t", "t", "T – Establish")],
  args: [arg("c1", "cp", "The fifty states should establish single payer"), arg("c2", "cp", "States solve better through experimentation", { cites: ["Bakst 15"] }), arg("k1", "k", "The aff's market logic is capitalism"), arg("t1", "t", "Establish means create a new program")],
  relations: [],
  decisions: [],
};
const sec = (id: string, extra: Partial<CheckSection> = {}): CheckSection => ({ id, title: id, relation: "answers", targets: [], role: null, crossApplyFrom: null, analytic: "", cardCites: [], parentId: null, kind: "response", ...extra });
const codes = (speech: SpeechId, sections: CheckSection[], judgeLay = false) => analyticChecks({ graph, speech, sections, judgeLay }).map((c) => c.code);

describe("analytic and block norms", () => {
  it("a 2AC CP block: perm first, three answers or more, each aimed at their words", () => {
    const sections = [
      sec("cpblock", { kind: "position", title: "States CP" }),
      sec("a1", { parentId: "cpblock", targets: ["c2"], title: "1. Solvency deficit", analytic: "Uniformity matters: patchwork coverage leaves gaps, so experimentation means people go uninsured while states test." }),
      sec("a2", { parentId: "cpblock", targets: ["c1"], role: "perm", title: "2. Perm do both", analytic: "Perm do both: the federal program plus state administration captures experimentation, so no net benefit." }),
    ];
    const c = codes("2AC", sections);
    expect(c).toContain("perm_first");
    expect(c).toContain("few_answers");
    expect(c).not.toContain("analytic_no_engagement");
  });

  it("flags thin answers, answers that ignore their words, and cites with no card behind them", () => {
    const sections = [
      sec("x", { targets: ["c2"], title: "No", analytic: "Wrong." }),
      sec("y", { targets: ["k1"], title: "1. Alt fails", analytic: "Revolution never comes because history shows reform wins, and Smith 21 proves it." }),
    ];
    const c = codes("2AC", sections);
    expect(c).toContain("analytic_thin");
    expect(c).toContain("analytic_no_engagement");
    expect(c).toContain("cite_without_card");
  });

  it("K frontlines and T answers need their standard parts", () => {
    const sections = [
      sec("kb", { kind: "position", title: "Cap K" }),
      sec("k1a", { parentId: "kb", targets: ["k1"], title: "1. Perm", role: "perm", analytic: "Perm do the aff and reject capitalism elsewhere, because markets and the alt can coexist." }),
      sec("tb", { kind: "position", title: "T – Establish" }),
      sec("t1a", { parentId: "tb", targets: ["t1"], title: "1. We meet", role: "we_meet", analytic: "We meet: the plan creates a new national program, so establish is satisfied." }),
    ];
    const c = codes("2AC", sections);
    expect(c).toContain("k_frontline");
    expect(c).toContain("t_no_counter_interp");
    expect(c).toContain("t_first");
  });

  it("final rebuttals weigh on two dimensions; lay judges get plain words; repeats are caught", () => {
    const rebuttal = [sec("w", { title: "Weigh", analytic: "Our impact is bigger in magnitude than theirs, so vote aff even if they win some of their link." })];
    expect(codes("2AR", rebuttal)).toContain("impact_calc_one_dimension");
    expect(codes("2AC", [sec("j", { title: "Non-unique", analytic: "Non-unique because the bill already failed last week in the committee vote." })], true)).toContain("lay_jargon");
    const twice = [sec("r1", { analytic: "States lack funding to run single payer because budgets must balance every year." }), sec("r2", { analytic: "States lack the funding to run single payer since their budgets must balance every year." })];
    expect(codes("2AC", twice)).toContain("repeats");
  });

  it("a 1NC shell is complete for its type", () => {
    const shell = [sec("da", { kind: "position", title: "Spending DA" }), sec("u", { parentId: "da", role: "uniqueness", analytic: "Congress is holding the line on spending now because of the debt deal." }), sec("l", { parentId: "da", role: "link", analytic: "Single payer costs trillions, so it breaks the debt deal and triggers the fight." })];
    const c = analyticChecks({ graph, speech: "1NC", sections: shell });
    expect(c.find((x) => x.code === "shell_incomplete")?.message).toContain("impact");
  });
});

describe("prep guide", () => {
  it("follows the caps by speech", () => {
    expect(prepGuide("2AC", 480, 60)).toMatchObject({ maxNowSec: 60 });
    expect(prepGuide("1NR", 480, 100)?.maxNowSec).toBe(0);
    expect(prepGuide("2AR", 480, 300)?.maxNowSec).toBe(180);
  });
});

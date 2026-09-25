import { describe, expect, it } from "vitest";
import { checkSpeech, type CheckSection } from "../speech-checks";
import { computeCoverage, droppedByThem, type ArgUnit, type Position, type RoundGraph } from "../flow";
import type { SpeechId } from "../format";

// SYNTHETIC FIXTURE: we are aff. The 1NC read a Politics DA and a States CP.
const pos = (id: string, kind: Position["kind"], name: string, side: "aff" | "neg" = "neg", introducedIn: SpeechId = "1NC"): Position => ({ id, kind, name, side, introducedIn, order: 1 });
const arg = (id: string, positionId: string, speech: SpeechId, side: "aff" | "neg", role: ArgUnit["role"], text: string, extra: Partial<ArgUnit> = {}): ArgUnit => ({ id, positionId, speech, side, order: 1, text, role, cardIds: [], provenance: { type: "user_note", by: "u" }, delivery: "confirmed", ...extra });

function graph(extraArgs: ArgUnit[] = [], relations: RoundGraph["relations"] = []): RoundGraph {
  return {
    ourSide: "aff",
    positions: [pos("pol", "da", "Politics DA"), pos("cp", "cp", "States CP"), pos("adv", "advantage", "Advantage 1", "aff", "1AC")],
    args: [
      arg("n1", "pol", "1NC", "neg", "link", "Plan drains political capital"),
      arg("n2", "cp", "1NC", "neg", "cp_text", "The fifty states should establish national health insurance"),
      arg("a1", "adv", "1AC", "aff", "impact", "Uninsurance causes 26,000 deaths a year", { cites: ["Lee 26"] }),
      ...extraArgs,
    ],
    relations,
    decisions: [],
  };
}
const section = (id: string, targets: string[], extra: Partial<CheckSection> = {}): CheckSection => ({ id, title: id, relation: "answers", targets, role: null, crossApplyFrom: null, analytic: "They are wrong because the bill already died, so there is no link.", cardCites: [], parentId: null, kind: "response", ...extra });

describe("checkSpeech", () => {
  it("2AC: every 1NC off-case position needs an answer (critical)", () => {
    const r = checkSpeech({ graph: graph(), speech: "2AC", sections: [section("s1", ["n1"])], recorded: new Set(["1AC", "1NC"]) });
    const crit = r.checks.filter((c) => c.severity === "critical");
    expect(crit.map((c) => c.code)).toEqual(["cov6_2ac_unanswered_position"]);
    expect(crit[0].message).toContain("States CP");
  });

  it("flags double turns, bare perms, and link turns without non-uniqueness", () => {
    const r = checkSpeech({
      graph: graph(),
      speech: "2AC",
      sections: [section("lt", ["n1"], { role: "link_turn" }), section("it", ["n1"], { role: "impact_turn" }), section("perm", ["n2"], { role: "perm", title: "Perm do both", analytic: "Perm do both." })],
      recorded: new Set(["1AC", "1NC"]),
    });
    const codes = r.checks.map((c) => c.code);
    expect(codes).toContain("double_turn");
    expect(codes).toContain("bare_perm");
    expect(codes).toContain("link_turn_needs_nonunique");
  });

  it("final rebuttals need impact comparison, 'even if', and a ballot sentence", () => {
    const bare = checkSpeech({ graph: graph(), speech: "2AR", sections: [section("s", ["n1"], { analytic: "Extend the advantage, it is true because the card says so." })], recorded: new Set() });
    expect(bare.checks.map((c) => c.code)).toEqual(expect.arrayContaining(["no_impact_calc", "no_even_if", "no_ballot_sentence"]));
    const good = checkSpeech({ graph: graph(), speech: "2AR", sections: [section("s", ["n1"], { analytic: "Even if they win a risk of the link, our impact outweighs on probability and timeframe, so vote aff." })], recorded: new Set() });
    expect(good.checks.map((c) => c.code)).not.toEqual(expect.arrayContaining(["no_impact_calc"]));
    expect(good.checks.map((c) => c.code)).not.toContain("no_even_if");
    expect(good.checks.map((c) => c.code)).not.toContain("no_ballot_sentence");
  });

  it("lists our arguments they dropped, safe to claim only with a full record (COV-5)", () => {
    const g = graph([arg("a2", "pol", "2AC", "aff", "non_unique", "Non-unique: the bill already failed last week in committee"), arg("b1", "pol", "2NC", "neg", "uniqueness", "Bill passes now")]);
    const partial = droppedByThem(g, "1AR", new Set(["2NC"]));
    expect(partial.find((d) => d.arg.id === "a2")).toMatchObject({ safeToClaim: false });
    const full = droppedByThem(g, "1AR", new Set(["2NC", "1NR"]));
    expect(full.find((d) => d.arg.id === "a2")).toMatchObject({ safeToClaim: true });
    const answered = droppedByThem({ ...g, relations: [{ id: "r", type: "answers", from: "b1", to: ["a2"], provenance: { type: "user_note", by: "u" }, status: "confirmed" }] }, "1AR", new Set(["2NC", "1NR"]));
    expect(answered.find((d) => d.arg.id === "a2")).toBeUndefined();
  });

  it("an extension linked to their argument answers it, and only our arguments count as extended", () => {
    const g = graph([arg("x1", "pol", "2AC", "aff", "no_link", "No link: the plan is regulation"), arg("b1", "pol", "2NC", "neg", "link", "Regulation needs staff and money")]);
    const ext = { sectionId: "s", title: "Extend no link", relation: "extend" as const, targets: ["x1", "b1"] };
    const cov = computeCoverage(g, "1AR", [ext], new Set(["2NC", "1NR"]));
    expect(cov.items.find((i) => i.arg.id === "b1")?.status).toBe("answered");
    expect(cov.extensions.map((e) => e.ours.id)).toEqual(["x1"]);
    const r = checkSpeech({ graph: g, speech: "1AR", sections: [section("s", ["x1", "b1"], { relation: "extend", title: "Extend no link", analytic: "Extend 2AC 2: the plan is regulation, not spending, so there is no link." })], recorded: new Set(["2NC", "1NR"]) });
    expect(r.checks.map((c) => c.code)).not.toContain("ext2_not_ours");
  });

  it("new arguments in rebuttals follow the format's rule", () => {
    const s = [section("n", [], { relation: "new", title: "New add-on", analytic: "A brand new advantage because reasons, so vote aff." })];
    const conventional = checkSpeech({ graph: graph(), speech: "1AR", sections: s, recorded: new Set() });
    expect(conventional.checks.map((c) => c.code)).toContain("new_in_rebuttal");
    const permissive = checkSpeech({ graph: graph(), speech: "1AR", sections: s, recorded: new Set(), newArgumentPolicy: "permissive" });
    expect(permissive.checks.map((c) => c.code)).not.toContain("new_in_rebuttal");
    const strict = checkSpeech({ graph: graph(), speech: "2AR", sections: [section("e", ["n1"], { cardCites: ["Brand New 26"] })], recorded: new Set(), newArgumentPolicy: "strict" });
    expect(strict.checks.map((c) => c.code)).toContain("new_evidence_final");
  });

  it("the 1NR isn't asked to answer what the 2NC already covered", () => {
    const g = graph([arg("x1", "pol", "2AC", "aff", "no_link", "No link"), arg("x2", "cp", "2AC", "aff", "perm", "Perm do both"), arg("c1", "pol", "2NC", "neg", "link", "Link extension")]);
    const cov1NR = computeCoverage(g, "1NR", [], new Set(["2AC", "2NC"]));
    expect(cov1NR.items.map((i) => i.arg.id)).toEqual(["x2"]);
  });
});

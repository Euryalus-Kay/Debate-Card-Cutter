import { describe, expect, it } from "vitest";
import { checkKick, computeCoverage, detectConflicts, possiblyKickedPositions, unansweredByUs, type ArgUnit, type RoundGraph } from "../flow";
import type { SpeechId } from "../format";

// SYNTHETIC FIXTURE: a small aff round (we are aff) used only for tests.
function arg(p: Partial<ArgUnit> & Pick<ArgUnit, "id" | "positionId" | "speech" | "side" | "text">): ArgUnit {
  return {
    order: 0,
    role: "claim",
    cardIds: [],
    provenance: { type: "document", documentId: "doc" },
    delivery: "confirmed",
    ...p,
  };
}

function graph(): RoundGraph {
  return {
    ourSide: "aff",
    positions: [
      { id: "adv1", kind: "advantage", name: "Adv 1 — Grid resilience", side: "aff", introducedIn: "1AC", order: 0 },
      { id: "ptx", kind: "da", name: "Politics DA", side: "neg", introducedIn: "1NC", order: 1 },
      { id: "cp", kind: "cp", name: "States CP", side: "neg", introducedIn: "1NC", order: 2 },
      { id: "t", kind: "t", name: "T — Substantial", side: "neg", introducedIn: "1NC", order: 3 },
    ],
    args: [
      arg({ id: "a1", positionId: "adv1", speech: "1AC", side: "aff", text: "Grid attacks cause cascading blackouts" }),
      arg({ id: "n1", positionId: "ptx", speech: "1NC", side: "neg", text: "PC is key to the bill", role: "uniqueness" }),
      arg({ id: "n2", positionId: "cp", speech: "1NC", side: "neg", text: "States solve", role: "solvency" }),
      arg({ id: "n3", positionId: "t", speech: "1NC", side: "neg", text: "Substantial means 10%", role: "interpretation" }),
      arg({ id: "a2", positionId: "ptx", speech: "2AC", side: "aff", text: "Non-unique: bill already dead", role: "uniqueness" }),
      arg({ id: "a3", positionId: "cp", speech: "2AC", side: "aff", text: "Perm do both", role: "perm" }),
      // Block: 2NC goes for politics + CP, 1NR takes case; T not extended.
      arg({ id: "b1", positionId: "ptx", speech: "2NC", side: "neg", text: "Bill alive — whip counts", role: "uniqueness" }),
      arg({ id: "b2", positionId: "ptx", speech: "2NC", side: "neg", text: "Link: plan costs PC", role: "link" }),
      arg({ id: "b3", positionId: "cp", speech: "2NC", side: "neg", text: "Perm severs federal action", role: "theory" }),
      arg({ id: "b4", positionId: "adv1", speech: "1NR", side: "neg", text: "Grid is resilient — redundancy", role: "defense" }),
      arg({ id: "b5", positionId: "adv1", speech: "1NR", side: "neg", text: "Cards in doc not read", delivery: "not_read" }),
      arg({
        id: "b6",
        positionId: "adv1",
        speech: "1NR",
        side: "neg",
        text: "Maybe an alt cause argument",
        provenance: { type: "ai_inferred", confidence: 0.3 },
        delivery: "documented",
      }),
    ],
    relations: [
      { id: "r1", type: "answers", from: "b1", to: ["a2"], provenance: { type: "ai_inferred", confidence: 0.9 }, status: "confirmed" },
      { id: "r2", type: "answers", from: "b3", to: ["a3"], provenance: { type: "document", documentId: "doc" }, status: "confirmed" },
      { id: "r3", type: "answers", from: "a2", to: ["n1"], provenance: { type: "document", documentId: "doc" }, status: "confirmed" },
      { id: "r4", type: "answers", from: "a3", to: ["n2"], provenance: { type: "document", documentId: "doc" }, status: "confirmed" },
      { id: "r5", type: "answers", from: "b4", to: ["a1"], provenance: { type: "document", documentId: "doc" }, status: "confirmed" },
    ],
    decisions: [],
  };
}

const allRecorded = new Set<SpeechId>(["1AC", "1NC", "2AC", "2NC", "1NR"]);

describe("computeCoverage (1AR)", () => {
  it("lists block arguments, skips not-read cards, and marks low-confidence items uncertain", () => {
    const rep = computeCoverage(graph(), "1AR", [], allRecorded);
    const ids = rep.items.map((i) => i.arg.id);
    expect(ids).toEqual(["b4", "b6", "b1", "b2", "b3"]);
    expect(rep.items.find((i) => i.arg.id === "b6")!.status).toBe("uncertain");
    expect(rep.counts.unanswered).toBe(4);
  });

  it("derives status only from draft links and explicit decisions", () => {
    const g = graph();
    g.decisions.push({ id: "d1", speech: "1AR", kind: "deprioritize", targets: ["b4"], reason: "Adv 2 outweighs; spend time on politics" });
    const rep = computeCoverage(
      g,
      "1AR",
      [
        { sectionId: "s1", title: "Politics — uniqueness", relation: "answers", targets: ["b1"] },
        { sectionId: "s2", title: "Politics — link group", relation: "group", targets: ["b2", "b3"] },
        { sectionId: "s3", title: "Extend non-unique", relation: "extend", targets: ["a2"] },
      ],
      allRecorded,
    );
    const st = Object.fromEntries(rep.items.map((i) => [i.arg.id, i.status]));
    expect(st).toMatchObject({ b1: "answered", b2: "grouped", b3: "grouped", b4: "deprioritized", b6: "uncertain" });
    const ext = rep.extensions.find((e) => e.ours.id === "a2")!;
    expect(ext.against.map((a) => a.id)).toEqual(["b1"]);
    expect(ext.extendedBy).toEqual(["s3"]);
  });

  it("warns about missing records instead of treating them as concessions", () => {
    const rep = computeCoverage(graph(), "1AR", [], new Set<SpeechId>(["1AC", "1NC", "2AC", "2NC"]));
    expect(rep.recordWarnings.join(" ")).toContain("1NR");
  });
});

describe("possiblyKickedPositions", () => {
  it("reports T as possibly kicked only when the block is recorded", () => {
    const g = graph();
    expect(possiblyKickedPositions(g, "1AR", allRecorded)).toEqual([{ position: g.positions[3], certain: true }]);
    expect(possiblyKickedPositions(g, "1AR", new Set<SpeechId>(["1NC", "2NC"]))[0].certain).toBe(false);
  });
});

describe("unansweredByUs", () => {
  it("does not call an argument dropped when our answering speech has no record", () => {
    const g = graph();
    // T (n3) was never answered by the 2AC in this fixture.
    const withRecord = unansweredByUs(g, "1AR", allRecorded).find((x) => x.arg.id === "n3")!;
    expect(withRecord.safeToClaimDropped).toBe(true);
    const noRecord = unansweredByUs(g, "1AR", new Set<SpeechId>(["1AC", "1NC"])).find((x) => x.arg.id === "n3")!;
    expect(noRecord.safeToClaimDropped).toBe(false);
  });
});

describe("detectConflicts (Snider Table K1)", () => {
  const g = graph();
  const planned = (roles: string[]): ArgUnit[] =>
    roles.map((role, i) => arg({ id: `p${i}`, positionId: "ptx", speech: "2AC", side: "aff", text: role, role: role as ArgUnit["role"], delivery: "planned" }));

  it("flags a double turn as an error", () => {
    expect(detectConflicts(g, "aff", planned(["link_turn", "impact_turn"])).map((c) => c.code)).toContain("double_turn");
  });

  it("treats non-unique + link turn as the standard straight-turn package (no conflict)", () => {
    const codes = detectConflicts(g, "aff", planned(["link_turn", "non_unique"])).map((c) => c.code);
    expect(codes).not.toContain("double_turn");
    expect(codes).not.toContain("link_turn_vs_defense");
    expect(codes).not.toContain("link_turn_needs_nonunique");
  });

  it("warns that non-unique makes an impact turn kickable", () => {
    expect(detectConflicts(g, "aff", planned(["impact_turn", "non_unique"])).map((c) => c.code)).toContain("impact_turn_vs_defense");
  });

  it("does not treat impact mitigation as undercutting an impact turn", () => {
    expect(detectConflicts(g, "aff", planned(["impact_turn", "impact_mitigation"])).map((c) => c.code)).not.toContain("impact_turn_vs_defense");
  });

  it("reminds that a lone link turn needs non-uniqueness", () => {
    expect(detectConflicts(g, "aff", planned(["link_turn"])).map((c) => c.code)).toContain("link_turn_needs_nonunique");
  });
});

describe("checkKick", () => {
  it("errors when the neg kicks a turned DA by conceding non-uniqueness", () => {
    const g = graph();
    g.args.push(
      arg({ id: "t1", positionId: "ptx", speech: "2AC", side: "aff", text: "Plan builds PC", role: "link_turn" }),
      arg({ id: "nu", positionId: "ptx", speech: "2AC", side: "aff", text: "Bill already dead", role: "non_unique" }),
      arg({ id: "nil", positionId: "ptx", speech: "2AC", side: "aff", text: "Bill won't matter", role: "no_internal_link" }),
    );
    const bad = checkKick(g, "neg", "ptx", ["nu"]);
    expect(bad[0].code).toBe("kick_concession_does_not_neutralize");
    expect(checkKick(g, "neg", "ptx", ["nil"])).toEqual([]);
  });
});

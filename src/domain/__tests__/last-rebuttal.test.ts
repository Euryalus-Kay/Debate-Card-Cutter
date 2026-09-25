import { describe, expect, it } from "vitest";
import type { ArgUnit, RoundGraph } from "../flow";
import type { SpeechId } from "../format";
import { lastRebuttalScores } from "../last-rebuttal";

// SYNTHETIC FIXTURE: a neg round (we are neg) at the 2NR.
function arg(p: Partial<ArgUnit> & Pick<ArgUnit, "id" | "positionId" | "speech" | "side" | "text">): ArgUnit {
  return { order: 0, role: "claim", cardIds: [], provenance: { type: "document", documentId: "doc" }, delivery: "confirmed", ...p };
}
const answers = (id: string, from: string, to: string[]) => ({ id, type: "answers" as const, from, to, provenance: { type: "document" as const, documentId: "doc" }, status: "confirmed" as const });

function graph(): RoundGraph {
  return {
    ourSide: "neg",
    positions: [
      { id: "da", kind: "da", name: "Deficits DA", side: "neg", introducedIn: "1NC", order: 0 },
      { id: "cp", kind: "cp", name: "States CP", side: "neg", introducedIn: "1NC", order: 1 },
      { id: "t", kind: "t", name: "T — Establish", side: "neg", introducedIn: "1NC", order: 2 },
    ],
    args: [
      arg({ id: "d1", positionId: "da", speech: "1NC", side: "neg", text: "Spending increases deficits and interest rates", role: "link", cites: ["Lee 26"] }),
      arg({ id: "d2", positionId: "da", speech: "2NC", side: "neg", text: "Interest rates spike, crowding out private investment", role: "internal_link", cites: ["Park 25"] }),
      arg({ id: "c1", positionId: "cp", speech: "1NC", side: "neg", text: "The fifty states should establish health insurance", role: "cp_text" }),
      arg({ id: "c2", positionId: "cp", speech: "2NC", side: "neg", text: "States solve because they already run Medicaid", role: "solvency", cites: ["Ruiz 24"] }),
      arg({ id: "t1", positionId: "t", speech: "1NC", side: "neg", text: "Establish means to create a new program, and theirs expands one", role: "interpretation" }),
      // The 2AC answered the DA's link and turned it; the 1AR extended the turn. Nobody answered the internal link.
      arg({ id: "a1", positionId: "da", speech: "2AC", side: "aff", text: "No link: savings offset the cost", role: "no_link" }),
      arg({ id: "a2", positionId: "da", speech: "1AR", side: "aff", text: "Link turn: healthier workers raise growth and revenue", role: "link_turn" }),
      arg({ id: "a3", positionId: "cp", speech: "2AC", side: "aff", text: "Perm do both", role: "perm" }),
    ],
    relations: [answers("r1", "a1", ["d1"]), answers("r2", "a2", ["d1"]), answers("r3", "c2", ["a3"])],
    decisions: [],
  };
}

const recorded = new Set<SpeechId>(["1AC", "1NC", "2AC", "2NC", "1NR", "1AR"]);

describe("what to go for in the 2NR", () => {
  it("ranks positions by what's still ours and what of theirs is open, and marks what the block didn't extend", () => {
    const s = lastRebuttalScores(graph(), "2NR", recorded);
    const byName = Object.fromEntries(s.map((x) => [x.position.name, x]));
    // T wasn't extended in the block: not available.
    expect(byName["T — Establish"].available).toBe(false);
    expect(s[s.length - 1].position.name).toBe("T — Establish");
    // The DA: its internal link went unanswered, but their link turn is still open.
    expect(byName["Deficits DA"].dropped.map((d) => d.arg.id)).toContain("d2");
    expect(byName["Deficits DA"].theirTurns.map((a) => a.id)).toEqual(["a2"]);
    expect(byName["Deficits DA"].reasons.join(" ")).toMatch(/turn is still unanswered/);
    // The CP: everything they said has an answer, so it ranks first.
    expect(s[0].position.name).toBe("States CP");
    expect(byName["States CP"].theirOpen).toEqual([]);
  });
});

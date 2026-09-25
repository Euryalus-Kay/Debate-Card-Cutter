import { describe, expect, it } from "vitest";
import { guessRole, parseHeard } from "../heard-parse";
import type { Position } from "../flow";

// SYNTHETIC FIXTURE: shorthand a debater might type during a 2NC.
const lines = [
  "Roadmap: politics then case",
  "Politics DA",
  "1. uq - bill passes now, whip count (Lee 26)",
  "2. LT - plan is popular so no link turn (analytic)",
  "B) perm doesn't solve the net benefit",
  "Case",
  "alt causes - china",
  "??",
].map((text, line) => ({ key: "heard:2NC:u1", line, text }));

const politics: Position = { id: "pos_pol", kind: "da", name: "Politics DA", side: "neg", introducedIn: "1NC", order: 1 };

describe("parseHeard (no AI)", () => {
  it("turns headers, labels, roles, and cites into flow units without inventing text", () => {
    const out = parseHeard(lines, { positions: [politics] });
    const byLine = new Map(out.map((o) => [o.line, o]));
    expect(byLine.get(0)).toMatchObject({ action: "not_argument", category: "roadmap" });
    expect(byLine.get(1)).toMatchObject({ action: "not_argument", category: "header", position: { id: "pos_pol" } });
    expect(byLine.get(2)!.args[0]).toMatchObject({ label: "1", role: "uniqueness", evidence: "card", cite: "Lee 26" });
    expect(byLine.get(2)!.position).toEqual({ id: "pos_pol" });
    expect(byLine.get(3)!.args[0]).toMatchObject({ label: "2", role: "link_turn", evidence: "analytic" });
    expect(byLine.get(4)!.args[0]).toMatchObject({ label: "B", role: "perm" });
    expect(byLine.get(5)).toMatchObject({ category: "header", position: { name: "Case", kind: "case_other" } });
    expect(byLine.get(6)!.position).toEqual({ name: "Case", kind: "case_other" });
    expect(byLine.get(7)).toMatchObject({ action: "not_argument", category: "filler" });
    // Every argument's quote is the typed line (minus its label): nothing added.
    for (const o of out) for (const a of o.args) expect(lines[o.line].text).toContain(a.quote);
  });

  it("keeps the current position across batches", () => {
    const out = parseHeard([{ key: "k", line: 9, text: "3. no link - plan is bipartisan" }], { positions: [politics], current: { id: "pos_pol" } });
    expect(out[0]).toMatchObject({ action: "create", position: { id: "pos_pol" } });
    expect(out[0].args[0].role).toBe("no_link");
  });

  it("recognizes common roles from shorthand", () => {
    expect(guessRole("nu - already passed")).toBe("non_unique");
    expect(guessRole("condo bad - 3 condo")).toBe("theory");
    expect(guessRole("we meet - plan is a tax")).toBe("we_meet");
    expect(guessRole("c/i - establish means create")).toBe("counter_interpretation");
    expect(guessRole("case outweighs - timeframe")).toBe("impact_calc");
    expect(guessRole("they're just wrong")).toBe("claim");
  });
});

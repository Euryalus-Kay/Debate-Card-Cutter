import { describe, expect, it } from "vitest";
import { alignRead, applyReadPlan, tokenizeBody } from "../align";
import { makeText, readAloud } from "../card";
import { highlightMetrics } from "../highlight-metrics";

// SYNTHETIC FIXTURE
const para1 = "The report finds that the new rules will not raise costs for small farms. Instead, the rules cut paperwork and the rules save money.";
const para2 = "Critics say the rules hurt farms, but the data show the opposite: farm income rose 12% after adoption.";
const body = () => [makeText(para1), makeText(para2, { newParagraph: true })];

describe("read-aloud alignment", () => {
  it("places repeated words next to their phrase (fewest fragments)", () => {
    const toks = tokenizeBody(body());
    const a = alignRead(toks, "the rules save money");
    expect(a.unmatched).toEqual([]);
    expect(a.fragments).toBe(1);
    const words = a.matched.map((i) => toks[i]);
    expect(para1.slice(words[0].start, words[words.length - 1].end)).toBe("the rules save money");
  });

  it("refuses words that are not in the card (text is never changed)", () => {
    const a = alignRead(tokenizeBody(body()), "the rules dramatically save money");
    expect(a.unmatched).toEqual(["dramatically"]);
  });

  it("keeps order: a word earlier in the card can't be read later", () => {
    const a = alignRead(tokenizeBody(body()), "farm income rose report");
    expect(a.unmatched).toEqual(["report"]);
  });

  it("builds highlight and underline spans that read back exactly", () => {
    const r = applyReadPlan(body(), {
      readLong: "the new rules will not raise costs for small farms the rules cut paperwork farm income rose 12% after adoption",
      readShort: "rules will not raise costs rules cut paperwork farm income rose 12%",
      emphasis: ["not raise costs"],
    });
    expect(r.unmatchedShort).toEqual([]);
    expect(readAloud(r.body).text).toBe("rules will not raise costs rules cut paperwork farm income rose 12%");
    // highlight ⊆ underline
    for (const b of r.body) for (const h of b.highlight) expect(b.underline.some((u) => u.start <= h.start && u.end >= h.end)).toBe(true);
    expect(r.body[0].emphasis.length).toBe(1);
  });

  it("adds back a skipped negation so the meaning can't flip", () => {
    const r = applyReadPlan(body(), { readLong: "", readShort: "the new rules will raise costs for small farms", emphasis: [] });
    expect(r.protectedWords).toContain("not");
    expect(readAloud(r.body).text).toContain("will not raise costs");
  });

  it("produces metrics that reflect choppiness", () => {
    const smooth = applyReadPlan(body(), { readLong: "", readShort: "the rules cut paperwork and the rules save money", emphasis: [] });
    const choppy = applyReadPlan(body(), { readLong: "", readShort: "report rules costs farms paperwork money", emphasis: [] });
    expect(highlightMetrics(choppy.body).fragments).toBeGreaterThan(highlightMetrics(smooth.body).fragments);
  });
});

// SYNTHETIC FIXTURES (docs/research/highlighting.md §5, invented passages; plus our own regression cases).
const card = (...paras: string[]) => paras.map((p, i) => makeText(p, i ? { newParagraph: true } : {}));
const read = (paras: string[], readShort: string) => {
  const r = applyReadPlan(card(...paras), { readLong: "", readShort, emphasis: [] });
  return { ...r, text: readAloud(r.body).text };
};
const STEEL = "Some analysts argue that expanding tariff exemptions would revive domestic steel production. The record does not support that claim. Plants that received exemptions in 2019 did not increase output; at most, they delayed layoffs by a few months. The main effect of a broad exemption would be not new hiring but lower input prices for manufacturers that buy steel.";

describe("meaning protection (research checks H-4, H-5, H-7, H-8, H-9)", () => {
  it("H-7: restores a negator whose governed word is read", () => {
    const r = read([STEEL], "Plants that received exemptions did increase output");
    expect(r.text).toContain("did not increase output");
  });

  it("H-7: skipping the rejected half of 'not X but Y' is faithful and stays skipped", () => {
    const r = read([STEEL], "The main effect of a broad exemption would be lower input prices for manufacturers");
    expect(r.protectedWords).not.toContain("not");
    expect(r.text).toBe("The main effect of a broad exemption would be lower input prices for manufacturers");
  });

  it("H-7: a negator inside a skipped 'X, not Y' aside is not pulled into the read", () => {
    const r = read(["The solution is regulation, not subsidies, because markets fail."], "The solution is regulation because markets fail");
    expect(r.text).not.toContain("not");
  });

  it("H-8: a hedge inside a skipped clause is not pulled into the read", () => {
    const r = read(["The plan, which would cost $5 billion, solves warming."], "The plan solves warming");
    expect(r.protectedWords).toEqual([]);
    expect(r.text).toBe("The plan solves warming");
  });

  it("H-8: restores a modal before the verb it governs, with its helper words", () => {
    const sat = "That dependence creates a vulnerability adversaries could exploit: a single targeted disruption could stall replenishment of military and civilian constellations alike.";
    expect(read([sat], "dependence creates a vulnerability disruption stall constellations").text).toContain("disruption could stall");
    expect(read(["Regulators might have sued the firm."], "Regulators sued the firm").text).toBe("Regulators might have sued the firm");
  });

  it("H-8: 'most if not all' keeps its weaker bound", () => {
    expect(read(["Most if not all states have adopted the rule."], "all states have adopted the rule").text).toBe("Most if not all states have adopted the rule");
  });

  it("H-8: 'not only … but also' may be skipped", () => {
    const r = read(["The policy not only cuts costs but also saves lives."], "The policy cuts costs but also saves lives");
    expect(r.text).toBe("The policy cuts costs but also saves lives");
  });

  it("H-9: a read number keeps its bound, magnitude, and symbol", () => {
    const ports = "According to the agency's own estimate, the new screening rule could reduce wait times at land ports of entry by as much as 40 percent, although officials cautioned that gains may be smaller at crossings with limited staffing. In a pilot at two ports, average waits fell from 52 minutes to 38 minutes.";
    const r = read([ports], "the new screening rule could reduce wait times at land ports 40 percent average waits fell to 38 minutes");
    expect(r.text).toContain("as much as 40 percent");
    expect(r.notes.map((n) => n.code)).toEqual(expect.arrayContaining(["limit_skipped", "baseline_skipped"]));
    expect(read(["Spending rose to $40 billion, up 12% from last year."], "Spending rose to 40 up 12").text).toBe("Spending rose to $40 billion, up 12%");
  });

  it("H-5: a skipped adjective comes back when the article no longer fits", () => {
    expect(read(["The report found a sharp increase in costs."], "The report found a increase in costs").text).toBe("The report found a sharp increase in costs");
    expect(read(["The report found an unexpected fall in costs."], "The report found an unexpected fall in costs").protectedWords).toEqual([]);
  });

  it("H-4: a read sentence doesn't stop on 'of' / 'the' mid-phrase", () => {
    const r = read(["Tensions will grow as the rise of China continues. Conflict is likely."], "Tensions will grow as the rise of Conflict is likely");
    expect(r.trimmedWords).toEqual(["of"]);
    expect(r.text).toBe("Tensions will grow as the rise Conflict is likely");
  });

  it("H-10: flags reading a view the author attributes to others and then rebuts", () => {
    const r = read([STEEL], "expanding tariff exemptions would revive domestic steel production");
    const n = r.notes.find((x) => x.code === "attribution_skipped");
    expect(n?.strawMan).toBe(true);
  });

  it("H-10: reads the attribution when the author's rebuttal is read too", () => {
    const r = read([STEEL], "expanding tariff exemptions would revive domestic steel production. The record does not support that claim");
    expect(r.text.startsWith("Some analysts argue that expanding tariff exemptions")).toBe(true);
    expect(r.notes.some((n) => n.code === "attribution_skipped")).toBe(false);
  });

  it("leaves a faithful, fully read passage alone", () => {
    const good = "Plants that received exemptions in 2019 did not increase output";
    const r = read([STEEL], good);
    expect(r.protectedWords).toEqual([]);
    expect(r.text).toBe(good);
  });
});

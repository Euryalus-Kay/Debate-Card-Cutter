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
    expect(readAloud(r.body).text).toBe("rules will not raise costs rules cut paperwork farm income rose 12");
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

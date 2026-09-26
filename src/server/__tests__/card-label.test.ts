/**
 * Library labels (synthetic cards, invented text): suggested tags only for tags that need one, and every
 * claim or suggestion checked against the card's own words.
 */
import { describe, expect, it } from "vitest";
import { makeText } from "@/domain/card";
import { retagProblems } from "@/domain/span-check";
import { checkLabel, unclearTag } from "@/server/library/label";
import type { CardMeta } from "@/domain/card-label";

describe("unclearTag", () => {
  it("flags pointers, extension labels, short labels and re-read notes; not claims", () => {
    for (const t of ["Extend Shepherd 22", "That turns the economy", "AND by impeachment.", "It’s the top issue in every competitive house race.", "*NHI It’s the highest priority for 2028.", "Ext", "Card 2", "Invented claim <<<1NC Jackson>>>"]) expect(unclearTag(t)).toBe(true);
    for (const t of ["Public option saves the GOP in the midterm.", "Single payer cuts administrative costs because one payer negotiates every price"]) expect(unclearTag(t)).toBe(false);
  });
});

describe("label checks", () => {
  const body = [makeText("Invented text: Democrats will win the senate this fall, and Trump’s approval keeps falling in every invented poll we ran.", { underline: [{ start: 0, end: 40 }] })];
  const base: CardMeta = { side: "neg", argType: "disad", position: "Midterms DA", role: "uniqueness", claim: "", by: "ai" };

  it("names: same stem and curly apostrophes count; a name the card lacks does not", () => {
    const text = "Democrats will win the senate this fall, and Trump’s approval keeps falling";
    expect(retagProblems("Democratic gains in the Senate as Trump's approval falls", { tag: "x", text })).toEqual([]);
    expect(retagProblems("The GOP loses the Senate", { tag: "x", text }).join(" ")).toMatch(/GOP/);
  });

  it("keeps a faithful claim; drops a claim or suggested tag with a number or name the card doesn't have", () => {
    const ok = checkLabel({ ...base, claim: "Democrats are on track to win the Senate as Trump's approval falls." }, { tag: "Dems win now", body });
    expect(ok.claim).not.toBe("");
    const bad = checkLabel({ ...base, claim: "Democrats lead by 12 points.", suggestedTag: "The Senate goes to Harris" }, { tag: "Dems win now", body });
    expect(bad.claim).toBe("");
    expect(bad.suggestedTag).toBeUndefined();
    expect(bad.dropped?.length).toBe(2);
  });

  it("a 'use' line may name positions and speeches from the file, but no new numbers", () => {
    const ok = checkLabel({ ...base, use: "2NC uniqueness extension on the Midterms DA" }, { tag: "Dems win now", body, path: ["Midterms DA", "UQ---2NC"] });
    expect(ok.use).toBeDefined();
    const bad = checkLabel({ ...base, use: "2NC extends card 17 on the Midterms DA" }, { tag: "Dems win now", body, path: ["Midterms DA"] });
    expect(bad.use).toBeUndefined();
  });
});

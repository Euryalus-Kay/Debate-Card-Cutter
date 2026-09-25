import { describe, expect, it } from "vitest";
import { citesIn, spanWarnings, stripIds } from "../span-check";

describe("AI edits of selected words", () => {
  it("finds author-year citations in the forms debaters write them", () => {
    expect(citesIn("Extend Lee 26 and Smith '19; also Creed et al. 2017 (Roper 2015).")).toEqual(["lee 26", "smith 19", "creed 17", "roper 15"]);
  });

  it("flags an author or a number the section, its cards, and the flow don't contain", () => {
    const allowed = "Extend Lee 26: uninsurance kills 26,000 people a year.";
    expect(spanWarnings({ replacement: "Lee 26 proves 26,000 deaths a year, so extend it.", allowed })).toEqual([]);
    const w = spanWarnings({ replacement: "Smith 21 says 45,000 die every year.", allowed });
    expect(w).toHaveLength(2);
    expect(w[0]).toContain("Smith 21");
    expect(w[1]).toContain("45000");
  });

  it("never shows internal ids to debaters", () => {
    expect(stripIds("The strongest is cross-border streams (2AC 3, dl_ope0cwn7_sec_7kvvwrmiv9a): upstream states won't act.")).toBe("The strongest is cross-border streams (2AC 3): upstream states won't act.");
    expect(stripIds("Answer [ha_hm_9e0f593f_0] directly, then extend arg_mugrqxp1qhr4832nio8c.")).toBe("Answer directly, then extend.");
    expect(stripIds("Extend 2AC 4 and the Lee 26 card.")).toBe("Extend 2AC 4 and the Lee 26 card.");
  });
});

import { retagProblems } from "../span-check";

describe("retagProblems (new tags for library cards)", () => {
  // SYNTHETIC card text.
  const card = { tag: "Capital is spent", text: "Rivera 25 reports the health bill is dead in committee because political capital was spent on the budget fight in March, and 62 senators oppose it." };
  it("allows a tag that says what the card's words say", () => {
    expect(retagProblems("Political capital is already spent — the health bill is dead in committee", card)).toEqual([]);
    expect(retagProblems("No link — the plan can't cost capital that was already spent on the budget", card)).toEqual([]);
    expect(retagProblems("Perm solves: 62 senators oppose the bill regardless", card)).toEqual([]);
  });
  it("refuses a new number, author, or name the card lacks", () => {
    expect(retagProblems("80 senators oppose the bill", card).join(" ")).toMatch(/80/);
    expect(retagProblems("Capital is spent — Lee 24 agrees", card).join(" ")).toMatch(/Lee 24/);
    expect(retagProblems("The bill is dead because China lobbied against it", card).join(" ")).toMatch(/China/);
  });
});

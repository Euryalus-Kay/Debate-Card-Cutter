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

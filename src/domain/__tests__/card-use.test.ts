import { describe, expect, it } from "vitest";
import { CARD_USE, cardUseFor } from "../card-use";

describe("card use", () => {
  it("maps each speech to its cutting norm", () => {
    expect(cardUseFor("1AC")).toBe("1AC");
    expect(cardUseFor("2NC")).toBe("block");
    expect(cardUseFor("1NR")).toBe("block");
    expect(cardUseFor("1AR")).toBe("1AR");
    expect(cardUseFor("2AR")).toBe("rebuttal");
  });
  it("later speeches read fewer words from shorter cards (measured medians)", () => {
    expect(CARD_USE["1AC"].readWords).toBeGreaterThan(CARD_USE["2AC"].readWords);
    expect(CARD_USE["2AC"].readWords).toBeGreaterThan(CARD_USE["1AR"].readWords);
    expect(CARD_USE["1AC"].excerptWords[1]).toBeGreaterThan(CARD_USE["1AR"].excerptWords[1]);
  });
});

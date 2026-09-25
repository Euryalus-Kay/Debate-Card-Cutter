import { describe, expect, it } from "vitest";
import { assessRead as assess } from "../highlight";

describe("assessRead tolerance", () => {
  const m = (readWords: number) => ({ readWords, fragments: 4, fragmentsPer100: 10, oneWordFragmentShare: 0, readRatio: 0.14 }) as never;
  it("holds a known speech's target closer", () => {
    expect(assess(m(70), 57, { unmatchedShort: [], notes: [] }).some((i) => i.code === "too_long")).toBe(false);
    expect(assess(m(70), 57, { unmatchedShort: [], notes: [] }, {}, 0.2).some((i) => i.code === "too_long")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { costOf } from "@/server/ai/cost";

describe("costOf", () => {
  it("prices fresh input, cache reads and writes, and output (AI SDK 7 usage shape)", () => {
    const c = costOf("claude-sonnet-5", { inputTokens: 3077, outputTokens: 874, inputTokenDetails: { noCacheTokens: 1994, cacheReadTokens: 1083, cacheWriteTokens: 0 } });
    expect(c).toBeCloseTo((1994 * 2 + 1083 * 0.2 + 874 * 10) / 1e6, 8);
  });
  it("handles the older usage shape, and unknown models", () => {
    expect(costOf("claude-haiku-4-5", { inputTokens: 1000, outputTokens: 100, cachedInputTokens: 400 })).toBeCloseTo((600 * 1 + 400 * 0.1 + 100 * 5) / 1e6, 8);
    expect(costOf("some-other-model", { inputTokens: 10 })).toBeNull();
  });
});

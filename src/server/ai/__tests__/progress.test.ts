import { describe, expect, it, vi } from "vitest";
import { formatEta, median, remainingMs, type Progress } from "@/domain/progress";
import { draftProgress, patchProgress } from "@/server/ai/progress";

describe("progress math", () => {
  it("medians, time left, and wording", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
    // 2 of 8 parts took 20 s: 6 left at 10 s each.
    expect(remainingMs({ done: 2, total: 8, since: 0, now: 20_000, typicalWritingMs: null })).toBe(60_000);
    // Nothing finished yet: the typical time minus what has passed.
    expect(remainingMs({ done: 0, total: 8, since: 0, now: 10_000, typicalWritingMs: 40_000 })).toBe(30_000);
    expect(formatEta(2000)).toBe("almost done");
    expect(formatEta(23_000)).toBe("about 25 s left");
    expect(formatEta(95_000)).toBe("about 1.5 min left");
    expect(formatEta(null)).toBe("");
  });
});

describe("draft progress stages", () => {
  it("planning → planned n sections → writing section k of n → checking", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const seen: Progress[] = [];
    const t = draftProgress((p) => seen.push(p), { totalMs: 45_000, ttftMs: 3_000 }, { totalMs: 10_000, ttftMs: 2_000 });
    t.start();
    vi.setSystemTime(1_000);
    t.partial({ outline: [] });
    vi.setSystemTime(2_000);
    t.partial({ outline: ["Politics DA", "1. Non-unique", "2. No link", "Case"] });
    vi.setSystemTime(4_000);
    t.partial({ outline: ["Politics DA", "1. Non-unique", "2. No link", "Case"], sections: [{ title: "Politics DA" }] });
    vi.setSystemTime(14_000);
    t.partial({ outline: ["Politics DA", "1. Non-unique", "2. No link", "Case"], sections: [{ title: "Politics DA" }, { title: "1. Non-unique" }, { title: "2. No link" }] });
    t.checking(4);
    vi.useRealTimers();
    expect(seen.map((p) => p.stage)).toEqual(["Reading the round", "Planning the speech", "Planned 4 sections", "Writing section 1 of 4: Politics DA", "Writing section 3 of 4: 2. No link", "Checking what it answers"]);
    // Two sections took 10 s, so two more take about 10 s.
    expect(seen[4].etaMs).toBe(10_000);
    const fractions = seen.map((p) => p.fraction);
    expect([...fractions].sort((a, b) => a - b)).toEqual(fractions);
  });

  it("an update counts the answers it writes against the new arguments", () => {
    const seen: Progress[] = [];
    const t = patchProgress((p) => seen.push(p), { totalMs: 15_000, ttftMs: 5_000 }, 3);
    t.start();
    t.partial({ adds: [] });
    t.partial({ adds: [{ targets: ["a"] }, { targets: ["b"] }] });
    expect(seen.map((p) => p.stage)).toEqual(["Reading what changed", "Planning answers to 3 new arguments", "Writing answer 2 of 3"]);
  });
});

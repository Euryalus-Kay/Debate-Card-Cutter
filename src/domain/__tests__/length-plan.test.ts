import { describe, expect, it } from "vitest";
import { acceptRewrites, allocateWordChange } from "../length-plan";

const sum = (m: Map<string, number>, items: { id: string; words: number }[]) => items.reduce((a, i) => a + (m.get(i.id) ?? i.words), 0);

describe("allocateWordChange", () => {
  const items = [
    { id: "a", words: 200, priority: 1 },
    { id: "b", words: 200, priority: 2 },
    { id: "c", words: 200, priority: 3 },
  ];

  it("cuts exactly the requested words, lower priority first", () => {
    const m = allocateWordChange(items, -120);
    expect(sum(m, items)).toBeCloseTo(600 - 120, -1);
    expect(200 - m.get("c")!).toBeGreaterThan(200 - m.get("b")!);
    expect(200 - m.get("b")!).toBeGreaterThan(200 - m.get("a")!);
  });

  it("never trims a section below its floor, and moves the rest elsewhere", () => {
    const m = allocateWordChange([{ id: "x", words: 40, priority: 3 }, { id: "y", words: 400, priority: 1 }], -150);
    expect(m.get("x") ?? 40).toBeGreaterThanOrEqual(20);
    expect(sum(m, [{ id: "x", words: 40 }, { id: "y", words: 400 }])).toBeCloseTo(440 - 150, -1);
  });

  it("does as much as it can when the cut is larger than the room", () => {
    const m = allocateWordChange([{ id: "x", words: 100, priority: 2 }], -500);
    expect(m.get("x")).toBe(45);
  });

  it("grows higher-priority sections more and caps growth", () => {
    const m = allocateWordChange(items, 150);
    expect(sum(m, items)).toBeCloseTo(750, -1);
    expect(m.get("a")!).toBeGreaterThan(m.get("c")!);
    const capped = allocateWordChange([{ id: "x", words: 50, priority: 1 }], 400);
    expect(capped.get("x")).toBe(100);
  });

  it("concentrates a small change instead of dropping it when every share is tiny", () => {
    const many = [30, 28, 26, 24, 22, 20, 18, 16].map((w, i) => ({ id: `t${i}`, words: w, priority: 2 }));
    const m = allocateWordChange(many, 70);
    expect(m.size).toBeGreaterThan(0);
    expect(sum(m, many) - many.reduce((a, i) => a + i.words, 0)).toBeCloseTo(70, -1);
    for (const [id, w] of m) expect(w - many.find((i) => i.id === id)!.words).toBeGreaterThanOrEqual(12);
  });

  it("skips changes too small to be worth a rewrite", () => {
    const m = allocateWordChange([{ id: "big", words: 300, priority: 2 }, { id: "small", words: 20, priority: 2 }], -40);
    expect(m.has("small")).toBe(false);
    expect(m.get("big")).toBe(260);
  });
});

describe("acceptRewrites", () => {
  it("keeps trims that got shorter, not ones that gutted the section", () => {
    const keep = acceptRewrites("trim", [
      { id: "a", have: 100, got: 70, want: 70, priority: 2 },
      { id: "b", have: 100, got: 110, want: 70, priority: 2 },
      { id: "c", have: 100, got: 20, want: 70, priority: 2 },
    ], 500, 480, 0.25);
    expect([...keep]).toEqual(["a"]);
  });

  it("keeps fills most-important first and never past the cap", () => {
    // 0.25 s per word; the speech is at 400 s with a 470 s cap: 70 s = 280 words of room.
    const keep = acceptRewrites("grow", [
      { id: "low", have: 100, got: 260, want: 240, priority: 3 }, // +40 s
      { id: "high", have: 100, got: 260, want: 240, priority: 1 }, // +40 s
      { id: "mid", have: 100, got: 180, want: 170, priority: 2 }, // +20 s
      { id: "wild", have: 50, got: 200, want: 90, priority: 1 }, // far past its target (over 1.4×): rejected
    ], 400, 470, 0.25);
    expect(keep.has("high")).toBe(true);
    expect(keep.has("mid")).toBe(true);
    expect(keep.has("low")).toBe(false); // would reach 500 s
    expect(keep.has("wild")).toBe(false);
  });
});

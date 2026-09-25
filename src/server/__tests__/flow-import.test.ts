import { describe, expect, it } from "vitest";
import { guessKind, matchPosition, positionKey } from "../flow-import";
import type { Position } from "@/domain/flow";

const pos = (id: string, name: string, side: "aff" | "neg" = "aff"): Position => ({ id, name, kind: "advantage", side, introducedIn: side === "aff" ? "1AC" : "1NC", order: 0 });

describe("position matching across speeches", () => {
  const existing = [pos("a1", "Advantage 1 — Water Security"), pos("a2", "Advantage 2 — Hegemony"), pos("p", "Politics DA", "neg"), pos("s", "States CP", "neg")];
  it("matches answer headings to the position they answer", () => {
    expect(matchPosition("Case — Water Security", existing)?.id).toBe("a1");
    expect(matchPosition("2AC — Politics", existing)?.id).toBe("p");
    expect(matchPosition("A2 States Counterplan", existing)?.id).toBe("s");
    expect(matchPosition("Adv 2", existing)?.id).toBe("a2");
    expect(matchPosition("Topicality — Substantial", existing)).toBeNull();
  });
  it("normalizes keys and guesses kinds", () => {
    expect(positionKey("A2: Politics DA")).toBe("politics");
    expect(guessKind("States CP")).toBe("cp");
    expect(guessKind("T — Substantial")).toBe("t");
    expect(guessKind("Conditionality bad")).toBe("theory");
    expect(guessKind("Cap K")).toBe("k");
  });
});

describe("guessKind regressions", () => {
  it("classifies advantages that mention security as advantages", () => {
    expect(guessKind("Advantage 1 — Water Security")).toBe("advantage");
    expect(guessKind("Security K")).toBe("k");
    expect(guessKind("Climate Tradeoff DA")).toBe("da");
  });
});

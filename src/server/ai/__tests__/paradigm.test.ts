import { describe, expect, it } from "vitest";
import { enforceQuotes, renderJudgeProfile, type JudgeProfile } from "../paradigm";
import { capRatesForJudge, presetProfile } from "@/domain/timing";

// SYNTHETIC FIXTURE (not a real judge)
const paradigm = "Please slow down on tags. I will not judge kick unless the 2NR tells me to. Tabula rasa.";
const unknown = { value: "unknown" as const, quote: "" };
const base: JudgeProfile = {
  experience: unknown,
  speed: { value: "moderate", quote: "Please slow down on tags." },
  docSharing: unknown,
  topicality: { value: 0, quote: "" },
  counterplans: { value: 0, quote: "" },
  disads: { value: 0, quote: "" },
  kritiks: { value: 5, quote: "I love kritiks" }, // not in the paradigm: must be dropped
  condo: unknown,
  judgeKick: { value: "if_asked", quote: "I will not judge kick unless the 2NR tells me to" },
  new2NC: unknown,
  techTruth: { value: "tech", quote: "" }, // no quote: must be dropped
  theory: { value: "", quote: "" },
  advice: [],
};

describe("judge profiles keep only quoted preferences", () => {
  it("drops values whose quote is missing or not in the paradigm", () => {
    const { profile, dropped } = enforceQuotes(base, paradigm);
    expect(dropped.sort()).toEqual(["kritiks", "techTruth"]);
    expect(profile.kritiks.value).toBe(0);
    expect(profile.techTruth.value).toBe("unknown");
    expect(profile.speed.value).toBe("moderate");
    expect(profile.judgeKick.value).toBe("if_asked");
  });
  it("tells the AI to ask for judge kick explicitly unless the judge says yes", () => {
    const { profile } = enforceQuotes(base, paradigm);
    expect(renderJudgeProfile(profile)).toContain("must ask for it explicitly");
  });
});

describe("judge pace caps time estimates (TIME-6)", () => {
  it("caps a fast speaker to the judge's pace and leaves unstated speed alone", () => {
    const fast = presetProfile("fast");
    const slow = capRatesForJudge(fast, "slow");
    expect(slow.cap).toBe("conversational");
    expect(slow.profile.rates.cardWpm).toBe(160);
    expect(capRatesForJudge(fast, "moderate").profile.rates.cardWpm).toBe(230);
    expect(capRatesForJudge(fast, "unknown").cap).toBeNull();
    expect(capRatesForJudge(presetProfile("conversational"), "moderate").cap).toBeNull();
  });
});

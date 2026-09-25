import { describe, expect, it } from "vitest";
import { getFormat, nextSpeechFor, roundSequence, speechesToAnswer, speechesToExtend, validatePrepContext, type SlotState } from "../format";
import { budgetReport, calibrate, countWords, estimate, estimateSeconds, presetProfile, type CalibrationObservation } from "../timing";
import { cardLoad, highlightPhrases, makeText, readAloud, highlightRatio, structuralIssues } from "../card";
import { citationGaps, emptyCitation, fullCite, shortCite, type Citation } from "../citation";

describe("format", () => {
  it("produces the standard 12-slot sequence with CX after each constructive", () => {
    const seq = roundSequence(getFormat("hs-standard"));
    expect(seq.map((s) => s.slot)).toEqual(["1AC", "CX1", "1NC", "CX2", "2AC", "CX3", "2NC", "CX4", "1NR", "1AR", "2NR", "2AR"]);
    expect(seq.find((s) => s.slot === "1AC")!.seconds).toBe(480);
    expect(seq.find((s) => s.slot === "1NR")!.seconds).toBe(300);
    expect(seq.find((s) => s.slot === "CX1")!.cx!.asker).toBe("2N");
  });

  it("college format uses 9-3-6", () => {
    const seq = roundSequence(getFormat("college-9-3-6"));
    expect(seq.find((s) => s.slot === "2AC")!.seconds).toBe(540);
    expect(seq.find((s) => s.slot === "2AR")!.seconds).toBe(360);
  });

  it("knows what each speech answers and extends", () => {
    expect(speechesToAnswer("1AR")).toEqual(["2NC", "1NR"]);
    expect(speechesToAnswer("2NC")).toEqual(["2AC"]);
    expect(speechesToExtend("2AR")).toEqual(["1AC", "2AC", "1AR"]);
    expect(speechesToExtend("1NR")).toEqual(["1NC", "2NC"]);
  });

  it("flags preparing a speech for the wrong side", () => {
    const issues = validatePrepContext("2NC", "aff", []);
    expect(issues.find((i) => i.code === "wrong_side")?.severity).toBe("error");
  });

  it("warns when the speeches to answer are missing, without inventing them", () => {
    const slots: SlotState[] = [
      { speech: "1AC", status: "delivered", hasDocument: true, hasNotes: false },
      { speech: "1NC", status: "delivered", hasDocument: true, hasNotes: false },
      { speech: "2AC", status: "delivered", hasDocument: true, hasNotes: false },
    ];
    const issues = validatePrepContext("1AR", "aff", slots);
    const missing = issues.filter((i) => i.code === "missing_prior_speech").map((i) => i.speech);
    expect(missing).toEqual(["2NC", "1NR"]);
  });

  it("warns when a later speech is already recorded", () => {
    const slots: SlotState[] = [{ speech: "2NR", status: "documented", hasDocument: true, hasNotes: false }];
    expect(validatePrepContext("2AC", "aff", slots).some((i) => i.code === "later_speech_present")).toBe(true);
  });

  it("computes the next speech for a side", () => {
    const slots: SlotState[] = [
      { speech: "1AC", status: "delivered", hasDocument: true, hasNotes: false },
      { speech: "1NC", status: "delivered", hasDocument: true, hasNotes: false },
    ];
    expect(nextSpeechFor("aff", slots)).toBe("2AC");
    expect(nextSpeechFor("neg", slots)).toBe("2NC");
  });
});

describe("timing", () => {
  it("counts words ignoring stray punctuation", () => {
    expect(countWords("  The plan — solves  warming. ")).toBe(4);
  });

  it("estimates with uncertainty ranges and budgets", () => {
    const p = presetProfile("fast");
    const e = estimate({ cardWords: 300, tagWords: 0, analyticWords: 0, cards: 0, transitions: 0 }, p);
    expect(e.seconds).toBeCloseTo(60, 5);
    expect(e.low).toBeLessThan(60);
    expect(e.high).toBeGreaterThan(60);
    expect(e.calibrated).toBe(false);
    const rep = budgetReport([{ id: "a", label: "A", seconds: 200, budgetSeconds: 150 }, { id: "b", label: "B", seconds: 150 }], 300);
    expect(rep.overBySeconds).toBe(50);
    expect(rep.lines[0].overBudget).toBe(true);
  });

  it("calibration moves rates toward observed delivery", () => {
    // Speaker actually reads cards at ~250 wpm (slower than the fast preset's 310).
    const obs: CalibrationObservation[] = [100, 200, 300, 150, 250].map((w) => ({
      load: { cardWords: w, tagWords: 10, analyticWords: 20, cards: 1, transitions: 1 },
      seconds: (w * 60) / 250 + (10 * 60) / 220 + (20 * 60) / 210 + 1.5 + 1,
      source: "timed_reading",
      at: "2026-09-25T00:00:00Z",
    }));
    const prof = calibrate("fast", obs, 5);
    expect(prof.rates.cardWpm).toBeGreaterThan(235);
    expect(prof.rates.cardWpm).toBeLessThan(290);
    expect(prof.uncertainty).toBeLessThanOrEqual(0.25);
    expect(prof.observations.length).toBe(5);
  });

  it("card read time uses highlighted text plus tag and short cite", () => {
    const text = "one two three four five six seven eight nine ten";
    const { block } = highlightPhrases(makeText(text), ["one two three", "nine ten"]);
    const load = cardLoad({ tag: "Tag has four words", citation: { authors: [{ name: "Ann Lee" }], date: { year: 2024 }, provenance: {} }, body: [block] });
    expect(load.cardWords).toBe(5);
    expect(load.tagWords).toBe(6); // 4 tag words + "Lee 24"
    expect(estimateSeconds(load, presetProfile("fast").rates)).toBeGreaterThan(0);
  });
});

describe("card", () => {
  const text = "Climate change will increase conflict risk because resource scarcity drives migration and competition.";

  it("reads highlighted text, falling back to underline then full", () => {
    const b = makeText(text, { underline: [{ start: 0, end: 30 }] });
    expect(readAloud([b]).basis).toBe("underline");
    const { block } = highlightPhrases(b, ["Climate change", "increase conflict risk", "scarcity drives migration"]);
    const r = readAloud([block]);
    expect(r.basis).toBe("highlight");
    expect(r.text).toBe("Climate change increase conflict risk scarcity drives migration");
    expect(readAloud([makeText(text)]).basis).toBe("full");
  });

  it("reports phrases that do not exist verbatim", () => {
    const { missing } = highlightPhrases(makeText(text), ["Climate change", "causes war"]);
    expect(missing).toEqual(["causes war"]);
  });

  it("computes highlight ratio", () => {
    const { block } = highlightPhrases(makeText(text), [text]);
    expect(highlightRatio([block])).toBeCloseTo(1, 5);
  });

  it("structural issues flag missing tag and citation gaps", () => {
    const issues = structuralIssues({ tag: "", body: [makeText(text)], citation: emptyCitation() });
    expect(issues.map((i) => i.code)).toEqual(expect.arrayContaining(["missing_tag", "missing_author", "missing_date"]));
  });
});

describe("citation", () => {
  const c: Citation = {
    authors: [{ name: "Jane Q. van der Berg", qualifications: "Professor of Political Science, Yale University", qualificationsProvenance: "source" }],
    date: { year: 2023, month: 3, day: 15 },
    title: "The Limits of Sanctions",
    publication: "Foreign Affairs",
    url: "https://example.org/limits",
    accessed: "2026-09-25",
    cutterInitials: "ZZ",
    provenance: { authors: "source", date: "source", title: "source" },
  };

  it("builds short cites for 1, 2, and 3+ authors, orgs, and no-date", () => {
    expect(shortCite(c)).toBe("van der Berg 23");
    expect(shortCite({ ...c, authors: [...c.authors, { name: "Tom Jones" }] })).toBe("van der Berg & Jones 23");
    expect(shortCite({ ...c, authors: [...c.authors, { name: "Tom Jones" }, { name: "A B" }] })).toBe("van der Berg et al. 23");
    expect(shortCite({ ...emptyCitation(), organization: "Congressional Budget Office", organizationShort: "CBO", date: { year: 2024 } })).toBe("CBO 24");
    expect(shortCite({ ...c, date: undefined })).toBe("van der Berg ND");
  });

  it("formats the full cite and never shows unverified qualifications", () => {
    const full = fullCite(c);
    expect(full).toContain("Jane Q. van der Berg, Professor of Political Science, Yale University");
    expect(full).toContain('"The Limits of Sanctions," Foreign Affairs, March 15, 2023');
    expect(full).toContain("accessed 9-25-2026");
    expect(full.endsWith("//ZZ")).toBe(true);
    const unverified = fullCite({ ...c, authors: [{ name: "Jane Doe", qualifications: "Nobel laureate", qualificationsProvenance: "ai_unverified" }] });
    expect(unverified).not.toContain("Nobel");
  });

  it("marks missing fields explicitly", () => {
    expect(fullCite({ ...emptyCitation(), title: "X" })).toContain("no author listed");
    expect(fullCite({ ...emptyCitation(), title: "X" })).toContain("no date");
    expect(citationGaps({ ...emptyCitation(), title: "X" })).toEqual(expect.arrayContaining(["author", "date", "publication", "URL/DOI"]));
  });
});

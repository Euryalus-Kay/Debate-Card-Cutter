import { describe, expect, it } from "vitest";
import { makeText, type BodyBlock } from "../card";
import { normalizeWithMap, qualifierWarnings, tagWarnings, verifyAgainstSource } from "../verify";

const SOURCE = `The report found that “sanctions rarely change a regime’s behavior” — at least not quickly.

However, the authors caution that sanctions can work when they are multilateral and sustained for years.

A third paragraph discusses implementation costs in detail, including the administrative burden on Treasury.

Finally, the study concludes that unilateral sanctions are unlikely to succeed against large economies.`;

describe("normalizeWithMap", () => {
  it("maps typographic variants to canonical forms and keeps offsets", () => {
    const t = normalizeWithMap("A “quote” — and  it’s fine");
    expect(t.norm).toBe(`A "quote" - and it's fine`);
    // every normalized char maps to a real index
    for (const i of t.map) expect(i).toBeGreaterThanOrEqual(0);
  });

  it("dehyphenates line-break hyphenation when asked", () => {
    expect(normalizeWithMap("eco-\n nomic growth", { dehyphenate: true }).norm).toBe("economic growth");
    expect(normalizeWithMap("well-known fact", { dehyphenate: true }).norm).toBe("well-known fact");
  });
});

describe("verifyAgainstSource", () => {
  it("verifies exact text with straight quotes against a curly-quoted source", () => {
    const body: BodyBlock[] = [makeText(`The report found that "sanctions rarely change a regime's behavior" - at least not quickly.`)];
    const r = verifyAgainstSource(body, SOURCE);
    expect(r.ok).toBe(true);
    expect(r.matches[0].found).toBe(true);
    const range = r.matches[0].sourceRange!;
    expect(SOURCE.slice(range.start, range.end)).toContain("sanctions rarely change");
  });

  it("accepts contiguous paragraphs", () => {
    const body: BodyBlock[] = [
      makeText("However, the authors caution that sanctions can work when they are multilateral and sustained for years."),
      makeText("A third paragraph discusses implementation costs in detail, including the administrative burden on Treasury."),
    ];
    expect(verifyAgainstSource(body, SOURCE).ok).toBe(true);
  });

  it("flags skipped text without an omission marker", () => {
    const body: BodyBlock[] = [
      makeText("However, the authors caution that sanctions can work when they are multilateral and sustained for years."),
      makeText("Finally, the study concludes that unilateral sanctions are unlikely to succeed against large economies."),
    ];
    const r = verifyAgainstSource(body, SOURCE);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("undisclosed_omission");
  });

  it("accepts skipped text when an omission marker is present", () => {
    const body: BodyBlock[] = [
      makeText("However, the authors caution that sanctions can work when they are multilateral and sustained for years."),
      { kind: "omission", marker: "[…]" },
      makeText("Finally, the study concludes that unilateral sanctions are unlikely to succeed against large economies."),
    ];
    expect(verifyAgainstSource(body, SOURCE).ok).toBe(true);
  });

  it("detects altered words and explains the difference", () => {
    const body: BodyBlock[] = [makeText("Finally, the study concludes that unilateral sanctions are likely to succeed against large economies.")];
    const r = verifyAgainstSource(body, SOURCE);
    expect(r.ok).toBe(false);
    const issue = r.issues.find((i) => i.code === "text_altered");
    expect(issue).toBeTruthy();
    expect(issue!.message).toContain("unlikely");
  });

  it("detects capitalization changes", () => {
    const body: BodyBlock[] = [makeText("however, the authors caution that sanctions can work when they are multilateral and sustained for years.")];
    const r = verifyAgainstSource(body, SOURCE);
    expect(r.issues.map((i) => i.code)).toContain("case_changed");
  });

  it("detects reordering", () => {
    const body: BodyBlock[] = [
      makeText("Finally, the study concludes that unilateral sanctions are unlikely to succeed against large economies."),
      { kind: "omission", marker: "…" },
      makeText("However, the authors caution that sanctions can work when they are multilateral and sustained for years."),
    ];
    const r = verifyAgainstSource(body, SOURCE);
    expect(r.issues.map((i) => i.code)).toContain("out_of_order");
  });

  it("reports text that is not in the source at all", () => {
    const body: BodyBlock[] = [makeText("Nuclear war would cause human extinction within weeks according to every expert.")];
    const r = verifyAgainstSource(body, SOURCE);
    expect(r.issues.map((i) => i.code)).toContain("not_in_source");
  });

  it("ignores editorial insertions (they are verified separately as brackets)", () => {
    const body: BodyBlock[] = [
      makeText("However, the authors caution that sanctions can work when they are multilateral and sustained for years."),
      { kind: "insertion", text: "sanctions", read: true },
    ];
    expect(verifyAgainstSource(body, SOURCE).ok).toBe(true);
  });

  it("handles PDF line-break hyphenation when enabled", () => {
    const pdf = "Deterrence stability depends on second-strike capa-\nbility and survivable forces.";
    const body: BodyBlock[] = [makeText("Deterrence stability depends on second-strike capability and survivable forces.")];
    expect(verifyAgainstSource(body, pdf).ok).toBe(false);
    expect(verifyAgainstSource(body, pdf, { dehyphenate: true }).ok).toBe(true);
  });
});

describe("meaning checks", () => {
  it("flags an unhighlighted negation in a highlighted sentence", () => {
    const text = "Sanctions will not change regime behavior in the short term.";
    const start = text.indexOf("Sanctions will");
    const hl1 = { start, end: start + "Sanctions will".length, color: "yellow" as const };
    const s2 = text.indexOf("change regime behavior");
    const hl2 = { start: s2, end: s2 + "change regime behavior".length, color: "yellow" as const };
    const body: BodyBlock[] = [makeText(text, { highlight: [hl1, hl2] })];
    const w = qualifierWarnings(body);
    expect(w.some((x) => x.word === "not" && x.kind === "negation")).toBe(true);
  });

  it("flags numbers in tags that are not in the body", () => {
    const body: BodyBlock[] = [makeText("Unemployment rose to 7 percent last year.")];
    expect(tagWarnings("Unemployment hits 12% — collapse coming", body).map((w) => w.code)).toContain("number_not_in_body");
    expect(tagWarnings("Unemployment rose to 7 percent", body)).toHaveLength(0);
  });

  it("flags absolute tags over hedged read text", () => {
    const text = "Escalation could possibly occur if both sides misread signals.";
    const body: BodyBlock[] = [makeText(text, { highlight: [{ start: 0, end: text.length, color: "yellow" }] })];
    expect(tagWarnings("Escalation will certainly cause extinction", body).map((w) => w.code)).toContain("possible_overclaim");
  });
});

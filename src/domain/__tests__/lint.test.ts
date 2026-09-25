import { describe, expect, it } from "vitest";
import { makeText, type BodyBlock } from "../card";
import { lintCard } from "../lint";
import type { Citation } from "../citation";

const cite: Citation = {
  authors: [{ name: "Jane Smith", qualifications: "Professor, Yale", qualificationsProvenance: "source" }],
  date: { year: 2024, month: 3, day: 1 },
  title: "Title",
  publication: "Journal",
  url: "https://x.test",
  accessed: "2026-09-25",
  provenance: {},
};

function hl(text: string, ...phrases: string[]) {
  const highlight = phrases.map((p) => {
    const i = text.indexOf(p);
    return { start: i, end: i + p.length, color: "yellow" as const };
  });
  return makeText(text, { highlight, underline: highlight.map(({ start, end }) => ({ start, end })) });
}

const codes = (body: BodyBlock[], tag = "Sanctions work", c = cite) => lintCard({ tag, body, citation: c }).map((i) => `${i.severity}:${i.code}`);

describe("lintCard", () => {
  it("flags a skipped negation inside a read sentence as an error", () => {
    const t = "Sanctions will not change regime behavior in the short term.";
    expect(codes([hl(t, "Sanctions will", "change regime behavior")])).toContain("error:skipped_negation");
  });

  it("does not flag qualifiers in sentences that are not read", () => {
    const t = "Sanctions work over time. They may not work quickly.";
    expect(codes([hl(t, "Sanctions work over time.")]).some((c) => c.includes("skipped_"))).toBe(false);
  });

  it("enforces NSDA ellipsis policy and allows it when permissive", () => {
    const body: BodyBlock[] = [makeText("First part of the sentence"), { kind: "omission", marker: "…" }, makeText("rest of it.", { newParagraph: false })];
    expect(codes(body)).toContain("error:ellipsis_prohibited");
    expect(lintCard({ tag: "x", body, citation: cite }, { omissionPolicy: "permissive" }).some((i) => i.code === "ellipsis_prohibited")).toBe(false);
  });

  it("treats bracketed insertions that add negation as distortion", () => {
    const body: BodyBlock[] = [makeText("The plan will succeed."), { kind: "insertion", text: "not", read: true }];
    expect(codes(body)).toContain("error:insertion_changes_meaning");
  });

  it("errors when the tag cites a number absent from the body", () => {
    expect(codes([hl("Costs rose 12 percent last year.", "Costs rose 12 percent")], "Costs rose 40%")).toContain("error:tag_number_not_in_body");
    expect(codes([hl("Costs rose 12 percent last year.", "Costs rose 12 percent")], "Costs rose 12%")).not.toContain("error:tag_number_not_in_body");
  });

  it("warns on possible power tags and straw arguments", () => {
    expect(codes([hl("Escalation could occur under some conditions.", "Escalation could occur")], "Escalation causes extinction")).toContain("warning:possible_power_tag");
    const t = "Critics argue that sanctions always fail. However, the evidence shows the opposite.";
    expect(codes([hl(t, "sanctions always fail")])).toContain("warning:possible_straw_argument");
  });

  it("errors on unverified AI qualifications", () => {
    const c: Citation = { ...cite, authors: [{ name: "A B", qualifications: "Nobel laureate", qualificationsProvenance: "ai_unverified" }] };
    expect(codes([hl("Text here.", "Text")], "x", c)).toContain("error:unverified_qualifications");
  });
});

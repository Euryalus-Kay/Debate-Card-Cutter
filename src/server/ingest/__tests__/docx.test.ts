import { describe, expect, it } from "vitest";
import { buildDocx, type ExportNode } from "@/server/export/docx-writer";
import { parseDocx } from "../docx";
import { structureDocument, type ImportedCard } from "../structure";
import { makeText, readAloud } from "@/domain/card";

// SYNTHETIC FIXTURE (not real evidence).
const text1 = "Sanctions rarely change regime behavior quickly, but multilateral sanctions sustained for years can succeed.";
const text2 = "The administrative burden on Treasury is significant and growing.";

function fixture(): ExportNode[] {
  const i = text1.indexOf("multilateral sanctions");
  return [
    { kind: "heading", level: 1, text: "1NC" },
    { kind: "heading", level: 2, text: "Sanctions DA" },
    { kind: "heading", level: 3, text: "Uniqueness" },
    {
      kind: "card",
      tag: "Multilateral sanctions work — sustained pressure changes behavior",
      shortCite: "Smith 23",
      fullCite: 'Jane Smith, Professor at Yale; "The Limits of Sanctions," Foreign Affairs, March 15, 2023, https://example.org/x //ZZ',
      body: [
        makeText(text1, {
          underline: [{ start: i, end: text1.length }],
          emphasis: [{ start: i, end: i + "multilateral sanctions".length }],
          highlight: [{ start: i, end: i + "multilateral sanctions sustained for years can succeed".length, color: "yellow" }],
        }),
        { kind: "omission", marker: "[…]" },
        makeText(text2, { underline: [{ start: 0, end: 30 }], highlight: [{ start: 4, end: 27, color: "cyan" }] }),
      ],
    },
    { kind: "analytic", text: "Extend Smith — they have no answer to the sustained-pressure warrant" },
  ];
}

describe("DOCX round trip", () => {
  it("parses headings, cards, cites, and formatting spans from an exported file", () => {
    const bytes = buildDocx(fixture(), { title: "test" });
    const parsed = parseDocx(bytes);
    expect(parsed.warnings).toEqual([]);
    const levels = parsed.paragraphs.filter((p) => p.headingLevel > 0).map((p) => [p.headingLevel, p.text]);
    expect(levels).toEqual([
      [1, "1NC"],
      [2, "Sanctions DA"],
      [3, "Uniqueness"],
      [4, "Multilateral sanctions work — sustained pressure changes behavior"],
      [4, "Extend Smith — they have no answer to the sustained-pressure warrant"],
    ]);

    const s = structureDocument(parsed.paragraphs);
    expect(s.counts).toEqual({ headings: 3, cards: 1, analytics: 1 });
    const card = s.items.find((x) => x.kind === "card") as ImportedCard;
    expect(card.path).toEqual(["1NC", "Sanctions DA", "Uniqueness"]);
    expect(card.cite!.short).toBe("Smith 23");
    expect(card.citation.url).toBe("https://example.org/x");
    expect(card.citation.title).toBe("The Limits of Sanctions");
    expect(card.citation.cutterInitials).toBe("ZZ");

    // Body: paragraph 1 keeps text and spans exactly.
    const b1 = card.body[0];
    expect(b1.text).toBe(text1);
    const i = text1.indexOf("multilateral sanctions");
    expect(b1.highlight).toEqual([{ start: i, end: i + "multilateral sanctions sustained for years can succeed".length, color: "yellow" }]);
    expect(b1.emphasis).toEqual([{ start: i, end: i + "multilateral sanctions".length }]);
    expect(b1.underline).toEqual([{ start: i, end: text1.length }]);
    // The omission marker is exported on its own line; imported docs keep text as-is.
    expect(card.body.map((b) => b.text)).toEqual([text1, "[…]", text2]);
    expect(card.body[2].highlight).toEqual([{ start: 4, end: 27, color: "cyan" }]);
    expect(readAloud(card.body).text).toContain("multilateral sanctions sustained for years can succeed");
  });

  it("rejects non-zip input with a helpful error", () => {
    expect(() => parseDocx(new TextEncoder().encode("hello"))).toThrow(/not a valid \.docx/);
  });

  it("treats a tag followed immediately by another tag as an analytic", () => {
    const bytes = buildDocx([
      { kind: "analytic", text: "Perm do both — shields the link" },
      { kind: "analytic", text: "No net benefit" },
    ]);
    const s = structureDocument(parseDocx(bytes).paragraphs);
    expect(s.items.map((x) => x.kind)).toEqual(["analytic", "analytic"]);
  });
});

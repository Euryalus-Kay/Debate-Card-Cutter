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

import { citationFromImported, looksLikeCite, splitCite } from "../structure";
import type { DocParagraph } from "../docx";

describe("real-world cite patterns (from Verbatim camp files)", () => {
  const para = (runs: { text: string; bold?: boolean; cs?: string }[]): DocParagraph => ({
    index: 0,
    headingLevel: 0,
    inTable: false,
    text: runs.map((r) => r.text).join(""),
    runs: runs.map((r) => ({ text: r.text, props: { bold: r.bold }, emphasis: false, charStyle: r.cs, charStyleName: r.cs ? "Style 13 pt Bold" : undefined })),
  });

  it("detects a cite whose first name precedes the Cite-styled short cite", () => {
    const p = para([{ text: "Ben " }, { text: "Deighton 19", cs: "Style13ptBold" }, { text: ", Postgraduate journalism degrees, Managing Editor of SciDev.Net, 2/18" }]);
    expect(looksLikeCite(p)).toBe(true);
    const s = splitCite(p);
    expect(s).toMatchObject({ short: "Deighton 19", prefix: "Ben" });
    const c = citationFromImported(s.short, s.rest, s.raw, s.prefix);
    expect(c.authors[0]).toMatchObject({ name: "Ben Deighton", family: "Deighton" });
    expect(c.date?.year).toBe(2019);
  });

  it("parses curly-apostrophe, single-digit, 2K, m/d/yy, and trailing years", () => {
    expect(citationFromImported("Berry & Huckins ’19", "", "").date?.year).toBe(2019);
    expect(citationFromImported("Bracey 6", "Associate Professor of Law", "").date?.year).toBe(2006);
    expect(citationFromImported("Reed 2K", "Professor at Lancaster University", "").date?.year).toBe(2000);
    expect(citationFromImported("Segall 3/12/21", ". Assistant Chief Counsel", "").date).toMatchObject({ year: 2021, month: 3, day: 12 });
    const n = citationFromImported("Newburger", "21, Biden’s budget proposal calls for more, 1-27-2021, CNBC", "");
    expect(n.date).toMatchObject({ year: 2021, month: 1, day: 27 });
    expect(n.authors[0].name).toBe("Newburger");
    expect(citationFromImported("Levitz 19", "9-18-2019, Democracy Dies When Labor Unions Do, https://nymag.com/x", "").date).toMatchObject({ year: 2019, month: 9, day: 18 });
  });
});

describe("tags pasted without the Tag style (synthetic)", () => {
  const p = (index: number, text: string, opts: { h?: 0 | 1 | 2 | 3 | 4; bold?: boolean; underline?: boolean } = {}): DocParagraph => ({
    index,
    headingLevel: opts.h ?? 0,
    inTable: false,
    text,
    runs: [{ text, props: { bold: opts.bold, underline: opts.underline }, emphasis: false }],
  });
  const cite = "Rivera 22 — Professor of Economics, “An Invented Title,” Journal of Examples, 2022";
  const body = "Invented card text about markets and firms that a debater underlined.";

  it("splits a bold line above a citation into its own card in a styled file", () => {
    const s = structureDocument([
      p(0, "Growth is fragile", { h: 4 }),
      p(1, cite),
      p(2, body, { underline: true }),
      p(3, "Small firms drive the gains", { bold: true }),
      p(4, cite),
      p(5, body, { underline: true }),
    ]);
    const cards = s.items.filter((x): x is ImportedCard => x.kind === "card");
    expect(cards.map((c) => c.tag)).toEqual(["Growth is fragile", "Small firms drive the gains"]);
    expect(cards[0].body).toHaveLength(1);
  });

  it("keeps a bold short cite on its own line inside the card", () => {
    const s = structureDocument([p(0, "Growth is fragile", { h: 4 }), p(1, "Rivera 22", { bold: true }), p(2, cite), p(3, body, { underline: true })]);
    expect(s.items.filter((x) => x.kind === "card")).toHaveLength(1);
  });
});

describe("files saved without heading styles (synthetic)", () => {
  const p = (index: number, text: string, opts: { h?: 0 | 1 | 2 | 3 | 4; bold?: boolean; size?: number } = {}): DocParagraph => ({
    index,
    headingLevel: opts.h ?? 0,
    inTable: false,
    text,
    runs: [{ text, props: { bold: opts.bold, size: opts.size }, emphasis: false }],
  });

  it("Verbatim sizes become headings again, only when the file has no heading styles at all", async () => {
    const { inferHeadingsFromSize } = await import("@/server/uploads");
    const flat = [p(0, "Case Neg", { bold: true, size: 52 }), p(1, "Advantage 1", { bold: true, size: 44 }), p(2, "AT: Innovation", { bold: true, size: 32 }), p(3, "Tags stay tags", { bold: true, size: 26 }), p(4, "Big but not bold", { size: 44 })];
    expect(inferHeadingsFromSize(flat).map((x) => x.headingLevel)).toEqual([1, 2, 3, 0, 0]);
    const styled = [p(0, "Pocket", { h: 1 }), p(1, "Big bold line", { bold: true, size: 44 })];
    expect(inferHeadingsFromSize(styled).map((x) => x.headingLevel)).toEqual([1, 0]);
  });

  it("recognizes cites that open with a full name or a name particle, not ordinary sentences", () => {
    const cite = (text: string) => looksLikeCite(p(0, text));
    expect(cite("Andreas von Gunten, 15 – Master of Arts in Philosophy, Open University, 2015")).toBe(true);
    expect(cite("Jane Rivera 22, Professor of Economics at Example State University, 2022")).toBe(true);
    expect(cite("The Supreme Court 2019 decision changed how states regulate insurance markets.")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { pdfParagraphs } from "@/server/ingest/pdf";
import { bylineFromParagraphs, dateFromParagraphs, markdownToText, paragraphsOf } from "@/server/research/fetcher";
import { buildCitation, cleanAuthorName, parseDate, splitAuthors } from "@/server/research/cite";
import { buildCut, CutRejected, locatePhrase, numberSource, type CardCutOutput } from "@/server/research/cut";
import { fullCite, shortCite } from "@/domain/citation";
import { readAloud } from "@/domain/card";

describe("pdfParagraphs", () => {
  const pages = [
    "Housing Policy Brief\nThe research shows that stricter zoning is associated with less construc-\ntion and higher prices. Relaxing those rules does\nnot reverse the effect quickly.\nA second paragraph starts here and is long enough to look like prose in\nthe document, and it continues onto the next",
    "2\npage with more words. It ends here.\nKey Takeaways:\n• Supply rises slowly after upzoning.\n• Prices may not fall in rezoned areas.",
  ];
  const paras = pdfParagraphs(pages);
  it("joins hyphenated line breaks and lines within a paragraph", () => {
    expect(paras.some((p) => p.text.includes("less construction and higher prices"))).toBe(true);
  });
  it("drops page-number lines and joins a paragraph across the page break", () => {
    const cont = paras.find((p) => p.text.startsWith("A second paragraph"));
    expect(cont?.text).toContain("onto the next page with more words. It ends here.");
    expect(cont?.pages).toEqual([1, 2]);
    expect(paras.some((p) => p.text === "2")).toBe(false);
  });
  it("splits headings and bullet items", () => {
    expect(paras.map((p) => p.text)).toContain("Housing Policy Brief");
    expect(paras.map((p) => p.text)).toContain("• Supply rises slowly after upzoning.");
  });
});

describe("web text", () => {
  it("renders Markdown as visible text", () => {
    const md = "# Title\n\nSee [the report](https://x.org/a \"t\") and ![img](https://x.org/i.png) **now**.\n\n- item one\n- item_two stays";
    expect(markdownToText(md)).toBe("Title\n\nSee the report and  now.\n\nitem one\nitem_two stays");
  });
  it("drops bare-URL paragraphs (embeds)", () => {
    expect(paragraphsOf("Real text.\n\nhttps://player.vimeo.com/video/1?a=1&amp;b=2\n\nMore text.")).toEqual(["Real text.", "More text."]);
  });
  it("finds bylines and date lines", () => {
    expect(bylineFromParagraphs(["4 minute read", "By Todd Litman"])).toEqual(["Todd Litman"]);
    expect(bylineFromParagraphs(["By continuing to use this site you agree"])).toEqual([]);
    expect(dateFromParagraphs(["December 26, 2023, 5:00 AM PST"])).toBe("December 26, 2023");
    expect(dateFromParagraphs(["NBER WORKING PAPER", "March 2002"])).toBe("March 2002");
  });
});

describe("citation fields", () => {
  it("parses common date formats", () => {
    expect(parseDate("2024-03-12T10:00:00Z")).toMatchObject({ year: 2024, month: 3, day: 12 });
    expect(parseDate("December 26, 2023")).toMatchObject({ year: 2023, month: 12, day: 26 });
    expect(parseDate("12 Sept. 2021")).toMatchObject({ year: 2021, month: 9, day: 12 });
    expect(parseDate("Spring 2019")).toMatchObject({ year: 2019 });
    expect(parseDate("n.d.")).toBeUndefined();
  });
  it("accepts only plausible personal names", () => {
    expect(cleanAuthorName("lbowen")).toBeNull();
    expect(cleanAuthorName("Staff Writer")).toBeNull();
    expect(cleanAuthorName("Smith, Jane")).toBe("Jane Smith");
    expect(cleanAuthorName("MARIA GARCIA-LOPEZ")).toBe("Maria Garcia-Lopez");
    expect(splitAuthors(["Jane Smith and John Doe"])).toEqual(["Jane Smith", "John Doe"]);
  });
  it("adds qualifications only when the source text states them", () => {
    const sourceText = "By Jane Smith\n\nJane Smith is a professor of economics at Yale University.\n\nZoning raises prices.";
    const { citation, rejected } = buildCitation({
      url: "https://example.org/a",
      metadata: { authors: ["Jane Smith"], title: "Zoning", siteName: "Example Review", published: "2024-05-01" },
      byline: {
        title: "",
        publication: "",
        authors: [
          { name: "Jane Smith", nameEvidence: "By Jane Smith", qualifications: "Professor of Economics, Yale University", qualificationsEvidence: "Jane Smith is a professor of economics at Yale University" },
          { name: "Bob Jones", nameEvidence: "Bob Jones", qualifications: "Nobel laureate", qualificationsEvidence: "Bob Jones won the Nobel" },
        ],
        organization: "",
        organizationEvidence: "",
        date: "",
        dateEvidence: "",
      },
      sourceText,
      accessed: "2026-09-25",
    });
    expect(citation.authors).toHaveLength(1);
    expect(citation.authors[0]).toMatchObject({ name: "Jane Smith", qualificationsProvenance: "source" });
    expect(shortCite(citation)).toBe("Smith 24");
    expect(fullCite(citation)).toContain("Jane Smith, Professor of Economics, Yale University");
    expect(rejected.join(" ")).toContain("Bob Jones");
  });
  it("leaves the date empty rather than guessing", () => {
    const { citation } = buildCitation({ url: "https://example.org/b", metadata: { authors: [] }, sourceText: "Text without a date.", accessed: "2026-09-25" });
    expect(citation.date).toBeUndefined();
    expect(fullCite(citation)).toContain("no date");
  });
});

describe("card cutting (deterministic part)", () => {
  const paragraphs = [
    "By Jane Smith",
    "Critics say upzoning does nothing. That view is wrong.",
    "Recent studies show that upzoning can increase housing supply and “drive down” prices over time. The effect is not immediate.",
    "Local conditions matter a great deal. More on Housing",
  ];
  const text = paragraphs.join("\n\n");
  const src = numberSource(paragraphs, "upzoning increases supply");
  const base: CardCutOutput = {
    verdict: "cut",
    reason: "",
    startParagraph: 3,
    endParagraph: 4,
    firstWords: "",
    lastWords: "",
    readShort: 'upzoning can increase housing supply and "drive down" prices',
    readLong: 'Recent studies show that upzoning can increase housing supply and "drive down" prices over time',
    emphasis: ["increase"],
    tag: "Upzoning increases supply and lowers prices",
    support: { level: "strong", explanation: "", caveats: [] },
    byline: { title: "", publication: "", authors: [], organization: "", organizationEvidence: "", date: "", dateEvidence: "" },
  };

  it("locates phrases despite typographic differences", () => {
    const at = locatePhrase(paragraphs[2], 'and "drive down" prices');
    expect(at).not.toBeNull();
    expect(paragraphs[2].slice(at!.start, at!.end)).toBe("and “drive down” prices");
  });

  it("copies verbatim source text, places the planned read on it, and verifies", () => {
    const built = buildCut(base, src, text, false);
    expect(built.verification.ok).toBe(true);
    expect(built.body[0].text).toBe(paragraphs[2]);
    // The read keeps the source's own punctuation and quote marks.
    expect(readAloud(built.body).text).toBe("upzoning can increase housing supply and “drive down” prices");
    // read text is always underlined (the underline is the longer read)
    const h = built.body[0].highlight[0];
    expect(built.body[0].underline.some((u) => u.start <= h.start && u.end >= h.end)).toBe(true);
    expect(built.body[0].emphasis).toHaveLength(1);
  });

  it("ends the excerpt before a trailing link label", () => {
    const built = buildCut(base, src, text, false);
    expect(built.body[1].text).toBe("Local conditions matter a great deal.");
  });

  it("trims to firstWords at a sentence start", () => {
    const built = buildCut({ ...base, startParagraph: 2, endParagraph: 2, firstWords: "That view is wrong.", readShort: "", readLong: "", emphasis: [] }, src, text, false);
    expect(built.body[0].text).toBe("That view is wrong.");
  });

  it("drops planned read words that are not in the excerpt (the text is never changed)", () => {
    const built = buildCut({ ...base, readShort: "upzoning always lowers rents", readLong: "" }, src, text, false);
    expect(built.missingPhrases).toEqual(["always", "lowers", "rents"]);
    expect(readAloud(built.body).text).toBe("upzoning");
  });

  it("refuses paragraphs the model was not shown", () => {
    const narrow = { ...src, shown: [2] };
    expect(() => buildCut({ ...base, startParagraph: 1, endParagraph: 1 }, narrow, text, false)).toThrow(CutRejected);
  });

  it("narrows long sources but always shows the front matter", () => {
    const filler = Array.from({ length: 400 }, (_, i) => `Filler paragraph ${i} about unrelated agricultural matters and weather patterns in the region.`);
    const long = ["By Jane Smith", "March 2002", ...filler.slice(0, 200), "Upzoning increases housing supply substantially, the study finds.", ...filler.slice(200)];
    const n = numberSource(long, "upzoning increases housing supply", 6000);
    expect(n.shown).toContain(0);
    expect(n.shown).toContain(1);
    expect(n.shown).toContain(202);
    expect(n.text).toContain("not shown");
  });
});

describe("institutional authors", () => {
  it("treats an organization entered as author as the organization", () => {
    const { citation } = buildCitation({ url: "", metadata: { authors: [] }, sourceText: "x", accessed: "2026-09-25", user: { authors: ["Climate Leadership Council"], date: "January 17, 2019" } });
    expect(citation.authors).toHaveLength(0);
    expect(citation.organization).toBe("Climate Leadership Council");
    expect(shortCite(citation)).toBe("Climate Leadership Council 19");
  });
});

describe("byline words that aren't names", () => {
  it("drops a role word read from the byline as if it were an author", () => {
    const sourceText = "By Journalist. Reporting from the capital, the program's costs rose again this year.";
    const byline = { authors: [{ name: "Journalist.", nameEvidence: "By Journalist.", qualifications: "", qualificationsEvidence: "" }], organization: "", organizationEvidence: "", date: "", dateEvidence: "" };
    const { citation } = buildCitation({ url: "https://example.test/a", metadata: { authors: [], siteName: "Example News" }, sourceText, accessed: "2026-09-25", byline: byline as never });
    expect(citation.authors).toHaveLength(0);
  });
});

describe("authors from a journal page and its DOI record (synthetic)", () => {
  it("a page listing only its corresponding author takes the DOI record's full author list, in order", () => {
    const { citation } = buildCitation({
      url: "https://journal.example.org/article/1",
      metadata: { authors: ["Camila Ortiz"], doi: "10.0000/example" },
      bibliographic: { authors: ["Rosa Delgado", "Tomas Weber", "Camila Ortiz"], year: 2019 },
      sourceText: "Invented article text.",
      accessed: "2026-09-25",
    });
    expect(citation.authors.map((a) => a.name)).toEqual(["Rosa Delgado", "Tomas Weber", "Camila Ortiz"]);
  });
});

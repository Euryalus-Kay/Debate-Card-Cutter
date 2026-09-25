/**
 * Label repairs for AI-split files (Phase B1). Synthetic paragraphs (invented text), shaped like the
 * failures seen on real camp files with their styles stripped.
 */
import { describe, expect, it } from "vitest";
import type { DocParagraph } from "@/server/ingest/docx";
import { repairLabels, type SegmentKind } from "@/server/library/segment";

type Spec = [text: string, kind: SegmentKind, fmt?: "bold" | "underline"];

function setup(specs: Spec[]) {
  const paragraphs = new Map<number, DocParagraph>();
  const kind = new Map<number, SegmentKind>();
  specs.forEach(([text, k, fmt], index) => {
    paragraphs.set(index, { index, text, headingLevel: 0, inTable: false, runs: [{ text, props: { bold: fmt === "bold", underline: fmt === "underline" }, emphasis: false }] });
    kind.set(index, k);
  });
  const order = specs.map((_, i) => i);
  const out = repairLabels(order, kind, paragraphs);
  return { kinds: order.map((i) => out.kind.get(i)), merged: [...out.mergeIntoPrev] };
}

const CITE = "Rivera 22 — Professor of Economics at Example State University, “An Invented Title,” Journal of Examples, 2022, https://example.org/a";
const LONG = "Invented card text that runs on for a while about markets and firms. ".repeat(8).trim();

describe("repairLabels", () => {
  it("a bold line above a cite-shaped line is a tag and a cite, even when both were labeled card text", () => {
    const r = setup([
      [LONG, "card_text", "underline"],
      ["Small firms drive the gains", "card_text", "bold"],
      [CITE, "card_text"],
      [LONG, "card_text", "underline"],
    ]);
    expect(r.kinds).toEqual(["card_text", "tag", "cite", "card_text"]);
  });

  it("a heading or analytic directly above a cite is that card's tag", () => {
    expect(setup([["Increases innovation", "block"], [CITE, "cite"], [LONG, "card_text", "underline"]]).kinds).toEqual(["tag", "cite", "card_text"]);
    expect(setup([["[e] Increases innovation", "analytic"], [CITE, "cite"], [LONG, "card_text", "underline"]]).kinds).toEqual(["tag", "cite", "card_text"]);
  });

  it("a short bold cite on its own line is not made a tag", () => {
    const r = setup([
      ["Growth is fragile", "tag", "bold"],
      ["Rivera 22", "cite", "bold"],
      [CITE, "cite"],
      [LONG, "card_text", "underline"],
    ]);
    expect(r.kinds[1]).toBe("cite");
    expect(r.merged).toEqual([]);
  });

  it("a citation runs at most two lines; the rest of a long cite run is card text", () => {
    const r = setup([
      ["Growth is fragile", "tag", "bold"],
      [CITE, "cite"],
      [LONG, "cite"],
      ["A subheading", "cite"],
      [LONG, "cite"],
    ]);
    expect(r.kinds).toEqual(["tag", "cite", "card_text", "card_text", "card_text"]);
  });

  it("keeps a real second cite line", () => {
    const r = setup([
      ["Growth is fragile", "tag", "bold"],
      ["Rivera 22 — Professor of Economics", "cite"],
      ["Ana Rivera, “An Invented Title,” Journal of Examples, March 2022", "cite"],
      [LONG, "card_text", "underline"],
    ]);
    expect(r.kinds).toEqual(["tag", "cite", "cite", "card_text"]);
  });

  it("short article subheadings between card text stay in the card; numbered analytics don't", () => {
    expect(setup([[CITE, "cite"], [LONG, "card_text", "underline"], ["It's Big", "tag", "bold"], [LONG, "card_text", "underline"]]).kinds[2]).toBe("card_text");
    expect(setup([[CITE, "cite"], [LONG, "card_text", "underline"], ["2. Non-unique", "tag", "bold"], [LONG, "card_text", "underline"]]).kinds[2]).toBe("tag");
  });

  it("a long 'tag' with card formatting inside a card is card text; without a cite or formatting it's an analytic", () => {
    expect(setup([[CITE, "cite"], [LONG, "card_text", "underline"], ["Solutions: what to do", "other"], [LONG, "tag", "underline"]]).kinds).toEqual(["cite", "card_text", "card_text", "card_text"]);
    expect(setup([["AT: Perm", "block"], [LONG, "tag"]]).kinds).toEqual(["block", "analytic"]);
  });

  it("joins a two-line tag", () => {
    const r = setup([
      ["Growth is fragile —", "tag", "bold"],
      ["and a crash spreads", "analytic", "bold"],
      [CITE, "cite"],
      [LONG, "card_text", "underline"],
    ]);
    expect(r.kinds).toEqual(["tag", "tag", "cite", "card_text"]);
    expect(r.merged).toEqual([1]);
  });
});

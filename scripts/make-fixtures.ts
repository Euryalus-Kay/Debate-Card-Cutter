/**
 * Writes tests/fixtures/synthetic-1nc.docx: a Verbatim-style 1NC made up for
 * tests (invented text, fictional authors and sources), with the same shape the
 * E2E tests rely on: a CP with a text and two cards, a DA with three cards, and
 * two case analytics. Also tests/fixtures/synthetic-2ac-blocks.docx: the aff's
 * answers to that 1NC (and one unrelated card), for library reuse tests.
 * Run: npx tsx scripts/make-fixtures.ts
 */
import { writeFileSync } from "node:fs";
import { buildDocx, type ExportNode } from "@/server/export/docx-writer";
import { makeText } from "@/domain/card";

/** A card body: the read part underlined and highlighted. */
function body(before: string, read: string, after: string) {
  const text = `${before}${read}${after}`;
  return [makeText(text, { underline: [{ start: before.length, end: before.length + read.length }], highlight: [{ start: before.length, end: before.length + read.length, color: "yellow" }] })];
}
const cite = (who: string, year: string, title: string) => ({ shortCite: `${who} ${year}`, fullCite: `${who} ${year} (SYNTHETIC TEST SOURCE — invented for tests, not a real publication: "${title}")` });

const nodes: ExportNode[] = [
  { kind: "heading", level: 1, text: "1NC — SYNTHETIC TEST DOCUMENT" },
  { kind: "heading", level: 2, text: "States CP" },
  { kind: "analytic", asTag: true, text: "Text: The fifty states should adopt matching protections for ephemeral streams through an interstate compact." },
  {
    kind: "card",
    tag: "States solve better – they can tailor protection to local watersheds",
    ...cite("Rivera", "24", "State Watershed Programs"),
    body: body("In the invented example used for these tests, ", "state agencies know their own watersheds and can adjust protection to local conditions faster than a national rule", ", which is the claim the counterplan relies on."),
  },
  {
    kind: "card",
    tag: "The CP adds protection above the federal floor",
    ...cite("Okafor", "23", "Floors and Ceilings"),
    body: body("This made-up passage says that ", "states often go further than federal minimums when they write their own rules", ", so the counterplan claims to capture the plan's benefits."),
  },
  { kind: "heading", level: 2, text: "Climate Tradeoff DA" },
  {
    kind: "card",
    tag: "Climate is the budget priority now",
    ...cite("Lindqvist", "25", "Budget Priorities"),
    body: body("According to this fictional report, ", "lawmakers have put climate programs first in this year's spending plans", ", leaving little room for new water commitments."),
  },
  {
    kind: "card",
    tag: "New water mandates trade off with climate spending",
    ...cite("Mehta", "24", "Tradeoffs"),
    body: body("The invented analysis argues that ", "every new federal water mandate pulls enforcement money from climate programs", " in the same agencies."),
  },
  {
    kind: "card",
    tag: "Climate failure risks catastrophe",
    ...cite("Baptiste", "23", "Tipping Points"),
    body: body("In this synthetic source, ", "delays in climate action raise the risk of large, irreversible harms", " over the coming decades."),
  },
  { kind: "heading", level: 2, text: "Case — Water Security" },
  { kind: "analytic", asTag: true, text: "No water wars — states cooperate over shared water far more often than they fight" },
  { kind: "analytic", asTag: true, text: "Alternate causes — agricultural runoff, not ephemeral streams, drives drinking water contamination" },
];

writeFileSync("tests/fixtures/synthetic-1nc.docx", buildDocx(nodes, { title: "SYNTHETIC 1NC (test fixture)" }));
console.log("wrote tests/fixtures/synthetic-1nc.docx");

const blocks: ExportNode[] = [
  { kind: "heading", level: 1, text: "Aff — 2AC blocks — SYNTHETIC TEST DOCUMENT" },
  { kind: "heading", level: 2, text: "2AC — States CP" },
  {
    kind: "card",
    tag: "States can't adopt matching protections — an interstate compact takes years to ratify",
    ...cite("Castellanos", "25", "Compacts in Practice"),
    body: body("In this invented study, ", "an interstate compact needs every member legislature to ratify it, which takes years, so matching state protections arrive late or not at all", ", the fictional author concludes."),
  },
  { kind: "heading", level: 2, text: "2AC — Climate Tradeoff DA" },
  {
    kind: "card",
    tag: "Non-unique — climate is not the budget priority now; its spending was cut",
    ...cite("Haldane", "25", "Spending Review"),
    body: body("The made-up review finds that ", "climate spending was cut in this year's budget, and it is not the priority lawmakers claim", ", according to the synthetic data."),
  },
  { kind: "heading", level: 2, text: "Space Innovation Add-on" },
  {
    kind: "card",
    tag: "Space exploration boosts innovation",
    ...cite("Moreau", "24", "Orbits and Industry"),
    body: body("This invented passage says ", "space programs spin off technologies that raise productivity across industries", " over time."),
  },
];
writeFileSync("tests/fixtures/synthetic-2ac-blocks.docx", buildDocx(blocks, { title: "SYNTHETIC 2AC blocks (test fixture)" }));
console.log("wrote tests/fixtures/synthetic-2ac-blocks.docx");

/** SYNTHETIC test speech docs assembled from real camp-file cards (kept out of git). */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { parseDocx } from "@/server/ingest/docx";
import { structureDocument, type ImportedCard } from "@/server/ingest/structure";
import { buildDocx, type ExportNode } from "@/server/export/docx-writer";
import { shortCite, fullCite } from "@/domain/citation";

const dir = `${process.env.HOME}/Projects/debate-backups/research-samples`;
const out = process.argv[2];
mkdirSync(out, { recursive: true });
const cardsOf = (f: string) => structureDocument(parseDocx(new Uint8Array(readFileSync(path.join(dir, f)))).paragraphs).items.filter((i): i is ImportedCard => i.kind === "card");
const mich = cardsOf("Climate Tradeoff DA - Michigan7 2021 BFPSW.docx");
const berk = cardsOf("States CP - Berkeley 2021.docx");
const card = (c: ImportedCard): ExportNode => ({ kind: "card", tag: c.tag, shortCite: c.cite?.short ?? shortCite(c.citation), fullCite: c.cite?.rest ?? fullCite(c.citation), body: c.body });
const pick = (list: ImportedCard[], startsWith: string) => list.find((c) => c.tag.startsWith(startsWith))!;

const ac: ExportNode[] = [
  { kind: "heading", level: 1, text: "1AC — SYNTHETIC TEST DOCUMENT" },
  { kind: "heading", level: 2, text: "Advantage 1 — Water Security" },
  { kind: "analytic", text: "Federal protection for ephemeral and intermittent streams is collapsing — millions of stream miles lost Clean Water Act coverage" },
  { kind: "analytic", text: "Unprotected headwaters contaminate downstream drinking water — pollution flows into the rivers that supply cities" },
  { kind: "analytic", text: "Water insecurity escalates into economic decline and regional conflict" },
  { kind: "heading", level: 2, text: "Plan" },
  { kind: "analytic", text: "Plan: The United States federal government should substantially expand protection of ephemeral streams, intermittent streams, and wetlands under the Clean Water Act." },
  { kind: "heading", level: 2, text: "Solvency" },
  { kind: "analytic", text: "Only uniform federal standards stop a race to the bottom between states" },
  { kind: "analytic", text: "Federal enforcement deters polluters that states cannot reach across borders" },
];
const nc: ExportNode[] = [
  { kind: "heading", level: 1, text: "1NC — SYNTHETIC TEST DOCUMENT" },
  { kind: "heading", level: 2, text: "States CP" },
  { kind: "analytic", text: "Text: The fifty states and all relevant territories in the United States should substantially expand protection of ephemeral streams, intermittent streams, and wetlands." },
  card(pick(berk, "States solve better")),
  card(pick(berk, "The CP ensures effective agency regulation")),
  { kind: "heading", level: 2, text: "Climate Tradeoff DA" },
  card(pick(mich, "Biden’s focusing on climate change")),
  card(pick(mich, "Water policies trade off with climate policies")),
  card(pick(mich, "Extinction")),
  { kind: "heading", level: 2, text: "Case — Water Security" },
  { kind: "analytic", text: "No water wars — states cooperate over shared water far more often than they fight" },
  { kind: "analytic", text: "Alternate causes — agricultural runoff, not ephemeral streams, drives drinking water contamination" },
];
writeFileSync(path.join(out, "SYNTHETIC 1AC.docx"), buildDocx(ac, { title: "SYNTHETIC 1AC" }));
writeFileSync(path.join(out, "SYNTHETIC 1NC.docx"), buildDocx(nc, { title: "SYNTHETIC 1NC" }));
console.log("wrote", out);

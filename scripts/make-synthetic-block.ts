/** SYNTHETIC 2NC/1NR test docs from real camp-file 2NC material (kept out of git). */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseDocx } from "@/server/ingest/docx";
import { structureDocument, type ImportedCard, type ImportedItem } from "@/server/ingest/structure";
import { buildDocx, type ExportNode } from "@/server/export/docx-writer";

const dir = `${process.env.HOME}/Projects/debate-backups/research-samples`;
const out = process.argv[2];
const items = (f: string) => structureDocument(parseDocx(new Uint8Array(readFileSync(path.join(dir, f)))).paragraphs).items;
const berk = items("States CP - Berkeley 2021.docx");
const mich = items("Climate Tradeoff DA - Michigan7 2021 BFPSW.docx");
const toNode = (it: ImportedItem): ExportNode | null =>
  it.kind === "card" ? { kind: "card", tag: it.tag, shortCite: it.cite?.short ?? "", fullCite: it.cite?.rest ?? "", body: it.body } : it.kind === "analytic" ? { kind: "analytic", text: it.text } : null;
function blockUnder(list: ImportedItem[], heading: string): ExportNode[] {
  const out: ExportNode[] = [];
  let on = false;
  for (const it of list) {
    if (it.kind === "heading") {
      if (on && it.level <= 3) break;
      on = it.text === heading;
      continue;
    }
    if (on) {
      const n = toNode(it);
      if (n) out.push(n);
    }
  }
  return out;
}
const nc2: ExportNode[] = [
  { kind: "heading", level: 1, text: "2NC — SYNTHETIC TEST DOCUMENT" },
  { kind: "heading", level: 2, text: "States CP" },
  { kind: "heading", level: 3, text: "AT: Perm Do Both" },
  ...blockUnder(berk, "AT: Perm Do Both"),
  { kind: "heading", level: 3, text: "AT: Uniformity" },
  ...blockUnder(berk, "AT: Uniformity").slice(0, 3),
  { kind: "heading", level: 3, text: "AT: Interstate" },
  ...blockUnder(berk, "AT: Interstate"),
];
const nr1: ExportNode[] = [
  { kind: "heading", level: 1, text: "1NR — SYNTHETIC TEST DOCUMENT" },
  { kind: "heading", level: 2, text: "Climate Tradeoff DA" },
  { kind: "analytic", text: "Extend Newburger — climate is the budget priority now; their non-unique argument misreads the card: water spending is already allocated, the plan adds new demands" },
  { kind: "analytic", text: "AT: No link — regulation requires enforcement staff and money; the plan expands jurisdiction to millions of stream miles" },
  { kind: "heading", level: 3, text: "Impact — Econ" },
  ...blockUnder(mich, "Block - ! - Econ"),
  { kind: "heading", level: 2, text: "Case — Water Security" },
  { kind: "analytic", text: "Extend no water wars — their 2AC answer only says conflict happens; the risk of escalation from domestic water policy is zero" },
];
writeFileSync(path.join(out, "SYNTHETIC 2NC.docx"), buildDocx(nc2, { title: "SYNTHETIC 2NC" }));
writeFileSync(path.join(out, "SYNTHETIC 1NR.docx"), buildDocx(nr1, { title: "SYNTHETIC 1NR" }));
console.log("ok", nc2.length, nr1.length);

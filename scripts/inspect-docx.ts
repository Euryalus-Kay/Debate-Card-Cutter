import { readFileSync } from "node:fs";
import { parseDocx } from "@/server/ingest/docx";
import { structureDocument } from "@/server/ingest/structure";
const f = process.argv[2];
const p = parseDocx(new Uint8Array(readFileSync(f)));
const s = structureDocument(p.paragraphs);
let shown = 0;
for (const it of s.items) {
  if (shown++ > Number(process.env.MAX ?? 14)) break;
  if (it.kind === "card") console.log("CARD", JSON.stringify(it.tag.slice(0, 80)), "| cite:", JSON.stringify(it.cite?.short), "| body paras:", it.body.length, "| hl:", it.body.reduce((a, b) => a + b.highlight.length, 0), "| ul:", it.body.reduce((a, b) => a + b.underline.length, 0));
  else if (it.kind === "analytic") console.log("ANALYTIC", JSON.stringify(it.text.slice(0, 100)), "path", it.path.join(" > "));
  else console.log("H" + it.level, JSON.stringify(it.text.slice(0, 80)));
}

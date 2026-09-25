import { readFileSync } from "node:fs";
import { parseDocx } from "@/server/ingest/docx";
const p = parseDocx(new Uint8Array(readFileSync(process.argv[2])));
for (const para of p.paragraphs.slice(Number(process.argv[3] ?? 0), Number(process.argv[4] ?? 12))) {
  console.log(`#${para.index} H${para.headingLevel} style=${para.styleId}/${para.styleName} runs=${para.runs.length}`);
  for (const r of para.runs.slice(0, 6)) console.log(`   [${r.props.bold ? "B" : ""}${r.props.underline ? "U" : ""}${r.props.highlight ? "H:" + r.props.highlight : ""}${r.emphasis ? "E" : ""} sz=${r.props.size ?? ""} cs=${r.charStyle ?? ""}/${r.charStyleName ?? ""}] ${JSON.stringify(r.text.slice(0, 70))}`);
}

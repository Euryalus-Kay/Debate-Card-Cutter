/**
 * How humans highlighted real Verbatim cards (the user's supplied files).
 * Prints aggregate statistics only (and a few read-aloud examples when --examples).
 *   npx tsx scripts/highlight-stats.ts docs/research/samples [--examples]
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseDocx } from "@/server/ingest/docx";
import { structureDocument, type ImportedCard } from "@/server/ingest/structure";
import { normalizeSpans, type BodyText } from "@/domain/card";
import { highlightMetrics } from "@/domain/highlight-metrics";

const dir = process.argv[2];
const examples = process.argv.includes("--examples");
const rows: ReturnType<typeof highlightMetrics>[] = [];
let shown = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith(".docx"))) {
  const s = structureDocument(parseDocx(new Uint8Array(readFileSync(path.join(dir, f)))).paragraphs);
  for (const c of s.items.filter((i): i is ImportedCard => i.kind === "card")) {
    const texts = c.body.filter((b): b is BodyText => b.kind === "text");
    if (!texts.some((t) => normalizeSpans(t.highlight, t.text.length).length)) continue;
    const m = highlightMetrics(c.body);
    rows.push(m);
    if (examples && shown < 6) {
      shown++;
      console.log(`\n[${f.slice(0, 20)}] TAG: ${c.tag.slice(0, 100)}\n  READ (${m.readWords}w of ${m.totalWords}, ${m.fragments} fragments): ${m.readText.slice(0, 420)}`);
    }
  }
}
const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const col = (k: keyof (typeof rows)[number]) => rows.map((r) => r[k] as number);
console.log(`\ncards with highlighting: ${rows.length}`);
for (const k of ["totalWords", "readWords", "ratio", "fragments", "meanFragmentWords", "oneWordFragmentShare", "danglingShare", "partialWordFragments", "fragmentsPer100", "sentencesWithVerbShare"] as const) {
  const v = col(k);
  console.log(`${k.padEnd(24)} p10 ${q(v, 0.1).toFixed(2).padStart(7)}  median ${q(v, 0.5).toFixed(2).padStart(7)}  p90 ${q(v, 0.9).toFixed(2).padStart(7)}`);
}

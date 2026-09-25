import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseDocx } from "@/server/ingest/docx";
import { structureDocument, type ImportedCard } from "@/server/ingest/structure";
const dir = process.argv[2];
let total = 0, withCite = 0, withYear = 0, withUrl = 0, withTitle = 0, emptyBody = 0;
const misses: string[] = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith(".docx"))) {
  const s = structureDocument(parseDocx(new Uint8Array(readFileSync(path.join(dir, f)))).paragraphs);
  for (const c of s.items.filter((i): i is ImportedCard => i.kind === "card")) {
    total++;
    if (c.cite) withCite++; else misses.push(`${f}: ${c.tag.slice(0, 60)}`);
    if (c.citation.date?.year) withYear++;
    if (c.citation.url) withUrl++;
    if (c.citation.title) withTitle++;
    if (!c.body.length) emptyBody++;
  }
}
console.log({ total, withCite, withYear, withUrl, withTitle, emptyBody });
console.log(misses.slice(0, 10).join("\n"));
for (const f of readdirSync(dir).filter((x) => x.endsWith(".docx"))) {
  const s = structureDocument(parseDocx(new Uint8Array(readFileSync(path.join(dir, f)))).paragraphs);
  for (const c of s.items.filter((i): i is ImportedCard => i.kind === "card")) if (!c.citation.date?.year) console.log("NOYEAR", JSON.stringify(c.cite?.short), "|", c.cite?.rest.slice(0, 90));
}

/**
 * Does "card for" change the cut (Phase D)? The same claims and pages cut for the 1AC and for the 1AR:
 * excerpt and read length against the measured medians (1AC 88 read words, 1AR 57). Counts only.
 *   npx tsx --env-file=.env.local scripts/bench/card-use.ts <out.json>
 */
import { writeFileSync } from "node:fs";
import { fetchSource } from "@/server/research/fetcher";
import { cutCard } from "@/server/research/cut";
import { readAloud, verbatimText } from "@/domain/card";
import { CARD_USE, type CardUse } from "@/domain/card-use";

const CASES = [
  { url: "https://legal-planet.org/2023/04/11/does-upzoning-reduce-housing-prices/", claim: "Upzoning alone cannot solve housing affordability" },
  { url: "https://www.governing.com/community/zoning-changes-small-impact-on-housing-supply-affordability-study", claim: "Zoning reform has only a small effect on housing supply" },
];
const USES: CardUse[] = ["1AC", "1AR"];
const rows: unknown[] = [];
for (const c of CASES) {
  const f = await fetchSource(c.url);
  if (!f.ok) {
    rows.push({ url: c.url, error: f.error });
    continue;
  }
  for (const use of USES) {
    const r = await cutCard({ claim: c.claim, source: { title: f.metadata.title, url: f.finalUrl }, paragraphs: f.paragraphs, sourceText: f.text, dehyphenate: f.format === "pdf", use, side: "aff" });
    const b = r.built;
    const row = b ? { url: c.url, use, target: CARD_USE[use].readWords, excerptWords: verbatimText(b.body).split(/\s+/).length, readWords: readAloud(b.body).text.split(/\s+/).length, verified: b.verification.ok } : { url: c.url, use, rejected: r.rejectedReason };
    console.log(JSON.stringify(row));
    rows.push(row);
  }
}
writeFileSync(process.argv[2], JSON.stringify({ at: new Date().toISOString(), note: "Counts only.", rows }, null, 2));

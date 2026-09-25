/**
 * Live check of fetch → cut → verify on real pages, across models.
 *   env -u ANTHROPIC_BASE_URL npx tsx --env-file=.env.local scripts/try-cut.ts
 * Writes docs/evals/results/card-cut-<date>.json.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { fetchSource } from "@/server/research/fetcher";
import { cutCard } from "@/server/research/cut";
import { buildCitation } from "@/server/research/cite";
import { lintCard } from "@/domain/lint";
import { fullCite, shortCite } from "@/domain/citation";
import { readAloud } from "@/domain/card";
import { MODELS, type ModelSpec } from "@/server/ai/models";

const SETS: Record<string, { url: string; claim: string }[]> = {
  run1: [
    { url: "https://legal-planet.org/2023/04/11/does-upzoning-reduce-housing-prices/", claim: "Upzoning reduces housing prices" },
    { url: "https://www.planetizen.com/news/2023/12/126834-upzoning-affordability-impacts-latest-research", claim: "Credible research shows upzoning increases housing supply and affordability" },
    { url: "https://vhc.virginia.gov/Zoning%20and%20Construction.pdf", claim: "Upzoning fails to produce affordable housing for low-income households" },
    { url: "https://www.governing.com/community/zoning-changes-small-impact-on-housing-supply-affordability-study", claim: "Zoning reform dramatically lowers rents" },
  ],
  run3: [
    { url: "https://www.sciencedirect.com/science/article/pii/S0094119024000597", claim: "Relaxing land-use regulation increases housing construction" },
    { url: "https://doi.org/10.3386/w8835", claim: "Zoning restrictions are the main cause of high housing prices" },
    { url: "https://legal-planet.org/2023/04/11/does-upzoning-reduce-housing-prices/", claim: "Upzoning alone cannot solve housing affordability" },
  ],
};
const CASES = SETS[process.env.SET ?? "run1"];

const CONFIGS: Record<string, ModelSpec[]> = {
  "opus55-low": [{ model: MODELS.opus55, effort: "low", maxOutputTokens: 8000 }],
  "sonnet5-off": [{ model: MODELS.sonnet5, thinkingOff: true, maxOutputTokens: 8000 }],
  "sonnet5-low": [{ model: MODELS.sonnet5, effort: "low", maxOutputTokens: 8000 }],
  haiku45: [{ model: MODELS.haiku45, maxOutputTokens: 8000 }],
};

const only = process.argv[2];
const results: unknown[] = [];
for (const c of CASES) {
  const t0 = Date.now();
  const src = await fetchSource(c.url);
  console.log(`\n=== ${c.url}\n  fetch: ok=${src.ok} method=${src.method} ${Date.now() - t0}ms paragraphs=${src.paragraphs.length} chars=${src.text.length} ${src.error ?? ""}`);
  console.log(`  meta: title="${src.metadata.title}" authors=${JSON.stringify(src.metadata.authors)} published=${src.metadata.published} site=${src.metadata.siteName}`);
  if (!src.ok) {
    results.push({ case: c, fetch: { ok: false, error: src.error, blocked: src.blocked } });
    continue;
  }
  for (const [name, models] of Object.entries(CONFIGS)) {
    if (only && name !== only) continue;
    const t1 = Date.now();
    try {
      const r = await cutCard({ claim: c.claim, source: { title: src.metadata.title, publication: src.metadata.siteName, url: src.finalUrl, knownAuthors: src.metadata.authors, published: src.metadata.published }, paragraphs: src.paragraphs, sourceText: src.text, dehyphenate: src.format === "pdf", models });
      const ms = Date.now() - t1;
      if (!r.built) {
        console.log(`  [${name}] ${ms}ms NO CARD: ${r.rejectedReason}`);
        results.push({ case: c, config: name, ms, ttft: r.run.ttftMs, verdict: r.run.output.verdict, reason: r.rejectedReason });
        continue;
      }
      const { citation, rejected } = buildCitation({ url: src.finalUrl, metadata: src.metadata, byline: r.run.output.byline, sourceText: src.text, accessed: new Date().toISOString().slice(0, 10) });
      const lint = lintCard({ tag: r.built.tag, body: r.built.body, citation });
      const read = readAloud(r.built.body).text;
      console.log(`  [${name}] ${ms}ms ttft=${r.run.ttftMs} verified=${r.built.verification.ok} paras=${r.built.paragraphRange.join("-")} read=${r.built.readWords}w hl=${(r.built.highlightRatio * 100).toFixed(0)}% missing=${r.built.missingPhrases.length} support=${r.run.output.support.level}`);
      console.log(`     TAG: ${r.built.tag}`);
      console.log(`     CITE: ${shortCite(citation)} — ${fullCite(citation)}`);
      if (rejected.length) console.log(`     rejected cite fields: ${rejected.join("; ")}`);
      console.log(`     READ: ${read.slice(0, 400)}`);
      for (const i of lint.filter((x) => x.severity !== "info")) console.log(`     LINT ${i.severity}: ${i.code} ${i.message.slice(0, 140)}`);
      results.push({
        case: c,
        config: name,
        ms,
        ttft: r.run.ttftMs,
        usage: r.run.usage,
        verified: r.built.verification.ok,
        paragraphRange: r.built.paragraphRange,
        readWords: r.built.readWords,
        highlightRatio: r.built.highlightRatio,
        missingPhrases: r.built.missingPhrases,
        support: r.run.output.support,
        tag: r.built.tag,
        shortCite: shortCite(citation),
        fullCite: fullCite(citation),
        rejectedCite: rejected,
        read,
        lint: lint.map((i) => ({ s: i.severity, c: i.code, m: i.message })),
      });
    } catch (e) {
      console.log(`  [${name}] ERROR ${e instanceof Error ? e.message : e}`);
      results.push({ case: c, config: name, error: String(e) });
    }
  }
}
mkdirSync("docs/evals/results", { recursive: true });
writeFileSync(`docs/evals/results/card-cut-${process.env.SET ?? "run1"}${only ? `-${only}` : ""}.json`, JSON.stringify(results, null, 2));

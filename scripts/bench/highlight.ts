/**
 * Highlighting benchmark on real human-highlighted cards (the user's supplied
 * Verbatim files). Each card's marks are removed, each model re-highlights it
 * to the same read length the human chose, and every version (including the
 * human's) is scored:
 *   - agreement with the human highlight (word-level F1),
 *   - readability metrics (domain/highlight-metrics.ts),
 *   - blind 1–10 ratings from two judges of different model families.
 *
 *   npx tsx --env-file=.env.local scripts/bench/highlight.ts docs/research/samples [cards=16]
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { parseDocx } from "@/server/ingest/docx";
import { structureDocument, type ImportedCard } from "@/server/ingest/structure";
import { normalizeSpans, readAloud, makeText, type BodyBlock, type BodyText } from "@/domain/card";
import { highlightMetrics, highlightOverlap } from "@/domain/highlight-metrics";
import { highlightCard } from "@/server/research/highlight";
import { runStructured } from "@/server/ai/run";
import { MODELS, type ModelSpec } from "@/server/ai/models";

const dir = process.argv[2] ?? "docs/research/samples";
const limit = Number(process.argv[3] ?? 16);
const only = process.env.ONLY?.split(",");

// USD per million tokens (standard rates; Gemini 3.8 Flash promo rate through 2026-12-31).
const PRICE: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
  "gemini-3.8-flash": [0.75, 3.75],
};

const GENERATORS: Record<string, ModelSpec[]> = {
  "Opus 5.5 · low": [{ model: MODELS.opus55, effort: "low", maxOutputTokens: 6000 }],
  "Opus 5.5 · medium": [{ model: MODELS.opus55, effort: "medium", maxOutputTokens: 12000 }],
  "Sonnet 5 · thinking off": [{ model: MODELS.sonnet5, thinkingOff: true, maxOutputTokens: 6000 }],
  "Sonnet 5 · low": [{ model: MODELS.sonnet5, effort: "low", maxOutputTokens: 6000 }],
  "Haiku 4.5": [{ model: MODELS.haiku45, maxOutputTokens: 6000 }],
  "Gemini 3.8 Flash · low": [{ model: MODELS.gemini38flash, effort: "low", maxOutputTokens: 6000 }],
  "Gemini 3.8 Flash · medium": [{ model: MODELS.gemini38flash, effort: "medium", maxOutputTokens: 12000 }],
};

const JudgeSchema = z.object({
  comprehension: z.number().describe("1-10: from the read-aloud words alone, would a judge understand the tag's claim AND the reason it is true?"),
  fluency: z.number().describe("1-10: does it sound like sentences someone can follow at speed (10), or scattered words (1)?"),
  fidelity: z.number().describe("1-10: does it represent what the author actually says, with negations, qualifiers, and context intact (10), or distort it (1)?"),
  efficiency: z.number().describe("1-10: are the read words well spent for their length — no filler, no repetition (10)?"),
  overall: z.number().describe("1-10: overall quality as a highlighted debate card"),
  note: z.string().describe("one short sentence on the biggest strength or weakness"),
});

const JUDGES: Record<string, ModelSpec[]> = {
  claude: [{ model: MODELS.opus55, effort: "low", maxOutputTokens: 2000 }],
  gemini: [{ model: MODELS.gemini38flash, effort: "medium", maxOutputTokens: 4000 }],
};

const JUDGE_SYSTEM = `You are an experienced policy debate coach grading how a debate card is highlighted. The highlighted words are exactly what the speaker reads aloud, in order; the rest of the card is not read. Grade only the highlighting (not the evidence itself, and not the tag's wording). Be strict and consistent: 5 is ordinary, 8+ is what a strong varsity debater would produce.`;

function cost(model: string, usage: { inputTokens?: number; outputTokens?: number } | null | undefined): number {
  const p = PRICE[model];
  if (!p || !usage) return 0;
  return ((usage.inputTokens ?? 0) * p[0] + (usage.outputTokens ?? 0) * p[1]) / 1e6;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

// ---- Load human-highlighted cards ----
const cards: { file: string; tag: string; human: BodyBlock[]; blank: BodyBlock[] }[] = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith(".docx")).sort()) {
  const s = structureDocument(parseDocx(new Uint8Array(readFileSync(path.join(dir, f)))).paragraphs);
  for (const c of s.items.filter((i): i is ImportedCard => i.kind === "card")) {
    const texts = c.body.filter((b): b is BodyText => b.kind === "text");
    if (!texts.some((t) => normalizeSpans(t.highlight, t.text.length).length)) continue;
    const blank = c.body.map((b) => (b.kind === "text" ? makeText(b.text, { newParagraph: b.newParagraph }) : b));
    cards.push({ file: f, tag: c.tag, human: c.body, blank });
  }
}
// Deterministic spread across files: every other card, up to the limit.
const selected = cards.filter((_, i) => i % 2 === 0).slice(0, limit);
console.log(`human-highlighted cards: ${cards.length}; benchmarking ${selected.length}`);

interface Version {
  card: number;
  source: string;
  read: string;
  readWords: number;
  targetWords: number;
  metrics: ReturnType<typeof highlightMetrics>;
  f1: number;
  ms: number;
  cost: number;
  repaired: boolean;
  unmatched: number;
  protectedWords: number;
  error?: string;
  judge?: Record<string, z.infer<typeof JudgeSchema> | { error: string }>;
}
const versions: Version[] = [];

// ---- Generate ----
const gens = Object.entries(GENERATORS).filter(([name]) => !only || only.some((o) => name.toLowerCase().includes(o.toLowerCase())));
for (const [ci, c] of selected.entries()) {
  const hm = highlightMetrics(c.human);
  versions.push({ card: ci, source: "Human (original file)", read: readAloud(c.human).text, readWords: hm.readWords, targetWords: hm.readWords, metrics: hm, f1: 1, ms: 0, cost: 0, repaired: false, unmatched: 0, protectedWords: 0 });
}
const jobs = selected.flatMap((c, ci) => gens.map(([name, models]) => ({ c, ci, name, models })));
const t0 = Date.now();
const produced = await pool(jobs, 5, async ({ c, ci, name, models }) => {
  const target = highlightMetrics(c.human).readWords;
  const started = Date.now();
  try {
    const r = await highlightCard({ tag: c.tag, body: c.blank, targetWords: target, models, repair: true });
    const v: Version = {
      card: ci,
      source: name,
      read: r.read,
      readWords: r.metrics.readWords,
      targetWords: target,
      metrics: r.metrics,
      f1: highlightOverlap(r.body, c.human).f1,
      ms: Date.now() - started,
      cost: r.runs.reduce((a, x) => a + cost(x.model, x.usage as never), 0),
      repaired: r.repaired,
      unmatched: r.unmatched.length,
      protectedWords: r.protectedWords.length,
    };
    process.stdout.write(".");
    return v;
  } catch (e) {
    process.stdout.write("x");
    return { card: ci, source: name, read: "", readWords: 0, targetWords: target, metrics: highlightMetrics(c.blank), f1: 0, ms: Date.now() - started, cost: 0, repaired: false, unmatched: 0, protectedWords: 0, error: e instanceof Error ? e.message.slice(0, 200) : String(e) } as Version;
  }
});
versions.push(...produced);
console.log(`\ngenerated ${produced.length} highlights in ${Math.round((Date.now() - t0) / 1000)} s`);

// ---- Judge (blind: each version scored alone; the judge doesn't know who produced it) ----
const toJudge = versions.filter((v) => !v.error && v.read);
await pool(toJudge, 6, async (v) => {
  const c = selected[v.card];
  const full = c.blank.filter((b): b is BodyText => b.kind === "text").map((b) => b.text).join("\n\n");
  v.judge = {};
  for (const [jname, models] of Object.entries(JUDGES)) {
    try {
      const r = await runStructured({
        task: "coverage_review",
        system: JUDGE_SYSTEM,
        prompt: `TAG: ${c.tag}\n\nFULL CARD TEXT:\n${full}\n\nREAD ALOUD (${v.readWords} words; "…" marks skipped text):\n${v.metrics.readText}`,
        schema: JudgeSchema,
        models,
      });
      v.judge[jname] = r.output;
    } catch (e) {
      v.judge[jname] = { error: e instanceof Error ? e.message.slice(0, 120) : String(e) };
    }
  }
  process.stdout.write("j");
});

// ---- Summarize ----
const sources = [...new Set(versions.map((v) => v.source))];
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const score = (v: Version, j: string, k: keyof z.infer<typeof JudgeSchema>) => {
  const s = v.judge?.[j];
  return s && !("error" in s) ? (s[k] as number) : NaN;
};
const rows = sources.map((src) => {
  const vs = versions.filter((v) => v.source === src && !v.error);
  const js = (j: string, k: keyof z.infer<typeof JudgeSchema>) => avg(vs.map((v) => score(v, j, k)).filter((x) => !Number.isNaN(x)));
  return {
    source: src,
    n: vs.length,
    errors: versions.filter((v) => v.source === src && v.error).length,
    overallClaude: js("claude", "overall"),
    overallGemini: js("gemini", "overall"),
    comprehension: avg([js("claude", "comprehension"), js("gemini", "comprehension")]),
    fluency: avg([js("claude", "fluency"), js("gemini", "fluency")]),
    fidelity: avg([js("claude", "fidelity"), js("gemini", "fidelity")]),
    efficiency: avg([js("claude", "efficiency"), js("gemini", "efficiency")]),
    f1VsHuman: avg(vs.map((v) => v.f1)),
    wordsVsTarget: avg(vs.map((v) => v.readWords / Math.max(1, v.targetWords))),
    fragmentsPer100: avg(vs.map((v) => v.metrics.fragmentsPer100)),
    oneWordShare: avg(vs.map((v) => v.metrics.oneWordFragmentShare)),
    danglingShare: avg(vs.map((v) => v.metrics.danglingShare)),
    seconds: avg(vs.map((v) => v.ms / 1000)),
    cost: avg(vs.map((v) => v.cost)),
    repairedShare: avg(vs.map((v) => (v.repaired ? 1 : 0))),
  };
});
console.log("\n\nsource | n | overall (Claude judge) | overall (Gemini judge) | comprehension | fluency | fidelity | efficiency | F1 vs human | length/target | frag/100w | 1-word | dangling | sec | $ | repaired");
for (const r of rows)
  console.log(
    [r.source, `${r.n}${r.errors ? ` (${r.errors} err)` : ""}`, r.overallClaude.toFixed(2), r.overallGemini.toFixed(2), r.comprehension.toFixed(2), r.fluency.toFixed(2), r.fidelity.toFixed(2), r.efficiency.toFixed(2), r.f1VsHuman.toFixed(2), r.wordsVsTarget.toFixed(2), r.fragmentsPer100.toFixed(1), r.oneWordShare.toFixed(2), r.danglingShare.toFixed(2), r.seconds.toFixed(1), r.cost.toFixed(4), r.repairedShare.toFixed(2)].join(" | "),
  );
mkdirSync("docs/evals/results", { recursive: true });
const out = `docs/evals/results/highlight-bench-${process.env.RUN ?? "run1"}.json`;
// Store scores and metrics, not the card text (the files are the user's; keep them out of git).
writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), cards: selected.length, rows, versions: versions.map(({ read: _r, ...v }) => ({ ...v, metrics: { ...v.metrics, readText: undefined } })) }, null, 2));
console.log(`\nwrote ${out}`);

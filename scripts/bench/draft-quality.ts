/**
 * Blind pairwise quality test for speech drafting on one round (a synthetic
 * test round). Every challenger config drafts the same speeches as the
 * baseline (Opus 5.5 low, the current fast draft); each pair is judged by two
 * model families in both orders (to cancel position bias). Judges see exactly
 * the evidence the drafters saw. Drafts go through the product's automatic
 * trim/fill to time, as a user would get them.
 *
 *   npx tsx --env-file=.env.local scripts/bench/draft-quality.ts <roundId> [repeats=3]
 *   RUN=run2 TEXTS=/path/to/scratch/texts.json CONFIGS=opus-medium,gemini-medium …
 */
import { writeFileSync } from "node:fs";
import { z } from "zod";
import { draftSpeech } from "@/server/ai/ops";
import { runStructured } from "@/server/ai/run";
import { buildRoundContext } from "@/server/ai/context";
import { MODELS, type ModelSpec } from "@/server/ai/models";
import type { SpeechDraftOutput } from "@/server/ai/schemas";
import type { SpeechId } from "@/domain/format";

const roundId = process.argv[2];
const repeats = Number(process.argv[3] ?? 3);
const EVIDENCE = "selected_plus_library" as const;
const BASELINE = "opus-low";
const ALL: Record<string, { models: ModelSpec[]; mode: "fast" | "deep" }> = {
  "opus-low": { models: [{ model: MODELS.opus55, effort: "low", maxOutputTokens: 16000 }], mode: "fast" },
  "opus-medium": { models: [{ model: MODELS.opus55, effort: "medium", maxOutputTokens: 24000 }], mode: "deep" },
  "gemini-low": { models: [{ model: MODELS.gemini38flash, effort: "low", maxOutputTokens: 16000 }], mode: "fast" },
  "gemini-medium": { models: [{ model: MODELS.gemini38flash, effort: "medium", maxOutputTokens: 24000 }], mode: "deep" },
};
const challengers = (process.env.CONFIGS ?? "opus-medium,gemini-low,gemini-medium").split(",").filter((c) => c in ALL && c !== BASELINE);
const CONFIGS = Object.fromEntries([BASELINE, ...challengers].map((c) => [c, ALL[c]]));
const SPEECHES: SpeechId[] = ["1AR", "2AC"];
// $ per million tokens (input, output), list prices.
const PRICE: Record<string, [number, number]> = { "claude-opus-5-5": [4, 20], "gemini-3.8-flash": [0.5, 3] };

const Verdict = z.object({
  winner: z.enum(["A", "B", "tie"]),
  scoreA: z.number().describe("1-10"),
  scoreB: z.number().describe("1-10"),
  reasons: z.string().describe("two or three sentences: the decisive differences"),
});
const JUDGES: Record<string, ModelSpec[]> = {
  claude: [{ model: MODELS.opus55, effort: "medium", maxOutputTokens: 4000 }],
  gemini: [{ model: MODELS.gemini38flash, effort: "medium", maxOutputTokens: 6000 }],
};

async function retry<T>(f: () => Promise<T>, label: string): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await f();
    } catch (e) {
      if (i >= 3) throw e;
      console.log(`\n${label}: ${(e as Error).message.slice(0, 120)} — retrying`);
      await new Promise((r) => setTimeout(r, 15000 * (i + 1)));
    }
  }
}

function render(out: SpeechDraftOutput, tags: Map<string, string>): string {
  const lines: string[] = [];
  const kids = (ref: string) => out.sections.filter((s) => s.parentRef === ref);
  const walk = (ref: string, depth: number) => {
    for (const s of kids(ref)) {
      const pad = "  ".repeat(depth);
      lines.push(`${pad}## ${s.title}${s.targets.length ? `  (answers: ${s.targets.join(", ")})` : ""}`);
      if (s.analytic.trim()) lines.push(`${pad}${s.analytic.trim()}`);
      for (const c of s.cardIds) lines.push(`${pad}[CARD] ${tags.get(c) ?? c}`);
      walk(s.ref, depth + 1);
    }
  };
  walk("", 0);
  if (out.omitted?.length) lines.push(`(Deliberately not answered: ${out.omitted.map((o) => o.reason).join("; ")})`);
  return lines.join("\n");
}

type Draft = { speech: SpeechId; config: string; i: number; text: string; seconds: number; rawSeconds: number; adjusted: string; ms: number; cost: number; model: string };
const drafts: Draft[] = [];
for (const speech of SPEECHES) {
  const ctx = await buildRoundContext(roundId, { speech, evidenceMode: EVIDENCE });
  const tags = new Map(ctx.cards.map((c) => [c.id, `${c.tag} — ${c.shortCite}`]));
  const jobs = Object.entries(CONFIGS).flatMap(([config, c]) => Array.from({ length: repeats }, (_, i) => ({ config, c, i })));
  const results = await Promise.all(
    jobs.map(({ config, c, i }) =>
      retry(async () => {
        const t0 = Date.now();
        const r = await draftSpeech({ roundId, speech, draftId: null, mode: c.mode, cardIds: [], evidenceMode: EVIDENCE, instructions: "", teamId: "", models: c.models });
        const u = r.run as unknown as { model: string; usage?: { inputTokens?: number; outputTokens?: number } };
        const p = PRICE[u.model] ?? [0, 0];
        const adj = r.validation.lengthAdjust;
        process.stdout.write(".");
        return {
          speech,
          config,
          i,
          text: render(r.output, tags),
          seconds: r.validation.estimatedSeconds,
          rawSeconds: adj?.fromSeconds ?? r.validation.estimatedSeconds,
          adjusted: adj ? `${adj.mode} ${adj.fromSeconds}→${adj.toSeconds}s (${adj.sections})` : "",
          ms: Date.now() - t0,
          cost: ((u.usage?.inputTokens ?? 0) * p[0] + (u.usage?.outputTokens ?? 0) * p[1]) / 1e6,
          model: u.model,
        };
      }, `${speech} ${config} #${i}`),
    ),
  );
  drafts.push(...results);
  console.log(`\n${speech}: drafted ${results.length}`);
}
if (process.env.TEXTS) writeFileSync(process.env.TEXTS, JSON.stringify(drafts, null, 2));

type V = { speech: SpeechId; challenger: string; pair: number; judge: string; order: string; challengerWins: number; baseScore: number; challengerScore: number; reasons: string };
const verdicts: V[] = [];
for (const speech of SPEECHES) {
  const ctx = await buildRoundContext(roundId, { speech, evidenceMode: EVIDENCE });
  const tasks: (() => Promise<void>)[] = [];
  for (const challenger of challengers)
    for (let i = 0; i < repeats; i++) {
      const base = drafts.find((d) => d.speech === speech && d.config === BASELINE && d.i === i)!;
      const ch = drafts.find((d) => d.speech === speech && d.config === challenger && d.i === i)!;
      for (const [judge, models] of Object.entries(JUDGES))
        for (const order of ["base-first", "challenger-first"] as const)
          tasks.push(async () => {
            const [A, B] = order === "base-first" ? [base, ch] : [ch, base];
            const r = await retry(
              () =>
                runStructured({
                  task: "coverage_review",
                  system:
                    "You are an expert high school policy debate judge and coach. Compare two versions of the same speech prepared for this round. Judge which would do more to win the round: answering everything that must be answered, the quality of warrants and clash (specific reasons, comparison, implications), strategic choices, fitting the time limit, and clarity for the judge. Do not reward length for its own sake. The EVIDENCE section of the round context lists every card available to the team; reading or extending any of those cards is legitimate. Only a card that is not in that list would be fabricated.",
                  context: ctx.text,
                  prompt: `SPEECH: ${speech} (time limit ${ctx.limitSeconds} s)\n\nVERSION A (estimated ${Math.round(A.seconds)} s):\n${A.text}\n\nVERSION B (estimated ${Math.round(B.seconds)} s):\n${B.text}`,
                  schema: Verdict,
                  models,
                }),
              `judge ${judge} ${speech} ${challenger} #${i}`,
            );
            const v = r.output;
            const baseIsA = order === "base-first";
            verdicts.push({
              speech,
              challenger,
              pair: i,
              judge,
              order,
              challengerWins: v.winner === "tie" ? 0.5 : (v.winner === "A") === baseIsA ? 0 : 1,
              baseScore: baseIsA ? v.scoreA : v.scoreB,
              challengerScore: baseIsA ? v.scoreB : v.scoreA,
              reasons: v.reasons,
            });
            process.stdout.write("j");
          });
    }
  // A few at a time: the free Gemini tier rate-limits bursts.
  for (let k = 0; k < tasks.length; k += 6) await Promise.all(tasks.slice(k, k + 6).map((t) => t()));
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
console.log("\n");
for (const speech of SPEECHES) {
  for (const config of Object.keys(CONFIGS)) {
    const dc = drafts.filter((x) => x.speech === speech && x.config === config);
    console.log(`${speech} ${config.padEnd(14)} time ${avg(dc.map((x) => x.ms / 1000)).toFixed(0)} s · raw length ${dc.map((x) => Math.round(x.rawSeconds)).join("/")} s → final ${dc.map((x) => Math.round(x.seconds)).join("/")} s · cost $${avg(dc.map((x) => x.cost)).toFixed(3)}`);
  }
  for (const challenger of challengers) {
    const v = verdicts.filter((x) => x.speech === speech && x.challenger === challenger);
    console.log(`${speech} ${challenger} vs ${BASELINE}: challenger wins ${(100 * avg(v.map((x) => x.challengerWins))).toFixed(0)}% of ${v.length} · scores ${BASELINE} ${avg(v.map((x) => x.baseScore)).toFixed(2)} vs ${avg(v.map((x) => x.challengerScore)).toFixed(2)}`);
    for (const j of Object.keys(JUDGES)) {
      const vj = v.filter((x) => x.judge === j);
      console.log(`   ${j} judge: challenger wins ${(100 * avg(vj.map((x) => x.challengerWins))).toFixed(0)}% · ${avg(vj.map((x) => x.baseScore)).toFixed(2)} vs ${avg(vj.map((x) => x.challengerScore)).toFixed(2)}`);
    }
  }
}
writeFileSync(`docs/evals/results/draft-quality-${process.env.RUN ?? "run1"}.json`, JSON.stringify({ at: new Date().toISOString(), roundId, baseline: BASELINE, evidence: EVIDENCE, drafts: drafts.map(({ text: _t, ...x }) => x), verdicts }, null, 2));
console.log("wrote results");

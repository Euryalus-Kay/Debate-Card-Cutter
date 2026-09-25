/**
 * Blind pairwise quality test: Opus 5.5 at low vs medium effort on the same
 * round (synthetic test round), for the 1AR and the 2AC. Each pair is judged
 * by two model families in both orders (to cancel position bias).
 *
 *   npx tsx --env-file=.env.local scripts/bench/draft-quality.ts <roundId> [repeats=3]
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
const CONFIGS: Record<string, ModelSpec[]> = {
  low: [{ model: MODELS.opus55, effort: "low", maxOutputTokens: 16000 }],
  medium: [{ model: MODELS.opus55, effort: "medium", maxOutputTokens: 24000 }],
};
const SPEECHES: SpeechId[] = ["1AR", "2AC"];
const PRICE: Record<string, [number, number]> = { "claude-opus-5-5": [4, 20] };

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

const drafts: { speech: SpeechId; config: string; i: number; text: string; seconds: number; ms: number; cost: number }[] = [];
for (const speech of SPEECHES) {
  const ctx = await buildRoundContext(roundId, { speech, evidenceMode: "selected_plus_library" });
  const tags = new Map(ctx.cards.map((c) => [c.id, `${c.tag}`]));
  const jobs = Object.entries(CONFIGS).flatMap(([config, models]) => Array.from({ length: repeats }, (_, i) => ({ config, models, i })));
  const results = await Promise.all(
    jobs.map(async ({ config, models, i }) => {
      const t0 = Date.now();
      const r = await draftSpeech({ roundId, speech, draftId: null, mode: config === "low" ? "fast" : "deep", cardIds: [], evidenceMode: "selected_plus_library", instructions: "", teamId: "", models });
      const u = r.run as unknown as { model: string; usage?: { inputTokens?: number; outputTokens?: number } };
      const p = PRICE[u.model] ?? [0, 0];
      return { speech, config, i, text: render(r.output, tags), seconds: r.validation.estimatedSeconds, ms: Date.now() - t0, cost: ((u.usage?.inputTokens ?? 0) * p[0] + (u.usage?.outputTokens ?? 0) * p[1]) / 1e6 };
    }),
  );
  drafts.push(...results);
  console.log(`${speech}: drafted ${results.length}`);
}

const verdicts: { speech: SpeechId; pair: number; judge: string; order: string; lowWins: number; lowScore: number; medScore: number; reasons: string }[] = [];
for (const speech of SPEECHES) {
  const ctx = await buildRoundContext(roundId, { speech, evidenceMode: "selected_only" });
  for (let i = 0; i < repeats; i++) {
    const low = drafts.find((d) => d.speech === speech && d.config === "low" && d.i === i)!;
    const med = drafts.find((d) => d.speech === speech && d.config === "medium" && d.i === i)!;
    await Promise.all(
      Object.entries(JUDGES).flatMap(([judge, models]) =>
        (["low-first", "medium-first"] as const).map(async (order) => {
          const [A, B] = order === "low-first" ? [low, med] : [med, low];
          const r = await runStructured({
            task: "coverage_review",
            system: "You are an expert high school policy debate judge and coach. Compare two versions of the same speech prepared for this round. Judge which would do more to win the round: answering everything that must be answered, the quality of warrants and clash (specific reasons, comparison, implications), strategic choices, fitting the time limit, and clarity for the judge. Do not reward length for its own sake.",
            context: ctx.text,
            prompt: `SPEECH: ${speech} (time limit ${ctx.limitSeconds} s)\n\nVERSION A (estimated ${Math.round(A.seconds)} s):\n${A.text}\n\nVERSION B (estimated ${Math.round(B.seconds)} s):\n${B.text}`,
            schema: Verdict,
            models,
          });
          const v = r.output;
          const lowIsA = order === "low-first";
          verdicts.push({
            speech,
            pair: i,
            judge,
            order,
            lowWins: v.winner === "tie" ? 0.5 : (v.winner === "A") === lowIsA ? 1 : 0,
            lowScore: lowIsA ? v.scoreA : v.scoreB,
            medScore: lowIsA ? v.scoreB : v.scoreA,
            reasons: v.reasons,
          });
        }),
      ),
    );
    process.stdout.write("j");
  }
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
console.log("\n");
for (const speech of SPEECHES) {
  const d = drafts.filter((x) => x.speech === speech);
  const v = verdicts.filter((x) => x.speech === speech);
  for (const config of ["low", "medium"]) {
    const dc = d.filter((x) => x.config === config);
    console.log(`${speech} ${config.padEnd(6)} time ${avg(dc.map((x) => x.ms / 1000)).toFixed(0)} s · length ${avg(dc.map((x) => x.seconds)).toFixed(0)} s · cost $${avg(dc.map((x) => x.cost)).toFixed(3)}`);
  }
  console.log(`${speech} judged: medium wins ${(100 * (1 - avg(v.map((x) => x.lowWins)))).toFixed(0)}% of ${v.length} judgments · scores low ${avg(v.map((x) => x.lowScore)).toFixed(2)} vs medium ${avg(v.map((x) => x.medScore)).toFixed(2)}`);
  for (const j of Object.keys(JUDGES)) {
    const vj = v.filter((x) => x.judge === j);
    console.log(`   ${j} judge: medium wins ${(100 * (1 - avg(vj.map((x) => x.lowWins)))).toFixed(0)}% · low ${avg(vj.map((x) => x.lowScore)).toFixed(2)} vs medium ${avg(vj.map((x) => x.medScore)).toFixed(2)}`);
  }
}
writeFileSync(`docs/evals/results/draft-quality-${process.env.RUN ?? "run1"}.json`, JSON.stringify({ at: new Date().toISOString(), roundId, drafts: drafts.map(({ text: _t, ...x }) => x), verdicts }, null, 2));
console.log("wrote results");

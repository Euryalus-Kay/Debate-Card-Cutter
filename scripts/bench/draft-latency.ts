/** Latency/quality-shape benchmark for speech drafting candidates on one real round. */
import { eq } from "drizzle-orm";
import { writeFileSync } from "node:fs";
import { db } from "@/server/db/client";
import { documents, rounds } from "@/server/db/schema";
import { draftSpeech } from "@/server/ai/ops";
import type { ModelSpec } from "@/server/ai/models";
import type { SpeechId } from "@/domain/format";

const [roundId, speech, outFile] = process.argv.slice(2);
const [round] = await db().select().from(rounds).where(eq(rounds.id, roundId));
const draft = (await db().select().from(documents).where(eq(documents.roundId, roundId))).find((d) => d.speech === speech);
const candidates: { name: string; spec: ModelSpec }[] = [
  { name: "sonnet5-thinking-off", spec: { model: "claude-sonnet-5", thinkingOff: true, maxOutputTokens: 16000 } },
  { name: "sonnet5-effort-low", spec: { model: "claude-sonnet-5", effort: "low", maxOutputTokens: 16000 } },
  { name: "opus55-effort-low", spec: { model: "claude-opus-5-5", effort: "low", maxOutputTokens: 16000 } },
  { name: "opus55-effort-medium", spec: { model: "claude-opus-5-5", effort: "medium", maxOutputTokens: 24000 } },
  { name: "opus5-thinking-off", spec: { model: "claude-opus-5", thinkingOff: true, maxOutputTokens: 16000 } },
  { name: "haiku45", spec: { model: "claude-haiku-4-5", maxOutputTokens: 16000 } },
];
const only = process.argv[5]?.split(",");
const results: unknown[] = [];
for (const c of candidates.filter((c) => !only || only.includes(c.name))) {
  const t0 = Date.now();
  let first = 0;
  try {
    const r = await draftSpeech({
      roundId, speech: speech as SpeechId, draftId: draft?.id ?? null, mode: "fast", cardIds: [], evidenceMode: "selected_plus_library",
      instructions: "Straight-turn the tradeoff DA if our evidence allows; perm the States CP and read a solvency deficit (uniformity, cross-border pollution). Spend ~1:30 on case defense.",
      teamId: round.teamId, models: [c.spec], onPartial: () => { if (!first) first = Date.now() - t0; },
    });
    const secs = r.output.sections;
    const row = {
      name: c.name, ok: true, firstPartialMs: first, totalMs: Date.now() - t0, usage: r.run.usage,
      sections: secs.length, responses: secs.filter((s) => s.kind === "response").length,
      cardsUsed: new Set(secs.flatMap((s) => s.cardIds)).size, analyticWords: secs.reduce((a, s) => a + s.analytic.split(/\s+/).filter(Boolean).length, 0),
      estSeconds: Math.round(r.validation.estimatedSeconds), unaddressed: r.validation.unaddressed.length, droppedTargets: r.validation.droppedTargets.length, droppedCards: r.validation.droppedCards.length,
      omitted: r.output.omitted.length, questions: r.output.questions.length, strategy: r.output.strategy.summary,
      output: r.output,
    };
    results.push(row);
    const { output: _o, ...print } = row;
    console.log(JSON.stringify(print));
  } catch (e) {
    const row = { name: c.name, ok: false, error: e instanceof Error ? e.message : String(e), totalMs: Date.now() - t0 };
    results.push(row);
    console.log(JSON.stringify(row));
  }
}
if (outFile) writeFileSync(outFile, JSON.stringify(results, null, 2));

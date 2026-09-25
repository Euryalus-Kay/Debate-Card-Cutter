/** Run a speech-draft operation against a real round from the CLI (uses the app's Anthropic key). */
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { documents, rounds } from "@/server/db/schema";
import { draftSpeech } from "@/server/ai/ops";
import type { SpeechId } from "@/domain/format";

const [roundId, speech, mode = "fast"] = process.argv.slice(2);
const [round] = await db().select().from(rounds).where(eq(rounds.id, roundId));
const drafts = await db().select().from(documents).where(eq(documents.roundId, roundId));
const draft = drafts.find((d) => d.speech === speech);
const t0 = Date.now();
let first = 0;
let partials = 0;
const res = await draftSpeech({
  roundId,
  speech: speech as SpeechId,
  draftId: draft?.id ?? null,
  mode: mode as "fast" | "deep",
  cardIds: [],
  evidenceMode: "selected_plus_library",
  instructions: process.argv[5] ?? "",
  teamId: round.teamId,
  onPartial: () => {
    partials++;
    if (!first) first = Date.now() - t0;
  },
});
console.log(JSON.stringify({ firstPartialMs: first, totalMs: Date.now() - t0, partials, run: res.run, validation: res.validation }, null, 2));
console.log("\nSTRATEGY:", res.output.strategy.summary);
for (const s of res.output.sections) {
  console.log(`\n[${s.ref}${s.parentRef ? " < " + s.parentRef : ""}] (${s.kind}/${s.relation}${s.role ? "/" + s.role : ""}) ${s.title}  targets=${s.targets.join(",")} cards=${s.cardIds.join(",")} budget=${s.budgetSeconds}s p${s.priority}`);
  if (s.analytic) console.log("   " + s.analytic.replace(/\n/g, "\n   "));
  if (s.needsEvidence) console.log("   NEEDS EVIDENCE: " + s.needsEvidence);
}
console.log("\nOMITTED:", JSON.stringify(res.output.omitted));
console.log("QUESTIONS:", JSON.stringify(res.output.questions));

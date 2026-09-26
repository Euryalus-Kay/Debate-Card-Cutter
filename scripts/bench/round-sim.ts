/**
 * A whole round, the engine against itself. An aff team and a neg team (two rounds of one team, both drawing
 * on the same library) alternate speeches from the 1AC to the 2AR. Each speech is drafted by the real engine,
 * applied to its draft, marked delivered on its own flow, exported as a Word speech doc and flowed by the other
 * side (import, AI link suggestions confirmed as a debater would, read confirmed). Then every speech is checked
 * — what it left unanswered, what it extended, repeated cards, partial shells, time — and an expert-judge model
 * reads the transcript for drops, answers, extensions and strategy.
 *
 *   npx tsx --env-file=.env.local scripts/bench/round-sim.ts <teamId> <private-out.json> <transcript.md> [mode=fast] [summary.json]
 *
 * The full report and transcript quote the team's own arguments, so they belong outside the (public) repository;
 * the optional summary has scores and counts only.
 */
import { writeFileSync } from "node:fs";
import { z } from "zod";
import { eq, gt } from "drizzle-orm";
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import { db } from "@/server/db/client";
import { teamMembers, telemetry } from "@/server/db/schema";
import { createDraft, createRound, RoundInput } from "@/server/rounds";
import { applyServerChange, loadDoc } from "@/server/docs/store";
import { draftSpeech, interpretFlow } from "@/server/ai/ops";
import { getCards } from "@/server/cards";
import { deliverDraft, exportDraftDocx } from "@/server/drafts";
import { saveUpload } from "@/server/uploads";
import { importUploadToFlow } from "@/server/flow-import";
import { renderDraft, renderFlow } from "@/server/ai/context";
import { runStructured } from "@/server/ai/run";
import { costOf } from "@/server/ai/cost";
import { sectionNodes } from "@/features/rounds/proposals";
import { readGraph, setRelationStatus, updateSlot } from "@/shared/round-doc";
import { DRAFT_FRAGMENT, draftSchema } from "@/shared/editor/schema";
import { draftFromPM, type PMNodeJSON } from "@/shared/draft-model";
import { droppedByThem } from "@/domain/flow";
import { SPEECH_IDS, SPEECHES, type SpeechId } from "@/domain/format";
import { CURRENT_TOPIC } from "@/domain/topics";

const [teamId, outJson, transcriptPath, mode = "fast"] = process.argv.slice(2);
const [member] = await db().select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId)).limit(1);
const userId = member.userId;
const t0 = new Date();
const stamp = t0.toISOString().slice(0, 16);

const make = (ourSide: "aff" | "neg") =>
  createRound(teamId, userId, RoundInput.parse({ ourSide, tournament: "SIM", roundLabel: `sim ${stamp}`, resolution: CURRENT_TOPIC.resolution, aiPolicy: "allowed", opponent: { school: ourSide === "aff" ? "SIM NEG" : "SIM AFF", code: "SIM" } }));
const A = await make("aff");
const N = await make("neg");

// What each speaker is told, as a team would tell its speakers.
const PLAN: Record<SpeechId, string> = {
  "1AC": "Plan: The United States federal government should establish single-payer national health insurance in the United States. Run from our files: Costs; Coverage.",
  "1NC": "Run from our files: T---Multi Payer; Midterms DA; NHS CP. Then answer the case.",
  "2AC": "",
  "2NC": "The 2NC takes the Midterms DA and T; the 1NR takes the NHS CP and the case.",
  "1NR": "The 1NR takes the NHS CP and the case; the 2NC took the Midterms DA and T.",
  "1AR": "",
  "2NR": "",
  "2AR": "",
};

const rows: Record<string, unknown>[] = [];
const transcript: string[] = [`# Simulated round (${stamp}) — ${CURRENT_TOPIC.resolution}`, ""];
for (const speech of SPEECH_IDS) {
  const mine = SPEECHES[speech].side === "aff" ? A : N;
  const other = mine === A ? N : A;
  const s0 = Date.now();
  const draftId = await createDraft({ teamId, roundId: mine.id, speech, userId });
  const r = await draftSpeech({ roundId: mine.id, speech, draftId, mode: mode as "fast" | "deep", cardIds: [], evidenceMode: "selected_plus_library", instructions: PLAN[speech], teamId });
  const used = [...new Set(r.output.sections.flatMap((s) => s.cardIds))];
  const cardRows = used.length ? await getCards(teamId, used) : [];
  const nodes = sectionNodes(r.output, new Map(cardRows.map((c) => [c.id, c])), null);
  await applyServerChange(draftId, (doc) => prosemirrorJSONToYXmlFragment(draftSchema(), { type: "doc", content: nodes } as never, doc.getXmlFragment(DRAFT_FRAGMENT)), { userId, origin: "sim" });
  await deliverDraft(draftId, userId);
  await applyServerChange(mine.stateDocId, (doc) => updateSlot(doc, speech, { status: "delivered", readConfirmed: true, deliveredDraftId: draftId, deliveredAt: Date.now() }), { userId, origin: "sim" });
  // The other side gets the speech doc and flows it.
  const { bytes } = await exportDraftDocx(draftId);
  const up = await saveUpload({ teamId, userId, roundId: other.id, purpose: "speech_doc", fileName: `${speech} (sim).docx`, bytes, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", attribution: { speech, owner: "opponent", confirmedDelivered: true, uploadedBy: userId, uploadedAt: new Date().toISOString() } });
  await importUploadToFlow(other.id, up.id, userId);
  const linked = await interpretFlow({ roundId: other.id, speech, teamId, userId }).catch((e) => ({ linksAdded: 0, error: String(e) }));
  await applyServerChange(
    other.stateDocId,
    (doc) => {
      for (const rel of readGraph(doc, other === A ? "aff" : "neg").relations) if (rel.status === "suggested") setRelationStatus(doc, rel.id, "confirmed");
      updateSlot(doc, speech, { readConfirmed: true });
    },
    { userId, origin: "sim" },
  );
  const v = r.validation;
  const checks = v.checks ?? [];
  const row = {
    speech,
    seconds: Math.round((Date.now() - s0) / 1000),
    sections: r.output.sections.length,
    cards: used.length,
    libraryOffered: v.library?.offered ?? 0,
    libraryUsed: v.library?.used ?? 0,
    unaddressed: v.unaddressed.length,
    estimatedSeconds: Math.round(v.estimatedSeconds),
    limitSeconds: v.limitSeconds,
    critical: checks.filter((c) => c.severity === "critical").map((c) => c.code),
    warnings: checks.filter((c) => c.severity === "warning").map((c) => c.code),
    repeatedCards: v.repeatedCards?.length ?? 0,
    partialShells: v.partialShells ?? [],
    newInRebuttal: v.newInRebuttal.length,
    positionsNotInBlock: v.positionsNotInBlock,
    unsupportedDropClaims: v.unsupportedDropClaims.length,
    linksSuggested: (linked as { linksAdded?: number }).linksAdded ?? 0,
  };
  rows.push(row);
  console.log(JSON.stringify(row));
  const json = yXmlFragmentToProsemirrorJSON((await loadDoc(draftId)).doc.getXmlFragment(DRAFT_FRAGMENT)) as PMNodeJSON;
  transcript.push(`## ${speech} (${SPEECHES[speech].side.toUpperCase()})`, "", `Strategy: ${r.output.strategy.summary}`, "", renderDraft(draftFromPM(json)), "");
}

// Each side's flow at the end.
const flows = await Promise.all([A, N].map(async (x, i) => ({ side: i ? "neg" : "aff", graph: readGraph((await loadDoc(x.stateDocId)).doc, i ? "neg" : "aff") })));
const all = new Set<SpeechId>(SPEECH_IDS);
const dropped = {
  // What each side's last rebuttal can say the other side dropped (record confirmed).
  byNeg: droppedByThem(flows[1].graph, "2NR", all).filter((d) => d.safeToClaim).length,
  byAff: droppedByThem(flows[0].graph, "2AR", all).filter((d) => d.safeToClaim).length,
};
writeFileSync(transcriptPath, [...transcript, "## The aff's flow at the end", "", renderFlow(flows[0].graph), "", "## The neg's flow at the end", "", renderFlow(flows[1].graph)].join("\n"));

// An expert judge reads the round.
const Judge = z.object({
  overall: z.object({ score: z.number().min(1).max(10), winner: z.enum(["aff", "neg"]), summary: z.string() }),
  speeches: z.array(z.object({ speech: z.enum(SPEECH_IDS), score: z.number().min(1).max(10), drops: z.array(z.string()).describe("arguments this speech should have answered or extended but didn't"), extensions: z.string().describe("how well it extended what it needed to (or n/a)"), problems: z.array(z.string()), strengths: z.array(z.string()) })),
  idealDifferences: z.array(z.string()).describe("what an ideal round would have done differently, most important first"),
});
const judged = await runStructured({
  task: "file_plan",
  system: `You are an experienced national-circuit high school policy debate judge and coach. Read this round (each speech's analytics with its cards' tags and cites, and both teams' flows at the end) and evaluate it as an ideal round would be judged. For each speech: what it dropped (their arguments it should have answered, or our arguments it should have extended), how well it extended its side's positions (framework, links, impacts, alternatives, solvency: every part the position needs), its problems and strengths. Then the decision and what an ideal round would do differently. Be specific and strict; don't invent content that isn't there.`,
  prompt: [CURRENT_TOPIC.brief, "", transcript.join("\n").slice(0, 120_000), "", "## The aff's flow at the end", renderFlow(flows[0].graph).slice(0, 20_000), "", "## The neg's flow at the end", renderFlow(flows[1].graph).slice(0, 20_000)].join("\n"),
  schema: Judge,
  teamId,
});
const tel = await db().select().from(telemetry).where(gt(telemetry.createdAt, t0));
const usd = tel.reduce((a, t) => {
  const d = t.data as { usage?: Parameters<typeof costOf>[1]; searches?: number } | null;
  return a + (costOf(t.name.split(":")[1] ?? "", d?.usage) ?? 0) + (d?.searches ?? 0) * 0.01;
}, 0);
const out = { at: t0.toISOString(), mode, rounds: { aff: A.id, neg: N.id }, speeches: rows, dropped, judge: judged.output, usd: +usd.toFixed(2), minutes: +((Date.now() - t0.getTime()) / 60000).toFixed(1) };
writeFileSync(outJson, JSON.stringify(out, null, 2));
// Scores and counts only (no arguments, authors or card text).
const summaryPath = process.argv[6];
if (summaryPath)
  writeFileSync(
    summaryPath,
    JSON.stringify({ at: out.at, mode, usd: out.usd, minutes: out.minutes, overall: out.judge.overall.score, winner: out.judge.overall.winner, speeches: rows.map((r) => ({ speech: r.speech, score: out.judge.speeches.find((j) => j.speech === r.speech)?.score ?? null, judgeDrops: out.judge.speeches.find((j) => j.speech === r.speech)?.drops.length ?? null, unaddressed: r.unaddressed, critical: (r.critical as string[]).length, warnings: (r.warnings as string[]).length, repeatedCards: r.repeatedCards, partialShells: (r.partialShells as unknown[]).length, estimatedSeconds: r.estimatedSeconds, limitSeconds: r.limitSeconds, cards: r.cards })), droppedClaimable: out.dropped }, null, 2),
  );
console.log(JSON.stringify({ judge: judged.output.overall, usd: out.usd, minutes: out.minutes }));
process.exit(0);

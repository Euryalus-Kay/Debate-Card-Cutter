/**
 * "Explain": a card, an argument, or a whole position in plain words — what it says, why it matters in this
 * round and on this topic, the words to know, how to answer it (theirs) or use it (ours), and what it doesn't
 * prove. Built only from the card's or argument's own words plus general debate knowledge; an explanation is
 * never evidence. Explanations are kept per team, so a partner's click on the same thing is instant and free.
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { explanations, rounds, uploadBlocks } from "@/server/db/schema";
import { getCards } from "@/server/cards";
import { loadDoc } from "@/server/docs/store";
import { readGraph } from "@/shared/round-doc";
import { readAloud, verbatimText, type BodyBlock } from "@/domain/card";
import { fullCite, shortCite, type Citation } from "@/domain/citation";
import { labelLine, type CardMeta } from "@/domain/card-label";
import { POSITION_KIND_LABEL, type ArgUnit } from "@/domain/flow";
import { SPEECH_IDS } from "@/domain/format";
import { topicFor } from "@/domain/topics";
import { numbersIn } from "@/domain/lint";
import { runStructured } from "./run";

export const ExplainTarget = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("card"), cardId: z.string().min(1), roundId: z.string().optional() }),
  z.object({ kind: z.literal("argument"), roundId: z.string().min(1), argId: z.string().min(1) }),
  z.object({ kind: z.literal("position"), roundId: z.string().min(1), positionId: z.string().min(1) }),
]);
export type ExplainTarget = z.infer<typeof ExplainTarget>;

export const ExplainSchema = z.object({
  simple: z.string().describe("what it says, in 1–3 short sentences a 13-year-old understands"),
  why: z.string().describe("why it matters in this debate: what the team reading it wants the judge to believe, and which argument and part it is"),
  words: z.array(z.object({ term: z.string(), meaning: z.string() })).describe("up to 5 hard words or debate terms, each explained in a few simple words"),
  respond: z.array(z.string()).describe("2–4 simple ways to answer it (the other team's) or tips for using it (ours)"),
  watch: z.array(z.string()).describe("up to 3 honest limits: what it doesn't prove, hedges, age, who wrote it"),
});
export type Explanation = z.infer<typeof ExplainSchema> & { title: string; whose: "ours" | "theirs" | "library"; flags: string[] };

const EXPLAIN_VERSION = 2;

const SYSTEM = `You explain policy debate evidence and arguments to a high school debater in very simple words, like a patient coach talking to a 13-year-old who is new to the topic. Short sentences, everyday words; explain any debate term or hard word you use.
Base everything on the card's or argument's own words and on general debate knowledge (what a disad, link, perm or kritik is). Never add facts, numbers, studies, names or quotes that aren't in what you were given; if it doesn't say something, say that it doesn't.
Fields:
- simple: what it says, in 1–3 short sentences.
- why: why it matters in this debate — what the team reading it wants the judge to believe, and which argument and part it is (uniqueness, link, impact, solvency, answer…). Use the round and topic background.
- words: up to 5 hard words or debate terms from it, each in a few simple words.
- respond: if it's the other team's, 2–4 simple ways to answer it, based on what it does and doesn't say; if it's ours, 2–4 simple tips for using it well (when to read it, what to say with it).
- watch: up to 3 honest limits — what it doesn't prove, hedges like "may", how old it is, who wrote it.`;

interface Subject {
  title: string;
  whose: "ours" | "theirs" | "library";
  /** a library card's side, from its label */
  side?: "aff" | "neg" | "either";
  text: string;
  roundLine?: string;
  resolution?: string | null;
  aiRound?: typeof rounds.$inferSelect;
}

function cardBlock(tag: string, cite: string, body: BodyBlock[], label?: string): string {
  const read = readAloud(body);
  const all = verbatimText(body).split(/\s+/);
  return [`TAG: ${tag}`, `CITE: ${cite}`, label ? `LIBRARY LABEL: ${label}` : "", `${read.basis === "highlight" ? "READ ALOUD (highlighted)" : "READ ALOUD"}: ${read.text}`, `MORE OF THE TEXT: ${all.slice(0, 380).join(" ")}${all.length > 380 ? " …" : ""}`].filter(Boolean).join("\n");
}

async function roundOf(teamId: string, roundId: string) {
  const [round] = await db().select().from(rounds).where(and(eq(rounds.id, roundId), eq(rounds.teamId, teamId)));
  if (!round) throw new Error("round not found");
  return round;
}

/** The card behind an argument read from their speech doc, if it came from one. */
async function docCard(arg: ArgUnit): Promise<string | null> {
  if (arg.provenance.type !== "document" || !arg.provenance.blockId) return null;
  const [b] = await db()
    .select({ text: uploadBlocks.text, data: uploadBlocks.data, kind: uploadBlocks.kind })
    .from(uploadBlocks)
    .where(and(eq(uploadBlocks.uploadId, arg.provenance.documentId), eq(uploadBlocks.idx, Number(arg.provenance.blockId))));
  if (!b || b.kind !== "card") return null;
  const d = (b.data ?? {}) as { citation?: Citation; cite?: { raw?: string }; body?: BodyBlock[] };
  if (!d.body?.length) return null;
  return cardBlock(arg.text, d.citation ? `${shortCite(d.citation)} — ${fullCite(d.citation).slice(0, 240)}` : (d.cite?.raw ?? ""), d.body);
}

export async function explainSubject(teamId: string, target: ExplainTarget): Promise<Subject> {
  if (target.kind === "card") {
    const [c] = await getCards(teamId, [target.cardId]);
    if (!c) throw new Error("card not found");
    const meta = c.meta && "side" in c.meta ? (c.meta as CardMeta) : null;
    const round = target.roundId ? await roundOf(teamId, target.roundId) : null;
    const whose = round && meta && meta.side !== "either" ? (meta.side === round.ourSide ? "ours" : "theirs") : round ? "ours" : "library";
    return { title: c.tag, whose, side: meta?.side, text: cardBlock(c.tag, `${shortCite(c.citation)} — ${fullCite(c.citation).slice(0, 240)}`, c.body, labelLine(meta) || undefined), resolution: round?.resolution, roundLine: round ? `We are ${round.ourSide.toUpperCase()} in this round.` : undefined, aiRound: round ?? undefined };
  }
  const round = await roundOf(teamId, target.roundId);
  const graph = readGraph((await loadDoc(round.stateDocId)).doc, round.ourSide);
  const posName = new Map(graph.positions.map((p) => [p.id, `${p.name} (${POSITION_KIND_LABEL[p.kind]}, ${p.side.toUpperCase()})`]));
  const line = (a: ArgUnit) => `${a.speech} ${a.side.toUpperCase()}: ${a.label ? `${a.label}. ` : ""}${a.text}${a.cites?.length ? ` (${a.cites.join(", ")})` : ""}${a.role && a.role !== "claim" ? ` {${a.role.replace("_", " ")}}` : ""}`;
  const roundLine = `We are ${round.ourSide.toUpperCase()} in this round.`;
  if (target.kind === "argument") {
    const a = graph.args.find((x) => x.id === target.argId);
    if (!a) throw new Error("argument not found");
    const answers = graph.relations.filter((r) => r.from === a.id && r.status !== "rejected").flatMap((r) => r.to).map((id) => graph.args.find((x) => x.id === id)).filter((x): x is ArgUnit => !!x);
    const answeredBy = graph.relations.filter((r) => r.to.includes(a.id) && r.status !== "rejected").map((r) => graph.args.find((x) => x.id === r.from)).filter((x): x is ArgUnit => !!x);
    const card = await docCard(a);
    const text = [`ARGUMENT on ${posName.get(a.positionId) ?? "the flow"}: ${line(a)}`, a.warrant ? `WARRANT: ${a.warrant}` : "", answers.length ? `IT ANSWERS:\n${answers.map((x) => `- ${line(x)}`).join("\n")}` : "", answeredBy.length ? `ANSWERED BY:\n${answeredBy.map((x) => `- ${line(x)}`).join("\n")}` : "", card ? `THE CARD THEY READ:\n${card}` : ""].filter(Boolean).join("\n");
    return { title: a.text.slice(0, 160), whose: a.side === round.ourSide ? "ours" : "theirs", text, roundLine, resolution: round.resolution, aiRound: round };
  }
  const p = graph.positions.find((x) => x.id === target.positionId);
  if (!p) throw new Error("position not found");
  const args = graph.args.filter((a) => a.positionId === p.id && a.delivery !== "not_read");
  const bySpeech = SPEECH_IDS.map((s) => [s, args.filter((a) => a.speech === s).sort((x, y) => x.order - y.order)] as const).filter(([, list]) => list.length);
  const text = [`POSITION: ${posName.get(p.id)}, first read in the ${p.introducedIn}`, ...bySpeech.map(([s, list]) => `${s}:\n${list.slice(0, 14).map((a) => `- ${line(a)}`).join("\n")}`)].join("\n");
  return { title: p.name, whose: p.side === round.ourSide ? "ours" : "theirs", text, roundLine, resolution: round.resolution, aiRound: round };
}

export async function explain(teamId: string, target: ExplainTarget, opts: { abortSignal?: AbortSignal } = {}): Promise<Explanation> {
  const subject = await explainSubject(teamId, target);
  // The version changes when the prompt does, so better explanations replace older ones.
  const key = createHash("sha256").update(JSON.stringify([EXPLAIN_VERSION, teamId, target.kind, subject.whose, subject.side ?? "", subject.roundLine ?? "", subject.text])).digest("hex");
  const [hit] = await db().select({ data: explanations.data }).from(explanations).where(eq(explanations.key, key));
  if (hit) return hit.data as Explanation;
  const topic = topicFor(subject.resolution);
  const whoseLine =
    subject.whose === "theirs"
      ? "This is the OTHER team's material: explain it and how to answer it."
      : subject.whose === "ours"
        ? "This is OUR team's material: explain it; in respond, give tips for using it; in watch, how the other side would attack it."
        : `This card is in our team's library${subject.side && subject.side !== "either" ? ` (an ${subject.side.toUpperCase()} card)` : ""}: explain it; in respond, give tips for USING it well (when to read it, what to say with it); in watch, how the other side would attack it.`;
  const prompt = [topic?.brief ?? "", subject.roundLine ?? "", whoseLine, "", subject.text, "", "Explain it in very simple words."].filter((l, i) => l || i > 0).join("\n");
  const res = await runStructured({
    task: "explain",
    system: SYSTEM,
    prompt,
    schema: ExplainSchema,
    teamId,
    abortSignal: opts.abortSignal,
    fake: () => ({ simple: `[AI_FAKE] ${subject.title.slice(0, 120)}`, why: "[AI_FAKE] It supports one part of the argument.", words: [{ term: "link", meaning: "why the plan causes the bad thing" }], respond: ["[AI_FAKE] Ask what the card actually proves."], watch: ["[AI_FAKE] Check the date."] }),
  });
  // Numbers the explanation adds that the card or argument doesn't contain are pointed out, not trusted.
  const have = new Set(numbersIn(subject.text).map((n) => n.replace(/^\$/, "")));
  const added = [...new Set(numbersIn([res.output.simple, res.output.why, ...res.output.respond, ...res.output.watch].join(" ")).map((n) => n.replace(/^\$/, "")))].filter((n) => !have.has(n) && !/^\d$/.test(n));
  const out: Explanation = {
    simple: res.output.simple,
    why: res.output.why,
    words: res.output.words.slice(0, 5),
    respond: res.output.respond.slice(0, 4),
    watch: res.output.watch.slice(0, 3),
    title: subject.title,
    whose: subject.whose,
    flags: added.length ? [`Mentions ${added.join(", ")}, which the card or argument doesn't say. Check it before repeating it.`] : [],
  };
  await db().insert(explanations).values({ key, teamId, data: out }).onConflictDoNothing();
  return out;
}

/** The round an explanation depends on, for its AI rules (a card with no round has none). */
export async function explainRoundId(target: ExplainTarget): Promise<string | null> {
  return target.kind === "card" ? (target.roundId ?? null) : target.roundId;
}

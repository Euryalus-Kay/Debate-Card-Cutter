/**
 * Cross-examination help: questions for a CX where we ask (aimed at the warrants of the speech just given,
 * each tied to the argument it's about and what the answer sets up), or likely questions with short answers
 * for a CX where they ask us. Questions use only the round's record; answers never claim evidence we don't
 * have. Nothing goes on the flow: CX notes stay notes (SEQ-4).
 */

import { z } from "zod";
import { DEFAULT_CX, SPEECHES, type SpeechId } from "@/domain/format";
import { stripIds } from "@/domain/span-check";
import { buildRoundContext } from "./context";
import { runStructured } from "./run";
import { GLOBAL_RULES } from "./speech-rules";

export const CxQuestionsSchema = z.object({
  questions: z.array(
    z.object({
      target: z.string().describe("id of the flow argument the question is about, or empty for the speech as a whole"),
      question: z.string().describe("one short question, one idea, easy to answer yes/no or narrowly"),
      goal: z.enum(["expose_warrant", "pin_down", "set_up", "clarify"]),
      why: z.string().describe("what the answer sets up for our next speech, in one sentence"),
      followUp: z.string().describe("the follow-up if they dodge, one short question; else empty"),
    }),
  ),
});

export const CxAnswersSchema = z.object({
  answers: z.array(
    z.object({
      target: z.string().describe("id of our flow argument the question attacks, or empty"),
      likelyQuestion: z.string(),
      answer: z.string().describe("a short, honest answer that concedes nothing we need; cite only cards on the flow"),
      avoid: z.string().describe("what not to say, in one sentence; else empty"),
    }),
  ),
});

const SYSTEM = `You coach high-school policy debaters for cross-examination. CX is 3 minutes: questions are short, one idea each, and aimed at the other side's warrants, not their tags. Good questions pin down a position (conditionality, what the plan or counterplan does, the link story), expose a missing or weak warrant (what their evidence actually says, its date or qualifications), or set up an argument for the next speech. Never ask them to explain their whole argument; never argue in CX; stay polite.
Use only the round's record: the flow, their cards' tags and cites, and the CX notes. Never invent what their evidence says.

${GLOBAL_RULES}`;

export async function cxPrep(roundId: string, cxId: string, teamId: string, abortSignal?: AbortSignal) {
  const cx = DEFAULT_CX.find((c) => c.id === cxId);
  if (!cx) throw new Error("unknown CX period");
  const after = cx.after as SpeechId;
  const ctx = await buildRoundContext(roundId, { speech: after, evidenceMode: "selected_only", abortSignal });
  const ourSide = ctx.graph.ourSide;
  const weAsk = SPEECHES[after].side !== ourSide;
  const theirs = ctx.graph.args.filter((a) => a.speech === after);
  const argIds = new Set(ctx.graph.args.map((a) => a.id));
  if (weAsk) {
    const res = await runStructured({
      task: "cx_prep",
      system: SYSTEM,
      context: ctx.text,
      prompt: `We (${ourSide.toUpperCase()}) cross-examine the ${after} next. Write 6–10 questions, best first, aimed at the ${after}'s arguments${theirs.length ? "" : " (the flow has none recorded yet: ask about the speech's positions in general)"}. Tie each to the argument it's about (target = its id) and say what the answer sets up for our next speech.`,
      schema: CxQuestionsSchema,
      teamId,
      abortSignal,
      fake: () => ({ questions: (theirs.length ? theirs : [{ id: "", text: "their speech" }]).slice(0, 6).map((a) => ({ target: a.id, question: `[AI_FAKE] What does your evidence say causes ${a.text.slice(0, 40)}?`, goal: "expose_warrant" as const, why: "[AI_FAKE] Sets up a no-warrant argument.", followUp: "" })) }),
    });
    return {
      mode: "ask" as const,
      questions: res.output.questions.map((q) => ({ ...q, target: argIds.has(q.target) ? q.target : "", question: stripIds(q.question), why: stripIds(q.why), followUp: stripIds(q.followUp) })),
    };
  }
  const ours = ctx.graph.args.filter((a) => a.speech === after);
  const res = await runStructured({
    task: "cx_prep",
    system: SYSTEM,
    context: ctx.text,
    prompt: `They cross-examine our ${after} next. List the 6–8 questions they're most likely to ask, aimed at our ${after}'s weakest points, each with a short answer that concedes nothing we need and what not to say.`,
    schema: CxAnswersSchema,
    teamId,
    abortSignal,
    fake: () => ({ answers: ours.slice(0, 6).map((a) => ({ target: a.id, likelyQuestion: `[AI_FAKE] Where's your evidence for ${a.text.slice(0, 40)}?`, answer: "[AI_FAKE] It's the card we read; the warrant is in the underlined text.", avoid: "" })) }),
  });
  return {
    mode: "answer" as const,
    answers: res.output.answers.map((a) => ({ ...a, target: argIds.has(a.target) ? a.target : "", likelyQuestion: stripIds(a.likelyQuestion), answer: stripIds(a.answer), avoid: stripIds(a.avoid) })),
  };
}

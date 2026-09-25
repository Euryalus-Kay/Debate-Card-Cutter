/**
 * AI operations. Each returns a validated result plus the references
 * (hashes / sequence numbers) of the inputs it used, so the client can tell
 * whether the result is stale before applying it.
 */

import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { rounds } from "@/server/db/schema";
import { applyServerChange, loadDoc } from "@/server/docs/store";
import { upsertArg, upsertRelation } from "@/shared/round-doc";
import { readArgs, readRelations } from "@/shared/round-doc";
import { computeCoverage, isLive, positionsAvailableFor2NR, type ArgUnit, type DraftTarget } from "@/domain/flow";
import { isBefore, isRebuttal, SPEECHES, speechesToAnswer as speechesToAnswerFor, type SpeechId } from "@/domain/format";
import { addLoads, countWords, estimateSeconds, presetProfile, type RateProfile } from "@/domain/timing";
import { cardLoad } from "@/domain/card";
import { acceptRewrites, allocateWordChange } from "@/domain/length-plan";
import { allSections, isHumanEdited, itemLoad, sectionContentHash, type DraftItem, type DraftSection, type PMNodeJSON } from "@/shared/draft-model";
import { buildRoundContext, renderDraft, type RoundContext } from "./context";
import { draftTargetsFromDraft } from "./draft-targets";
import { checkSections, checkSpeech, type CheckSection, type SpeechCheck } from "@/domain/speech-checks";
import { GLOBAL_RULES, SPEECH_RULES } from "./speech-rules";
import { runStructured, type RunResult } from "./run";
import { draftProgress, extractProgress, fitProgress, patchProgress, taskTiming } from "./progress";
import type { Progress } from "@/domain/progress";
import { MODELS } from "./models";
import { AlternativesSchema, FitPlanSchema, TopUpSchema, FlowExtractSchema, type FlowExtractOutput, FlowInterpretSchema, PatchPlanSchema, type PatchPlanOutput, SectionRevisionSchema, SpeechDraftSchema, type AlternativesOutput, type FitPlanOutput, type FlowInterpretOutput, type SectionRevisionOutput, type SpeechDraftOutput } from "./schemas";
import { alreadyAnswered, argBasisHash, changedShare, changeSet, isUpToDate, patchSections, placeAnswer, type ChangeSet, type Placement } from "@/domain/patch";
import { newId } from "@/server/ids";
import { heardLines, readGraph, readHeardMarks, type HeardLine } from "@/shared/round-doc";
import { applyHeard, parsedToValidated, type HeardApplyResult } from "@/shared/heard-apply";
import { parseHeard } from "@/domain/heard-parse";
import { validateExtraction, type ExtractLine } from "@/domain/flow-extract";
import { uploadBlocks, uploads } from "@/server/db/schema";
import { and, sql } from "drizzle-orm";


export const SYSTEM_BASE = `You are an expert high school policy debate coach and strategist helping two debaters prepare speeches during and before rounds. You reason about the specific round in front of you: the actual arguments on the flow, the actual evidence provided, and the actual speech being prepared.

Your output is editable assistance: the debaters decide strategy and final wording. Be concrete and substantive. Every answer must identify the warrant it is attacking or relying on and say why it matters for the decision — never generic filler like "their evidence is weak" or "our impacts outweigh" without the reason.

${GLOBAL_RULES}`;

export interface Validation {
  /** sections that claim a drop/concession while the answered speech's record is unconfirmed */
  unsupportedDropClaims: string[];
  droppedTargets: string[];
  droppedCards: string[];
  unaddressed: { id: string; text: string }[];
  newInRebuttal: string[];
  positionsNotInBlock: string[];
  estimatedSeconds: number;
  limitSeconds: number;
  sectionSeconds: Record<string, number>;
  /** set when the draft was automatically trimmed or filled to time */
  lengthAdjust?: LengthAdjust;
  /** speech checks on the speech as it will stand (existing sections + this proposal) */
  checks?: SpeechCheck[];
}

export interface LengthAdjust {
  mode: "trim" | "grow";
  fromSeconds: number;
  toSeconds: number;
  sections: number;
}

function estimateSection(analytic: string, title: string, cardIds: string[], ctx: RoundContext, rates: RateProfile): number {
  const byId = new Map(ctx.cards.map((c) => [c.id, c]));
  let seconds = estimateSeconds({ cardWords: 0, tagWords: countWords(title), analyticWords: countWords(analytic), cards: 0, transitions: 1 }, rates.rates);
  for (const id of cardIds) {
    const c = byId.get(id);
    if (c) seconds += estimateSeconds(cardLoad({ tag: c.tag, citation: c.citation, body: c.body }), rates.rates);
  }
  return seconds;
}

export function validateDraft(out: SpeechDraftOutput, ctx: RoundContext, speech: SpeechId, ourSide: "aff" | "neg", rates: RateProfile): { output: SpeechDraftOutput; validation: Validation } {
  const argIds = new Set(ctx.graph.args.map((a) => a.id));
  const cardIds = new Set(ctx.cards.map((c) => c.id));
  const droppedTargets: string[] = [];
  const droppedCards: string[] = [];
  const sectionSeconds: Record<string, number> = {};
  // Models occasionally reuse a ref; make refs unique (children keep pointing at the first).
  const seenRefs = new Set<string>();
  const uniq = out.sections.map((s, i) => {
    let ref = s.ref || `s${i}`;
    while (seenRefs.has(ref)) ref = `${ref}_${i}`;
    seenRefs.add(ref);
    return { ...s, ref, parentRef: s.parentRef === ref ? "" : s.parentRef };
  });
  const sections = uniq.map((s) => {
    const targets = s.targets.filter((t) => {
      const ok = argIds.has(t);
      if (!ok) droppedTargets.push(t);
      return ok;
    });
    const cards = s.cardIds.filter((c) => {
      const ok = cardIds.has(c);
      if (!ok) droppedCards.push(c);
      return ok;
    });
    sectionSeconds[s.ref] = estimateSection(s.analytic, s.title, cards, ctx, rates);
    return { ...s, targets, cardIds: cards };
  });
  const targets: DraftTarget[] = sections
    .filter((s) => s.relation !== "none" && s.relation !== "new")
    .map((s) => ({ sectionId: s.ref, title: s.title, relation: s.relation as DraftTarget["relation"], targets: s.targets }));
  // Coverage and checks look at the speech as it will stand: what's already in the draft plus this proposal.
  const existing = ctx.draft ? draftTargetsFromDraft(ctx.draft) : [];
  const cov = SPEECHES[speech].side === ourSide ? computeCoverage(ctx.graph, speech, [...existing, ...targets], ctx.recorded) : null;
  const proposalSections: CheckSection[] = sections.map((s) => ({ id: s.ref, title: s.title, relation: s.relation, targets: s.targets, role: s.role || null, crossApplyFrom: s.crossApplyFrom || null, analytic: s.analytic, cardCites: s.cardIds.map((c) => ctx.cards.find((x) => x.id === c)?.shortCite ?? ""), parentId: s.parentRef || null, kind: s.kind }));
  const checks = SPEECHES[speech].side === ourSide ? checkSpeech({ graph: ctx.graph, speech, sections: [...checkSections(ctx.draft), ...proposalSections], recorded: ctx.recorded }).checks : [];
  const omitted = new Set(out.omitted.flatMap((o) => o.targets));
  const unaddressed = (cov?.items ?? []).filter((i) => i.status === "unanswered" && !omitted.has(i.arg.id)).map((i) => ({ id: i.arg.id, text: i.arg.text }));
  const newInRebuttal = isRebuttal(speech) ? sections.filter((s) => s.relation === "new").map((s) => s.title) : [];
  let positionsNotInBlock: string[] = [];
  if (speech === "2NR") {
    const allowed = new Set(positionsAvailableFor2NR(ctx.graph).map((p) => p.id));
    const argPos = new Map(ctx.graph.args.map((a) => [a.id, a.positionId]));
    positionsNotInBlock = [...new Set(sections.flatMap((s) => s.targets.map((t) => argPos.get(t)).filter((p): p is string => !!p && !allowed.has(p))))].map((pid) => ctx.graph.positions.find((p) => p.id === pid)?.name ?? pid);
  }
  const estimated = Object.values(sectionSeconds).reduce((a, b) => a + b, 0);
  // Claims that the other side dropped/conceded something require a confirmed record (COV-5).
  const DROP = /\b(dropped|drops|conceded|concedes|never answered|no answer to|didn'?t answer|did not answer|went unanswered)\b/i;
  const unconfirmed = speechesToAnswerFor(speech).filter((s) => !ctx.confirmed.has(s));
  const unsupportedDropClaims = unconfirmed.length ? sections.filter((s) => DROP.test(s.analytic)).map((s) => s.title) : [];
  return {
    output: { ...out, sections },
    validation: { unsupportedDropClaims, droppedTargets, droppedCards, unaddressed, newInRebuttal, positionsNotInBlock, estimatedSeconds: estimated, limitSeconds: ctx.limitSeconds, sectionSeconds, checks },
  };
}

async function roundFor(roundId: string) {
  const [round] = await db().select().from(rounds).where(eq(rounds.id, roundId));
  if (!round) throw new Error("round not found");
  return round;
}

export interface DraftSpeechInput {
  roundId: string;
  speech: SpeechId;
  draftId: string | null;
  mode: "fast" | "deep";
  cardIds: string[];
  evidenceMode: "selected_only" | "selected_plus_library";
  instructions: string;
  rates?: RateProfile | null;
  teamId: string;
  onPartial?: (p: unknown) => void;
  /** short progress notes after the plan is written (e.g. trimming to time) */
  onStatus?: (s: string) => void;
  /** stage, parts done, and time left (A4) */
  onProgress?: (p: Progress) => void;
  abortSignal?: AbortSignal;
  /** benchmark override of the model chain */
  models?: import("./models").ModelSpec[];
  /** benchmark switch: skip the automatic trim/fill to time */
  noLengthFix?: boolean;
}

export async function draftSpeech(input: DraftSpeechInput) {
  const task = input.mode === "deep" ? "speech_draft" : "speech_draft_fast";
  const progress = input.onProgress ? draftProgress(input.onProgress, await taskTiming(task), await taskTiming("section_revise")) : null;
  progress?.start();
  const round = await roundFor(input.roundId);
  const ctx = await buildRoundContext(input.roundId, { speech: input.speech, draftId: input.draftId, cardIds: input.cardIds, evidenceMode: input.evidenceMode, instructions: input.instructions, rates: input.rates ?? presetProfile("fast") });
  const rates = ctx.rates; // capped when the judge limits speed
  const system = `${SYSTEM_BASE}\n\nSPEECH BEING PREPARED\n${SPEECH_RULES[input.speech]}`;
  const lockedNote = ctx.draft && allSections(ctx.draft).some((s) => s.locked) ? "Some sections of the current draft are LOCKED: keep them exactly as they are and plan around them (do not output replacements for them)." : "";
  const prompt = `Prepare the ${input.speech} for the ${round.ourSide.toUpperCase()}.

Time limit: ${Math.round(ctx.limitSeconds)} seconds. Plan to use about ${Math.round(ctx.limitSeconds * 0.95)} seconds, with section budgets that add up to that. A speech that runs short wastes time the team needs; fill it with developed answers (warrant, comparison, implication), not filler.
Length: this speaker reads analytics at about ${Math.round(rates.rates.analyticWpm)} words per minute (${(rates.rates.analyticWpm / 6).toFixed(0)} words per 10 seconds). Each card's read time is listed in the evidence (TIME TO READ). For a section with a budget of B seconds whose cards take C seconds, write about (B − C) × ${(rates.rates.analyticWpm / 60).toFixed(1)} words of analytic text. Across the speech, that is roughly ${Math.round((ctx.limitSeconds * 0.95 * rates.rates.analyticWpm) / 60)} words if it were all analytics, less the time of the cards you read.
${input.evidenceMode === "selected_only" ? "Use ONLY the cards the team selected. Do not use library cards." : "Prefer the cards the team selected; use library cards only when they are clearly on point."}
${input.instructions.trim() ? `Team instructions: ${input.instructions.trim()}` : "No extra instructions."}
${lockedNote}
${ctx.draft && ctx.draft.items.length ? "There is already a draft. Build the complete speech; where an existing section already answers something well, you may keep its approach, but output the full plan." : ""}

Output a complete, deliverable speech plan: first the outline (every section title, in order), then top-level position sections (kind "position", or "overview") containing response/extension sections (parentRef = the position's ref). Every response targets the actual flow ids it answers. Use "omitted" for anything you deliberately leave unanswered, with the reason. Put anything uncertain in "questions".`;
  const onPartial = (p: unknown) => {
    progress?.partial(p as Parameters<NonNullable<typeof progress>["partial"]>[0]);
    input.onPartial?.(p);
  };
  const res = await runStructured({ task, system, context: ctx.text, prompt, schema: SpeechDraftSchema, onPartial, abortSignal: input.abortSignal, teamId: input.teamId, models: input.models });
  progress?.checking(res.output.sections.length);
  let { output, validation } = validateDraft(res.output, ctx, input.speech, round.ourSide, rates);
  if (!input.noLengthFix) {
    const onStatus = input.onStatus;
    const fixed = await fitDraftLength(output, validation, ctx, { ...input, onStatus: (st) => (onStatus?.(st), progress?.fitting(st, output.sections.length)) }, round.ourSide, system);
    if (fixed) ({ output, validation } = fixed);
  }
  return { output, validation, run: meta(res), contextRefs: { ...ctx.refs, draftHash: ctx.draftJson ? sectionContentHash(ctx.draftJson) : null }, cards: summarizeCards(ctx) };
}

const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/**
 * Bring a fresh draft to time. Planners budget words loosely (deeper thinking
 * tends to run long, fast drafts run short), and a speech over the limit isn't
 * deliverable. When the draft runs over (or leaves more than 10% unused), code
 * computes an exact analytic word count per section from the speaker's
 * measured rate and one quick call rewrites those sections to it. A trim that
 * still leaves the speech over gets up to two more passes; fills are accepted
 * only while the speech stays under 98% of the limit. Cards are never touched.
 */
export async function fitDraftLength(output: SpeechDraftOutput, validation: Validation, ctx: RoundContext, input: DraftSpeechInput, ourSide: "aff" | "neg", system: string): Promise<{ output: SpeechDraftOutput; validation: Validation } | null> {
  const limit = validation.limitSeconds;
  const from = validation.estimatedSeconds;
  let current = { output, validation };
  let mode: "trim" | "grow" | null = null;
  const rewritten = new Set<string>();
  for (let pass = 0; pass < 3; pass++) {
    const before = current.validation.estimatedSeconds;
    const m = before > limit ? "trim" : pass === 0 && before < limit * 0.9 ? "grow" : null;
    if (!m || (mode && m !== mode) || input.abortSignal?.aborted) break;
    mode = m;
    input.onStatus?.(m === "grow" ? `Leaves ${fmtSec(limit - before)} unused; filling out the answers` : pass ? `Still ${fmtSec(before - limit)} over; trimming again` : `Runs ${fmtSec(before)} of ${fmtSec(limit)}; trimming to fit`);
    // Trims of dense sections come back a little long, so each extra trim pass aims lower. Fills come back
    // well short of their word targets, so they aim at the full limit; the 98% cap keeps them from running over.
    const step = await lengthPass(current.output, current.validation, ctx, input, ourSide, system, m, m === "trim" ? 0.97 - 0.02 * pass : 1);
    if (!step) break;
    current = step;
    for (const id of step.changed) rewritten.add(id);
  }
  if (!mode || !rewritten.size) return null;
  return { output: current.output, validation: { ...current.validation, lengthAdjust: { mode, fromSeconds: Math.round(from), toSeconds: Math.round(current.validation.estimatedSeconds), sections: rewritten.size } } };
}

async function lengthPass(output: SpeechDraftOutput, validation: Validation, ctx: RoundContext, input: DraftSpeechInput, ourSide: "aff" | "neg", system: string, mode: "trim" | "grow", aim: number) {
  const limit = validation.limitSeconds;
  const before = validation.estimatedSeconds;
  const rates = ctx.rates;
  const secondsPerWord = 60 / rates.rates.analyticWpm;
  const deltaWords = Math.round((limit * aim - before) / secondsPerWord);
  const items = output.sections.map((s) => ({ id: s.ref, words: countWords(s.analytic), priority: s.priority })).filter((i) => i.words >= (mode === "trim" ? 25 : 15));
  const targets = allocateWordChange(items, deltaWords);
  if (!targets.size) return null;

  const byRef = new Map(output.sections.map((s) => [s.ref, s]));
  const argText = new Map(ctx.graph.args.map((a) => [a.id, `${a.speech} "${a.text.slice(0, 120)}"`]));
  const cardText = new Map(ctx.cards.map((c) => [c.id, `${c.tag} (${c.shortCite})`]));
  const blocks = [...targets].map(([ref, words]) => {
    const s = byRef.get(ref)!;
    return `<section id="${ref}" target_words="${words}">
# ${s.title}
${s.targets.length ? `Answers: ${s.targets.map((t) => argText.get(t) ?? t).join("; ")}\n` : ""}Current text (${countWords(s.analytic)} words):
${s.analytic}
Cards read in this section: ${s.cardIds.map((c) => cardText.get(c) ?? c).join("; ") || "none"}
</section>`;
  });
  const prompt =
    mode === "trim"
      ? `This speech runs over its time limit. Shorten each section's analytic text to the stated number of words: as close as you can, never more. Keep the central warrant, the signposting, and what the section does strategically; cut repetition, throat-clearing, restated tags, and secondary points first. Do not add arguments, claims about what the other team said, or references to evidence not listed for that section.

${blocks.join("\n\n")}

Return every section above, using its id as sectionId, with its full shortened text.`
      : `This speech leaves speaking time unused. Rewrite each section's analytic text to the stated number of words: as close as you can, never more. Keep the same argument, order, and signposting; add depth — the specific warrant against their argument, comparison with their evidence, impact calculus, "even if" framing — never filler or repetition. Refer only to the cards listed for that section, and never attribute a claim to an author or card that isn't listed.

${blocks.join("\n\n")}

Return every section above, using its id as sectionId, with its full rewritten text.`;
  try {
    const res = await runStructured({
      task: "section_revise",
      system,
      // Trimming only needs the sections; filling needs the round to add real depth.
      context: mode === "grow" ? ctx.text : undefined,
      prompt,
      schema: TopUpSchema,
      abortSignal: input.abortSignal,
      teamId: input.teamId,
      models: [
        { model: MODELS.sonnet5, thinkingOff: true, maxOutputTokens: 12000, firstChunkMs: 30000 },
        { model: MODELS.opus55, effort: "low", maxOutputTokens: 12000 },
      ],
    });
    const rewrites = res.output.sections
      .filter((r) => targets.has(r.sectionId) && byRef.has(r.sectionId) && r.analytic.trim())
      .map((r) => ({ id: r.sectionId, have: countWords(byRef.get(r.sectionId)!.analytic), got: countWords(r.analytic), want: targets.get(r.sectionId)!, priority: byRef.get(r.sectionId)!.priority, text: r.analytic.trim() }));
    const keep = acceptRewrites(mode, rewrites, before, limit * 0.98, secondsPerWord);
    if (process.env.DEBUG_LENGTH) console.log(`[length ${mode}] ${Math.round(before)}s/${limit}s Δ${deltaWords}w targets ${JSON.stringify([...targets])} got ${JSON.stringify(rewrites.map(({ text: _t, ...r }) => r))} keep ${[...keep]}`);
    if (!keep.size) return null;
    const text = new Map(rewrites.filter((r) => keep.has(r.id)).map((r) => [r.id, r.text]));
    const fitted = validateDraft({ ...output, sections: output.sections.map((s) => (text.has(s.ref) ? { ...s, analytic: text.get(s.ref)! } : s)) }, ctx, input.speech, ourSide, rates);
    return { ...fitted, changed: [...keep] };
  } catch (e) {
    // Best effort: an untrimmed draft still shows its time in red, and Fit to time is one click away.
    console.warn(`draft length ${mode} failed: ${(e as Error).message}`);
    return null;
  }
}

function summarizeCards(ctx: RoundContext) {
  return ctx.cards.map((c) => ({ id: c.id, tag: c.tag, shortCite: c.shortCite, verificationStatus: c.verificationStatus }));
}

function meta<T>(r: RunResult<T>) {
  return { model: r.model, attempts: r.attempts, ttftMs: r.ttftMs, totalMs: r.totalMs, usage: r.usage };
}

function findSection(json: PMNodeJSON | null, sectionId: string): PMNodeJSON | null {
  if (!json) return null;
  let hit: PMNodeJSON | null = null;
  const walk = (n: PMNodeJSON) => {
    if (hit) return;
    if (n.type === "section" && n.attrs?.id === sectionId) {
      hit = n;
      return;
    }
    for (const c of n.content ?? []) walk(c);
  };
  walk(json);
  return hit;
}

export type SectionAction = "strengthen" | "clarify" | "reword" | "condense" | "alternatives" | "find_card" | "custom";

const ACTION_TEXT: Record<Exclude<SectionAction, "alternatives">, string> = {
  strengthen: "Deepen this answer: name their specific warrant, explain precisely why it fails or is outweighed, compare evidence on the substance, and state the implication for the round. Keep it speakable within the budget.",
  clarify: "Make the explanation clearer and easier to flow: same argument, same evidence, tighter logic, clear signposting (they say / but / because / therefore).",
  reword: "Keep the argument and evidence exactly the same; change only the wording so it's more natural to say aloud.",
  condense: "Condense this section to fit the time budget. Preserve the central warrant and the strategic purpose; cut repetition and weaker cards first; say what was cut in the note.",
  find_card: "Identify which warrant in this section needs better evidence. Keep the section, and describe precisely the card to find in needsEvidence (claim, ideal source type, recency).",
  custom: "Follow the team's instruction for this section.",
};

export interface ReviseInput {
  roundId: string;
  speech: SpeechId;
  draftId: string;
  sectionId: string;
  action: SectionAction;
  instructions: string;
  targetSeconds?: number | null;
  cardIds: string[];
  rates?: RateProfile | null;
  teamId: string;
  onPartial?: (p: unknown) => void;
  abortSignal?: AbortSignal;
}

export async function reviseSection(input: ReviseInput) {
  const ctx = await buildRoundContext(input.roundId, { speech: input.speech, draftId: input.draftId, cardIds: input.cardIds, evidenceMode: "selected_plus_library", instructions: input.instructions, rates: input.rates ?? presetProfile("fast") });
  const rates = ctx.rates;
  const sectionJson = findSection(ctx.draftJson, input.sectionId);
  if (!sectionJson) throw new Error("That section no longer exists in the draft.");
  if (sectionJson.attrs?.locked) throw new Error("That section is locked. Unlock it to revise.");
  const section = allSections(ctx.draft!).find((s) => s.id === input.sectionId) as DraftSection;
  const baseHash = sectionContentHash(sectionJson);
  const current = renderDraft({ items: [{ type: "section", section }] });
  const targets = section.targets.map((t) => ctx.graph.args.find((a) => a.id === t)).filter(Boolean);
  const currentSeconds = estimateSection(section.items.filter((i) => i.type === "paragraph").map((i) => (i as { text: string }).text).join(" "), section.title, section.items.filter((i) => i.type === "card").map((i) => (i as { cardId: string | null }).cardId ?? "").filter(Boolean), ctx, rates);
  const target = input.action === "condense" ? input.targetSeconds ?? Math.max(10, Math.round(currentSeconds * 0.6)) : section.budgetSec ?? null;
  const system = `${SYSTEM_BASE}\n\nSPEECH BEING PREPARED\n${SPEECH_RULES[input.speech]}`;
  if (input.action === "alternatives") {
    const prompt = `Give three strategically DISTINCT ways to handle this section of the ${input.speech} (not three wordings of one idea): e.g. straight defense vs. a turn vs. a grouped answer or a concession that serves the larger strategy — whatever is actually available in this round. For each, state the tradeoff honestly (what it gains, what it risks or concedes, contradictions it could create).

SECTION:
${current}

It targets: ${targets.map((a) => `[${a!.id}] ${a!.text}`).join("; ") || "(no targets)"}
${input.instructions ? `Team instruction: ${input.instructions}` : ""}`;
    const res = await runStructured({ task: "section_alternatives", system, context: ctx.text, prompt, schema: AlternativesSchema, onPartial: input.onPartial, abortSignal: input.abortSignal, teamId: input.teamId });
    const valid = new Set(ctx.cards.map((c) => c.id));
    const output: AlternativesOutput = { options: res.output.options.map((o) => ({ ...o, cardIds: o.cardIds.filter((c) => valid.has(c)) })) };
    return { kind: "alternatives" as const, output, baseHash, run: meta(res), contextRefs: ctx.refs, cards: summarizeCards(ctx) };
  }
  const prompt = `${ACTION_TEXT[input.action]}
${target ? `Time budget: about ${Math.round(target)} seconds (currently ~${Math.round(currentSeconds)} s).` : `Currently ~${Math.round(currentSeconds)} s.`}
${input.instructions ? `Team instruction: ${input.instructions}` : ""}

SECTION TO REVISE (only this section changes; the rest of the speech stays as is):
${current}

It targets: ${targets.map((a) => `[${a!.id}] ${a!.text}${a!.warrant ? ` (warrant: ${a!.warrant})` : ""}`).join("; ") || "(no targets)"}

Return the revised section: its heading (title), the analytic text to say, and which card ids to read (from the section's cards or the provided evidence).`;
  const res = await runStructured({ task: "section_revise", system, context: ctx.text, prompt, schema: SectionRevisionSchema, onPartial: input.onPartial, abortSignal: input.abortSignal, teamId: input.teamId });
  const valid = new Set(ctx.cards.map((c) => c.id));
  const output: SectionRevisionOutput = { ...res.output, cardIds: res.output.cardIds.filter((c) => valid.has(c)) };
  const seconds = estimateSection(output.analytic, output.title, output.cardIds, ctx, rates);
  return { kind: "revision" as const, output, baseHash, estimatedSeconds: seconds, previousSeconds: currentSeconds, run: meta(res), contextRefs: ctx.refs, cards: summarizeCards(ctx) };
}

// ---------------------------------------------------------------------------
// Fit the whole speech to time
// ---------------------------------------------------------------------------

export interface FitInput {
  roundId: string;
  speech: SpeechId;
  draftId: string;
  targetSeconds?: number | null;
  instructions: string;
  rates?: RateProfile | null;
  teamId: string;
  onPartial?: (p: unknown) => void;
  onProgress?: (p: Progress) => void;
  abortSignal?: AbortSignal;
}

/** Seconds for a section's own content (excluding nested sections). */
function ownSeconds(s: DraftSection, rates: RateProfile): number {
  return estimateSeconds(addLoads(...s.items.filter((i) => i.type !== "section").map(itemLoad)), rates.rates);
}

function totalSeconds(s: DraftSection, rates: RateProfile): number {
  return ownSeconds(s, rates) + s.items.filter((i): i is Extract<DraftItem, { type: "section" }> => i.type === "section").reduce((a, i) => a + totalSeconds(i.section, rates), 0);
}

function renderForFit(items: DraftItem[], rates: RateProfile, graph: RoundContext["graph"], depth = 0): string[] {
  const lines: string[] = [];
  const pad = "  ".repeat(depth);
  for (const it of items) {
    if (it.type !== "section") continue;
    const s = it.section;
    const targets = s.targets.map((t) => graph.args.find((a) => a.id === t)).filter(Boolean).map((a) => `${a!.speech} "${a!.text.slice(0, 80)}"`);
    lines.push(`${pad}<section id="${s.id}" own="${Math.round(ownSeconds(s, rates))}s" total="${Math.round(totalSeconds(s, rates))}s"${s.locked ? " LOCKED" : ""}${s.role ? ` role="${s.role}"` : ""}>`);
    if (s.title) lines.push(`${pad}  # ${s.title}`);
    if (targets.length) lines.push(`${pad}  answers: ${targets.join("; ")}`);
    for (const x of s.items) {
      if (x.type === "paragraph" && x.text.trim()) lines.push(`${pad}  ${x.text}`);
      if (x.type === "card") lines.push(`${pad}  [card ${x.cardId ?? "unsaved"}] ${x.tag} — ${x.shortCite} (~${Math.round(estimateSeconds(itemLoad(x), rates.rates))}s)`);
    }
    lines.push(...renderForFit(s.items, rates, graph, depth + 1));
    lines.push(`${pad}</section>`);
  }
  return lines;
}

/** Rewrite expanded sections that came back shorter than their time target, to an explicit word count. */
async function topUpExpanded(plan: FitPlanOutput["plan"], sections: DraftSection[], ctx: RoundContext, rates: RateProfile, input: FitInput): Promise<void> {
  const poolById = new Map(ctx.cards.map((c) => [c.id, c]));
  const ownById = new Map<string, Extract<DraftItem, { type: "card" }>>();
  for (const s of sections) for (const i of s.items) if (i.type === "card" && i.cardId) ownById.set(i.cardId, i);
  const cardSeconds = (id: string) => {
    const own = ownById.get(id);
    if (own) return estimateSeconds(itemLoad(own), rates.rates);
    const c = poolById.get(id);
    return c ? estimateSeconds(cardLoad({ tag: c.tag, citation: c.citation, body: c.body }), rates.rates) : 0;
  };
  const wps = rates.rates.analyticWpm / 60;
  const short: { e: FitPlanOutput["plan"][number]; have: number; need: number }[] = [];
  for (const e of plan) {
    if (e.action !== "expand") continue;
    const fixed = e.cardIds.reduce((a, id) => a + cardSeconds(id), 0) + estimateSeconds({ cardWords: 0, tagWords: countWords(e.title), analyticWords: 0, cards: 0, transitions: 1 }, rates.rates);
    const need = Math.round(Math.max(0, e.targetSeconds - fixed) * wps);
    const have = countWords(e.analytic);
    if (need >= 30 && have < need * 0.85) short.push({ e, have, need });
  }
  if (!short.length) return;
  const tagOf = (id: string) => ownById.get(id)?.tag ?? poolById.get(id)?.tag ?? id;
  const prompt = `Rewrite each section's analytic text to the stated number of words (within about 10%). Keep the same argument, order, and signposting; add depth — the specific warrant against their argument, comparison of evidence, impact calculus, "even if" framing — never filler or repetition. Refer only to the cards listed for that section.

${short
  .map(
    ({ e, have, need }) => `<section id="${e.sectionId}" target_words="${need}">
# ${e.title}
Current text (${have} words):
${e.analytic}
Cards read in this section: ${e.cardIds.map(tagOf).join("; ") || "none"}
</section>`,
  )
  .join("\n\n")}

Return every section above with its full rewritten text.`;
  try {
    const res = await runStructured({
      task: "section_revise",
      system: `${SYSTEM_BASE}\n\nSPEECH BEING PREPARED\n${SPEECH_RULES[input.speech]}`,
      context: ctx.text,
      prompt,
      schema: TopUpSchema,
      abortSignal: input.abortSignal,
      teamId: input.teamId,
      models: [
        { model: MODELS.sonnet5, thinkingOff: true, maxOutputTokens: 12000, firstChunkMs: 20000 },
        { model: MODELS.opus55, effort: "low", maxOutputTokens: 12000 },
      ],
    });
    for (const r of res.output.sections) {
      const hit = short.find((x) => x.e.sectionId === r.sectionId);
      if (hit && countWords(r.analytic) > hit.have) hit.e.analytic = r.analytic;
    }
  } catch {
    // Best effort: keep the planner's text if the top-up fails.
  }
}

export async function fitSpeech(input: FitInput) {
  const probe = await buildRoundContext(input.roundId, { speech: input.speech, draftId: input.draftId, evidenceMode: "selected_only", instructions: input.instructions, rates: input.rates ?? presetProfile("fast") });
  if (!probe.draft || !probe.draftJson) throw new Error("Open a draft with content to fit.");
  const probeCurrent = estimateSeconds(addLoads(...probe.draft.items.map(itemLoad)), probe.rates.rates);
  // Short speeches are filled (expanding with the team's evidence); long ones are cut.
  const fill = probeCurrent < probe.limitSeconds * 0.9;
  const ctx = fill ? await buildRoundContext(input.roundId, { speech: input.speech, draftId: input.draftId, evidenceMode: "selected_plus_library", instructions: input.instructions, rates: input.rates ?? presetProfile("fast") }) : probe;
  const rates = ctx.rates;
  if (!ctx.draft || !ctx.draftJson) throw new Error("Open a draft with content to fit.");
  const sections = allSections(ctx.draft);
  if (!sections.length) throw new Error("This draft has no sections to fit. Add sections (or generate a draft) first.");
  const topLoose = ctx.draft.items.filter((i) => i.type !== "section");
  const current = estimateSeconds(addLoads(...ctx.draft.items.map(itemLoad)), rates.rates);
  const limit = ctx.limitSeconds;
  const target = Math.round(Math.min(input.targetSeconds ?? limit * (fill ? 0.95 : 0.97), limit));
  const system = `${SYSTEM_BASE}

SPEECH BEING PREPARED
${SPEECH_RULES[input.speech]}

${
    fill
      ? `TASK: FILL THE SPEECH TO TIME. The draft runs short, leaving speaking time unused. Decide, section by section, what to keep as is and what to expand. Expand where it wins the round: deeper warrants against their specific arguments, evidence comparison, impact calculus, "even if" framing, and extensions the next speech needs; add cards from the provided evidence where they directly support the section (use only the listed card ids). Do not pad with repetition or filler. A section marked LOCKED must be kept exactly.`
      : `TASK: FIT THE SPEECH TO TIME. The debaters wrote or accepted this draft and it runs long. Decide, section by section, what to keep as is, what to condense (rewrite shorter), and what to cut, so the whole speech fits the target. Priorities: keep the arguments that decide the round and every answer to an argument the other team is likely to extend; cut repetition, redundant cards (keep the best one), and low-value defense first; condense overviews and long explanations; group similar answers. A section marked LOCKED must be kept exactly. Never invent evidence: condensed sections may only keep cards they already have. Say honestly what is being given up.`
  }`;
  const notes = [input.instructions ? `Team instruction: ${input.instructions}` : "", topLoose.length ? "(Text outside sections is kept as is.)" : ""].filter(Boolean).join("\n");
  const need = Math.abs(Math.round(current - target));
  const wps = rates.rates.analyticWpm / 60;
  const goal = fill
    ? `The draft runs ~${Math.round(current)} s. The ${input.speech} limit is ${limit} s. Bring it to about ${target} s: add about ${need} s in total, and do not go over ${limit} s. Use "expand" for sections that should grow and "keep" for the rest; don't cut anything.`
    : `The draft runs ~${Math.round(current)} s. The ${input.speech} limit is ${limit} s. Bring it to about ${target} s: remove about ${need} s in total, and no more than ${need + 20} s. Every second of a rebuttal is valuable, so do not cut deeper than needed; prefer cutting a whole weak section or a redundant card over rewriting everything.`;
  const prompt = `${goal}
This speaker reads analytics at about ${Math.round(rates.rates.analyticWpm)} words per minute, so a section of N seconds should have about ${wps.toFixed(1)} × N words of analytic text (cards add their own time, shown below${fill ? " and in the evidence list" : ""}). Give each entry a targetSeconds and write the new text to that length.
${notes}
DRAFT (seconds are estimates at this speaker's measured rate):
${renderForFit(ctx.draft.items, rates, ctx.graph).join("\n")}

Return one plan entry for every section id above.`;
  const progress = input.onProgress ? fitProgress(input.onProgress, await taskTiming("speech_fit"), sections.length) : null;
  progress?.start();
  const onPartial = (p: unknown) => {
    progress?.partial(p as { plan?: unknown[] });
    input.onPartial?.(p);
  };
  const res = await runStructured({ task: "speech_fit", system, context: ctx.text, prompt, schema: FitPlanSchema, onPartial, abortSignal: input.abortSignal, teamId: input.teamId });

  // Validate: known sections only; locked sections stay; condensed sections keep only their own cards.
  const byId = new Map(sections.map((s) => [s.id, s]));
  const hashOf = (id: string) => {
    const j = findSection(ctx.draftJson, id);
    return j ? sectionContentHash(j) : "";
  };
  const plan: FitPlanOutput["plan"] = [];
  const seen = new Set<string>();
  for (const e of res.output.plan) {
    const s = byId.get(e.sectionId);
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id);
    if (s.locked && e.action !== "keep") {
      plan.push({ ...e, action: "keep", title: "", analytic: "", cardIds: [], reason: "Locked by the team, kept as is." });
      continue;
    }
    const own = new Set(s.items.filter((i) => i.type === "card").map((i) => (i as { cardId: string | null }).cardId).filter((x): x is string => !!x));
    const pool = new Set(ctx.cards.map((c) => c.id));
    if (fill && (e.action === "cut" || e.action === "condense")) {
      plan.push({ ...e, action: "keep", title: "", analytic: "", cardIds: [], reason: e.reason });
      continue;
    }
    if (!fill && e.action === "expand") {
      plan.push({ ...e, action: "keep", title: "", analytic: "", cardIds: [] });
      continue;
    }
    // Condensed sections keep only their own cards; expanded ones may add provided (library) cards.
    plan.push(e.action === "condense" ? { ...e, cardIds: e.cardIds.filter((c) => own.has(c)) } : e.action === "expand" ? { ...e, cardIds: [...new Set(e.cardIds.filter((c) => own.has(c) || pool.has(c)))] } : e);
  }
  for (const s of sections) if (!seen.has(s.id)) plan.push({ sectionId: s.id, action: "keep", targetSeconds: Math.round(ownSeconds(s, rates)), title: "", analytic: "", cardIds: [], reason: "Not covered by the plan; kept as is." });

  // Models write fewer words than a fast speaker needs for a given number of seconds. For expanded
  // sections, compute the exact analytic word count from the measured rate and have short ones
  // rewritten to that length in one batched call.
  if (fill) {
    progress?.stage("Writing the expanded sections to length", 0.92, (await taskTiming("section_revise")).totalMs);
    await topUpExpanded(plan, sections, ctx, rates, input);
  }

  // Sections inside a cut section are cut with it.
  const cut = new Set(plan.filter((e) => e.action === "cut").map((e) => e.sectionId));
  for (const s of sections) if (cut.has(s.id)) for (const c of allSections(s)) cut.add(c.id);

  // Time after the plan.
  const perSection: Record<string, { before: number; after: number }> = {};
  let after = current;
  const cardById = new Map<string, Extract<DraftItem, { type: "card" }>>();
  for (const s of sections) for (const i of s.items) if (i.type === "card" && i.cardId) cardById.set(i.cardId, i);
  for (const e of plan) {
    const s = byId.get(e.sectionId)!;
    const before = ownSeconds(s, rates);
    let a = before;
    if (cut.has(s.id)) a = 0;
    else if (e.action === "condense" || e.action === "expand") {
      const poolById = new Map(ctx.cards.map((c) => [c.id, c]));
      const loadOf = (id: string) => {
        const own = cardById.get(id);
        if (own) return itemLoad(own);
        const c = poolById.get(id);
        return c ? cardLoad({ tag: c.tag, citation: c.citation, body: c.body }) : { cardWords: 0, tagWords: 0, analyticWords: 0, cards: 0, transitions: 0 };
      };
      a = estimateSeconds(addLoads({ cardWords: 0, tagWords: countWords(e.title), analyticWords: countWords(e.analytic), cards: 0, transitions: 1 }, ...e.cardIds.map(loadOf)), rates.rates);
    }
    perSection[s.id] = { before: Math.round(before), after: Math.round(a) };
    after -= before - a;
  }

  // Coverage consequences: targets whose only answers are being cut.
  const kept = sections.filter((s) => !cut.has(s.id));
  const stillAnswered = new Set(kept.flatMap((s) => s.targets));
  const lost = [...new Set(sections.filter((s) => cut.has(s.id)).flatMap((s) => s.targets))].filter((t) => !stillAnswered.has(t));
  const newlyUnanswered = lost.map((id) => ({ id, text: ctx.graph.args.find((a) => a.id === id)?.text ?? id }));

  const baseHashes: Record<string, string> = {};
  for (const e of plan) if (e.action !== "keep") baseHashes[e.sectionId] = hashOf(e.sectionId);
  const titles: Record<string, string> = Object.fromEntries(sections.map((s) => [s.id, s.title]));
  return {
    kind: "fit" as const,
    mode: fill ? ("fill" as const) : ("cut" as const),
    output: { ...res.output, plan },
    baseHashes,
    titles,
    perSection,
    previousSeconds: Math.round(current),
    estimatedSeconds: Math.round(after),
    limitSeconds: limit,
    targetSeconds: target,
    newlyUnanswered,
    run: meta(res),
    contextRefs: ctx.refs,
  };
}

// ---------------------------------------------------------------------------
// Update an existing draft (A3): only what changed
// ---------------------------------------------------------------------------

export interface PatchInput {
  roundId: string;
  speech: SpeechId;
  draftId: string;
  instructions: string;
  cardIds: string[];
  evidenceMode: "selected_only" | "selected_plus_library";
  rates?: RateProfile | null;
  teamId: string;
  onPartial?: (p: unknown) => void;
  onStatus?: (s: string) => void;
  onProgress?: (p: Progress) => void;
  abortSignal?: AbortSignal;
  /** benchmark override of the model chain */
  models?: import("./models").ModelSpec[];
}

export interface PatchRetarget {
  sectionId: string;
  addTargets: string[];
  /** links to arguments no longer on the flow (added by code, never by the model) */
  removeTargets: string[];
  reason: string;
}

export interface PatchEditInfo {
  /** sectionContentHash when the update was planned; a different hash at apply time means someone edited it since */
  baseHash: string;
  /** share of the section's words the edit changes (0–1) */
  share: number;
  /** the team wrote this section or changed it after the AI did */
  humanEdited: boolean;
  /** rewrites more than half of the section although the argument it answers didn't change */
  large: boolean;
  previousSeconds: number;
  seconds: number;
}

export type PatchOutput = Omit<PatchPlanOutput, "retargets"> & { retargets: PatchRetarget[] };

const PATCH_TASK = `TASK: UPDATE THE DRAFT, DON'T REWRITE IT. The team already has a draft of this speech. New arguments came in, an argument changed, or the team has a new idea. Change only what that needs:
- A new argument that an existing section already answers as written: link it to that section (retargets). Never write a second answer to something already answered.
- A new argument nothing answers: add a section that answers it (adds), written like the draft's other answers (a numbered label, the claim against their specific warrant, because, so what). Set anchor to the id of the existing section that holds that position's answers; code places it. A whole new position gets one new section of kind "position" with its answers as children (their parentRef = its ref).
- Edit an existing section only when its answer no longer fits (the argument it answers changed) or the team asks. Keep every sentence that still works; never rewrite for style.
- Never edit a LOCKED section. Leave sections the team wrote or edited alone unless the team's instruction is about them; add a new section instead.
- Don't touch anything unrelated to the change, and don't re-answer what the draft already covers.
- New sections cost speaking time: keep them tight, and read a card only when the answer needs evidence and the card is provided (by id). If the speech would run over, say what to cut in questions; don't cut here.`;

function sectionJsonById(json: PMNodeJSON | null): Map<string, PMNodeJSON> {
  const out = new Map<string, PMNodeJSON>();
  const walk = (n: PMNodeJSON) => {
    if (n.type === "section" && typeof n.attrs?.id === "string") out.set(n.attrs.id, n);
    for (const c of n.content ?? []) walk(c);
  };
  if (json) walk(json);
  return out;
}

function renderForPatch(items: DraftItem[], json: Map<string, PMNodeJSON>, rates: RateProfile, graph: RoundContext["graph"], depth = 0): string[] {
  const lines: string[] = [];
  const pad = "  ".repeat(depth);
  const argById = new Map(graph.args.map((a) => [a.id, a]));
  for (const it of items) {
    if (it.type !== "section") continue;
    const s = it.section;
    const j = json.get(s.id);
    const by = s.origin !== "ai" ? "team" : j && isHumanEdited(j) ? "ai, edited by team" : "ai";
    lines.push(`${pad}<section id="${s.id}" own="${Math.round(ownSeconds(s, rates))}s"${s.locked ? " LOCKED" : ""} by="${by}"${s.relation !== "none" ? ` relation="${s.relation}"` : ""}${s.role ? ` role="${s.role}"` : ""}>`);
    if (s.title) lines.push(`${pad}  # ${s.title}`);
    if (s.targets.length) {
      const list = s.targets.map((t) => {
        const a = argById.get(t);
        return a ? `[${t}] ${a.speech} "${a.text.slice(0, 90)}"` : `[${t}] (no longer on the flow)`;
      });
      lines.push(`${pad}  ${s.relation === "extend" ? "extends" : "answers"}: ${list.join("; ")}`);
    }
    for (const x of s.items) {
      if (x.type === "paragraph" && x.text.trim()) lines.push(`${pad}  ${x.text}`);
      if (x.type === "card") lines.push(`${pad}  [card ${x.cardId ?? "unsaved"}] ${x.tag} — ${x.shortCite} (~${Math.round(estimateSeconds(itemLoad(x), rates.rates))}s)`);
      if (x.type === "note" && x.text.trim()) lines.push(`${pad}  (team note, not read: ${x.text})`);
    }
    lines.push(...renderForPatch(s.items, json, rates, graph, depth + 1));
    lines.push(`${pad}</section>`);
  }
  return lines;
}

function renderChanges(cs: ChangeSet, graph: RoundContext["graph"]): string {
  const pos = new Map(graph.positions.map((p) => [p.id, p.name]));
  const argById = new Map(graph.args.map((a) => [a.id, a]));
  const line = (a: ArgUnit) =>
    `- [${a.id}] (${pos.get(a.positionId) ?? "?"}) ${a.speech}${a.label ? ` ${a.label}.` : ""} ${a.text}${a.evidence === "analytic" ? " {analytic}" : a.cites?.length ? ` (${a.cites.join(", ")})` : ""}${a.provenance.type === "heard" && a.provenance.quote !== a.text ? ` {as heard: "${a.provenance.quote}"}` : ""}`;
  const out: string[] = [];
  if (cs.unanswered.length) out.push(`New arguments nothing in the draft answers yet (answer or link each; group only where one answer truly covers them; anything you leave, list in notAddressed with the reason):`, ...cs.unanswered.map(line));
  if (cs.uncertain.length) out.push(`Possibly said (low-confidence readings): answer only if it's cheap, otherwise ask in questions:`, ...cs.uncertain.map(line));
  if (cs.stale.length) out.push(`Answers written before the argument's words changed (edit only if the answer no longer fits):`, ...cs.stale.map((s) => `- section [${s.sectionId}] "${s.title}" answers ${s.argIds.map((id) => `[${id}], now "${argById.get(id)?.text.slice(0, 140) ?? ""}"`).join("; ")}`));
  if (cs.vanished.length) out.push(`Sections linked to arguments no longer on the flow (code removes the links; say in questions if a section should go):`, ...cs.vanished.map((v) => `- section [${v.sectionId}] "${v.title}" → ${v.argIds.map((id) => `[${id}]`).join(", ")}`));
  if (cs.otherFlows.length) out.push(`Unanswered on flows this speech doesn't go for (don't answer unless the team asks; a final rebuttal collapses):`, ...cs.otherFlows.slice(0, 20).map(line));
  return out.join("\n") || "(nothing new on the flow)";
}

function summarizeChanges(cs: ChangeSet, graph: RoundContext["graph"]) {
  const pos = new Map(graph.positions.map((p) => [p.id, p.name]));
  const arg = (a: ArgUnit) => ({ id: a.id, text: a.text, position: pos.get(a.positionId) ?? "", speech: a.speech });
  return { unanswered: cs.unanswered.map(arg), uncertain: cs.uncertain.map(arg), otherFlows: cs.otherFlows.map(arg), stale: cs.stale, vanished: cs.vanished };
}

/**
 * Update a draft for what changed: new arguments get answers (or links to the
 * section that already answers them), answers to arguments whose words changed
 * get minimal edits, and nothing else is touched. The model only proposes;
 * code validates every id, drops duplicate answers, decides placement, and the
 * browser applies with lock, staleness and partner checks.
 */
export async function patchSpeech(input: PatchInput) {
  const round = await roundFor(input.roundId);
  if (SPEECHES[input.speech].side !== round.ourSide) throw new Error("Only your own speeches can be updated.");
  const ctx = await buildRoundContext(input.roundId, { speech: input.speech, draftId: input.draftId, cardIds: input.cardIds, evidenceMode: input.evidenceMode, instructions: input.instructions, rates: input.rates ?? presetProfile("fast"), omitDraftText: true });
  if (!ctx.draft || !ctx.draftJson) throw new Error("Open a draft to update.");
  const rates = ctx.rates;
  const instructions = input.instructions.trim();
  const cs = changeSet({ graph: ctx.graph, speech: input.speech, draft: ctx.draft, recorded: ctx.recorded });
  const json = sectionJsonById(ctx.draftJson);
  const previousSeconds = Math.round(estimateSeconds(addLoads(...ctx.draft.items.map(itemLoad)), rates.rates));
  const titles = Object.fromEntries(allSections(ctx.draft).map((s) => [s.id, s.title]));
  const base = { kind: "patch" as const, changes: summarizeChanges(cs, ctx.graph), titles, previousSeconds, limitSeconds: ctx.limitSeconds, contextRefs: { ...ctx.refs, draftHash: sectionContentHash(ctx.draftJson) } };
  if (isUpToDate(cs) && !instructions) {
    const extra = [cs.uncertain.length ? `${cs.uncertain.length} low-confidence reading${cs.uncertain.length === 1 ? "" : "s"} to confirm on the flow` : "", cs.otherFlows.length ? `${cs.otherFlows.length} unanswered on flows this speech doesn't go for` : ""].filter(Boolean);
    const output: PatchOutput = { summary: `The draft already answers everything new on the flow${extra.length ? ` (${extra.join("; ")})` : ""}.`, adds: [], retargets: [], edits: [], notAddressed: [], questions: [] };
    const none = {
      addInfo: {} as Record<string, { positionId: string | null; where: string; seconds: number }>,
      editInfo: {} as Record<string, PatchEditInfo>,
      argHashes: {} as Record<string, string>,
      positionNames: {} as Record<string, string>,
      checks: [] as SpeechCheck[],
      remaining: [] as { id: string; text: string }[],
      dropped: { targets: 0, cards: 0, duplicates: [] as string[], linksInPlace: 0 },
    };
    return { ...base, upToDate: true, output, ...none, estimatedSeconds: previousSeconds, run: null };
  }
  const n = cs.unanswered.length;
  input.onStatus?.(n ? `Answering ${n} new argument${n === 1 ? "" : "s"}` : instructions ? "Working in your instruction" : "Updating changed answers");
  const progress = input.onProgress ? patchProgress(input.onProgress, await taskTiming("speech_patch"), n) : null;
  progress?.start();

  const system = `${SYSTEM_BASE}\n\nSPEECH BEING PREPARED\n${SPEECH_RULES[input.speech]}\n\n${PATCH_TASK}`;
  const prompt = `Update the ${input.speech} for the ${round.ourSide.toUpperCase()}.
The draft runs ~${previousSeconds} s of ${Math.round(ctx.limitSeconds)} s. This speaker reads analytics at about ${Math.round(rates.rates.analyticWpm)} words per minute (${(rates.rates.analyticWpm / 6).toFixed(0)} words per 10 seconds).
${instructions ? `Team instruction for this update: ${instructions}` : "No extra instructions: cover what changed."}

CURRENT DRAFT (section ids in brackets; own = seconds of the section's own words and cards)
${renderForPatch(ctx.draft.items, json, rates, ctx.graph).join("\n") || "(empty)"}

WHAT CHANGED
${renderChanges(cs, ctx.graph)}

Return only the changes: adds, retargets, edits. Leave everything else out.`;

  const fake = (): PatchPlanOutput => ({
    summary: `[AI_FAKE] Answers ${cs.unanswered.length} new argument${cs.unanswered.length === 1 ? "" : "s"}.`,
    adds: cs.unanswered.map((a, i) => ({
      ref: `n${i + 1}`,
      parentRef: "",
      anchor: "",
      kind: "response" as const,
      title: `${i + 1}. No link — ${a.text.slice(0, 40)}`,
      relation: "answers" as const,
      targets: [a.id],
      crossApplyFrom: "",
      role: "no_link" as const,
      analytic: `[AI_FAKE] They say ${a.text.slice(0, 60)}. That doesn't apply because their evidence is about the status quo, not the plan, so it can't be a reason to vote against us.`,
      cardIds: [],
      needsEvidence: "",
      budgetSeconds: 15,
      priority: 2,
    })),
    retargets: [],
    edits: [],
    notAddressed: [],
    questions: [],
  });
  const onPartial = (p: unknown) => {
    progress?.partial(p as Parameters<NonNullable<typeof progress>["partial"]>[0]);
    input.onPartial?.(p);
  };
  const res = await runStructured({ task: "speech_patch", system, context: ctx.text, prompt, schema: PatchPlanSchema, onPartial, abortSignal: input.abortSignal, teamId: input.teamId, models: input.models, fake });
  input.onStatus?.("Checking the update");
  progress?.checking();
  return { ...base, upToDate: false, ...validatePatch(res.output, ctx, cs, json, input.speech, instructions, previousSeconds), run: meta(res) };
}

function validatePatch(out: PatchPlanOutput, ctx: RoundContext, cs: ChangeSet, json: Map<string, PMNodeJSON>, speech: SpeechId, instructions: string, previousSeconds: number) {
  const { graph, rates } = ctx;
  const argById = new Map(graph.args.map((a) => [a.id, a]));
  const pool = new Set(ctx.cards.map((c) => c.id));
  const sections = patchSections(ctx.draft);
  const secById = new Map(sections.map((s) => [s.id, s]));
  const draftSecById = new Map(allSections(ctx.draft!).map((s) => [s.id, s]));
  let droppedTargets = 0;
  let droppedCards = 0;
  const duplicates: string[] = [];

  // Retargets: known sections, live arguments not already linked. Links to vanished arguments are removed by code.
  const retargets = new Map<string, PatchRetarget>();
  let linksInPlace = 0;
  for (const r of out.retargets) {
    const s = secById.get(r.sectionId);
    if (!s) continue;
    const add = r.addTargets.filter((t) => argById.has(t) && isLive(argById.get(t)!) && !s.targets.includes(t));
    if (!add.length) {
      if (r.addTargets.some((t) => s.targets.includes(t))) linksInPlace++;
      continue;
    }
    const cur = retargets.get(s.id) ?? { sectionId: s.id, addTargets: [], removeTargets: [], reason: r.reason };
    cur.addTargets = [...new Set([...cur.addTargets, ...add])];
    retargets.set(s.id, cur);
  }
  for (const v of cs.vanished) {
    const cur = retargets.get(v.sectionId) ?? { sectionId: v.sectionId, addTargets: [], removeTargets: [], reason: "The argument it answered is no longer on the flow." };
    cur.removeTargets = [...new Set([...cur.removeTargets, ...v.argIds])];
    retargets.set(v.sectionId, cur);
  }
  const linked = sections.map((s) => {
    const r = retargets.get(s.id);
    return r ? { ...s, targets: [...s.targets.filter((t) => !r.removeTargets.includes(t)), ...r.addTargets] } : s;
  });

  // Adds: unique refs, known ids only, no parent cycles, no second answer to something already answered.
  const seen = new Set<string>();
  let adds = out.adds.map((a, i) => {
    let ref = (a.ref || `n${i + 1}`).trim();
    while (seen.has(ref)) ref = `${ref}_${i}`;
    seen.add(ref);
    const targets = a.targets.filter((t) => argById.has(t) || (droppedTargets++, false));
    const cardIds = a.cardIds.filter((c) => pool.has(c) || (droppedCards++, false));
    return { ...a, ref, targets, cardIds, anchor: secById.has(a.anchor) ? a.anchor : "" };
  });
  const refs = new Set(adds.map((a) => a.ref));
  adds = adds.map((a) => ({ ...a, parentRef: a.parentRef && a.parentRef !== a.ref && refs.has(a.parentRef) ? a.parentRef : "" }));
  const parentOf = new Map(adds.map((a) => [a.ref, a.parentRef]));
  for (const a of adds) {
    let cur = a.parentRef;
    for (let steps = 0; cur && steps <= adds.length; steps++) {
      if (cur === a.ref) {
        a.parentRef = "";
        parentOf.set(a.ref, "");
        break;
      }
      cur = parentOf.get(cur) ?? "";
    }
  }
  if (!instructions) {
    const keep = adds.filter((a) => {
      const dup = a.relation !== "extend" && a.relation !== "new" && alreadyAnswered(linked, graph, a.targets);
      if (dup) duplicates.push(a.title || a.ref);
      return !dup;
    });
    const kept = new Set(keep.map((a) => a.ref));
    adds = keep.map((a) => (a.parentRef && !kept.has(a.parentRef) ? { ...a, parentRef: "" } : a));
  }
  // Containers whose answers were all dropped, and sections with nothing to say, go too.
  for (let pass = 0; pass < 3; pass++) {
    const hasKids = new Set(adds.map((a) => a.parentRef).filter(Boolean));
    adds = adds.filter((a) => a.analytic.trim() || a.cardIds.length || a.needsEvidence.trim() || hasKids.has(a.ref) || (a.title.trim() && a.targets.length));
  }

  // Where each new section goes (the browser re-decides on the live draft when applying).
  const addByRef = new Map(adds.map((a) => [a.ref, a]));
  const posOfTargets = (targets: string[]) => targets.map((t) => argById.get(t)?.positionId).find((p): p is string => !!p) ?? null;
  const positionOf = (a: (typeof adds)[number]): string | null => {
    let p = posOfTargets(a.targets);
    for (let cur = a, steps = 0; !p && cur.parentRef && steps < 10; steps++) {
      const parent = addByRef.get(cur.parentRef);
      if (!parent) break;
      p = posOfTargets(parent.targets);
      cur = parent;
    }
    if (!p) p = posOfTargets(adds.filter((k) => k.parentRef === a.ref).flatMap((k) => k.targets));
    if (!p && a.anchor) {
      const anc = secById.get(a.anchor)!;
      p = anc.positionId ?? posOfTargets(anc.targets);
    }
    return p;
  };
  const addInfo: Record<string, { positionId: string | null; where: string; seconds: number }> = {};
  for (const a of adds) {
    const positionId = positionOf(a);
    let where = "";
    if (!a.parentRef) {
      const place: Placement = placeAnswer(linked, graph, positionId, a.anchor);
      const title = (id: string) => `“${secById.get(id)?.title || "a section"}”`;
      where = "under" in place ? `under ${title(place.under)}` : "after" in place ? `after ${title(place.after)}` : a.kind === "position" || !positionId ? "at the end" : `at the end, as a new ${graph.positions.find((p) => p.id === positionId)?.name ?? "position"} section`;
    }
    addInfo[a.ref] = { positionId, where, seconds: Math.round(estimateSection(a.analytic, a.title, a.cardIds, ctx, rates)) };
  }

  // Edits: known, unlocked sections, with the section's own cards or provided ones; how much they change.
  const lockedAround = (id: string) => {
    for (let cur = secById.get(id); cur; cur = cur.parentId ? secById.get(cur.parentId) : undefined) if (cur.locked) return true;
    const node = draftSecById.get(id);
    return !!node && allSections(node).some((c) => c.locked);
  };
  const editInfo: Record<string, PatchEditInfo> = {};
  const edits: PatchOutput["edits"] = [];
  for (const e of out.edits) {
    const s = draftSecById.get(e.sectionId);
    const j = json.get(e.sectionId);
    if (!s || !j || editInfo[s.id] || lockedAround(s.id)) continue;
    const own = new Set(s.items.filter((i) => i.type === "card").map((i) => (i as { cardId: string | null }).cardId).filter((x): x is string => !!x));
    const cardIds = e.cardIds.filter((c) => own.has(c) || pool.has(c));
    const analytic = e.analytic.trim();
    if (!analytic && !cardIds.length) continue;
    const before = s.items
      .filter((i) => i.type === "paragraph")
      .map((i) => (i as { text: string }).text)
      .join("\n\n");
    const title = e.title.trim() || s.title;
    const share = changedShare(before, analytic);
    const sameCards = cardIds.length === own.size && cardIds.every((c) => own.has(c));
    if (share === 0 && title === s.title && sameCards) continue;
    const argChanged = cs.stale.some((x) => x.sectionId === s.id);
    editInfo[s.id] = { baseHash: sectionContentHash(j), share: Math.round(share * 100) / 100, humanEdited: isHumanEdited(j), large: share > 0.5 && !argChanged, previousSeconds: Math.round(ownSeconds(s, rates)), seconds: Math.round(estimateSection(analytic, title, cardIds, ctx, rates)) };
    edits.push({ ...e, title, analytic, cardIds });
  }

  // The speech as it would stand: checks and what's still unanswered.
  const edited = new Map(edits.map((e) => [e.sectionId, e]));
  const merged: CheckSection[] = checkSections(ctx.draft).map((s) => {
    const r = retargets.get(s.id);
    const e = edited.get(s.id);
    const targets = r ? [...new Set([...s.targets.filter((t) => !r.removeTargets.includes(t)), ...r.addTargets])] : s.targets;
    const relation = !r ? s.relation : !targets.length ? "none" : s.relation === "none" ? (targets.length > 1 ? "group" : "answers") : s.relation;
    return { ...s, targets, relation, title: e?.title ?? s.title, analytic: e?.analytic ?? s.analytic };
  });
  const cite = (id: string) => ctx.cards.find((c) => c.id === id)?.shortCite ?? "";
  const added: CheckSection[] = adds.map((a) => ({ id: `new:${a.ref}`, title: a.title, relation: a.relation, targets: a.targets, role: a.role || null, crossApplyFrom: a.crossApplyFrom || null, analytic: a.analytic, cardCites: a.cardIds.map(cite), parentId: a.parentRef ? `new:${a.parentRef}` : a.anchor || null, kind: a.kind }));
  const report = checkSpeech({ graph, speech, sections: [...merged, ...added], recorded: ctx.recorded });
  const covered = new Set(report.coverage.items.filter((i) => i.status !== "unanswered" && i.status !== "uncertain").map((i) => i.arg.id));
  const notAddressed = new Set(out.notAddressed.flatMap((x) => x.targets));
  const remaining = cs.unanswered.filter((a) => !covered.has(a.id) && !notAddressed.has(a.id)).map((a) => ({ id: a.id, text: a.text }));

  const argHashes: Record<string, string> = {};
  const referenced = [...adds.flatMap((a) => a.targets), ...[...retargets.values()].flatMap((r) => r.addTargets), ...merged.filter((s) => edited.has(s.id)).flatMap((s) => s.targets)];
  for (const id of referenced) {
    const a = argById.get(id);
    if (a) argHashes[id] = argBasisHash(a);
  }
  const positionNames = Object.fromEntries(graph.positions.map((p) => [p.id, p.name]));
  const addSeconds = Object.values(addInfo).reduce((s, x) => s + x.seconds, 0);
  const editDelta = Object.values(editInfo).reduce((s, x) => s + x.seconds - x.previousSeconds, 0);
  const output: PatchOutput = { ...out, adds, retargets: [...retargets.values()], edits, notAddressed: out.notAddressed.filter((x) => x.targets.some((t) => argById.has(t))) };
  return { output, addInfo, editInfo, argHashes, positionNames, estimatedSeconds: Math.round(previousSeconds + addSeconds + editDelta), checks: report.checks, remaining, dropped: { targets: droppedTargets, cards: droppedCards, duplicates, linksInPlace } };
}

export interface InterpretInput {
  roundId: string;
  speech: SpeechId;
  teamId: string;
  userId: string;
  onPartial?: (p: unknown) => void;
  abortSignal?: AbortSignal;
}

/** Interpret roles and response links for one speech's arguments; writes SUGGESTIONS to the flow. */
export async function interpretFlow(input: InterpretInput) {
  const round = await roundFor(input.roundId);
  const ctx = await buildRoundContext(input.roundId, { speech: input.speech, evidenceMode: "selected_only" });
  const inSpeech = ctx.graph.args.filter((a) => a.speech === input.speech);
  if (!inSpeech.length) throw new Error(`No ${input.speech} arguments on the flow yet. Add the document to the flow first.`);
  const system = `${SYSTEM_BASE}

TASK: FLOWING. You interpret arguments that were extracted from speech documents. For each argument in the target speech: write a short flow-style claim, the warrant, its role, and whether it is offense. Then link each response to the argument(s) it answers from EARLIER opposing speeches (and extensions to the same side's earlier arguments). Use the document's signposting (numbering, "extend", "they say", "A2") as the strongest signal; mark explicit=true only when the document itself makes the link clear. Never invent links to fill gaps; low confidence is fine and expected. If two positions are clearly the same sheet under different names, report it in positionMerges.`;
  const prompt = `Interpret the ${input.speech} arguments: ${inSpeech.map((a) => `[${a.id}]`).join(", ")}.`;
  const res = await runStructured({ task: "flow_interpret", system, context: ctx.text, prompt, schema: FlowInterpretSchema, onPartial: input.onPartial, abortSignal: input.abortSignal, teamId: input.teamId });
  const out = res.output as FlowInterpretOutput;
  const ids = new Set(ctx.graph.args.map((a) => a.id));
  const inSpeechIds = new Set(inSpeech.map((a) => a.id));
  const opId = newId("aop");
  let argsUpdated = 0;
  let linksAdded = 0;
  await applyServerChange(
    round.stateDocId,
    (doc) => {
      const existing = new Map(readArgs(doc).map((a) => [a.id, a]));
      const rels = readRelations(doc);
      for (const a of out.args) {
        if (!inSpeechIds.has(a.argId)) continue;
        const cur = existing.get(a.argId);
        if (!cur) continue;
        // Document text is never overwritten; the AI reading is stored beside it.
        // upsertArg also refuses to overwrite fields a human corrected.
        upsertArg(doc, {
          id: a.argId,
          warrant: cur.warrant || a.warrant || undefined,
          role: cur.role && cur.role !== "claim" ? cur.role : a.role ? (a.role as never) : cur.role,
          offensive: a.offensive,
          aiInterpretation: { opId, confidence: Math.max(0, Math.min(1, a.confidence)), claim: a.claim },
        });
        argsUpdated++;
      }
      for (const l of out.links) {
        if (!ids.has(l.from) || !l.to.every((t) => ids.has(t)) || !inSpeechIds.has(l.from)) continue;
        const dup = rels.some((r) => r.from === l.from && r.type === l.type && r.to.join() === l.to.join());
        if (dup) continue;
        upsertRelation(doc, {
          id: newId("rel"),
          type: l.type,
          from: l.from,
          to: l.to,
          grouped: l.grouped,
          provenance: { type: "ai_inferred", opId, confidence: Math.max(0, Math.min(1, l.confidence)) },
          status: "suggested",
        });
        linksAdded++;
      }
    },
    { userId: input.userId, origin: `ai:${opId}` },
  );
  return { kind: "interpretation" as const, argsUpdated, linksAdded, notes: out.notes, merges: out.positionMerges, run: meta(res) };
}

// ---------------------------------------------------------------------------
// Flow extraction (A1): typed notes / transcript lines → flow arguments.
// ---------------------------------------------------------------------------

export interface ExtractInput {
  roundId: string;
  speech: SpeechId;
  teamId: string;
  userId: string;
  onPartial?: (p: unknown) => void;
  onStatus?: (s: string) => void;
  abortSignal?: AbortSignal;
  /** benchmark override of the model chain */
  models?: import("./models").ModelSpec[];
  /** most lines handled per run (the rest wait for the next run) */
  maxLines?: number;
  onProgress?: (p: Progress) => void;
}

const FLOW_EXTRACT_SYSTEM = `You flow a high school policy debate round. A debater typed these lines while listening to a speech (fast, full of shorthand: uq = uniqueness, LT = link turn, NU = non-unique, condo = conditionality, perm, T, K, CP, DA, b/c = because). Transcript lines may come from speech-to-text and contain errors.

For EVERY numbered line decide:
- create: the line states one or more arguments the speaker made. Split a line into at most 3 arguments only when it clearly holds separate arguments.
- same_as: the line repeats an argument already listed under THIS SPEECH'S ARGUMENTS (give its id).
- not_argument: a header naming a position ("Politics DA", "Case"), a roadmap, filler, or a question to self.

Rules:
- "quote" must be copied exactly from the line (a contiguous piece of it). Never add claims, authors, numbers, or reasons that aren't on the line. "text" stays close to the line's words; you may only expand shorthand.
- Keep the debater's label (the typed number or letter) in "label".
- Put each argument on the position it belongs to: the header above it, an existing position id, or a new position (name and kind).
- "answers": ids of the OTHER team's arguments (listed below) that this argument responds to, only when the line makes it clear (their numbering, "no link", the same subject). Leave it empty otherwise.
- evidence = "card" when the line names an author or cite (e.g. "Lee 26") or says card/ev; otherwise "analytic".
- confidence: how sure you are that you read the line correctly (0–1).`;

export async function extractFlow(input: ExtractInput) {
  const round = await roundFor(input.roundId);
  const { doc } = await loadDoc(round.stateDocId);
  const speech = input.speech;
  const side = SPEECHES[speech].side;
  const all = heardLines(doc, speech);
  const pending = all.filter((l) => l.status !== "flowed").slice(0, input.maxLines ?? 40);
  const empty = { kind: "flow_extract" as const, speech, created: [] as string[], aliased: [] as string[], positions: [] as string[], marks: [] as string[], relations: [] as string[], notArguments: 0, skipped: 0, rejected: [] as { n: number; reason: string }[], fallback: 0, remaining: 0, run: null as ReturnType<typeof meta> | null };
  if (!pending.length) return empty;
  input.onStatus?.(`Reading ${pending.length} new line${pending.length === 1 ? "" : "s"}`);

  const graph = readGraph(doc, round.ourSide);
  const positions = graph.positions;
  // An edited line is read again from scratch: its earlier reading isn't something it can repeat.
  const marks = new Map(readHeardMarks(doc).map((m) => [m.id, m]));
  const priorOf = (l: HeardLine) => (l.status === "changed" ? l.markIds.flatMap((id) => marks.get(id)?.argIds ?? []) : []);
  const replacing = new Set(pending.flatMap(priorOf));
  const existing = graph.args.filter((a) => a.speech === speech && !replacing.has(a.id));
  const theirs = graph.args.filter((a) => a.side !== side && isBefore(a.speech, speech)).slice(-150);
  const posName = new Map(positions.map((p) => [p.id, p.name]));
  const lines: ExtractLine[] = pending.map((l, i) => ({ n: i + 1, key: l.textKey, line: l.line, text: l.text }));

  // Their speech doc for this speech, if uploaded: tags and cites help match lines to cards.
  const docTags = (
    await db()
      .select({ text: uploadBlocks.text, kind: uploadBlocks.kind })
      .from(uploadBlocks)
      .innerJoin(uploads, eq(uploads.id, uploadBlocks.uploadId))
      .where(and(eq(uploads.roundId, input.roundId), sql`${uploads.attribution}->>'speech' = ${speech}`))
  )
    .filter((b) => b.kind !== "heading")
    .slice(0, 80)
    .map((b) => `- ${b.text.slice(0, 140)}`);

  const flowedContext = (l: HeardLine) => all.filter((x) => x.textKey === l.textKey && x.status === "flowed" && x.line < l.line).slice(-2);
  const shown = new Set<string>();
  const numbered: string[] = [];
  for (const [i, l] of pending.entries()) {
    for (const c of flowedContext(l)) {
      const k = `${c.textKey}|${c.line}`;
      if (shown.has(k)) continue;
      shown.add(k);
      numbered.push(`   (already on the flow) ${c.text}`);
    }
    const prior = priorOf(l);
    numbered.push(`${i + 1}. ${l.text}${l.source === "transcript" ? "   [transcript]" : ""}${prior.length ? `   [edited after it was flowed; read the whole line again]` : ""}`);
  }
  const prompt = `SPEECH: ${speech} (${side.toUpperCase()})

POSITIONS ON THE FLOW:
${positions.map((p) => `[${p.id}] ${p.name} (${p.kind}, ${p.side})`).join("\n") || "(none yet)"}

THIS SPEECH'S ARGUMENTS ALREADY ON THE FLOW:
${existing.map((a) => `[${a.id}] ${posName.get(a.positionId) ?? ""} ${a.label ?? ""}. ${a.text.slice(0, 160)}`).join("\n") || "(none)"}

THE OTHER TEAM'S EARLIER ARGUMENTS (for "answers"):
${theirs.map((a) => `[${a.id}] ${a.speech} ${posName.get(a.positionId) ?? ""} ${a.label ?? ""}. ${a.text.slice(0, 140)}`).join("\n") || "(none)"}
${docTags.length ? `\nTHEIR SPEECH DOC FOR THIS SPEECH (tags):\n${docTags.join("\n")}\n` : ""}
LINES TO FLOW:
${numbered.join("\n")}

Return one entry for every numbered line.`;

  const fake = () => {
    const parsed = parseHeard(
      lines.map((l) => ({ key: l.key, line: l.line, text: l.text })),
      { positions },
    );
    return {
      lines: parsed.map((p, i) => ({
        line: i + 1,
        action: p.action,
        category: p.category ?? "",
        sameAs: "",
        args: p.args.map((a) => ({
          quote: a.quote,
          text: a.text,
          warrant: "",
          role: a.role,
          evidence: a.evidence,
          label: a.label ?? "",
          positionId: p.position && "id" in p.position && !p.position.id.startsWith("pending:") ? p.position.id : "",
          newPositionName: p.position && "name" in p.position ? p.position.name : p.position && "id" in p.position && p.position.id.startsWith("pending:") ? p.position.id.slice(8) : "",
          newPositionKind: p.position && "name" in p.position ? p.position.kind : "",
          answers: [],
          confidence: 0.8,
        })),
      })),
    };
  };

  const progress = input.onProgress ? extractProgress(input.onProgress, await taskTiming("flow_extract"), lines.length) : null;
  progress?.start();
  const onPartial = (p: unknown) => {
    progress?.partial(p as { lines?: unknown[] });
    input.onPartial?.(p);
  };
  const res = await runStructured({ task: "flow_extract", system: FLOW_EXTRACT_SYSTEM, prompt, schema: FlowExtractSchema, onPartial, abortSignal: input.abortSignal, teamId: input.teamId, models: input.models, fake });
  progress?.stage("Putting it on the flow");
  const checked = validateExtraction({ lines, positions, existing, ours: new Set(theirs.map((a) => a.id)) }, res.output as FlowExtractOutput);

  // Lines the AI missed or that failed the checks still reach the flow, via the no-AI parser, marked uncertain.
  const done = new Set(checked.lines.map((l) => l.n));
  const leftover = lines.filter((l) => !done.has(l.n));
  const fallback = leftover.length ? parsedToValidated(parseHeard(leftover.map((l) => ({ key: l.key, line: l.line, text: l.text })), { positions }), leftover) : [];
  const opId = newId("aop");
  let applied: HeardApplyResult | null = null;
  input.onStatus?.("Putting it on the flow");
  await applyServerChange(
    round.stateDocId,
    (d) => {
      applied = applyHeard(d, { speech, side, lines: [...checked.lines, ...fallback].sort((a, b) => a.key.localeCompare(b.key) || a.line - b.line), opId, by: input.userId });
    },
    { userId: input.userId, origin: `ai:${opId}` },
  );
  const r = applied as HeardApplyResult | null;
  return {
    ...empty,
    ...(r ?? {}),
    rejected: checked.rejected,
    fallback: fallback.length,
    remaining: Math.max(0, all.filter((l) => l.status !== "flowed").length - pending.length),
    run: meta(res),
  };
}

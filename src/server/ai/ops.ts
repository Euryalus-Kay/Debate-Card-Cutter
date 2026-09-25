/**
 * AI operations. Each returns a validated result plus the references
 * (hashes / sequence numbers) of the inputs it used, so the client can tell
 * whether the result is stale before applying it.
 */

import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { rounds } from "@/server/db/schema";
import { applyServerChange } from "@/server/docs/store";
import { upsertArg, upsertRelation } from "@/shared/round-doc";
import { readArgs, readRelations } from "@/shared/round-doc";
import { computeCoverage, positionsAvailableFor2NR, type DraftTarget } from "@/domain/flow";
import { isRebuttal, SPEECHES, speechesToAnswer as speechesToAnswerFor, type SpeechId } from "@/domain/format";
import { addLoads, countWords, estimateSeconds, presetProfile, type RateProfile } from "@/domain/timing";
import { cardLoad } from "@/domain/card";
import { allSections, itemLoad, sectionContentHash, type DraftItem, type DraftSection, type PMNodeJSON } from "@/shared/draft-model";
import { buildRoundContext, renderDraft, type RoundContext } from "./context";
import { GLOBAL_RULES, SPEECH_RULES } from "./speech-rules";
import { runStructured, type RunResult } from "./run";
import { AlternativesSchema, FitPlanSchema, FlowInterpretSchema, SectionRevisionSchema, SpeechDraftSchema, type AlternativesOutput, type FitPlanOutput, type FlowInterpretOutput, type SectionRevisionOutput, type SpeechDraftOutput } from "./schemas";
import { newId } from "@/server/ids";

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
  const cov = SPEECHES[speech].side === ourSide ? computeCoverage(ctx.graph, speech, targets, ctx.recorded) : null;
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
    validation: { unsupportedDropClaims, droppedTargets, droppedCards, unaddressed, newInRebuttal, positionsNotInBlock, estimatedSeconds: estimated, limitSeconds: ctx.limitSeconds, sectionSeconds },
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
  abortSignal?: AbortSignal;
  /** benchmark override of the model chain */
  models?: import("./models").ModelSpec[];
}

export async function draftSpeech(input: DraftSpeechInput) {
  const round = await roundFor(input.roundId);
  const rates = input.rates ?? presetProfile("fast");
  const ctx = await buildRoundContext(input.roundId, { speech: input.speech, draftId: input.draftId, cardIds: input.cardIds, evidenceMode: input.evidenceMode, instructions: input.instructions, rates });
  const system = `${SYSTEM_BASE}\n\nSPEECH BEING PREPARED\n${SPEECH_RULES[input.speech]}`;
  const lockedNote = ctx.draft && allSections(ctx.draft).some((s) => s.locked) ? "Some sections of the current draft are LOCKED: keep them exactly as they are and plan around them (do not output replacements for them)." : "";
  const prompt = `Prepare the ${input.speech} for the ${round.ourSide.toUpperCase()}.

Time limit: ${Math.round(ctx.limitSeconds)} seconds. Plan to use about ${Math.round(ctx.limitSeconds * 0.95)} seconds, with section budgets that add up to that.
${input.evidenceMode === "selected_only" ? "Use ONLY the cards the team selected. Do not use library cards." : "Prefer the cards the team selected; use library cards only when they are clearly on point."}
${input.instructions.trim() ? `Team instructions: ${input.instructions.trim()}` : "No extra instructions."}
${lockedNote}
${ctx.draft && ctx.draft.items.length ? "There is already a draft. Build the complete speech; where an existing section already answers something well, you may keep its approach, but output the full plan." : ""}

Output a complete, deliverable speech plan: top-level position sections (kind "position", or "overview") containing response/extension sections (parentRef = the position's ref). Every response targets the actual flow ids it answers. Use "omitted" for anything you deliberately leave unanswered, with the reason. Put anything uncertain in "questions".`;
  const res = await runStructured({ task: input.mode === "deep" ? "speech_draft" : "speech_draft_fast", system, context: ctx.text, prompt, schema: SpeechDraftSchema, onPartial: input.onPartial, abortSignal: input.abortSignal, teamId: input.teamId, models: input.models });
  const { output, validation } = validateDraft(res.output, ctx, input.speech, round.ourSide, rates);
  return { output, validation, run: meta(res), contextRefs: { ...ctx.refs, draftHash: ctx.draftJson ? sectionContentHash(ctx.draftJson) : null }, cards: summarizeCards(ctx) };
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
  const rates = input.rates ?? presetProfile("fast");
  const ctx = await buildRoundContext(input.roundId, { speech: input.speech, draftId: input.draftId, cardIds: input.cardIds, evidenceMode: "selected_plus_library", instructions: input.instructions, rates });
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

export async function fitSpeech(input: FitInput) {
  const rates = input.rates ?? presetProfile("fast");
  const ctx = await buildRoundContext(input.roundId, { speech: input.speech, draftId: input.draftId, evidenceMode: "selected_only", instructions: input.instructions, rates });
  if (!ctx.draft || !ctx.draftJson) throw new Error("Open a draft with content to fit.");
  const sections = allSections(ctx.draft);
  if (!sections.length) throw new Error("This draft has no sections to fit. Add sections (or generate a draft) first.");
  const topLoose = ctx.draft.items.filter((i) => i.type !== "section");
  const current = estimateSeconds(addLoads(...ctx.draft.items.map(itemLoad)), rates.rates);
  const limit = ctx.limitSeconds;
  const target = Math.round(Math.min(input.targetSeconds ?? limit * 0.97, limit));
  const system = `${SYSTEM_BASE}

SPEECH BEING PREPARED
${SPEECH_RULES[input.speech]}

TASK: FIT THE SPEECH TO TIME. The debaters wrote or accepted this draft and it runs long. Decide, section by section, what to keep as is, what to condense (rewrite shorter), and what to cut, so the whole speech fits the target. Priorities: keep the arguments that decide the round and every answer to an argument the other team is likely to extend; cut repetition, redundant cards (keep the best one), and low-value defense first; condense overviews and long explanations; group similar answers. A section marked LOCKED must be kept exactly. Never invent evidence: condensed sections may only keep cards they already have. Say honestly what is being given up.`;
  const notes = [input.instructions ? `Team instruction: ${input.instructions}` : "", topLoose.length ? "(Text outside sections is kept as is.)" : ""].filter(Boolean).join("\n");
  const need = Math.max(0, Math.round(current - target));
  const wps = rates.rates.analyticWpm / 60;
  const prompt = `The draft runs ~${Math.round(current)} s. The ${input.speech} limit is ${limit} s. Bring it to about ${target} s: remove about ${need} s in total, and no more than ${need + 20} s. Every second of a rebuttal is valuable, so do not cut deeper than needed; prefer cutting a whole weak section or a redundant card over rewriting everything.
This speaker reads analytics at about ${Math.round(rates.rates.analyticWpm)} words per minute, so a condensed section of N seconds should have about ${wps.toFixed(1)} × N words of analytic text (cards add their own time, shown below). Give each entry a targetSeconds and write condensed text to that length.
${notes}
DRAFT (seconds are estimates at this speaker's measured rate):
${renderForFit(ctx.draft.items, rates, ctx.graph).join("\n")}

Return one plan entry for every section id above.`;
  const res = await runStructured({ task: "speech_fit", system, context: ctx.text, prompt, schema: FitPlanSchema, onPartial: input.onPartial, abortSignal: input.abortSignal, teamId: input.teamId });

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
    plan.push(e.action === "condense" ? { ...e, cardIds: e.cardIds.filter((c) => own.has(c)) } : e);
  }
  for (const s of sections) if (!seen.has(s.id)) plan.push({ sectionId: s.id, action: "keep", targetSeconds: Math.round(ownSeconds(s, rates)), title: "", analytic: "", cardIds: [], reason: "Not covered by the plan; kept as is." });

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
    else if (e.action === "condense") {
      a = estimateSeconds(addLoads({ cardWords: 0, tagWords: countWords(e.title), analyticWords: countWords(e.analytic), cards: 0, transitions: 1 }, ...e.cardIds.map((id) => (cardById.get(id) ? itemLoad(cardById.get(id)!) : { cardWords: 0, tagWords: 0, analyticWords: 0, cards: 0, transitions: 0 }))), rates.rates);
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

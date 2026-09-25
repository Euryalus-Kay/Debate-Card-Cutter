/**
 * Builds the model's view of a round: compact, structured, id-addressed.
 * The model never sees a growing chat transcript; it sees the current state.
 * Every id it may reference (arguments, positions, cards, sections) appears
 * here, so outputs can be validated against real entities.
 */

import { eq } from "drizzle-orm";
import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";
import { db } from "@/server/db/client";
import { rounds, uploads } from "@/server/db/schema";
import { loadDoc } from "@/server/docs/store";
import { getCards, searchCards, type CardRow } from "@/server/cards";
import { computeCoverage, possiblyKickedPositions, liveOffenseOnKickedPositions, POSITION_KIND_LABEL, type ArgUnit, type CoverageReport, type RoundGraph } from "@/domain/flow";
import { DEFAULT_CX, getFormat, SPEECH_IDS, SPEECHES, speechSeconds, speechesToAnswer, type SpeechId } from "@/domain/format";
import { cardLoad, readAloud } from "@/domain/card";
import { fullCite, shortCite } from "@/domain/citation";
import { capRatesForJudge, estimateSeconds, presetProfile, wordsForSeconds, type JudgeSpeed, type RatePresetId, type RateProfile } from "@/domain/timing";
import { renderJudgeProfile } from "./paradigm";
import type { StoredJudge } from "@/server/judges";
import { readCxNotes, readGraph, readSlots, readStrategy, recordedSpeeches } from "@/shared/round-doc";
import { draftSchema, DRAFT_FRAGMENT } from "@/shared/editor/schema";
import { allSections, draftFromPM, sectionContentHash, type Draft, type PMNodeJSON } from "@/shared/draft-model";
import { draftTargetsFromDraft } from "./draft-targets";

export interface RoundContext {
  text: string;
  graph: RoundGraph;
  coverage: CoverageReport | null;
  cards: CardRow[];
  draft: Draft | null;
  draftJson: PMNodeJSON | null;
  recorded: Set<SpeechId>;
  /** speeches whose delivery is confirmed (read confirmed or marked delivered) */
  confirmed: Set<SpeechId>;
  limitSeconds: number;
  /** speaking rates used for every estimate (the speaker's, capped when the judge limits speed) */
  rates: RateProfile;
  judgeRateCap: RatePresetId | null;
  refs: { stateHeadSeq: number; draftHeadSeq: number | null; cardIds: string[] };
}

function argLine(a: ArgUnit, indent = "   "): string {
  const bits = [`${indent}[${a.id}]`, a.label ? `${a.label}.` : "", a.text];
  if (a.cites?.length) bits.push(`(${a.cites.join(", ")})`);
  const meta: string[] = [];
  if (a.role && a.role !== "claim") meta.push(`role: ${a.role}`);
  if (a.delivery !== "confirmed") meta.push(a.delivery === "documented" ? "in doc, read not confirmed" : a.delivery);
  if (a.evidence === "analytic") meta.push("analytic (no card)");
  if (a.provenance.type === "heard" && a.provenance.quote !== a.text) meta.push(`as heard: "${a.provenance.quote}"`);
  if (a.sameAs) meta.push(`same argument as [${a.sameAs}]`);
  if (a.warrant) meta.push(`warrant: ${a.warrant}`);
  if (meta.length) bits.push(`{${meta.join("; ")}}`);
  return bits.filter(Boolean).join(" ");
}

export function renderFlow(graph: RoundGraph): string {
  const out: string[] = [];
  const rel = new Map<string, string[]>();
  for (const r of graph.relations.filter((r) => r.status !== "rejected")) {
    rel.set(r.from, [...(rel.get(r.from) ?? []), `${r.type}${r.grouped ? " (grouped)" : ""} → ${r.to.map((t) => `[${t}]`).join(", ")}${r.status === "suggested" ? " (unconfirmed)" : ""}`]);
  }
  for (const p of graph.positions) {
    out.push(`## [${p.id}] ${p.name} — ${POSITION_KIND_LABEL[p.kind]}, introduced by ${p.side.toUpperCase()} in the ${p.introducedIn}`);
    for (const s of SPEECH_IDS) {
      const args = graph.args.filter((a) => a.positionId === p.id && a.speech === s && a.delivery !== "not_read").sort((a, b) => a.order - b.order);
      if (!args.length) continue;
      out.push(` ${s} (${SPEECHES[s].side.toUpperCase()}):`);
      for (const a of args) {
        out.push(argLine(a));
        for (const r of rel.get(a.id) ?? []) out.push(`      ${r}`);
      }
    }
  }
  return out.join("\n") || "(the flow is empty)";
}

function renderCard(c: CardRow, full: boolean, rates: RateProfile): string {
  const read = readAloud(c.body);
  const words = read.text.split(/\s+/);
  const text = full ? read.text : words.slice(0, 90).join(" ") + (words.length > 90 ? " …" : "");
  const secs = Math.round(estimateSeconds(cardLoad({ tag: c.tag, citation: c.citation, body: c.body }), rates.rates));
  return `[${c.id}] TAG: ${c.tag}\n   CITE: ${shortCite(c.citation)} — ${fullCite(c.citation).slice(0, 220)}\n   ${read.basis === "highlight" ? "READ TEXT (highlighted)" : read.basis === "underline" ? "READ TEXT (underlined)" : "TEXT"}: ${text}\n   TIME TO READ: ~${secs} s (tag, cite, and read text)\n   STATUS: ${c.verificationStatus}`;
}

export function renderDraft(draft: Draft): string {
  const lines: string[] = [];
  const walk = (items: Draft["items"], depth: number) => {
    for (const it of items) {
      const pad = "  ".repeat(depth);
      if (it.type === "section") {
        const s = it.section;
        lines.push(`${pad}<section id="${s.id}" relation="${s.relation}" targets="${s.targets.join(",")}"${s.role ? ` role="${s.role}"` : ""}${s.locked ? " locked" : ""}>`);
        walk(s.items, depth + 1);
        lines.push(`${pad}</section>`);
      } else if (it.type === "card") {
        lines.push(`${pad}[card${it.cardId ? ` ${it.cardId}` : ""}] ${it.tag} — ${it.shortCite}`);
      } else if (it.type === "heading") lines.push(`${pad}# ${it.text}`);
      else if (it.type === "paragraph" && it.text.trim()) lines.push(`${pad}${it.text}`);
      else if (it.type === "note" && it.text.trim()) lines.push(`${pad}(partner note, not read: ${it.text})`);
    }
  };
  walk(draft.items, 0);
  return lines.join("\n") || "(empty draft)";
}

export interface ContextOptions {
  speech: SpeechId;
  draftId?: string | null;
  /** cards the user selected; "only" restricts evidence to these */
  cardIds?: string[];
  evidenceMode?: "selected_only" | "selected_plus_library";
  instructions?: string;
  rates?: RateProfile | null;
}

export async function buildRoundContext(roundId: string, opts: ContextOptions): Promise<RoundContext> {
  const [round] = await db().select().from(rounds).where(eq(rounds.id, roundId));
  if (!round) throw new Error("round not found");
  const { doc: stateDoc, headSeq: stateHeadSeq } = await loadDoc(round.stateDocId);
  const graph = readGraph(stateDoc, round.ourSide);
  const slots = readSlots(stateDoc);
  const strategy = readStrategy(stateDoc, opts.speech);
  const fmt = getFormat(round.formatId, round.formatOverrides as never);
  const limitSeconds = speechSeconds(fmt, opts.speech);
  const judgeRecord = ((round.judges ?? []) as StoredJudge[])[0];
  const { profile: rates, cap: judgeRateCap } = capRatesForJudge(opts.rates ?? presetProfile("fast"), judgeRecord?.profile?.speed?.value as JudgeSpeed | undefined);

  let draft: Draft | null = null;
  let draftJson: PMNodeJSON | null = null;
  let draftHeadSeq: number | null = null;
  if (opts.draftId) {
    const { doc, headSeq } = await loadDoc(opts.draftId);
    const raw = yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(DRAFT_FRAGMENT)) as PMNodeJSON;
    // Round-trip through the editor schema so default attributes are filled in exactly as the
    // browser's editor sees them; section hashes then match between server and client.
    try {
      draftJson = draftSchema().nodeFromJSON(raw).toJSON() as PMNodeJSON;
    } catch {
      draftJson = raw;
    }
    draft = draftFromPM(draftJson);
    draftHeadSeq = headSeq;
  }

  const docSpeeches = (await db().select({ attribution: uploads.attribution }).from(uploads).where(eq(uploads.roundId, roundId)))
    .map((u) => (u.attribution as { speech?: SpeechId } | null)?.speech)
    .filter((s): s is SpeechId => !!s);
  const recorded = recordedSpeeches(stateDoc, docSpeeches);
  const confirmed = new Set<SpeechId>();
  for (const s of SPEECH_IDS) if (slots[s].readConfirmed || slots[s].status === "delivered") confirmed.add(s);

  const ours = SPEECHES[opts.speech].side === round.ourSide;
  const coverage = ours ? computeCoverage(graph, opts.speech, draftTargetsFromDraft(draft), recorded) : null;

  // Evidence: selected cards (full read text) + relevant library cards (excerpts).
  const selected = opts.cardIds?.length ? await getCards(round.teamId, opts.cardIds) : [];
  let library: CardRow[] = [];
  if (opts.evidenceMode !== "selected_only") {
    const terms = new Set<string>();
    for (const p of graph.positions) terms.add(p.name);
    for (const it of coverage?.items.slice(0, 12) ?? []) terms.add(it.arg.text.split(/\s+/).slice(0, 8).join(" "));
    const ids = new Set(selected.map((c) => c.id));
    const found: string[] = [];
    for (const t of [...terms].slice(0, 10)) {
      const hits = await searchCards(round.teamId, t, { limit: 6 });
      for (const h of hits) if (!ids.has(h.id) && !found.includes(h.id)) found.push(h.id);
    }
    library = await getCards(round.teamId, found.slice(0, 24));
  }
  // Cards already in the draft are always available to keep.
  const inDraft = draft ? allCardIds(draft).filter((id) => !selected.some((c) => c.id === id) && !library.some((c) => c.id === id)) : [];
  const draftCards = inDraft.length ? await getCards(round.teamId, inDraft) : [];

  const judge = judgeRecord;
  const cardWpm = rates.rates.cardWpm;
  const analyticWpm = rates.rates.analyticWpm;
  const lines: string[] = [];
  lines.push(`ROUND`);
  lines.push(`- We are ${round.ourSide.toUpperCase()}. Opponent: ${[(round.opponent as { code?: string }).code, (round.opponent as { school?: string }).school].filter(Boolean).join(", ") || "unknown"}.`);
  lines.push(`- Resolution: ${round.resolution || "not given"}`);
  lines.push(`- Format: ${fmt.name}. The ${opts.speech} is ${Math.round(limitSeconds / 60)} minutes. New-argument policy: ${fmt.newArgumentPolicy}.`);
  lines.push(`- Speaker's rates: cards ~${cardWpm} wpm, analytics ~${analyticWpm} wpm. So 30 s ≈ ${wordsForSeconds(30, "analytic", rates.rates)} analytic words or ${wordsForSeconds(30, "card", rates.rates)} words of highlighted card text.`);
  if (judgeRateCap) lines.push(`- The judge limits speed, so these rates are capped at a ${judgeRateCap} pace. Write less rather than asking the speaker to go faster.`);
  if (judge?.profile) {
    lines.push(`- Judge ${judge.name || ""} preferences (from their paradigm; each with the words it is based on; anything not listed is unknown):\n${renderJudgeProfile(judge.profile)}`);
    const lay = judge.profile.experience?.value === "lay" || judge.profile.experience?.value === "parent";
    if (lay) lines.push(`- Lay judge: fewer positions, plain language instead of jargon, explicit comparison and a clear reason to vote.`);
    lines.push(`- Paradigm excerpt: """${judge.paradigmText.slice(0, 1500)}"""`);
  } else {
    lines.push(judge?.paradigmText?.trim() ? `- Judge ${judge.name || ""} paradigm (quoted; infer preferences only from what it explicitly says):\n"""${judge.paradigmText.slice(0, 4000)}"""` : `- No judge paradigm provided: do not assume judge preferences.`);
  }
  const cxNotes = readCxNotes(stateDoc);
  if (Object.keys(cxNotes).length) {
    lines.push("");
    lines.push(`CROSS-EX NOTES (the team's notes of what was asked and answered; NOT arguments on the flow unless a speech makes them — cite them as "in cross-ex they said…")`);
    for (const cx of DEFAULT_CX) if (cxNotes[cx.id]) lines.push(`- CX of the ${cx.after} (${cx.asker} asks ${cx.answerer}):\n"""${cxNotes[cx.id]!.slice(0, 2000)}"""`);
  }
  lines.push("");
  lines.push(`RECORD STATUS (what exists for each speech)`);
  for (const s of SPEECH_IDS) {
    const st = slots[s];
    const has = graph.args.some((a) => a.speech === s);
    lines.push(`- ${s}: ${st.status === "delivered" ? "delivered" : has ? "on the flow (from documents/notes)" : "NO RECORD"}${st.readConfirmed ? ", read confirmed" : ""}${st.notes.trim() ? `; notes: ${st.notes.trim().slice(0, 600)}` : ""}`);
  }
  lines.push("");
  lines.push(`FLOW (ids in brackets; → shows what an argument answers)`);
  lines.push(renderFlow(graph));
  if (coverage) {
    lines.push("");
    lines.push(`WHAT THE ${opts.speech} MUST ANSWER (from the ${speechesToAnswer(opts.speech).join(" + ") || "—"})`);
    if (coverage.recordWarnings.length) lines.push(...coverage.recordWarnings.map((w) => `! ${w}`));
    for (const it of coverage.items) lines.push(`- [${it.arg.id}] (${it.position?.name ?? "?"}) ${it.arg.text} — currently ${it.status}${it.note ? ` (${it.note})` : ""}`);
    if (coverage.extensions.length) {
      lines.push(`OUR ARGUMENTS THEY ANSWERED (candidates to extend):`);
      for (const e of coverage.extensions) lines.push(`- [${e.ours.id}] ${e.ours.speech}: ${e.ours.text} — against ${e.against.map((a) => `[${a.id}]`).join(", ")}`);
    }
    const kicked = possiblyKickedPositions(graph, opts.speech, recorded);
    if (kicked.length) lines.push(`POSITIONS NOT EXTENDED BY THEM: ${kicked.map((k) => `${k.position.name}${k.certain ? "" : " (record incomplete)"}`).join("; ")}`);
    const live = liveOffenseOnKickedPositions(graph, round.ourSide, opts.speech, recorded);
    if (live.length) lines.push(`LIVE OFFENSE FOR US ON KICKED POSITIONS: ${live.map((l) => `${l.position.name}: ${l.turns.map((t) => `[${t.id}]`).join(", ")}`).join("; ")}`);
  }
  const decisions = graph.decisions.filter((d) => d.speech === opts.speech);
  if (decisions.length) {
    lines.push("");
    lines.push(`TEAM DECISIONS FOR THE ${opts.speech}`);
    for (const d of decisions) lines.push(`- ${d.kind}: ${d.targets.map((t) => `[${t}]`).join(", ")}${d.reason ? ` — ${d.reason}` : ""}`);
  }
  if (strategy.plan || strategy.instructions) {
    lines.push("");
    lines.push(`TEAM STRATEGY NOTES FOR THE ${opts.speech}`);
    if (strategy.plan) lines.push(strategy.plan);
    if (strategy.instructions) lines.push(strategy.instructions);
  }
  lines.push("");
  lines.push(`EVIDENCE YOU MAY USE (reference by card id only; never quote beyond this text)`);
  if (!selected.length && !library.length && !draftCards.length) lines.push("(no cards available — use analytics only and list needed evidence in needsEvidence)");
  if (selected.length) {
    lines.push(`Cards the team selected for this speech:`);
    for (const c of selected) lines.push(renderCard(c, true, rates));
  }
  if (draftCards.length) {
    lines.push(`Cards already in the draft:`);
    for (const c of draftCards) lines.push(renderCard(c, true, rates));
  }
  if (library.length) {
    lines.push(`Possibly relevant cards from the team library (excerpts):`);
    for (const c of library) lines.push(renderCard(c, false, rates));
  }
  if (draft) {
    lines.push("");
    lines.push(`CURRENT DRAFT OF THE ${opts.speech}`);
    lines.push(renderDraft(draft));
  }

  return {
    text: lines.join("\n"),
    graph,
    coverage,
    cards: [...selected, ...draftCards, ...library],
    draft,
    draftJson,
    recorded,
    confirmed,
    limitSeconds,
    rates,
    judgeRateCap,
    refs: { stateHeadSeq, draftHeadSeq, cardIds: [...selected, ...draftCards, ...library].map((c) => c.id) },
  };
}

function allCardIds(d: Draft): string[] {
  const out: string[] = [];
  const walk = (items: Draft["items"]) => {
    for (const it of items) {
      if (it.type === "card" && it.cardId) out.push(it.cardId);
      if (it.type === "section") walk(it.section.items);
    }
  };
  walk(d.items);
  return out;
}

export { allSections, sectionContentHash };

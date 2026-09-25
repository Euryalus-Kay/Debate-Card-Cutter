/**
 * Round state: positions, argument units, relations, decisions, and the
 * coverage computation that tells a speaker what still needs an answer.
 *
 * Provenance is explicit on every unit and relation so the UI can always
 * distinguish document text, user-confirmed delivery, AI interpretation,
 * and planned (draft) content.
 */

import { opposite, SPEECHES, speechesToAnswer, speechesToExtend, isBefore, type Side, type SpeechId } from "./format";

export type PositionKind =
  | "advantage"
  | "harms"
  | "inherency"
  | "solvency"
  | "plan"
  | "case_other"
  | "da"
  | "cp"
  | "k"
  | "t"
  | "theory"
  | "framework"
  | "other";

export const POSITION_KIND_LABEL: Record<PositionKind, string> = {
  advantage: "Advantage",
  harms: "Harms",
  inherency: "Inherency",
  solvency: "Solvency",
  plan: "Plan",
  case_other: "Case",
  da: "Disadvantage",
  cp: "Counterplan",
  k: "Kritik",
  t: "Topicality",
  theory: "Theory",
  framework: "Framework",
  other: "Other",
};

export function isCasePosition(kind: PositionKind): boolean {
  return kind === "advantage" || kind === "harms" || kind === "inherency" || kind === "solvency" || kind === "plan" || kind === "case_other";
}

export interface Position {
  id: string;
  kind: PositionKind;
  name: string;
  /** side that introduced the position */
  side: Side;
  introducedIn: SpeechId;
  order: number;
}

/** Every argument role. One list drives the flow type and the AI output schemas. */
export const ARG_ROLES = [
  "claim",
  "uniqueness",
  "link",
  "internal_link",
  "impact",
  "solvency",
  "plan_text",
  "cp_text",
  "net_benefit",
  "perm",
  "interpretation",
  "violation",
  "standard",
  "voter",
  "alternative",
  "framework",
  "theory",
  "defense",
  // defensive answers typed precisely, because turn/kick logic depends on them
  "non_unique",
  "no_link",
  "no_internal_link",
  "no_impact",
  "impact_mitigation",
  "link_turn",
  "impact_turn",
  "we_meet",
  "counter_interpretation",
  "impact_calc",
  "overview",
  "other",
] as const;

export type ArgRole = (typeof ARG_ROLES)[number];

export function isArgRole(x: unknown): x is ArgRole {
  return typeof x === "string" && (ARG_ROLES as readonly string[]).includes(x);
}

export type Provenance =
  /** text found in a supplied document */
  | { type: "document"; documentId: string; blockId?: string; excerpt?: string }
  /** entered by a user from what they heard or know */
  | { type: "user_note"; by: string }
  /** an AI interpretation; must be reviewable */
  | { type: "ai_inferred"; opId?: string; confidence: number }
  /** planned content from one of our drafts */
  | { type: "draft"; draftId: string; sectionId: string }
  /**
   * what a debater typed while listening (or a transcript line): `quote` is the exact
   * text it came from, anchored in the pad by the mark `markId`
   */
  | { type: "heard"; speech: SpeechId; markId: string; quote: string; source: "typed" | "transcript"; opId?: string; confidence?: number };

/**
 * Whether the argument was actually delivered. A document alone never proves
 * delivery; "documented" means "in the doc, not confirmed".
 */
export type DeliveryStatus = "documented" | "confirmed" | "not_read" | "uncertain" | "planned";

export interface ArgUnit {
  id: string;
  positionId: string;
  speech: SpeechId;
  side: Side;
  parentId?: string;
  order: number;
  /** "1", "2", "A", "Uniqueness" */
  label?: string;
  /** short flow text of the claim */
  text: string;
  /** reasoning summary (interpretation unless provenance says otherwise) */
  warrant?: string;
  role: ArgRole;
  /** true when the argument is offense (a reason to vote), not only defense */
  offensive?: boolean;
  /** card ids used as evidence */
  cardIds: string[];
  /** display snapshot of evidence cites, e.g. ["Smith 23"] */
  cites?: string[];
  provenance: Provenance;
  delivery: DeliveryStatus;
  /** when the user corrected this unit, AI refreshes must not overwrite it */
  humanEdited?: boolean;
  /** AI reading of the argument, kept separate from document text */
  aiInterpretation?: { opId: string; confidence: number; claim: string };
  /** this unit is another record of the same argument (e.g. typed notes vs. their doc); coverage uses the canonical one */
  sameAs?: string;
  /** read from a card, or made without one (an analytic) */
  evidence?: "card" | "analytic";
}

export type RelationType = "answers" | "extends" | "cross_applies" | "turns";

export interface Relation {
  id: string;
  type: RelationType;
  /** the responding / extending argument */
  from: string;
  /** the argument(s) it relates to; >1 for grouped answers */
  to: string[];
  /** true when the speaker explicitly grouped these targets */
  grouped?: boolean;
  provenance: Provenance;
  status: "confirmed" | "suggested" | "rejected";
}

export type DecisionKind = "concede" | "deprioritize" | "kick" | "go_for" | "note";

export interface Decision {
  id: string;
  speech: SpeechId;
  kind: DecisionKind;
  /** argument or position ids */
  targets: string[];
  reason: string;
  by?: string;
}

export interface RoundGraph {
  ourSide: Side;
  positions: Position[];
  args: ArgUnit[];
  relations: Relation[];
  decisions: Decision[];
}

/** A section of our draft and the arguments it targets. */
export interface DraftTarget {
  sectionId: string;
  title: string;
  relation: "answers" | "group" | "cross_apply" | "extend" | "new";
  targets: string[];
  /** e.g. "turn" when the section turns the target */
  turn?: boolean;
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

export type CoverageStatus = "answered" | "grouped" | "cross_applied" | "conceded" | "deprioritized" | "unanswered" | "uncertain";

export interface CoverageItem {
  arg: ArgUnit;
  position?: Position;
  status: CoverageStatus;
  /** draft sections responsible */
  sections: string[];
  /** explanation shown to the user */
  note?: string;
  /** the opponent arg is itself answering one of our args (context for extensions) */
  answersOurs?: string[];
}

export interface ExtensionNeed {
  ours: ArgUnit;
  position?: Position;
  /** opponent arguments against it, from the speech(es) we are answering */
  against: ArgUnit[];
  extendedBy: string[];
}

export interface CoverageReport {
  speech: SpeechId;
  items: CoverageItem[];
  counts: Record<CoverageStatus, number>;
  extensions: ExtensionNeed[];
  /** notes about incomplete records, never treated as concessions */
  recordWarnings: string[];
}

const LOW_CONFIDENCE = 0.55;

export function isLive(a: ArgUnit): boolean {
  return a.delivery !== "not_read";
}

/**
 * Compute coverage for the speech we are preparing.
 *
 * Opponent arguments to answer come from `speechesToAnswer(target)`. Their
 * status is derived only from actual links: draft sections that target them,
 * or explicit decisions. A model's claim that "everything is answered" has no
 * input here.
 */
export function computeCoverage(graph: RoundGraph, target: SpeechId, draft: DraftTarget[], recordedSpeeches: Set<SpeechId>): CoverageReport {
  const posById = new Map(graph.positions.map((p) => [p.id, p]));
  const argById = new Map(graph.args.map((a) => [a.id, a]));
  const answerSpeeches = speechesToAnswer(target);
  const recordWarnings: string[] = [];
  for (const s of answerSpeeches) {
    if (!recordedSpeeches.has(s)) {
      recordWarnings.push(`No record of the ${s}. Anything said in it is missing from this list; missing records are not treated as concessions.`);
    }
  }

  const decided = new Map<string, Decision>();
  for (const d of graph.decisions.filter((d) => d.speech === target)) {
    for (const t of d.targets) decided.set(t, d);
  }

  // An alias (the same argument recorded twice, e.g. typed notes and their doc) counts as its canonical unit.
  const canonical = (id: string): string => {
    let cur = id;
    for (let i = 0; i < 5; i++) {
      const next = argById.get(cur)?.sameAs;
      if (!next || !argById.has(next)) break;
      cur = next;
    }
    return cur;
  };
  const bySection = new Map<string, { status: CoverageStatus; sections: string[] }>();
  const mark = (rawId: string, status: CoverageStatus, sectionId: string) => {
    const argId = canonical(rawId);
    const cur = bySection.get(argId);
    const rank: Record<CoverageStatus, number> = { answered: 5, grouped: 4, cross_applied: 3, conceded: 2, deprioritized: 1, uncertain: 0, unanswered: 0 };
    if (!cur) bySection.set(argId, { status, sections: [sectionId] });
    else {
      cur.sections.push(sectionId);
      if (rank[status] > rank[cur.status]) cur.status = status;
    }
  };
  const ourSide = SPEECHES[target].side;
  for (const s of draft) {
    if (s.relation === "new") continue;
    if (s.relation === "extend") {
      // "Extend our 2AC 4 — it answers their 2NC 7": linking their argument to an extension answers it.
      const theirs = s.targets.filter((t) => {
        const a = argById.get(canonical(t));
        return !!a && a.side !== ourSide;
      });
      for (const t of theirs) mark(t, theirs.length > 1 ? "grouped" : "answered", s.sectionId);
      continue;
    }
    const status: CoverageStatus = s.relation === "cross_apply" ? "cross_applied" : s.relation === "group" || s.targets.length > 1 ? "grouped" : "answered";
    for (const t of s.targets) mark(t, status, s.sectionId);
  }

  const notMine = blockExclusions(graph, target);
  const theirs = graph.args
    .filter((a) => a.side !== SPEECHES[target].side && answerSpeeches.includes(a.speech) && isLive(a) && canonical(a.id) === a.id && !notMine.has(a.positionId))
    .sort((a, b) => (posById.get(a.positionId)?.order ?? 0) - (posById.get(b.positionId)?.order ?? 0) || a.order - b.order);

  const items: CoverageItem[] = theirs.map((arg) => {
    const position = posById.get(arg.positionId);
    const answersOurs = graph.relations
      .filter((r) => r.status !== "rejected" && canonical(r.from) === arg.id && (r.type === "answers" || r.type === "turns"))
      .flatMap((r) => r.to.map(canonical))
      .filter((id) => argById.get(id)?.side === SPEECHES[target].side);
    const fromDraft = bySection.get(arg.id);
    const decision = decided.get(arg.id) ?? decided.get(arg.positionId);
    let status: CoverageStatus;
    let note: string | undefined;
    if (fromDraft) {
      status = fromDraft.status;
    } else if (decision && (decision.kind === "concede" || decision.kind === "kick")) {
      status = "conceded";
      note = decision.reason || undefined;
    } else if (decision && decision.kind === "deprioritize") {
      status = "deprioritized";
      note = decision.reason || undefined;
    } else if (
      arg.delivery === "uncertain" ||
      (arg.provenance.type === "ai_inferred" && arg.provenance.confidence < LOW_CONFIDENCE) ||
      (arg.provenance.type === "heard" && arg.provenance.confidence !== undefined && arg.provenance.confidence < LOW_CONFIDENCE)
    ) {
      status = "uncertain";
      note = arg.delivery === "uncertain" ? "Not sure this was read." : "The system's reading of this argument is low-confidence; confirm it.";
    } else {
      status = "unanswered";
    }
    return { arg, position, status, sections: fromDraft?.sections ?? [], note, answersOurs };
  });

  const counts: Record<CoverageStatus, number> = { answered: 0, grouped: 0, cross_applied: 0, conceded: 0, deprioritized: 0, unanswered: 0, uncertain: 0 };
  for (const it of items) counts[it.status]++;

  // Our earlier arguments that the opponent answered in the speeches we are responding to.
  const extendable = new Set(speechesToExtend(target));
  const extensionsMap = new Map<string, ExtensionNeed>();
  for (const it of items) {
    for (const oursId of it.answersOurs ?? []) {
      const ours = argById.get(oursId);
      if (!ours || !extendable.has(ours.speech)) continue;
      const need = extensionsMap.get(oursId) ?? { ours, position: posById.get(ours.positionId), against: [], extendedBy: [] };
      need.against.push(it.arg);
      extensionsMap.set(oursId, need);
    }
  }
  for (const s of draft.filter((d) => d.relation === "extend")) {
    for (const t of s.targets) {
      const ours = argById.get(t);
      if (!ours || ours.side !== ourSide) continue;
      const need = extensionsMap.get(t) ?? { ours, position: posById.get(ours.positionId), against: [], extendedBy: [] };
      need.extendedBy.push(s.sectionId);
      extensionsMap.set(t, need);
    }
  }

  return { speech: target, items, counts, extensions: [...extensionsMap.values()], recordWarnings };
}

/**
 * Positions the opponent introduced earlier but did not carry into the speeches
 * we are answering. Only reported as "possibly kicked" when those speeches
 * have a record; otherwise we cannot tell.
 */
export function possiblyKickedPositions(graph: RoundGraph, target: SpeechId, recordedSpeeches: Set<SpeechId>): { position: Position; certain: boolean }[] {
  const theirSide = opposite(SPEECHES[target].side);
  const answer = speechesToAnswer(target);
  const allRecorded = answer.every((s) => recordedSpeeches.has(s));
  const liveIn = new Set(graph.args.filter((a) => answer.includes(a.speech) && isLive(a)).map((a) => a.positionId));
  return graph.positions
    .filter((p) => p.side === theirSide && isBefore(p.introducedIn, target) && !answer.includes(p.introducedIn))
    .filter((p) => !liveIn.has(p.id))
    .map((position) => ({ position, certain: allRecorded }));
}

/**
 * Opponent arguments that our side never answered in any later speech of ours.
 * Candidates for "they dropped/conceded X" claims — but only claims about
 * arguments that were confirmed delivered and whose answering speech is recorded.
 */
export function unansweredByUs(graph: RoundGraph, uptoExclusive: SpeechId, recordedSpeeches: Set<SpeechId>): { arg: ArgUnit; safeToClaimDropped: boolean }[] {
  const ours = graph.ourSide;
  const answered = new Set(
    graph.relations
      .filter((r) => r.status !== "rejected")
      .filter((r) => {
        const from = graph.args.find((a) => a.id === r.from);
        return from?.side === ours && (r.type === "answers" || r.type === "turns" || r.type === "cross_applies");
      })
      .flatMap((r) => r.to),
  );
  return graph.args
    .filter((a) => a.side !== ours && isLive(a) && isBefore(a.speech, uptoExclusive) && !answered.has(a.id))
    .map((arg) => {
      // The first speech of ours after the argument that could have answered it.
      const responder = (["1AC", "1NC", "2AC", "2NC", "1NR", "1AR", "2NR", "2AR"] as SpeechId[]).find(
        (s) => SPEECHES[s].side === ours && isBefore(arg.speech, s) && isBefore(s, uptoExclusive),
      );
      const safe = arg.delivery === "confirmed" && !!responder && recordedSpeeches.has(responder);
      return { arg, safeToClaimDropped: safe };
    });
}

// ---------------------------------------------------------------------------
// Contradiction and kick logic (deterministic layer; AI analysis sits on top)
//
// Table K1 (Snider, The Code of the Debater ch. 22), docs/research/debate-domain.md §7:
//   conceded answer      | neutralizes link turn? | neutralizes impact turn?
//   no link              | no                     | yes
//   won't happen / no IL | yes                    | yes
//   non-unique           | NO (makes it better)   | yes
//   no impact            | yes (mostly)           | no ("not bad" can still be good)
// ---------------------------------------------------------------------------

export type ConflictCode =
  | "double_turn"
  | "impact_turn_vs_defense"
  | "link_turn_vs_defense"
  | "link_turn_needs_nonunique"
  | "kick_with_live_turns"
  | "kick_concession_does_not_neutralize";

export interface Conflict {
  code: ConflictCode;
  severity: "error" | "warning" | "info";
  positionId: string;
  argIds: string[];
  message: string;
}

const NEUTRALIZES_LINK_TURN: ArgRole[] = ["no_internal_link", "no_impact"];
const NEUTRALIZES_IMPACT_TURN: ArgRole[] = ["no_link", "no_internal_link", "non_unique"];

/**
 * Check one side's arguments (planned or delivered) on each position for
 * combinations the other side can exploit.
 */
export function detectConflicts(graph: RoundGraph, side: Side, args: ArgUnit[] = graph.args): Conflict[] {
  const conflicts: Conflict[] = [];
  const posName = new Map(graph.positions.map((p) => [p.id, p.name]));
  const bySideByPos = new Map<string, ArgUnit[]>();
  for (const a of args.filter((a) => a.side === side && isLive(a))) {
    const list = bySideByPos.get(a.positionId) ?? [];
    list.push(a);
    bySideByPos.set(a.positionId, list);
  }
  for (const [positionId, list] of bySideByPos) {
    const name = posName.get(positionId) ?? "this position";
    const has = (roles: ArgRole[]) => list.filter((a) => roles.includes(a.role));
    const linkTurns = has(["link_turn"]);
    const impactTurns = has(["impact_turn"]);
    if (linkTurns.length && impactTurns.length) {
      conflicts.push({
        code: "double_turn",
        severity: "error",
        positionId,
        argIds: [...linkTurns, ...impactTurns].map((a) => a.id),
        message: `Double turn on ${name}: the link turn says the plan prevents the impact, and the impact turn says the impact is good. Together they say the plan prevents something good. The other side can grant both. Keep one.`,
      });
    }
    const itDefense = has(NEUTRALIZES_IMPACT_TURN);
    if (impactTurns.length && itDefense.length) {
      conflicts.push({
        code: "impact_turn_vs_defense",
        severity: "warning",
        positionId,
        argIds: [...impactTurns, ...itDefense].map((a) => a.id),
        message: `On ${name}, ${itDefense.map((a) => roleLabel(a.role)).join(" / ")} lets the other side concede that defense and make your impact turn irrelevant (if the event never happens, it being good doesn't matter).`,
      });
    }
    const ltDefense = has(NEUTRALIZES_LINK_TURN);
    if (linkTurns.length && ltDefense.length) {
      conflicts.push({
        code: "link_turn_vs_defense",
        severity: "warning",
        positionId,
        argIds: [...linkTurns, ...ltDefense].map((a) => a.id),
        message: `On ${name}, ${ltDefense.map((a) => roleLabel(a.role)).join(" / ")} lets the other side concede it and kick out of your link turn (no credit for solving something that won't happen or doesn't matter).`,
      });
    }
    if (linkTurns.length && !has(["non_unique"]).length) {
      conflicts.push({
        code: "link_turn_needs_nonunique",
        severity: "info",
        positionId,
        argIds: linkTurns.map((a) => a.id),
        message: `Your link turn on ${name} is only offense if the impact is coming now (non-uniqueness). Pair it with a non-unique argument or show their uniqueness supports it.`,
      });
    }
  }
  return conflicts;
}

function roleLabel(r: ArgRole): string {
  return (
    {
      non_unique: "non-uniqueness",
      no_link: "no link",
      no_internal_link: "no internal link",
      no_impact: "no impact",
      impact_mitigation: "impact mitigation",
    } as Partial<Record<ArgRole, string>>
  )[r] ?? r.replace(/_/g, " ");
}

/**
 * Kicking a position that carries the other side's turns. Snider: "If you kick
 * out of disadvantages with turns on them, you will lose." To kick safely you
 * must concede an answer that neutralizes each turn (Table K1).
 */
export function checkKick(graph: RoundGraph, kicker: Side, positionId: string, concededArgIds: string[]): Conflict[] {
  const out: Conflict[] = [];
  const name = graph.positions.find((p) => p.id === positionId)?.name ?? "this position";
  const opp = graph.args.filter((a) => a.positionId === positionId && a.side !== kicker && isLive(a));
  const turns = opp.filter((a) => a.role === "link_turn" || a.role === "impact_turn");
  if (!turns.length) return out;
  const conceded = opp.filter((a) => concededArgIds.includes(a.id));
  for (const t of turns) {
    const neutral = t.role === "link_turn" ? NEUTRALIZES_LINK_TURN : NEUTRALIZES_IMPACT_TURN;
    const ok = conceded.some((c) => neutral.includes(c.role));
    if (!ok) {
      const wrong = conceded.find((c) => (t.role === "link_turn" ? c.role === "non_unique" || c.role === "no_link" : c.role === "no_impact" || c.role === "impact_mitigation"));
      out.push({
        code: wrong ? "kick_concession_does_not_neutralize" : "kick_with_live_turns",
        severity: "error",
        positionId,
        argIds: [t.id, ...(wrong ? [wrong.id] : [])],
        message: wrong
          ? `Conceding "${wrong.text}" (${roleLabel(wrong.role)}) does not take out their ${roleLabel(t.role)} on ${name}. The turn survives as their offense.`
          : `Kicking ${name} leaves their ${roleLabel(t.role)} ("${t.text}") standing as offense. Concede ${t.role === "link_turn" ? "a no-internal-link or no-impact answer" : "a no-link, won't-happen, or non-unique answer"} explicitly, or answer the turn.`,
      });
    }
  }
  return out;
}

/** Kicked or dropped opponent positions that still carry our unanswered turns (live offense for us). */
export function liveOffenseOnKickedPositions(graph: RoundGraph, ourSide: Side, target: SpeechId, recorded: Set<SpeechId>): { position: Position; turns: ArgUnit[] }[] {
  const kicked = possiblyKickedPositions(graph, target, recorded).map((k) => k.position);
  return kicked
    .map((position) => ({
      position,
      turns: graph.args.filter((a) => a.positionId === position.id && a.side === ourSide && isLive(a) && (a.role === "link_turn" || a.role === "impact_turn")),
    }))
    .filter((x) => x.turns.length > 0);
}

/** 2NR: may only go for positions the block extended (REB-4). */
export function positionsAvailableFor2NR(graph: RoundGraph): Position[] {
  const inBlock = new Set(graph.args.filter((a) => a.side === "neg" && (a.speech === "2NC" || a.speech === "1NR") && isLive(a)).map((a) => a.positionId));
  return graph.positions.filter((p) => inBlock.has(p.id));
}

// ---------------------------------------------------------------------------
// Their drops (A2): our arguments the other team never answered.
// ---------------------------------------------------------------------------

export interface TheirDrop {
  arg: ArgUnit;
  position?: Position;
  /** COV-5: a "they dropped it" claim is safe only with a confirmed record of both sides */
  safeToClaim: boolean;
  reason: string;
}

/**
 * Our arguments (from speeches the target extends) that no argument in the other
 * team's later speeches answered. Offense for the target to extend. Gated by
 * COV-5: our argument was delivered, every responding speech has a record, no
 * answer/turn/cross-application exists, and it carries a warrant (card or reason).
 */
export function droppedByThem(graph: RoundGraph, target: SpeechId, recordedSpeeches: Set<SpeechId>): TheirDrop[] {
  const mySide = SPEECHES[target].side;
  const posById = new Map(graph.positions.map((p) => [p.id, p]));
  const argById = new Map(graph.args.map((a) => [a.id, a]));
  const canonical = (id: string) => argById.get(id)?.sameAs ?? id;
  const answered = new Set(
    graph.relations
      .filter((r) => r.status !== "rejected" && (r.type === "answers" || r.type === "turns" || r.type === "cross_applies"))
      .filter((r) => argById.get(r.from)?.side !== mySide)
      .flatMap((r) => r.to.map(canonical)),
  );
  const kicked = new Set(graph.decisions.filter((d) => d.kind === "kick").flatMap((d) => d.targets));
  const extendable = new Set(speechesToExtend(target));
  return graph.args
    .filter((a) => a.side === mySide && extendable.has(a.speech) && isLive(a) && !a.sameAs && !answered.has(a.id) && !kicked.has(a.positionId))
    .map((arg) => {
      const responders = SPEECH_ORDER.filter((s) => SPEECHES[s].side !== mySide && isBefore(arg.speech, s) && isBefore(s, target));
      const missing = responders.filter((s) => !recordedSpeeches.has(s));
      const hasWarrant = arg.cardIds.length > 0 || !!arg.cites?.length || !!arg.warrant || arg.text.split(/\s+/).length >= 8;
      const delivered = arg.delivery === "confirmed";
      const safeToClaim = delivered && responders.length > 0 && missing.length === 0 && hasWarrant;
      const reason = !responders.length
        ? "They haven't spoken since."
        : missing.length
          ? `No record of their ${missing.join(" and ")}, so it may have been answered.`
          : !delivered
            ? "Not confirmed as delivered."
            : !hasWarrant
              ? "It needs a warrant to be worth extending."
              : `Unanswered in their ${responders.join(" and ")}.`;
      return { arg, position: posById.get(arg.positionId), safeToClaim, reason };
    });
}

const SPEECH_ORDER: SpeechId[] = ["1AC", "1NC", "2AC", "2NC", "1NR", "1AR", "2NR", "2AR"];

/**
 * The negative block splits positions between the 2NC and 1NR. Positions the team
 * assigned to the other speech (a "go_for" decision on that speech), or that the
 * 2NC already covered (for the 1NR), are not this speech's job.
 */
export function blockExclusions(graph: RoundGraph, target: SpeechId): Set<string> {
  const out = new Set<string>();
  if (target !== "2NC" && target !== "1NR") return out;
  const other: SpeechId = target === "2NC" ? "1NR" : "2NC";
  for (const d of graph.decisions) if (d.speech === other && d.kind === "go_for") for (const t of d.targets) out.add(graph.positions.some((p) => p.id === t) ? t : graph.args.find((a) => a.id === t)?.positionId ?? t);
  if (target === "1NR") for (const a of graph.args) if (a.speech === "2NC" && isLive(a) && a.delivery !== "planned") out.add(a.positionId);
  return out;
}
